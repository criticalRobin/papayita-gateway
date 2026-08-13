# Project Info — Papayita: WhatsApp Gateway

Context for anyone (human or agent) working on this repository. This document covers **what** the project is and **why** it's built the way it is. For **how** to write code in this repo, see `code-guide.md`.

## What this project is

Papayita is the **WhatsApp-facing client** for an existing Ecuadorian e-invoicing engine ("Core API," a separate repo/service, already built, not part of this codebase). This repo is the **gateway**: it lets a small business issue an SRI-authorized invoice by sending a text or voice note on WhatsApp. It does not reimplement SRI integration, XML signing, or PDF rendering — it calls the Core API for all of that.

"Gateway" and "the bot" refer to the same thing. Use "gateway" in code/docs, "bot" is fine in user-facing copy.

**This gateway currently has zero production customers.** It is the product that brings the first ones. Treat correctness and cost discipline as more important than feature breadth for the MVP.

## Non-negotiable product constraints

These came out of real cost analysis, not preference. Do not violate them without raising it explicitly with the team.

1. **WhatsApp service messages cost money and get no volume discount, ever** (confirmed: $0.0113/message, Resto de Latinoamérica, Utility-equivalent rate, effective Oct 1 2026 for service messages, flat regardless of volume). Every bot-to-user message is a real, permanent cost with no economy of scale.
2. **Message budget per invoice interaction: 2 messages happy path, 5 messages hard ceiling.** See "Conversation flow" below for the exact shape. Never design a flow that asks clarifying questions one at a time.
3. **Bundle, never drip-feed.** If the bot needs to ask about a missing field, a low-confidence catalog match, AND a price mismatch, all of that goes into **one** message. Never split it into sequential questions. This is the single highest-leverage cost rule in this product.
4. **Correction loop is capped at exactly one extra round**, then escalate to human support. Do not allow open-ended correction loops (an earlier design allowed 3 — that was revised specifically for cost reasons).
5. **Hardcode deterministic replies where the content doesn't depend on free-text understanding** (greetings, "falta tu cédula" style prompts once the missing field is known, generic errors). Don't spend an LLM call generating text that's the same every time.
6. **The invoice JSON is assembled in code, never generated whole by an LLM twice.** See "What the LLM owns vs. what code owns" below. This is a correctness rule as much as a cost rule — an LLM regenerating a legal tax document a second time is a real risk, not just inefficient.
7. **Never store `.p12` certificates or their passwords long-term in this repo's storage.** They're forwarded to the Core API's secure storage during registration. This gateway is a pass-through for that credential, not a custodian of it.
8. **Registration stays inside WhatsApp** — a WhatsApp Flow for structured data, a plain document attachment for the certificate. Never redirect the end customer to a separate website; that reintroduces the exact friction this product exists to remove.

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

Internals of this repo:

| Module | Responsibility |
|---|---|
| `whatsapp/webhook` | Receives inbound Meta Cloud API events, verifies signature, dedupes by WhatsApp message ID, enqueues a job. Does the minimum possible work — return fast, always. |
| `queue` | BullMQ, backed by Redis. One queue for inbound message processing. Worker concurrency = 1 for MVP (guarantees global ordering without per-phone locks; revisit only if this becomes an actual bottleneck). |
| `conversation-state` | Redis hash, key `conversation:{phone_number}`, TTL ~15 min. Fields: `state`, `pending_document`, `correlation_id`, `correction_count`, `updated_at`. This is the *only* thing that makes the async gap between a WhatsApp reply and a later Core API webhook coherent. |
| `classification` | Cheap, ideally non-LLM-first-pass classification of an inbound message: greeting / incomplete billing attempt / complete billing attempt / reply-to-pending-confirmation. Only escalate to the LLM extraction step when the message is an actual billing attempt. |
| `stt` | AssemblyAI (Universal-2, ~$0.0025/min). Only invoked for audio messages. |
| `extraction` | Gemini 2.5 Flash. Extracts free-text fields only — see contract below. Not the invoice JSON. |
| `catalog-client` | Calls Core API's `POST /emisores/{emisorId}/catalogo/busqueda`. See contract below. |
| `draft-builder` | **Pure code, no LLM.** Assembles the invoice JSON skeleton and merges catalog-resolved items into `detalles[]`. |
| `core-api-client` | Typed client for the Core API: create emisor, attach certificate, create document (async), fetch document/PDF. |
| `webhook-receiver` (inbound from Core API) | HMAC-verifies `comprobante.autorizado` (or rejection), resolves phone number via `correlation_id`, triggers delivery. |
| `registration` | Drives the WhatsApp Flow for emisor data, then ingests the `.p12` as a plain WhatsApp document attachment. |

## Conversation flow

Every inbound message is classified first (cheap, internal, no WhatsApp cost):

- **Greeting / unclear** → one hardcoded reply (no LLM). Conversation returns to idle, waiting for the next real message. Terminal, 1 message.
- **Billing attempt, missing required data** (e.g. no buyer ID) → one message asking for what's missing, stating what was already understood. The user's next reply should be treated as an *amendment* to the original parse (append to `pending_document`), not a fresh parse from scratch, so this doesn't add an extra message later.
- **Billing attempt, complete** → one bundled draft message: parsed items, any catalog candidates that need explicit user choice, any price-mismatch flags, all in the same message, asking for confirmation.

Then:

- User confirms as-is → submit to Core API (async), wait for webhook, deliver PDF or plain-language error. **This is the 2-message happy path: draft → result.**
- User's reply is a correction → send exactly **one** updated bundled draft, then force resolution (accept it or escalate to human support — no third attempt).

State machine (`conversation-state`):

```
idle → (message classified as billing attempt) → awaiting_confirmation
awaiting_confirmation → (user confirms) → submitting
awaiting_confirmation → (correction, correction_count == 0) → awaiting_confirmation (correction_count = 1)
awaiting_confirmation → (still wrong, correction_count == 1) → escalated
submitting → (webhook success/failure) → idle
```

Registration has its own states (`awaiting_flow`, `awaiting_certificate`) — see the system design doc for the full registration sequence; it's a separate flow from billing and isn't subject to the same message-count pressure since it happens once per business, not once per invoice.

## What the LLM owns vs. what code owns

**The LLM (Gemini 2.5 Flash) extracts only free text — never assembles the final invoice JSON.**

LLM output shape (one call per billing attempt, plus at most one more for a correction):

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
- `detalles[]` — seeded with placeholders per `idCliente`, filled from the catalog-search response (`codigoPrincipal`, `codigoAuxiliar`, `descripcion`, `unidadMedida`, `precioUnitario`, `impuestos` all come from the matched catalog candidate, never from the LLM)
- `pagos` — defaulted, or from `formaPagoMencionada` if present

**Corrections use a small, scoped second LLM call** — current draft + user's correction text in, a targeted diff out (e.g. "update `detalles[1].descuento`"). Never regenerate the whole draft from scratch on a correction; that reintroduces the risk of silently changing something that was already correct.

## Catalog search contract (Core API, already specified)

`POST /emisores/{emisorId}/catalogo/busqueda`. Response wrapped in `{ status, message, result }`. Full contract with field tables lives in `contrato-busqueda-catalogo.pdf` in the project docs — read it before implementing `catalog-client`. Key behavior:

| `estado` | Gateway action |
|---|---|
| `coincidencia_unica` + `resueltoAutomaticamente: true` | Resolve silently, name it in the draft, don't ask |
| `coincidencia_unica` + `resueltoAutomaticamente: false` | Show the single candidate in the draft, ask for confirmation |
| `multiples_coincidencias` | List candidates as numbered options in the draft, block until chosen |
| `sin_coincidencia` | Not yet decided — flag to the user rather than guessing; confirm fallback behavior before shipping this path |

Price reconciliation: compute expected total from resolved catalog prices × quantities, compare against `precioMencionado` (per item) or `precioTotalMencionado` (lump sum). Mismatch → flag in the same bundled draft message, never a separate message. Tolerance threshold is a backend-owned config value, not hardcoded in the gateway.

## Tech stack (locked in — don't substitute without discussion)

- **Framework:** NestJS
- **Queue:** BullMQ + Redis (`@nestjs/bullmq`, `ioredis`)
- **STT:** AssemblyAI Universal-2
- **LLM:** Gemini 2.5 Flash (primary). Two-tier routing to a stronger model for ambiguous/correction cases is a future optimization, not required for MVP.
- **WhatsApp:** Meta Cloud API directly, no BSP
- **Registration UI:** WhatsApp Flow (native in-chat form) + plain WhatsApp document attachment for the `.p12`
- **Containerization:** Docker, multi-stage build, `docker-compose` for local dev (`gateway` + `redis` services)
- **Config:** `@nestjs/config`
- **Secrets:** `.env` (git-ignored) + `.env.example` (committed, empty), injected via `env_file` in Compose. Production should graduate to a real secrets manager.

## Open questions — confirm with the Core API team before building around assumptions

- Self-service endpoint to create an `emisor` + attach a certificate, or admin-only today?
- Exact `comprobante.autorizado` webhook payload — correlation ID field name? Direct PDF URL, or a second fetch?
- Auth model for this gateway calling the Core API (service JWT? API key?)
- Does the Core API assign `secuencial`, or does the gateway need to?
- Current status of SRI provider-registration compliance (July 2026 resolution) — affects whether this can go live to real customers yet
- `sin_coincidencia` fallback behavior — not yet decided
- Price-mismatch tolerance threshold, and whether an over-total is treated differently from an under-total

## Related documents in this project

- `code-guide.md` — coding conventions and NestJS architecture practices for this repo
- `contrato-busqueda-catalogo.pdf` — full catalog search API contract
- System design doc (architecture, build plan, sequence diagrams for registration and invoice creation)