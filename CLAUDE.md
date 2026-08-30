# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Papayita is the **WhatsApp-facing gateway** for an existing Ecuadorian e-invoicing engine ("Core API," a separate repo/service, not part of this codebase). A small business issues an SRI-authorized invoice by sending a text or voice note on WhatsApp. This repo never reimplements SRI integration, XML signing, or PDF rendering — it calls the Core API for all of that.

"Gateway" and "the bot" refer to the same thing. Use "gateway" in code/docs.

**Zero production customers yet.** This is the product that brings the first ones — treat correctness and cost discipline as more important than feature breadth.

A **Next.js web app is a separate, related project** — the confirmation and registration UI that opens inside WhatsApp's in-app browser via a CTA button. It is not part of this repo, but this repo is its only backend: the Next.js app never calls the Core API directly.

Two docs in the repo root are the actual source of truth and go deeper than this file:
- `project-info.md` — product rationale, non-negotiable cost/message-budget constraints, architecture, conversation flow, LLM-vs-code contract, catalog search contract, auth model, open questions.
- `coding-guide.md` — NestJS module conventions, DI/testability pattern, the two-JWT auth model in code, the pure-core discipline for `draft-builder`/`conversation-state`, config validation, DTOs, error handling, BullMQ conventions, logging, Docker, testing, style, git/PR conventions.

Read both before making non-trivial changes — this CLAUDE.md summarizes the parts that matter most day to day, it doesn't replace them.

## Current state of the code

`src/` is still the unmodified Nest starter skeleton (`app.controller.ts`, `app.service.ts`, `app.module.ts`) plus a registered `whatsapp-messages` BullMQ queue. None of the feature modules described below exist yet. When building them, follow the module layout and conventions in `coding-guide.md` rather than extending `app.module.ts`/`app.controller.ts` directly.

## Commands

```bash
npm run start:dev      # watch mode, local dev
npm run start:debug    # watch mode + debugger
npm run build           # nest build
npm run lint             # eslint --fix over src/apps/libs/test
npm run format            # prettier --write over src/test

npm test                  # unit tests (jest, rootDir=src, matches *.spec.ts)
npm run test:watch
npm run test:cov
npx jest path/to/file.spec.ts          # run a single unit test file
npx jest path/to/file.spec.ts -t "name of test"   # run a single test case
npm run test:e2e          # e2e tests, separate config at test/jest-e2e.json

docker compose up --build   # gateway + redis, gateway on :3000, redis on :6379
```

Unit test root is `src/` (jest config lives in `package.json`), so `*.spec.ts` files live next to the code they test, not in a parallel `test/` tree. `test/` is e2e-only.

## Architecture

```
WhatsApp message ──┐
                    ├──▶ WhatsApp Gateway (this repo) ──▶ Core API ──▶ SRI
Next.js webview  ───┘         ▲ webhook: comprobante.autorizado
```

Both WhatsApp and the Next.js webview are front doors into the gateway. Neither talks to the Core API directly — the gateway is the only thing that holds Core API credentials and the only client the Core API needs to trust.

Planned module layout (per `coding-guide.md`), one module per domain concept, not per technical layer:

```
src/
  whatsapp/
    webhook/            # inbound Meta Cloud API handling — verifies signature, dedupes by WhatsApp message ID, enqueues job, returns fast
    client/              # outbound WhatsApp sending: hardcoded replies, CTA button messages (registration link, confirmation link)
  webview-auth/           # magic-link exchange-code minting + POST /auth/exchange
  queue/
    processors/          # BullMQ processors, one per job type
  conversation-state/     # Redis-backed state machine (see below)
  classification/         # cheap first-pass message classification (greeting/unclear vs. billing attempt)
  stt/                     # AssemblyAI client + adapter (Universal-2, audio only)
  extraction/              # Gemini 2.5 Flash client + prompt templates + schema validation — extracts free text only, never assembles invoice JSON
  catalog/                 # catalog-search client (Core API), threshold logic
  draft-builder/           # deterministic invoice JSON assembly + webview-facing controller
  core-api/                # typed Core API client, service auth (login/refresh) lifecycle
  registration/            # onboarding orchestration + webview-facing controller
  config/                  # typed config module + validation schema
  common/                  # shared decorators, filters, interceptors, pipes — keep small
```

### Which modules need a controller

A controller exists only where an HTTP request from outside this app needs to land. That set is bigger than just the WhatsApp webhook now that a real frontend exists:

- `whatsapp/webhook` — Meta calls this
- Core API's inbound webhook receiver — Core API calls this
- `webview-auth` — the Next.js app calls `POST /auth/exchange` here
- `draft-builder` — the Next.js app calls this to fetch a pending draft and to submit the confirmed/edited version
- `registration` — the Next.js app calls this to submit emisor data

`catalog`, `stt`, `extraction`, `core-api`, `conversation-state` remain pure service modules with no controller.

### Why worker concurrency = 1

`queue`'s BullMQ worker concurrency is explicitly set to 1 for MVP — this guarantees global message-processing ordering without per-phone locks. Don't "fix" this without understanding that ordering guarantee; revisit only if it's an actual bottleneck.

### The DI/testability pattern

Every module calling an external API (`stt`, `extraction`, `catalog`, `core-api`, `whatsapp/client`) is defined behind an interface and injected via a string token (e.g. `'CATALOG_SEARCH_CLIENT'`), never injected as the concrete class — so tests can swap in a plain fake with no HTTP/network involved. Full example in `coding-guide.md` under "Dependency injection and testability."

### Two JWTs — never mix them

Two structurally different credentials exist. Mixing them up is a real security bug. Use branded types (`CoreApiServiceToken`, `WebviewSessionToken`) so the type system prevents accidental substitution at compile time.

| | Service JWT (Gateway → Core API) | Session JWT (Next.js webview → Gateway) |
|---|---|---|
| Represents | The gateway itself — one fixed service identity | One specific user/conversation/draft |
| Minted by | Core API's `/auth/login`, refreshed via `refreshToken` | This gateway's `webview-auth` module, via `/auth/exchange` |
| Used for | Every Core API call (catalog search, document creation, etc.) | Every gateway call from the webview (fetch draft, submit, registration) |
| Lifespan | Long-lived, cached and refreshed centrally in `core-api-client` | Short-lived, per CTA link, tied to one `correlation_id`, ~15 min, single-use |
| Never | Forwarded to the webview or logged | Forwarded to the Core API |

Full code patterns for both in `coding-guide.md` under "Two JWTs."

### Pure-core discipline for `draft-builder` and `conversation-state`

These two modules hold the actual business rules (state machine, invoice-assembly/threshold rules) — a regression here is a cost or correctness regression, not just a bug. Decision logic lives in a framework-free `domain/` subfolder (no Nest decorators, no Redis, no HTTP — plain functions in, data out); a thin `@Injectable()` service wraps it for I/O. Equivalent to an NgRx reducer/effects split. Don't over-apply this pattern elsewhere — normal `@Injectable()` services doing their own I/O are fine for plumbing modules like `stt` or `whatsapp/client`.

```
conversation-state/
  domain/
    state-machine.ts       # pure — no Nest imports, no I/O
    state-machine.spec.ts  # fast, no TestingModule needed
  conversation-state.service.ts   # thin wrapper: Redis I/O + calls into domain/
  conversation-state.module.ts
```

State machine:
```
idle → (billing attempt classified, draft built, CTA sent) → awaiting_webview_action
awaiting_webview_action → (user submits via webview) → submitting
awaiting_webview_action → (exchange code expires unused) → idle   [handled by Redis TTL, no explicit transition needed]
submitting → (webhook success/failure) → idle
```

No correction-loop cap — that was a rule for the old plain-text design. Editing now happens inside the webview session before confirmation, so the state machine doesn't represent it at all.

Registration has separate states (`awaiting_flow`, `awaiting_certificate`) using the same shape.

## Conversation flow

Every inbound WhatsApp message is classified first (cheap, internal, no cost):

- **Greeting / unclear** → one hardcoded reply (no LLM). Terminal, 1 message.
- **Billing attempt** → STT if audio → LLM extraction → catalog resolution per item → `draft-builder` assembles a draft → gateway sends **one CTA message** linking to the confirmation webview.

Then, entirely inside the webview session (no further WhatsApp messages):
- Next.js app exchanges the code for a session JWT and fetches the draft.
- User reviews and edits anything (buyer info, quantities, catalog candidates, price) using real form UI.
- User confirms → gateway **re-validates everything** against the real catalog → submits to the Core API → waits for webhook.
- Gateway sends **one result message**: the PDF, or a plain-language error.

**Total: 2 WhatsApp messages per invoice interaction, always.**

## Non-negotiable product constraints

Cost-driven, confirmed with the team — don't violate without raising it explicitly:

1. Every bot-to-user WhatsApp message is a real, permanent cost ($0.0113/msg), no volume discount.
2. **Message budget: 2 messages per invoice interaction, always** — one CTA message opening the confirmation webview, one result message (PDF or error). Editing happens client-side inside the webview at zero message cost.
3. **Bundle, never drip-feed** — don't send a "procesando" message separate from the CTA. One message does both.
4. **No correction-loop cap needed** — obsolete from the plain-text design. The webview lets the user edit anything before submitting with no WhatsApp message cost per edit. What replaces it: a hard-failure/escalation path for cases the UI can't resolve (e.g. zero catalog candidates).
5. Hardcode deterministic replies (greetings, generic errors) — don't spend an LLM call on fixed text.
6. **The invoice JSON is assembled in code, never generated whole by an LLM** (see `project-info.md`) — correctness rule, not just cost.
7. Never store `.p12` certificates or passwords long-term in this repo's storage — pass through to Core API's secure storage during registration.
8. **Registration stays reachable from WhatsApp** — CTA button opens the Next.js webview for structured emisor data; `.p12` certificate is sent separately as a plain WhatsApp document attachment. Never require visiting a website outside WhatsApp's in-app browser.
9. **Two separate JWTs must never be substituted for each other** — service JWT (gateway → Core API) and session JWT (webview → gateway). See "Two JWTs" above.

## Config

All config goes through `@nestjs/config` with a validated schema (zod) passed to `ConfigModule.forRoot({ validate })` — the app must fail to boot on a missing required env var, not fail confusingly later. Never hardcode a fallback for anything security- or connectivity-relevant (a `localhost` Redis fallback was a real bug caught during setup). Async module config that needs `ConfigService` (BullMQ, HTTP clients with a base URL) uses `forRootAsync`/`registerAsync` with `useFactory` + `inject: [ConfigService]`, as already done for `BullModule` in `app.module.ts`.

## DTOs, errors, logging

- Every controller endpoint and every BullMQ job payload gets a `class-validator` DTO. Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- Webview submissions (`ConfirmDraftDto`) get both DTO validation *and* server-side re-validation against the real catalog — two layers of defense for client-submitted data.
- BullMQ job ID = WhatsApp message ID (or Core API correlation ID for webhook-triggered jobs) — this is the idempotency mechanism against Meta's webhook retries. Never auto-generate job IDs for inbound message jobs.
- Distinguish retryable failures (network blip, Core API 5xx) from terminal ones (SRI rejection, invalid RUC) with distinct exception classes (`RetryableCoreApiError` vs `InvoiceRejectedError`) so processors know whether to retry or fail+notify.
- Internal errors never leak to the end user — map to plain-language responses at **both** the WhatsApp-reply boundary **and** the webview API boundary.
- Redact before logging, not after: never log a full cédula/RUC, certificate password, raw WhatsApp token, Core API service token, or webview session token. Use a shared `common/redact.ts` for masked/truncated logging.
- Log at state-transition and threshold-decision boundaries (`state: idle → awaiting_webview_action`, `catalog: 3 candidates, auto-selected id=X at probabilidad=0.91`).

## Docker

Multi-stage `Dockerfile`: `builder` (npm ci + `nest build`) → `production` (npm ci --omit=dev + `dist/` only). Never ship dev deps or `.ts` source in the production image. Secrets are injected at runtime via `env_file` in `docker-compose.yaml`, never `COPY`'d or baked in with `ENV`. Inside Compose, reference services by Compose service name (`redis`), read from config — never hardcode `localhost`.

## Style

- ESLint + Prettier (`.prettierrc`: single quotes, trailing commas everywhere).
- Prefer explicit return types on exported functions/methods.
- Avoid `any` — validate untyped third-party SDK responses (LLM SDKs especially) into a typed shape at the boundary.
- Use the branded-type pattern (see "Two JWTs") for any value where two different strings could be accidentally interchanged — not just tokens, consider it for `emisorId` vs. `correlationId` if that class of mistake seems plausible.

## Git / PR conventions

- Branch naming: `feature/`, `fix/`, `chore/` prefixes.
- Commit messages: short imperative summary; body explains *why* when not obvious from the diff, especially for message-budget, auth, or state-machine changes.
- PRs touching `draft-builder`, `catalog`, `core-api`, or `webview-auth` should note which cases were tested, given how directly those map to the product's cost, correctness, and security guarantees.
