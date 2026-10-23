import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    // Unit and HTTP tests never touch Postgres or Redis: repositories are mocked,
    // rate limiters use memory, and the Redis client connects lazily.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/medverify_test",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test-secret-that-is-definitely-at-least-32-chars",
      ACCESS_TOKEN_TTL: "15m",
      REFRESH_TOKEN_TTL_DAYS: "30",
      REGULATOR_DEMO_PIN: "246810",
      SWAGGER_ENABLED: "true",
    },
  },
});
