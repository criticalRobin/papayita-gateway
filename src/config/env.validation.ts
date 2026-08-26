import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),

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

  CORE_API_BASE_URL: z.string().url(),
  WEBVIEW_BASE_URL: z.string().url(),
  LOGIN_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  return envSchema.parse(config);
}
