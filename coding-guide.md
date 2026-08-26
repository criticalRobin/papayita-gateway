# Code Guide — NestJS conventions for this repo

This document covers **how** to write code in this repository. For product context and architecture rationale, see `project-info.md`.

## Module structure

One NestJS module per domain concept from `project-info.md`'s architecture table — not per technical layer. Prefer feature modules over generic `controllers/`, `services/`, `dto/` top-level folders.

```
src/
  whatsapp/
    webhook/            # inbound Meta Cloud API handling
    client/              # outbound WhatsApp sending: hardcoded replies, CTA messages
  webview-auth/           # magic-link exchange-code minting + /auth/exchange
  queue/
    processors/          # BullMQ processors, one per job type
  conversation-state/     # Redis-backed state machine
  classification/         # cheap first-pass message classification
  stt/                     # AssemblyAI client + adapter
  extraction/              # Gemini client + prompt templates + schema validation
  catalog/                 # catalog-search client (Core API), threshold logic
  draft-builder/           # deterministic invoice JSON assembly + webview-facing controller
  core-api/                # typed Core API client, service auth (login/refresh) lifecycle
  registration/            # onboarding orchestration + webview-facing controller
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

**Which modules need a controller — this changed with the webview.** A controller exists only where an HTTP request from outside this app needs to land. That set is now bigger than "just the WhatsApp webhook":

- `whatsapp/webhook` — Meta calls this
- Core API's inbound webhook receiver — Core API calls this
- `webview-auth` — the Next.js app calls `POST /auth/exchange` here
- `draft-builder` — the Next.js app calls this to fetch a pending draft and to submit the confirmed/edited version
- `registration` — the Next.js app calls this to submit emisor data

`catalog`, `stt`, `extraction`, `core-api`, `conversation-state` remain pure service modules with no controller — nothing outside this app calls them directly. If you're adding an endpoint, ask "does the Next.js webview or Meta actually call this," not "might something call this eventually" — that's still the right instinct from before, just applied to a slightly larger set of modules now that a real frontend exists.

## Dependency injection and testability

Every module that calls an external API (`stt`, `extraction`, `catalog`, `core-api`, `whatsapp/client`) must be defined behind an interface, not just a concrete class, so it can be swapped for a test double without touching consumer code:

```ts
// catalog/catalog-search.interface.ts
export interface CatalogSearchClient {
  // one term per call — the real endpoint isn't batched, see project-info.md
  search(emisorId: string, termino: string): Promise<CatalogCandidate[]>;
}

export interface CatalogCandidate {
  id: string;
  codigoPrincipal: string;
  nombre: string;
  precioUnitario: number;
  palabrasParecidas: string[];
  probabilidad: number;
}

// catalog/catalog.service.ts
@Injectable()
export class CatalogService implements CatalogSearchClient {
  constructor(
    private readonly coreApiClient: CoreApiClient, // handles auth centrally, see "Two JWTs" below
  ) {}

  async search(emisorId: string, termino: string): Promise<CatalogCandidate[]> {
    return this.coreApiClient.post<CatalogCandidate[]>('/inventario/productos/buscar', {
      emisorId,
      termino,
    });
  }
}

// catalog/catalog.module.ts
@Module({
  providers: [
    { provide: 'CATALOG_SEARCH_CLIENT', useClass: CatalogService },
  ],
  exports: ['CATALOG_SEARCH_CLIENT'],
})
export class CatalogModule {}
```

Since the real endpoint takes one `termino` at a time, resolving a multi-item sale means fanning out in parallel, not looping sequentially:

```ts
async function resolveAllItems(emisorId: string, items: ExtractedItem[]): Promise<ResolvedItem[]> {
  const results = await Promise.all(
    items.map((item) => catalogClient.search(emisorId, item.textoConsulta)),
  );
  return items.map((item, i) => applyThreshold(item, results[i])); // gateway-owned threshold logic, see project-info.md
}
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
    { provide: 'CATALOG_SEARCH_CLIENT', useValue: { search: jest.fn().mockResolvedValue(fakeCandidates) } },
  ],
}).compile();
```

This isn't ceremony — `draft-builder` and the threshold logic need to be tested against known catalog responses (zero results, one below threshold, one above, multiple candidates) without hitting a real Core API. Given this branching now lives entirely in the gateway (the backend doesn't return an `estado` to guide it), this is exactly where a regression would silently change how many items get auto-selected vs. shown to the user.

## Two JWTs — do not let them touch each other

This repo holds two structurally different credentials. Mixing them up is a real security bug, not just a style issue, so make the type system help prevent it — don't type both as a bare `string`:

```ts
// core-api/core-api-token.ts
export type CoreApiServiceToken = string & { readonly __brand: 'CoreApiServiceToken' };

// webview-auth/webview-session-token.ts
export type WebviewSessionToken = string & { readonly __brand: 'WebviewSessionToken' };
```

This "branded type" trick costs nothing at runtime but makes it a compile error to accidentally pass a `WebviewSessionToken` somewhere a `CoreApiServiceToken` is expected, or vice versa.

**`CoreApiServiceToken`** — one fixed identity, this gateway's own service account. Lives entirely inside `core-api/`. Login and refresh, cached centrally so every other module just calls `core-api-client`'s methods without knowing how auth works underneath:

```ts
// core-api/core-api-client.service.ts
@Injectable()
export class CoreApiClient {
  private cachedToken: { accessToken: CoreApiServiceToken; refreshToken: string; expiresAt: Date } | null = null;

  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  private async getValidToken(): Promise<CoreApiServiceToken> {
    if (this.cachedToken && this.cachedToken.expiresAt > new Date(Date.now() + 60_000)) {
      return this.cachedToken.accessToken; // still valid, with a minute of buffer
    }
    if (this.cachedToken?.refreshToken) {
      return this.refresh(this.cachedToken.refreshToken);
    }
    return this.login();
  }

  private async login(): Promise<CoreApiServiceToken> {
    const { data } = await firstValueFrom(
      this.http.post(`${this.config.get('CORE_API_BASE_URL')}/auth/login`, {
        email: this.config.get('CORE_API_SERVICE_EMAIL'),
        password: this.config.get('CORE_API_SERVICE_PASSWORD'),
      }),
    );
    this.cachedToken = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: new Date(data.expiresAt),
    };
    return this.cachedToken.accessToken;
  }

  private async refresh(refreshToken: string): Promise<CoreApiServiceToken> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.config.get('CORE_API_BASE_URL')}/auth/refresh`, { refreshToken }),
      );
      this.cachedToken = { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: new Date(data.expiresAt) };
      return this.cachedToken.accessToken;
    } catch {
      return this.login(); // refresh token also expired — fall back to a fresh login
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getValidToken();
    const { data } = await firstValueFrom(
      this.http.post<T>(`${this.config.get('CORE_API_BASE_URL')}${path}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return data;
  }
}
```

Every module that needs the Core API (`catalog`, `draft-builder`'s submission step, `registration`) calls `CoreApiClient.post()`/`.get()` and never touches a token directly.

**`WebviewSessionToken`** — one specific user session, minted per CTA link, validated by `webview-auth`'s guard on the controllers that serve the Next.js app:

```ts
// webview-auth/webview-session.guard.ts
@Injectable()
export class WebviewSessionGuard implements CanActivate {
  constructor(private readonly webviewAuthService: WebviewAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    const session = await this.webviewAuthService.validateSession(token as WebviewSessionToken);
    request.webviewSession = session; // { phoneNumber, correlationId, purpose }
    return !!session;
  }
}

// draft-builder/draft-builder.controller.ts
@Controller('webview/draft')
@UseGuards(WebviewSessionGuard)
export class DraftBuilderController {
  @Get()
  async getDraft(@Req() req) {
    return this.draftBuilderService.getDraft(req.webviewSession.correlationId);
  }

  @Post('confirm')
  async confirmDraft(@Req() req, @Body() dto: ConfirmDraftDto) {
    // re-validate every submitted item against the real catalog before building the final invoice —
    // never trust client-submitted data as-is, see project-info.md
    return this.draftBuilderService.confirmAndSubmit(req.webviewSession.correlationId, dto);
  }
}
```

**The rule this exists to enforce:** nothing in `webview-auth` or any controller guarded by `WebviewSessionGuard` should ever construct a `CoreApiServiceToken`, and `CoreApiClient` should never accept or forward a `WebviewSessionToken`. If a future change seems to require crossing that boundary, that's a sign the design needs a second look, not a quick cast around the type system.

## Pure core for `draft-builder` and `conversation-state`

These two modules hold the actual business rules from `project-info.md` — the state machine and the invoice-assembly/threshold rules. A regression here is a cost or correctness regression, not just a bug, so they get one extra discipline beyond the standard module shape: **the decision logic itself is framework-free — no NestJS decorators, no Redis, no HTTP, just plain functions taking data in and returning data out.** A thin `@Injectable()` service (and, now, a thin controller) wraps it to do the actual I/O.

If you've used NgRx, this is exactly the reducer/effects split: the reducer is a pure `(state, action) => newState` function you can test without a store; the effect is where the side effects (API calls) live and dispatches into the reducer.

**The pure part — `conversation-state/domain/state-machine.ts`:**

```ts
// No imports from @nestjs/*. This file could be copy-pasted into any JS project and still work.

export type ConversationState = 'idle' | 'awaiting_webview_action' | 'submitting';

export interface ConversationRecord {
  state: ConversationState;
  correlationId: string | null;
  pendingDocument: unknown | null;
}

export type ConversationEvent =
  | { type: 'DRAFT_READY'; correlationId: string; draft: unknown }
  | { type: 'WEBVIEW_CONFIRMED' }
  | { type: 'WEBHOOK_RECEIVED' };

export function transition(record: ConversationRecord, event: ConversationEvent): ConversationRecord {
  switch (event.type) {
    case 'DRAFT_READY':
      return { ...record, state: 'awaiting_webview_action', correlationId: event.correlationId, pendingDocument: event.draft };

    case 'WEBVIEW_CONFIRMED':
      return { ...record, state: 'submitting' };

    case 'WEBHOOK_RECEIVED':
      return { ...record, state: 'idle', correlationId: null, pendingDocument: null };
  }
}
```

No correction-count/escalation logic here anymore — that was a rule for the plain-text design. Editing now happens inside the webview session, before `WEBVIEW_CONFIRMED` is ever emitted, so the state machine doesn't need to represent it at all. This tests in milliseconds, with zero mocking:

```ts
it('moves to submitting once the webview confirms', () => {
  const record: ConversationRecord = { state: 'awaiting_webview_action', correlationId: 'abc', pendingDocument: {} };
  const result = transition(record, { type: 'WEBVIEW_CONFIRMED' });
  expect(result.state).toBe('submitting');
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
    return raw ? JSON.parse(raw) : { state: 'idle', correlationId: null, pendingDocument: null };
  }

  private async save(phoneNumber: string, record: ConversationRecord): Promise<void> {
    await this.redis.set(`conversation:${phoneNumber}`, JSON.stringify(record), 'EX', 900); // 15 min TTL
  }
}
```

`draft-builder` follows the identical shape, with the threshold logic now living here too since the Core API no longer decides it:

```
draft-builder/
  domain/
    build-skeleton.ts          # pure — emisor + comprador + config constants → invoice skeleton
    apply-threshold.ts         # pure — CatalogCandidate[] + configured threshold → auto-select or "needs choice"
    merge-catalog-results.ts   # pure — skeleton + resolved items → detalles[]
    *.spec.ts
  draft-builder.service.ts     # thin: fetches emisor, calls catalog-client, calls the pure functions in order
  draft-builder.controller.ts  # thin: guarded by WebviewSessionGuard, calls the service
  draft-builder.module.ts
```

**Folder convention for `conversation-state`:**

```
conversation-state/
  domain/
    state-machine.ts       # pure — no Nest imports, no I/O
    state-machine.spec.ts  # fast, no TestingModule needed
  conversation-state.service.ts   # thin wrapper: Redis I/O + calls into domain/
  conversation-state.module.ts
```

This isn't asking you to adopt full DDD or hexagonal architecture across the codebase — it's applying that one specific discipline (pure domain logic, isolated from infrastructure) only to the places where the payoff is clearly worth the extra file. Everywhere else in the app, a normal `@Injectable()` service doing its own I/O directly is fine and preferred — don't over-apply this pattern to modules that are mostly plumbing (`stt`, `whatsapp/client`) where there's no meaningful decision logic to protect.

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
  CORE_API_SERVICE_EMAIL: z.string().email(),
  CORE_API_SERVICE_PASSWORD: z.string().min(1),
  WEBVIEW_BASE_URL: z.string().url(),        // where the Next.js app is hosted, used to build CTA links
  WEBVIEW_SESSION_SECRET: z.string().min(1), // signs/verifies exchange codes and session JWTs
  CATALOG_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8), // placeholder — see open question in project-info.md
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

Every controller endpoint and every queue job payload gets a `class-validator`-decorated DTO — including internal ones like BullMQ job data and webview submissions. This project moves money and legal tax data through several hops (webhook → queue → worker → Core API → webhook back, and now webview → gateway → Core API too); a malformed payload silently passed through untyped is how bugs become invisible until an invoice is wrong.

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

export class ConfirmDraftDto {
  @ValidateNested()
  @Type(() => CompradorDto)
  comprador: CompradorDto;

  @ValidateNested({ each: true })
  @Type(() => DetalleDto)
  @ArrayMinSize(1)
  detalles: DetalleDto[];
}
```

Enable global validation (`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`) so unexpected fields are rejected, not silently dropped or passed through. This matters especially for `ConfirmDraftDto` — it's client-submitted data from a browser, and DTO validation is the first of two layers of defense; the second is the server-side re-check against the real catalog before `draft-builder` runs, per `project-info.md`.

## Error handling

- Use a global exception filter that maps internal errors to plain-language responses **at both the WhatsApp-reply boundary and the webview API boundary** — internal errors (Core API timeout, Redis connection drop) should never leak a stack trace or technical message to the end user, whether they're seeing it as a chat message or as an error state in the Next.js UI.
- Distinguish **retryable** failures (network blip, Core API 5xx) from **terminal** ones (SRI rejection, invalid RUC) at the point they're thrown — use distinct exception classes (`RetryableCoreApiError` vs `InvoiceRejectedError`) so the BullMQ processor knows whether to let the job retry or fail permanently and notify the user.
- Never swallow an error to keep a flow moving. If catalog search fails outright (a real API error, not just zero results), that's a retryable failure, not silently treated the same as "no match."

## Async processing / BullMQ conventions

- **Job ID = WhatsApp message ID** (or, for webhook-triggered jobs, the Core API's correlation ID) — this is the idempotency mechanism that protects against Meta's webhook retry behavior causing duplicate processing. Never use an auto-generated job ID for inbound message jobs.
- One processor class per job type (`@Processor('whatsapp-inbound')`), not one giant processor with an internal switch statement.
- Processors should be thin — parse the job, delegate to a service, handle the retryable/terminal error distinction. Business logic belongs in the service, not the processor, so it's testable without spinning up BullMQ.
- Worker concurrency is set explicitly in code (`concurrency: 1` for MVP per `project-info.md`) — don't leave it at a library default, and comment *why* it's 1 so a future contributor doesn't "fix" it without understanding the ordering guarantee it provides.

## Logging

- Structured logging (Nest's built-in `Logger`, or `pino` if you want JSON logs from day one — either is fine, pick one and use it everywhere).
- **Redact before logging, not after.** Never log a full cédula/RUC, a certificate password, a raw WhatsApp access token, a Core API service token, or a webview session token. If you need to log identifying info for debugging, log a masked/truncated version (last 4 digits) — this should be a small shared utility (`common/redact.ts`), not something reimplemented per module.
- Log at the state-transition and threshold-decision boundaries (`state: idle → awaiting_webview_action`, `catalog: 3 candidates, auto-selected id=X at probabilidad=0.91`) — these are the log lines that actually help debug a stuck conversation or a wrong auto-selection, more than generic "processing message" logs.

## Docker / environment

- `Dockerfile` is multi-stage: `builder` compiles TypeScript, `production` copies only `dist/` + production `node_modules`. Never ship dev dependencies or source `.ts` files in the production image.
- `.dockerignore` excludes `node_modules`, `dist`, `.git`, `.env`.
- Never `COPY .env` into an image and never hardcode a secret via `ENV` in a Dockerfile — secrets are injected at container runtime via `env_file` in `docker-compose.yml`, not baked into image layers.
- Service-to-service hostnames inside Docker Compose use the Compose service name (`redis`, not `localhost`) — always read this from config, never hardcode, since the same code needs to work both inside Docker and (for quick local debugging) outside it.

## Testing

- **Unit tests** for `draft-builder` (including the threshold logic), `classification`, and the state-machine transitions in `conversation-state` must not depend on any live external API — mock `catalog-client`, `extraction`, and `core-api` at their interfaces. These are the modules encoding the business rules from `project-info.md` — they need the tightest test coverage in the repo.
- Write a test for every threshold-boundary case in the catalog resolution logic: empty array, one result just below the configured threshold, one result just above it, multiple results all above it — this branching directly determines what the webview shows the user, so a regression here is a UX and correctness regression, not just a bug.
- Write a test confirming `ConfirmDraftDto` submissions are re-validated against catalog data server-side, not trusted as-is — this is a security-relevant test, not just a correctness one.
- Write a test confirming `CoreApiClient` correctly falls back to a fresh login when the refresh token is also expired, not just when the access token expires.
- Integration/e2e tests that do hit real BullMQ + Redis (via the Docker Compose setup) are fine and encouraged for the queue/worker wiring itself — that's specifically the part that can't be meaningfully mocked.

## Style

- ESLint + Prettier, default NestJS starter config is a fine baseline — don't bikeshed this, just pick it and enforce it in CI.
- Prefer explicit return types on exported functions/methods, even where TypeScript could infer them — this repo has several modules where the shape of what's returned (LLM extraction output, catalog search result, invoice draft) is exactly the kind of thing that should be impossible to accidentally change without the type system complaining.
- Avoid `any`. If a third-party SDK response is genuinely untyped (LLM SDKs are common offenders), validate it into a typed shape at the boundary (`class-validator` or `zod`) rather than passing `any` deeper into the app.
- Use the branded-type pattern (see "Two JWTs" above) for any other value where two different strings could be accidentally interchanged and cause a real bug — not just tokens, consider it for `emisorId` vs. `correlationId` if that class of mistake seems plausible as the codebase grows.

## Git / PR conventions

- Branch naming: `feature/`, `fix/`, `chore/` prefixes.
- Commit messages: short imperative summary line, body explains *why* when the change isn't self-evident from the diff — especially for anything touching the message-budget, auth, or state-machine logic, where the "why" isn't visible from the code alone.
- Every PR touching `draft-builder`, `catalog`, `core-api`, or `webview-auth` should note in the description which cases were tested, given how directly those map to the product's cost, correctness, and security guarantees.