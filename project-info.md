# Project Info — Papayita: WhatsApp Gateway

Context for anyone (human or agent) working on this repository. This document covers **what** the project is and **why** it's built the way it is. For **how** to write code in this repo, see `code-guide.md`.

## What this project is

Papayita is the **WhatsApp-facing client** for an existing Ecuadorian e-invoicing engine ("Core API," a separate repo/service, already built, not part of this codebase). This repo is the **gateway**: it lets a small business issue an SRI-authorized invoice by sending a text or voice note on WhatsApp. It does not reimplement SRI integration, XML signing, or PDF rendering — it calls the Core API for all of that.

"Gateway" and "the bot" refer to the same thing. Use "gateway" in code/docs, "bot" is fine in user-facing copy.

**This gateway currently has zero production customers.** It is the product that brings the first ones. Treat correctness and cost discipline as more important than feature breadth for the MVP.

A **Next.js web app is a separate, related project** — the confirmation and registration UI that opens inside WhatsApp's in-app browser via a CTA button. It is not part of this repo, but this repo is its only backend: the Next.js app never calls the Core API directly (see "Architecture").

## Non-negotiable product constraints

These came out of real cost analysis, not preference. Do not violate them without raising it explicitly with the team.

1. **WhatsApp service messages cost money and get no volume discount, ever** (confirmed: $0.0113/message, Resto de Latinoamérica, Utility-equivalent rate, effective Oct 1 2026 for service messages, flat regardless of volume). Every bot-to-user message is a real, permanent cost with no economy of scale.
2. **Message budget per invoice interaction: 2 messages, always** — one CTA message opening the confirmation webview, one result message (PDF or plain-language error). This holds regardless of how much the user edits inside the webview, because editing happens client-side in an open session and doesn't send additional WhatsApp messages. A **greeting or unclear message** is a separate, terminal case: one hardcoded reply, no CTA, no LLM call, conversation returns to idle. See "Conversation flow."
3. **Bundle, never drip-feed, for anything still sent as a WhatsApp message.** This principle originally governed a plain-text confirmation draft; it now mainly applies to the initial classification step (don't send a "procesando" message separate from the CTA — one message does both) and to any hardcoded reply. Since real editing now happens inside the webview, not across chat turns, most of what this rule used to prevent (sequential clarifying questions) is structurally impossible now rather than merely discouraged.
4. **No correction-loop cap is needed anymore** — a rule from the plain-text design that's now obsolete. The webview lets the user edit anything before submitting, with no WhatsApp message cost per edit. What replaces it: a **hard-failure/escalation path** for cases the UI genuinely can't resolve (e.g. zero catalog candidates with no reasonable fallback) — see "Catalog search" below.
5. **Hardcode deterministic replies where the content doesn't depend on free-text understanding** (greetings, generic errors). Don't spend an LLM call generating text that's the same every time.
6. **The invoice JSON is assembled in code, never generated whole by an LLM.** See "What the LLM owns vs. what code owns" below. This is a correctness rule as much as a cost rule — an LLM regenerating a legal tax document is a real risk, not just inefficient.
7. **Never store `.p12` certificates or their passwords long-term in this repo's storage.** They're forwarded to the Core API's secure storage during registration. This gateway is a pass-through for that credential, not a custodian of it.
8. **Registration stays reachable from WhatsApp** — a CTA button opens the Next.js webview for structured emisor data; the `.p12` certificate is sent separately as a plain WhatsApp document attachment (not through the webview — keeps certificate handling on the one path already designed for it). Never require the end customer to visit a website through any channel other than the in-app browser opened from a message Papayita sent.
9. **Two separate JWTs exist in this system and must never be substituted for each other:** a **service JWT** (this gateway authenticating to the Core API, one fixed identity) and a **session JWT** (a specific webview session authenticating to this gateway, one specific user/draft). The end user's session JWT must never be forwarded to the Core API. See "Auth model" below.

## Architecture

```
WhatsApp message ──┐
                     ├──▶ WhatsApp Gateway (this repo) ──▶ Core API ──▶ SRI
Next.js webview  ───┘         ▲ webhook: comprobante.autorizado
```

Both WhatsApp and the Next.js webview are front doors into the gateway. Neither talks to the Core API directly — the gateway is the only thing that holds Core API credentials and the only client the Core API needs to trust. This keeps validation, business rules, and the audit trail in one place regardless of which front door a request came through.

Internals of this repo:

| Module | Responsibility |
|---|---|
| `whatsapp/webhook` | Receives inbound Meta Cloud API events, verifies signature, dedupes by WhatsApp message ID, enqueues a job. Does the minimum possible work — return fast, always. |
| `whatsapp/client` | Outbound WhatsApp sending: hardcoded replies, and CTA button messages (registration link, confirmation link). |
| `queue` | BullMQ, backed by Redis. One queue for inbound message processing. Worker concurrency = 1 for MVP (guarantees global ordering without per-phone locks; revisit only if this becomes an actual bottleneck). |
| `conversation-state` | Redis hash, key `conversation:{phone_number}`, TTL ~15 min. Fields: `state`, `pending_document`, `correlation_id`, `updated_at`. Makes the async gap between a WhatsApp/webview interaction and a later Core API webhook coherent. |
| `classification` | Cheap, ideally non-LLM-first-pass classification of an inbound message: greeting/unclear vs. billing attempt. Only escalate to the LLM extraction step for an actual billing attempt. |
| `stt` | AssemblyAI (Universal-2, ~$0.0025/min). Only invoked for audio messages. |
| `extraction` | Gemini 2.5 Flash. Extracts free-text fields only — see contract below. Not the invoice JSON. |
| `catalog-client` | Calls the Core API's real product search endpoint, one call per item (fans out in parallel for multi-item sales), and applies the gateway-owned confidence threshold. See "Catalog search" below. |
| `draft-builder` | **Pure decision logic, no LLM.** Assembles the invoice JSON skeleton and merges catalog-resolved items. Also owns the controller the Next.js webview calls to fetch and submit a draft (see "Auth model"). |
| `webview-auth` | Mints short-lived, single-use, signed exchange codes for CTA links; exposes `POST /auth/exchange` to trade a code for a session JWT scoped to one phone number + draft/action. |
| `core-api-client` | Typed client for the Core API. Owns the **service** login/refresh token lifecycle (see "Auth model") — every other module goes through this client rather than handling Core API auth itself. |
| `webhook-receiver` (inbound from Core API) | HMAC-verifies `comprobante.autorizado` (or rejection), resolves phone number via `correlation_id`, triggers delivery of the result message. |
| `registration` | Sends the CTA for the registration webview, exposes the controller the webview calls to submit emisor data, and separately ingests the `.p12` as a plain WhatsApp document attachment. |

## Conversation flow

Every inbound WhatsApp message is classified first (cheap, internal, no cost):

- **Greeting / unclear** → one hardcoded reply (no LLM). Conversation returns to idle. Terminal, 1 message.
- **Billing attempt** (complete or not — completeness is no longer decided at this stage) → STT if audio, then LLM extraction, then catalog resolution for each item (see "Catalog search"), then `draft-builder` assembles a draft — whatever is missing, ambiguous, or mismatched is simply part of what the webview shows and lets the user fix, not something decided or asked about over chat. The gateway stores the draft in `conversation-state` under a `correlation_id`, mints a scoped exchange code via `webview-auth`, and sends **one CTA message** linking to the confirmation webview.

Then, entirely inside the webview session (no further WhatsApp messages):

- The Next.js app exchanges the code for a session JWT and fetches the draft in the same round trip.
- The user reviews and edits anything — buyer info, quantities, which catalog candidate is correct, price — using real form UI, not chat replies.
- The user taps to confirm. The gateway **re-validates everything received** (never trusts client-submitted data as-is — re-check that submitted items still map to real catalog entries for that emisor before calling `draft-builder`), submits to the Core API asynchronously, and waits for the webhook.
- The gateway sends **one result message**: the PDF, or a plain-language error.

**Registration** follows the same shape: CTA → webview session for structured emisor data → submit → separate WhatsApp document message for the `.p12` certificate → done. It's not subject to the same message-count pressure as billing since it happens once per business, not once per invoice.

State machine (`conversation-state`):

```
idle → (billing attempt classified, draft built, CTA sent) → awaiting_webview_action
awaiting_webview_action → (user submits via webview) → submitting
awaiting_webview_action → (exchange code expires unused) → idle   [handled by Redis TTL, no explicit transition needed]
submitting → (webhook success/failure) → idle
```

Registration has its own states (`awaiting_flow`, `awaiting_certificate`) using the same shape — webview submission replaces what would have been a chat-based flow.

## What the LLM owns vs. what code owns

**The LLM (Gemini 2.5 Flash) extracts only free text — never assembles the final invoice JSON, and is never invoked a second time for corrections.**

LLM output shape (one call per billing attempt — there is no second call, since all editing now happens as structured form input in the webview, not free text):

```json
{
  "comprador": {
    "tipoIdentificacion": "04",
    "identificacion": "1850137918",
    "razonSocial": "Matias Tite"
  },
  "items": [
    { "idCliente": "item-1", "textoConsulta": "coca cola", "cantidad": 1, "precioMencionado": 2.00 }
  ],
  "precioTotalMencionado": null,
  "formaPagoMencionada": null
}
```

**Code assembles the rest, deterministically:**
- `emisor` — from the DB record created at registration, never touched by free text
- `fechaEmision` — system clock
- `ambiente` / `tipoEmision` — config constants
- `secuencial` — confirm with the Core API team whether they assign this or the gateway must; do not guess
- `detalles[]` — seeded with placeholders per `idCliente`, filled from the catalog-search response, then further edited by the user in the webview before final submission
- `pagos` — defaulted, or from `formaPagoMencionada` if present

**Any correction is a direct field edit in the webview, applied by code, never re-interpreted by an LLM.** This is both cheaper and safer than the earlier free-text correction design — there's no ambiguity to resolve when the user directly changes a form field.

## Catalog search

**This is the real, specified endpoint — supersedes any earlier contract draft, including `contrato-busqueda-catalogo.pdf`, which should now be treated as historical, not authoritative.**

`POST /inventario/productos/buscar`

Request (**one item per call, not batched** — the gateway must fan out one parallel call per item for a multi-item sale):
```json
{
  "emisorId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "termino": "gaseosa"
}
```

Response (plain array, no `{status, message, result}` envelope):
```json
[
  {
    "id": "string",
    "codigoPrincipal": "GAS-001",
    "nombre": "Gaseosa Cola 1L",
    "precioUnitario": 1.5,
    "palabrasParecidas": ["gaseosa", "cola", "refresco"],
    "probabilidad": 0.73
  }
]
```

**The confidence-threshold decision now lives entirely in the gateway** — the endpoint doesn't return an `estado` or a "resolved automatically" flag, just scored candidates. `catalog-client` (or a thin layer above it) is responsible for:
- Empty array → no match. The webview needs a fallback UI for this (manual entry? escalate to support?) — **not yet decided, confirm before shipping this path.**
- One result above a configured `probabilidad` threshold → pre-select it in the webview, still editable, not silently final.
- One result below threshold, or multiple results → show as options in the webview, none pre-selected as final until the user picks.
- The threshold value itself is a gateway config value (not hardcoded), and **not yet chosen** — needs validation against real query results across a range of product names before picking a number. The example's `0.73` shouldn't be assumed to be a good cutoff without testing.

**Price reconciliation and required fields for `detalles[]` are also now gateway-side concerns, not backend-provided:**
- The gateway computes expected total (`cantidad × precioUnitario` across resolved items) and compares against `precioMencionado`/`precioTotalMencionado` from the LLM extraction — itself, not via a backend flag.
- **Open question, don't guess:** the search response has `codigoPrincipal`, `nombre`, `precioUnitario`, but not `codigoAuxiliar`, `unidadMedida`, or `impuestos` — all required in the real invoice's `detalles[]`. Confirm with the Core API team whether there's a "get full product by id" endpoint, whether the Core API fills these in automatically on document submission, or whether the search endpoint needs to add them. `draft-builder`'s merge logic can't be finished without this answer.

## Auth model

Two distinct JWTs. Do not confuse them or let one substitute for the other.

| | Service JWT (Gateway → Core API) | Session JWT (Next.js webview → Gateway) |
|---|---|---|
| Represents | The gateway itself — one fixed service identity | One specific user/conversation/draft |
| Minted by | Core API's `/auth/login` (email + password), refreshed via its `refreshToken` | This gateway's `webview-auth` module, via `/auth/exchange` |
| Used for | Every Core API call: catalog search, document creation, emisor/certificate endpoints | Every gateway call from the webview: fetch draft, submit confirmed draft, submit registration data |
| Lifespan | Long-lived credential (Core API's example: 24h access token, ~7-day refresh token), cached and refreshed centrally in `core-api-client` | Short-lived, minted per CTA link, tied to one `correlation_id`, matches the ~15 min conversation TTL, single-use |
| Never | Forwarded to the webview or logged | Forwarded to the Core API |

**Core API login (the real, specified endpoint):**

`POST /auth/login`
```json
{ "email": "admin@empresa.com", "password": "password123" }
```
Response includes `accessToken`, `refreshToken`, `expiresIn`, `expiresAt`, and a `user` object with a `rol` field. The example response shows `SUPERADMIN` — **worth confirming with the Core API team whether a narrower-scoped role exists for a service account.** A gateway service account only ever needs access to its own tenant's emisores; defaulting to the broadest available role is worth pushing back on rather than accepting because it's what the example returned.

**Magic-link session flow (gateway's own mechanism, not Core API's):** the gateway mints a short, signed, single-use code scoped to a phone number + specific draft/action, embeds only that opaque code in the CTA URL (never a real bearer token, to avoid it being logged or cached in browser history), and the webview's first action on load is exchanging it for a session JWT via `POST /auth/exchange`. That exchange should also return the draft data in the same call — the gateway already knows which draft the code unlocks, no reason to make the client ask separately.

## Tech stack (locked in — don't substitute without discussion)

- **Framework:** NestJS
- **Confirmation/registration UI:** Next.js, a separate project, opened inside WhatsApp's in-app browser via a CTA button — not WhatsApp Flows (blocked by WABA trust-level/publishing approval on a new account; may be revisited later, but webview is the committed path forward, not a stopgap)
- **Queue:** BullMQ + Redis (`@nestjs/bullmq`, `ioredis`)
- **STT:** AssemblyAI Universal-2
- **LLM:** Gemini 2.5 Flash (primary). Two-tier routing to a stronger model is a future optimization, not required for MVP.
- **WhatsApp:** Meta Cloud API directly, no BSP
- **Containerization:** Docker, multi-stage build, `docker-compose` for local dev (`gateway` + `redis` services)
- **Config:** `@nestjs/config`
- **Secrets:** `.env` (git-ignored) + `.env.example` (committed, empty), injected via `env_file` in Compose. Production should graduate to a real secrets manager.

## Open questions — confirm with the Core API team before building around assumptions

- Whether a narrower-scoped role than `SUPERADMIN` exists for a service account login
- Where `codigoAuxiliar`, `unidadMedida`, and `impuestos` come from for `detalles[]`, given the catalog search response doesn't include them
- What `probabilidad` threshold is actually a good auto-select cutoff — needs empirical testing, not a guess
- Exact `comprobante.autorizado` webhook payload — correlation ID field name? Direct PDF URL, or a second fetch?
- Does the Core API assign `secuencial`, or does the gateway need to?
- Current status of SRI provider-registration compliance (July 2026 resolution) — affects whether this can go live to real customers yet
- Fallback UX for zero catalog candidates (`sin_coincidencia`-equivalent: empty array) — not yet decided
- Price-mismatch tolerance threshold, and whether an over-total is treated differently from an under-total
- Self-service endpoint to create an `emisor` + attach a certificate, or admin-only today?

## Related documents in this project

- `code-guide.md` — coding conventions and NestJS architecture practices for this repo
- System design doc (architecture, build plan, sequence diagrams — note: registration/confirmation sequences predate the webview decision and should be read as historical context for *why*, not current *how*)