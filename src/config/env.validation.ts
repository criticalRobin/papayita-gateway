import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6380),

  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  GRAPH_API_VERSION: z.string().min(1),
  // Not required yet — we don't have it from the Meta App Dashboard. Signature
  // verification is skipped (with a startup warning) while this is unset.
  META_APP_SECRET: z.string().min(1).optional(),

  ASSEMBLYAI_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),

  // Not required — code defaults to './.cache/transformers' if unset.
  TRANSFORMERS_CACHE_DIR: z.string().min(1).optional(),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.45),

  CONVERSATION_STATE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  // Billing correction window lifetime (conversation-state/domain/
  // billing-context.ts) — shorter than a normal conversation so a stale
  // half-fixed attempt doesn't capture a message sent much later.
  BILLING_CONTEXT_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  CORE_API_BASE_URL: z.string().url(),
  WEBVIEW_BASE_URL: z.string().url(),
  LOGIN_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // How many wrong-credential attempts a single login code tolerates before
  // it's burned outright — see WebviewAuthService's login-code methods.
  LOGIN_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // How many times a single draft-confirmation exchange code can be
  // consumed before it's burned — covers reopening the CTA link after
  // accidentally closing the webview mid-review. Still bounded by
  // CONVERSATION_STATE_TTL_SECONDS regardless, and killed outright on
  // confirm via killExchangeCodeForCorrelation.
  EXCHANGE_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  SRI_AMBIENTE: z.string().min(1).default('1'),
  SRI_TIPO_EMISION: z.string().min(1).default('1'),

  INVOICE_EMISSION_PENDING_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),

  // How long to wait for Core API's comprobante.autorizado/rechazado webhook
  // after a successful emitir() call before telling the user we couldn't
  // confirm it (e.g. SRI itself is down and Core API's internal job never
  // resolves). Must stay comfortably under CONVERSATION_STATE_TTL_SECONDS so
  // the watchdog notifies the user before Redis silently expires the state.
  EMISSION_CONFIRMATION_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),

  // Categories + products, 24h safety-net TTL — refreshed on every write
  // regardless, this only matters if a cache entry is never written to.
  INVENTORY_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86400),
  // SRI's fixed catalog, 7d — no write path ever refreshes it early.
  TAX_CATALOG_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604800),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  return envSchema.parse(config);
}
