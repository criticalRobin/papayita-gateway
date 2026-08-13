# Code Guide — NestJS conventions for this repo

This document covers **how** to write code in this repository. For product context and architecture rationale, see `project-info.md`.

## Module structure

One NestJS module per domain concept from `project-info.md`'s architecture table — not per technical layer. Prefer feature modules over generic `controllers/`, `services/`, `dto/` top-level folders.

```
src/
  whatsapp/
    webhook/            # inbound Meta Cloud API handling
    flows/               # WhatsApp Flow (registration) handling
    client/              # outbound message sending (WhatsApp Cloud API wrapper)
  queue/
    processors/          # BullMQ processors, one per job type
  conversation-state/     # Redis-backed state machine
  classification/         # cheap first-pass message classification
  stt/                     # AssemblyAI client + adapter
  extraction/              # Gemini client + prompt templates + schema validation
  catalog/                 # catalog-search client (Core API)
  draft-builder/           # deterministic invoice JSON assembly — no external calls, no LLM
  core-api/                # typed Core API client (documents, emisores, certificates)
  registration/            # onboarding orchestration
  config/                  # typed config module + validation schema
  common/                  # shared decorators, filters, interceptors, pipes — keep this small; if it's growing, it probably belongs in a real module
```

Each module owns its own DTOs, its own tests, and exposes a narrow public interface (one or two injectable services) to the rest of the app. Don't let other modules reach into a module's internals — inject the service, not the repository/client underneath it.

### Coming from Angular: what maps directly

NestJS's module/DI system is deliberately modeled on Angular's — this isn't a new mental model, it's the same one applied to a server.

| Angular | NestJS | Notes |
|---|---|---|
| `@NgModule({ imports, declarations, providers, exports })` | `@Module({ imports, controllers, providers, exports })` | `controllers` replaces `declarations`, everything else lines up |
| `@Injectable()` service | `@Injectable()` service ("provider") | Same decorator, same constructor injection |
| Component (renders UI, delegates to services) | Controller (handles one HTTP route, delegates to services) | A controller should be as thin as a well-written "smart" component — no business logic in it |

**The one habit to unlearn: not every module gets a controller.** In Angular, most modules eventually surface something routable. In this gateway, only modules that receive an inbound HTTP request from *outside* the app need one — in practice, that's just `whatsapp/webhook` (Meta calls it) and the Core API's inbound webhook receiver. `catalog`, `stt`, `extraction`, `core-api`, `draft-builder`, `conversation-state` are pure service modules, imported and injected by whoever needs them — never called over HTTP by anything external. If you catch yourself adding a controller "just in case," that's the signal it's not needed; add it back later if a real caller shows up.

## Dependency injection and testability

Every module that calls an external API (`stt`, `extraction`, `catalog`, `core-api`, `whatsapp/client`) must be defined behind an interface, not just a concrete class, so it can be swapped for a test double without touching consumer code:

```ts
// catalog/catalog-search.interface.ts
export interface CatalogSearchClient {
  search(emisorId: string, consultas: CatalogQuery[]): Promise<CatalogSearchResult>;
}

// catalog/catalog.service.ts
@Injectable()
export class CatalogService implements CatalogSearchClient {
  constructor(private readonly httpService: HttpService, private readonly config: ConfigService) {}

  async search(emisorId: string, consultas: CatalogQuery[]): Promise<CatalogSearchResult> {
    const url = `${this.config.get('CORE_API_BASE_URL')}/emisores/${emisorId}/catalogo/busqueda`;
    const response = await firstValueFrom(this.httpService.post(url, { consultas }));
    return response.data.result;
  }
}

// catalog/catalog.module.ts
@Module({
  imports: [HttpModule],
  providers: [
    { provide: 'CATALOG_SEARCH_CLIENT', useClass: CatalogService },
  ],
  exports: ['CATALOG_SEARCH_CLIENT'],
})
export class CatalogModule {}
```

The consumer never injects `CatalogService` directly — it asks for the abstract token instead, and has no idea (or need to know) that it's backed by an HTTP call:

```ts
@Injectable()
export class DraftBuilderService {
  constructor(
    @Inject('CATALOG_SEARCH_CLIENT') private readonly catalogClient: CatalogSearchClient,
  ) {}
}
```

In a test, swap the provider for a plain fake — no HTTP, no network, no flakiness:

```ts
const module = await Test.createTestingModule({
  providers: [
    DraftBuilderService,
    { provide: 'CATALOG_SEARCH_CLIENT', useValue: { search: jest.fn().mockResolvedValue(fakeResult) } },
  ],
}).compile();
```

This isn't ceremony — `draft-builder` and the confirmation-flow logic need to be tested against known catalog responses (single match, multiple matches, no match, price mismatch) without hitting a real Core API. If the client isn't swappable, those tests either don't get written or become flaky integration tests. Given how much of the message-budget logic in `project-info.md` depends on `estado` branching, this is where regressions would hide.

## Pure core for `draft-builder` and `conversation-state`

These two modules hold the actual business rules from `project-info.md` — the state machine, the message-budget/correction-cap logic, and the invoice-assembly rules. A regression here is a cost or correctness regression, not just a bug, so they get one extra discipline beyond the standard module shape: **the decision logic itself is framework-free — no NestJS decorators, no Redis, no HTTP, just plain functions taking data in and returning data out.** A thin `@Injectable()` service wraps it to do the actual I/O.

If you've used NgRx, this is exactly the reducer/effects split: the reducer is a pure `(state, action) => newState` function you can test without a store; the effect is where the side effects (API calls) live and dispatches into the reducer.

**The pure part — `conversation-state/domain/state-machine.ts`:**

```ts
// No imports from @nestjs/*. This file could be copy-pasted into any JS project and still work.

export type ConversationState = 'idle' | 'awaiting_confirmation' | 'submitting' | 'escalated';

export interface ConversationRecord {
  state: ConversationState;
  correctionCount: number;
  pendingDocument: unknown | null;
}

export type ConversationEvent =
  | { type: 'BILLING_ATTEMPT_PARSED'; draft: unknown }
  | { type: 'USER_CONFIRMED' }
  | { type: 'USER_CORRECTED'; draft: unknown }
  | { type: 'WEBHOOK_RECEIVED' };

export function transition(record: ConversationRecord, event: ConversationEvent): ConversationRecord {
  switch (event.type) {
    case 'BILLING_ATTEMPT_PARSED':
      return { ...record, state: 'awaiting_confirmation', pendingDocument: event.draft };

    case 'USER_CONFIRMED':
      return { ...record, state: 'submitting' };

    case 'USER_CORRECTED':
      if (record.correctionCount >= 1) {
        return { ...record, state: 'escalated' };
      }
      return {
        ...record,
        state: 'awaiting_confirmation',
        correctionCount: record.correctionCount + 1,
        pendingDocument: event.draft,
      };

    case 'WEBHOOK_RECEIVED':
      return { ...record, state: 'idle', pendingDocument: null };
  }
}
```

This tests in milliseconds, with zero mocking, and can never flake because of a Redis connection:

```ts
it('escalates after one correction instead of allowing a second', () => {
  const record: ConversationRecord = { state: 'awaiting_confirmation', correctionCount: 1, pendingDocument: {} };
  const result = transition(record, { type: 'USER_CORRECTED', draft: {} });
  expect(result.state).toBe('escalated');
});
```

**The thin wrapper — `conversation-state/conversation-state.service.ts`** does the Redis I/O and calls the pure function to decide the next state:

```ts
@Injectable()
export class ConversationStateService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async applyEvent(phoneNumber: string, event: ConversationEvent): Promise<ConversationRecord> {
    const current = await this.load(phoneNumber);   // side effect: Redis read
    const next = transition(current, event);         // pure logic, zero side effects
    await this.save(phoneNumber, next);               // side effect: Redis write
    return next;
  }

  private async load(phoneNumber: string): Promise<ConversationRecord> {
    const raw = await this.redis.get(`conversation:${phoneNumber}`);
    return raw ? JSON.parse(raw) : { state: 'idle', correctionCount: 0, pendingDocument: null };
  }

  private async save(phoneNumber: string, record: ConversationRecord): Promise<void> {
    await this.redis.set(`conversation:${phoneNumber}`, JSON.stringify(record), 'EX', 900); // 15 min TTL
  }
}
```

`draft-builder` follows the identical shape: pure functions (`buildSkeleton(emisor, comprador)`, `mergeCatalogResults(skeleton, catalogResponse)`) live in `draft-builder/domain/`, with zero knowledge of HTTP or the Core API client; one thin `DraftBuilderService` fetches whatever data those functions need and calls them in order.

**Folder convention for both modules:**

```
conversation-state/
  domain/
    state-machine.ts       # pure — no Nest imports, no I/O
    state-machine.spec.ts  # fast, no TestingModule needed
  conversation-state.service.ts   # thin wrapper: Redis I/O + calls into domain/
  conversation-state.module.ts

draft-builder/
  domain/
    build-skeleton.ts
    merge-catalog-results.ts
    *.spec.ts
  draft-builder.service.ts
  draft-builder.module.ts
```

This isn't asking you to adopt full DDD or hexagonal architecture across the codebase — it's applying that one specific discipline (pure domain logic, isolated from infrastructure) only to the two places where the payoff is clearly worth the extra file. Everywhere else in the app, a normal `@Injectable()` service doing its own I/O directly is fine and preferred — don't over-apply this pattern to modules that are mostly plumbing (`stt`, `whatsapp/client`) where there's no meaningful decision logic to protect.

## Config

All configuration goes through `@nestjs/config`, with a **validated schema** — don't let the app boot with a missing required env var and fail confusingly three requests later.

```ts
// config/env.validation.ts
import { z } from 'zod';

export const envSchema = z.object({
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  WHATSAPP_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),
  CORE_API_BASE_URL: z.string().url(),
  CORE_API_SERVICE_TOKEN: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;
```

```ts
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config) => envSchema.parse(config),
}),
```

Never hardcode a fallback value for anything security- or connectivity-relevant in application code (`localhost` for Redis was a real bug caught during setup — see `project-info.md`'s open-questions history). A fallback is acceptable only in local-dev-only paths, and even then, prefer failing loudly over guessing silently.

**Async module config that depends on `ConfigService`** (BullMQ, any HTTP client with a base URL) uses `forRootAsync` / `registerAsync` with `useFactory` + `inject: [ConfigService]` — not a plain object passed to `forRoot`, which can't see injected config.

## DTOs and validation

Every controller endpoint and every queue job payload gets a `class-validator`-decorated DTO — including internal ones like BullMQ job data. This project moves money and legal tax data through several async hops (webhook → queue → worker → Core API → webhook back); a malformed payload silently passed through untyped is how bugs become invisible until an invoice is wrong.

```ts
export class InboundMessageJobDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  whatsappMessageId: string;

  @IsEnum(MessageType)
  type: MessageType;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  mediaId?: string;
}
```

Enable global validation (`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`) so unexpected fields are rejected, not silently dropped or passed through.

## Error handling

- Use a global exception filter that maps internal errors to plain-language responses **only at the WhatsApp-reply boundary** — internal errors (Core API timeout, Redis connection drop) should never leak a stack trace or technical message to the end user, per the "plain-language error" rule in `project-info.md`.
- Distinguish **retryable** failures (network blip, Core API 5xx) from **terminal** ones (SRI rejection, invalid RUC) at the point they're thrown — use distinct exception classes (`RetryableCoreApiError` vs `InvoiceRejectedError`) so the BullMQ processor knows whether to let the job retry or fail permanently and notify the user.
- Never swallow an error to keep a flow moving. If catalog search fails outright (not `sin_coincidencia`, an actual API error), that's a retryable failure, not silently treated the same as "no match."

## Async processing / BullMQ conventions

- **Job ID = WhatsApp message ID** (or, for webhook-triggered jobs, the Core API's correlation ID) — this is the idempotency mechanism that protects against Meta's webhook retry behavior causing duplicate processing. Never use an auto-generated job ID for inbound message jobs.
- One processor class per job type (`@Processor('whatsapp-inbound')`), not one giant processor with an internal switch statement.
- Processors should be thin — parse the job, delegate to a service, handle the retryable/terminal error distinction. Business logic belongs in the service, not the processor, so it's testable without spinning up BullMQ.
- Worker concurrency is set explicitly in code (`concurrency: 1` for MVP per `project-info.md`) — don't leave it at a library default, and comment *why* it's 1 so a future contributor doesn't "fix" it without understanding the ordering guarantee it provides.

## Logging

- Structured logging (Nest's built-in `Logger`, or `pino` if you want JSON logs from day one — either is fine, pick one and use it everywhere).
- **Redact before logging, not after.** Never log a full cédula/RUC, a certificate password, or a raw WhatsApp access token. If you need to log identifying info for debugging, log a masked/truncated version (last 4 digits) — this should be a small shared utility (`common/redact.ts`), not something reimplemented per module.
- Log at the classification/state-transition boundaries (`state: idle → awaiting_confirmation`, `catalog search: estado=multiples_coincidencias`) — these are the log lines that actually help debug a stuck conversation, more than generic "processing message" logs.

## Docker / environment

- `Dockerfile` is multi-stage: `builder` compiles TypeScript, `production` copies only `dist/` + production `node_modules`. Never ship dev dependencies or source `.ts` files in the production image.
- `.dockerignore` excludes `node_modules`, `dist`, `.git`, `.env`.
- Never `COPY .env` into an image and never hardcode a secret via `ENV` in a Dockerfile — secrets are injected at container runtime via `env_file` in `docker-compose.yml`, not baked into image layers.
- Service-to-service hostnames inside Docker Compose use the Compose service name (`redis`, not `localhost`) — always read this from config, never hardcode, since the same code needs to work both inside Docker and (for quick local debugging) outside it.

## Testing

- **Unit tests** for `draft-builder`, `classification`, and the state-machine transitions in `conversation-state` must not depend on any live external API — mock `catalog-client`, `extraction`, and `core-api` at their interfaces. These are the modules encoding the business rules from `project-info.md` (message budget, bundling, correction cap) — they need the tightest test coverage in the repo.
- Write a test for every `estado` branch in the catalog contract (`coincidencia_unica` × both confidence values, `multiples_coincidencias`, `sin_coincidencia`) — this branching directly determines message count and cost, so a regression here is a cost regression, not just a bug.
- Write a test asserting the correction loop actually terminates after one round (escalates rather than looping) — this is a rule that's easy to accidentally regress by "just adding one more retry" later.
- Integration/e2e tests that do hit real BullMQ + Redis (via the Docker Compose setup) are fine and encouraged for the queue/worker wiring itself — that's specifically the part that can't be meaningfully mocked.

## Style

- ESLint + Prettier, default NestJS starter config is a fine baseline — don't bikeshed this, just pick it and enforce it in CI.
- Prefer explicit return types on exported functions/methods, even where TypeScript could infer them — this repo has several modules where the shape of what's returned (LLM extraction output, catalog search result, invoice draft) is exactly the kind of thing that should be impossible to accidentally change without the type system complaining.
- Avoid `any`. If a third-party SDK response is genuinely untyped (LLM SDKs are common offenders), validate it into a typed shape at the boundary (`class-validator` or `zod`) rather than passing `any` deeper into the app.

## Git / PR conventions

- Branch naming: `feature/`, `fix/`, `chore/` prefixes.
- Commit messages: short imperative summary line, body explains *why* when the change isn't self-evident from the diff — especially for anything touching the message-budget or state-machine logic, where the "why" (cost implications) isn't visible from the code alone.
- Every PR touching `draft-builder`, `catalog`, or `conversation-state` should note in the description which `estado`/state-transition cases were tested, given how directly those map to the product's cost and correctness guarantees.