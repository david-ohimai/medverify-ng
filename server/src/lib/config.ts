import "dotenv/config";
import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

const bool = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

/** An optional secret: unset and "" both mean "not configured". */
const optionalSecret = z
  .string()
  .min(16)
  .optional()
  .or(z.literal("").transform(() => undefined));

const llmProvider = z.enum(["gemini", "openrouter"]);

/**
 * Every setting the server reads, validated once at startup. A missing or weak
 * value stops the process with a clear message instead of failing later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_URL_READONLY: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().regex(/^\d+[smhd]$/, "ACCESS_TOKEN_TTL must look like 15m").default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  REGULATOR_DEMO_PIN: z.string().regex(/^\d{6,12}$/, "REGULATOR_DEMO_PIN must be 6-12 digits"),

  METRICS_TOKEN: optionalSecret,
  SWAGGER_ENABLED: bool("true"),

  // AI providers. A provider without a key is simply left out of the chain.
  LLM_PRIMARY: llmProvider.default("gemini"),
  LLM_FALLBACK: llmProvider.or(z.literal("none")).default("openrouter"),
  /** Hard deadline per AI attempt. Vision calls normally take 5–15 s. */
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_VISION_MODEL: z.string().min(3).default("gemini-3.5-flash"),
  GEMINI_LIGHT_MODEL: z.string().min(3).default("gemini-3.5-flash-lite"),
  /** Calls per UTC day we allow ourselves — kept under the free tier's own cap. */
  GEMINI_DAILY_LIMIT: z.coerce.number().int().min(0).default(200),
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_MODEL: z.string().min(3).default("nvidia/nemotron-3.5-super-vl:free"),
  OPENROUTER_DAILY_LIMIT: z.coerce.number().int().min(0).default(45),

  /** Run the scan worker inside the API process (development, single instance). */
  SCAN_WORKER_ENABLED: bool("true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on config, so this is the one place console is used.
  console.error("\nInvalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in the values.\n");
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
} as const;
