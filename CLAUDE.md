# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Papayita is the **WhatsApp-facing gateway** for an existing Ecuadorian e-invoicing engine ("Core API," a separate repo/service, not part of this codebase). A small business issues an SRI-authorized invoice by sending a text or voice note on WhatsApp. This repo never reimplements SRI integration, XML signing, or PDF rendering — it calls the Core API for all of that.

"Gateway" and "the bot" refer to the same thing. Use "gateway" in code/docs.

**Zero production customers yet.** This is the product that brings the first ones — treat correctness and cost discipline as more important than feature breadth.

Two docs in the repo root are the actual source of truth and go deeper than this file:
- `project-info.md` — product rationale, non-negotiable cost/message-budget constraints, architecture, conversation flow, LLM-vs-code contract, catalog search contract, open questions.
- `coding-guide.md` — NestJS module conventions, DI/testability pattern, the pure-core discipline for `draft-builder`/`conversation-state`, config validation, DTOs, error handling, BullMQ conventions, logging, Docker, testing, style, git/PR conventions.

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
WhatsApp user
     │  text / voice note / WhatsApp Flow submission
     ▼
WhatsApp Gateway (this repo)
     │  POST /documents (async)         ▲  webhook: comprobante.autorizado
     ▼                                  │
Core API (separate repo, existing) ── signs XML, submits to SRI, renders PDF
```

Planned module layout (per `coding-guide.md`), one module per domain concept, not per technical layer:

```
src/
  whatsapp/
    webhook/            # inbound Meta Cloud API handling — verifies signature, dedupes by WhatsApp message ID, enqueues job, returns fast
    flows/               # WhatsApp Flow (registration) handling
    client/              # outbound message sending (WhatsApp Cloud API wrapper)
  queue/
    processors/          # BullMQ processors, one per job type
  conversation-state/     # Redis-backed state machine (see below)
  classification/         # cheap first-pass message classification (greeting / incomplete / complete billing attempt / reply-to-pending)
  stt/                     # AssemblyAI client + adapter (Universal-2, audio only)
  extraction/              # Gemini 2.5 Flash client + prompt templates + schema validation — extracts free text only, never assembles invoice JSON
  catalog/                 # catalog-search client (Core API)
  draft-builder/           # deterministic invoice JSON assembly — no external calls, no LLM
  core-api/                # typed Core API client (documents, emisores, certificates)
  registration/            # onboarding orchestration (WhatsApp Flow + .p12 certificate attachment)
  config/                  # typed config module + validation schema
  common/                  # shared decorators, filters, interceptors, pipes — keep small
```

Only modules that receive an inbound HTTP request from *outside* the app get a controller — in practice just `whatsapp/webhook` and the Core API's inbound webhook receiver. Everything else (`catalog`, `stt`, `extraction`, `core-api`, `draft-builder`, `conversation-state`) is a pure service module, injected by whoever needs it.

### Why worker concurrency = 1

`queue`'s BullMQ worker concurrency is explicitly set to 1 for MVP — this guarantees global message-processing ordering without per-phone locks. Don't "fix" this without understanding that ordering guarantee; revisit only if it's an actual bottleneck.

### The DI/testability pattern

Every module calling an external API (`stt`, `extraction`, `catalog`, `core-api`, `whatsapp/client`) is defined behind an interface and injected via a string token (e.g. `'CATALOG_SEARCH_CLIENT'`), never injected as the concrete class — so tests can swap in a plain fake with no HTTP/network involved. Full example in `coding-guide.md` under "Dependency injection and testability".

### Pure-core discipline for `draft-builder` and `conversation-state`

These two modules hold the actual business rules (state machine, message-budget/correction-cap logic, invoice-assembly rules) — a regression here is a cost or correctness regression, not just a bug. Decision logic lives in a framework-free `domain/` subfolder (no Nest decorators, no Redis, no HTTP — plain functions in, data out); a thin `@Injectable()` service wraps it for I/O. Equivalent to an NgRx reducer/effects split. Don't over-apply this pattern elsewhere — normal `@Injectable()` services doing their own I/O are fine for plumbing modules like `stt` or `whatsapp/client`.

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
idle → (message classified as billing attempt) → awaiting_confirmation
awaiting_confirmation → (user confirms) → submitting
awaiting_confirmation → (correction, correction_count == 0) → awaiting_confirmation (correction_count = 1)
awaiting_confirmation → (still wrong, correction_count == 1) → escalated
submitting → (webhook success/failure) → idle
```

Registration has separate states (`awaiting_flow`, `awaiting_certificate`) not subject to the same message-count pressure (once per business, not once per invoice).

## Non-negotiable product constraints

Cost-driven, confirmed with the team — don't violate without raising it explicitly:

1. Every bot-to-user WhatsApp message is a real, permanent cost, no volume discount.
2. **Message budget: 2 messages happy path, 5 hard ceiling per invoice interaction.** Never ask clarifying questions one at a time.
3. **Bundle, never drip-feed** — missing field + low-confidence catalog match + price mismatch all go in one message. This is the single highest-leverage cost rule.
4. **Correction loop capped at exactly one extra round**, then escalate to human support.
5. Hardcode deterministic replies (greetings, known-missing-field prompts, generic errors) — don't spend an LLM call on fixed text.
6. **The invoice JSON is assembled in code, never generated whole by an LLM** (see "What the LLM owns vs. what code owns" in `project-info.md`) — correctness rule, not just cost.
7. Never store `.p12` certificates or passwords long-term in this repo's storage — pass through to Core API's secure storage during registration.
8. Registration stays inside WhatsApp (Flow + document attachment) — never redirect to an external site.

## Config

All config goes through `@nestjs/config` with a validated schema (zod) passed to `ConfigModule.forRoot({ validate })` — the app must fail to boot on a missing required env var, not fail confusingly later. Never hardcode a fallback for anything security- or connectivity-relevant (a `localhost` Redis fallback was a real bug caught during setup). Async module config that needs `ConfigService` (BullMQ, HTTP clients with a base URL) uses `forRootAsync`/`registerAsync` with `useFactory` + `inject: [ConfigService]`, as already done for `BullModule` in `app.module.ts`.

## DTOs, errors, logging

- Every controller endpoint and every BullMQ job payload gets a `class-validator` DTO. Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- BullMQ job ID = WhatsApp message ID (or Core API correlation ID for webhook-triggered jobs) — this is the idempotency mechanism against Meta's webhook retries. Never auto-generate job IDs for inbound message jobs.
- Distinguish retryable failures (network blip, Core API 5xx) from terminal ones (SRI rejection, invalid RUC) with distinct exception classes so processors know whether to retry or fail+notify.
- Internal errors never leak to the end user — map to plain-language WhatsApp replies at the reply boundary only.
- Redact before logging, not after: never log a full cédula/RUC, certificate password, or raw WhatsApp token. Use a shared `common/redact.ts` for masked/truncated logging.

## Docker

Multi-stage `Dockerfile`: `builder` (npm ci + `nest build`) → `production` (npm ci --omit=dev + `dist/` only). Never ship dev deps or `.ts` source in the production image. Secrets are injected at runtime via `env_file` in `docker-compose.yaml`, never `COPY`'d or baked in with `ENV`. Inside Compose, reference services by Compose service name (`redis`), read from config — never hardcode `localhost`.

## Style

- ESLint + Prettier (`.prettierrc`: single quotes, trailing commas everywhere).
- Prefer explicit return types on exported functions/methods.
- Avoid `any` — validate untyped third-party SDK responses (LLM SDKs especially) into a typed shape at the boundary.

## Git / PR conventions

- Branch naming: `feature/`, `fix/`, `chore/` prefixes.
- Commit messages: short imperative summary; body explains *why* when not obvious from the diff, especially for message-budget or state-machine changes.
- PRs touching `draft-builder`, `catalog`, or `conversation-state` should note which `estado`/state-transition cases were tested.
