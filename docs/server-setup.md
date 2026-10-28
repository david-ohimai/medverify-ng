# Server build guide — MedVerify NG API

> Audience: me. Every command, in order, that builds the server in `server/`, and why each piece exists.
> Part A runs what's already built. Part B rebuilds it from an empty folder, step by step. Part C explains the architecture for the defense.

Shell: **Git Bash** unless noted. Working folder: `medverify-ng/server/`.

**Stack (latest stable versions, Oct 2026):** Node 24 · TypeScript 7 · Express 5 · Prisma 7 (PostgreSQL 18 + PostGIS + pgvector) · Redis 8 (ioredis 6) · Zod 4 · Pino 10 · Vitest 5 · Supertest · Helmet · express-rate-limit 8 + rate-limit-redis · prom-client · Swagger. BullMQ 6 is installed for the scan queue (day 3).

> Prisma's npm `latest` tag currently points at a release candidate (8.0.0-rc). The server pins **7.10.1**, the newest stable, for the CLI, client and adapter together. Don't run the `npm i prisma@latest` the CLI suggests.

---

## Part A — Run it (from a fresh clone)

| # | Command | What it does |
|---|---|---|
| 1 | `node --version` | Must be **22.12 or newer** (Vitest 5 and Prisma 7 need it). This machine has 24. |
| 2 | `cd server` | |
| 3 | `npm install` | Installs every dependency from `package-lock.json` |
| 4 | `cp .env.example .env` | Local settings (PowerShell: `Copy-Item .env.example .env`) |
| 5 | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | Paste the output into `.env` as `JWT_ACCESS_SECRET` |
| 6 | `npm run db:up` | Starts Postgres (port 5433) and Redis (6379) in Docker — needs Docker Desktop running ([database guide §1](database-setup.md#1-install-docker-desktop-once)) |
| 7 | `npm run prisma:migrate` | Creates the tables |
| 8 | `npm run prisma:generate` | Builds the typed Prisma client into `src/generated/prisma` |
| 9 | `npm test` | 118 unit + HTTP tests; no database needed |
| 10 | `npm run typecheck` | Strict TypeScript check of `src/` and `tests/` |
| 11 | `npm run dev` | API on http://localhost:3000, restarts on save |
| 12 | Open http://localhost:3000/api-docs | Swagger UI — try every endpoint |
| 13 | `curl -s http://localhost:3000/health/ready` | `{"status":"ready",...}` when Postgres and Redis both answer |
| 14 | `npm run prisma:studio` | See the data at http://localhost:5555 |

End-to-end smoke test (server running, Docker up): walks register → elevate → old token revoked → refresh → reuse detected → delete my data against the real database:

```bash
npm run smoke
```

### Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`, only for the parts that changed:

| Job | What it proves |
|---|---|
| Server · typecheck, test, build | `prisma validate`, strict typecheck, 118 tests, production build |
| Server · migrations + smoke test | Starts the real Docker Postgres + Redis, applies every migration with `migrate deploy`, checks the extensions, seeds the registry, boots the built server and runs `npm run smoke` (device security + registry search + every verdict) |
| Mobile · format, analyze, test | `dart format` (120 columns), `flutter analyze --fatal-infos`, all tests |
| Mobile · Android APK | Pull requests into `main` only: obfuscated arm64 release APK, downloadable from the run for 5 days |

All Linux runners, cached dependencies, superseded runs cancelled — a full run is roughly 15–20 of the 2,000 free minutes a month on a private repo.

Production build:

```bash
npm run build          # prisma generate + tsc → dist/
npm start              # node dist/server.js
```

The full try-it walkthrough (register → refresh → elevate → see the rows) is in [database-setup.md §7–8](database-setup.md#7-start-the-server-and-try-it).

---

## Part B — Build it from scratch, step by step

### Step 1 — Project and TypeScript

```bash
mkdir server && cd server
npm init -y
npm pkg set type=module                        # ESM: Prisma 7's generated client is ESM-first
npm pkg set engines.node=">=22.12.0"
npm install -D typescript@latest tsx@latest @types/node@latest
```

Create `tsconfig.json` (type-checking; `noEmit`) and `tsconfig.build.json` (compiles only `src/` to `dist/`). Key choices:

| Option | Why |
|---|---|
| `module`/`moduleResolution: NodeNext` | Real Node ESM rules. Relative imports end in `.js` even in `.ts` files (`import { x } from "./lib/x.js"`). |
| `strict`, `noUncheckedIndexedAccess` | Catch `undefined` before it reaches production |
| `verbatimModuleSyntax` | Forces `import type` for types, so nothing type-only is emitted |
| `types: ["node"]` | TypeScript 7 no longer auto-includes every `@types` package |

`tsx` runs TypeScript directly in development (`tsx watch src/server.ts`); `tsc` compiles for production.

### Step 2 — Express and the folder structure

```bash
npm install express@latest helmet@latest cors@latest dotenv@latest zod@latest
npm install -D @types/express@latest @types/cors@latest
mkdir -p src/{routes,controllers,services,repositories,validators,middleware,lib,events,config,types,queues} tests/{unit,http}
```

The layered architecture from the bootcamp (Week 2 Day 1):

```
src/
├── server.ts          # starts listening; graceful shutdown
├── app.ts             # builds the Express app (no listen → testable)
├── routes/            # Layer 1: URL + method → middleware chain → controller
├── controllers/       # Layer 2: HTTP in/out only (req.validated → service → envelope)
├── services/          # Layer 3: business rules; plain data in/out, never req/res
├── repositories/      # Layer 4: every Prisma call lives here
├── validators/        # Zod schemas per endpoint
├── middleware/        # authenticate, authorize, validate, sanitize, rate limits, logging, metrics, errors
├── lib/               # config, logger, prisma, redis, tokens, hash, errors, response, events, metrics
├── events/            # event listeners (audit log, security signals)
├── config/            # constants, Swagger spec
├── queues/            # BullMQ queues and workers (day 3)
├── types/             # Express request augmentation
└── generated/prisma/  # generated client (git-ignored)
```

Each layer only calls the one below it: routes → controllers → services → repositories.

### Step 3 — Validated configuration (`src/lib/config.ts`)

All environment variables are validated with Zod **at startup**. A missing or weak value (e.g. `JWT_ACCESS_SECRET` under 32 characters) prints which one is wrong and exits with code 1 — the server never runs half-configured. `z.coerce.number()` turns `PORT="3000"` into a number.

Create `.env.example` (committed, placeholders) and `.env` (git-ignored, real values).

### Step 4 — Structured logging and correlation IDs

```bash
npm install pino@latest pino-http@latest
npm install -D pino-pretty@latest
```

- `src/lib/logger.ts` — Pino, JSON in production, coloured in development. Log with objects and a `namespace:action` event: `logger.info({ event: "device:registered", deviceId })`. Tokens, PINs, install ids and the `Authorization` header are **redacted** before anything is written.
- `src/lib/requestContext.ts` — `AsyncLocalStorage` holding the correlation id for the current request.
- `src/middleware/requestLogger.ts` — gives each request an id (or reuses a safe `X-Correlation-Id` from the caller), returns it in the response header, and logs one line per request. Every log line and audit row carries it, without passing it through function arguments.

### Step 5 — Database with Prisma 7

```bash
npm install -D prisma@7.10.1
npm install @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg@latest
npm install -D @types/pg@latest
npx prisma init --datasource-provider postgresql
```

Then:
1. Write `prisma.config.ts` (loads `.env`, points at the schema and migrations).
2. Write the models in `prisma/schema.prisma` — generator `prisma-client` with `output = "../src/generated/prisma"`, `moduleFormat = "esm"`, `importFileExtension = "js"`; datasource with `extensions = [postgis, vector, pg_trgm]` (preview feature `postgresqlExtensions`).
3. Start Docker: create `docker-compose.yml`, `docker/postgres/Dockerfile`, `docker/postgres/init/01-init.sql` ([database guide](database-setup.md)), then `npm run db:up`.
4. Create and apply the first migration, then generate the client:
   ```bash
   npx prisma format
   npx prisma validate
   npx prisma migrate dev --name init
   npx prisma generate
   ```
5. `src/lib/prisma.ts` — one `PrismaClient` for the whole process, through the `PrismaPg` adapter.

Tables today: `devices`, `refresh_tokens`, `audit_logs`.

### Step 6 — Redis

```bash
npm install ioredis@latest
```

`src/lib/redis.ts` — one shared connection with `keyPrefix: "medverify:"` and `lazyConnect` (tests can import the app without Redis; `server.ts` waits for `PING` at startup). BullMQ will get its own connections on day 3.

### Step 7 — Response envelope and error classes

- `src/lib/response.ts` — every response is `{ success, message, statusCode, code, data, errors, meta }`. The mobile app parses this one shape.
- `src/lib/errors.ts` — `AppError` (operational: the client can act on it) and subclasses `ValidationError` 422, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `RateLimitError` 429. Each has a machine-readable `code` (`TOKEN_EXPIRED`, `INVALID_PIN`…) the app can branch on.
- `src/middleware/errorHandler.ts` — registered **last**. AppErrors go back as they are; bad JSON → 400; Prisma unique violation → 409; anything else is a bug → logged with secrets scrubbed (`src/lib/scrub.ts`), client gets a generic 500 with no stack trace.

Express 5 forwards rejected promises from `async` handlers to the error handler, so controllers need no `try/catch` or `asyncHandler` wrapper.

### Step 8 — Security middleware

```bash
npm install xss@latest express-rate-limit@latest rate-limit-redis@latest
```

| Layer | File | What it stops |
|---|---|---|
| Security headers + CSP `default-src 'none'` | `app.ts` (helmet) | Clickjacking, MIME sniffing, injected scripts; Swagger gets its own looser CSP |
| CORS allowlist (empty by default) | `app.ts` | Other websites calling the API from a browser. Never `*` |
| Body limit 100 kB | `app.ts` | Huge JSON payloads |
| Sanitising | `middleware/sanitize.ts` | HTML/script tags in any string, **before** validation |
| Validation (strict) | `middleware/validate.ts` + `validators/` | Wrong shapes, and unknown fields (e.g. sending `"role":"regulator"` on register → 422) |
| Rate limits in Redis | `middleware/rateLimiter.ts` | Floods, PIN guessing, device-minting. Standard `RateLimit` headers + `Retry-After` |
| Access tokens | `lib/tokens.ts`, `middleware/authenticate.ts` | HS256 pinned (`alg: none` rejected), issuer/audience/type checked, 15-minute life. Each token carries the device's **token version**; `authenticate` checks it against the device (Redis-cached 60 s) so demote, re-registration and delete-my-data revoke old tokens **immediately** (`TOKEN_REVOKED`). The role used for authorisation comes from the device, not the token |
| Refresh-token rotation + reuse detection | `services/token.service.ts` | A stolen refresh token: reusing a **rotated** one revokes the whole chain. Each revocation records a reason (`rotated` / `session_reset` / `reuse_detected`), so a token ended by a role change is just stale — no false security alert |
| Hashing | `lib/hash.ts` | DB leak: install ids and refresh tokens are stored as SHA-256 only |
| Constant-time PIN check | `lib/hash.ts` `secureEquals` | Timing attacks on the regulator PIN |
| Role guard | `middleware/authorize.ts` | Public devices calling regulator endpoints |
| Trust proxy = exact hop count | `app.ts` | Spoofed `X-Forwarded-For` dodging rate limits |
| Redaction + scrubbing | `lib/logger.ts`, `lib/scrub.ts` | Secrets in logs |

Rate limits (they stack — a request passes every limiter on its route):

| Limiter | Key | Limit |
|---|---|---|
| `register` | IP | 20 / hour |
| `refresh` | IP | 30 / 15 min |
| `api` | device | 300 / 15 min (public), 1000 (regulator) |
| `pin-device` | device | 5 **wrong** PINs / 15 min |
| `pin-ip` | IP | 10 wrong PINs / hour — new device ids don't buy more guesses |
| `pin-global` | everyone | 30 wrong PINs / 15 min — many IPs don't either (≈2,900 guesses/day max; use 8+ digits beyond the demo) |
| `scan`, `chat` | device | added with those features |

### Step 9 — Events and the audit trail

`src/lib/events.ts` is a typed `EventEmitter`. Services **emit** (`device:registered`, `device:elevated`, `token:reuse-detected`…); listeners in `src/events/` **react**:

- `audit.events.ts` writes `audit_logs` rows (with the correlation id).
- `security.events.ts` counts failed PINs and token reuse in `/metrics` and logs warnings.

`events/listen.ts` wraps every listener so a failure is logged and never breaks the request. `app.ts` imports `./events/index.js` once.

### Step 10 — The device feature (one full vertical slice)

Built in this order, one layer at a time:

1. `validators/device.validator.ts` — Zod: `installId` must be a UUID v4, `platform` ∈ android/ios, `appVersion` like `1.0.0+1`, `language` defaults to `en`; PIN 6–12 digits.
2. `repositories/device.repository.ts`, `refreshToken.repository.ts`, `auditLog.repository.ts` — Prisma calls only. Token rotation runs in a `$transaction` and only succeeds if the old token is still unrevoked, so two simultaneous refreshes can't both win.
3. `services/token.service.ts` — issue pair, rotate, detect reuse, revoke.
4. `services/device.service.ts` — register (re-registering resets the role to public and revokes old sessions), elevate with PIN, demote, update preferences, delete.
5. `controllers/device.controller.ts` — reads `req.validated` and `req.device`, calls the service, sends the envelope, sets `Cache-Control: no-store` on anything returning tokens.
6. `routes/device.routes.ts` — the middleware chain per route, with `@openapi` comments for Swagger.

Endpoints:

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/devices/register` | — | Silent registration → device + tokens |
| POST | `/api/v1/devices/refresh` | — | Rotate the refresh token |
| GET / PATCH / DELETE | `/api/v1/devices/me` | access token | Profile / preferences / delete my data |
| POST | `/api/v1/devices/me/elevate` | access token | Regulator PIN → new tokens with the regulator role |
| POST | `/api/v1/devices/me/demote` | access token | Back to public |
| GET | `/api/v1/products/search?q=` | access token | Registry search: NAFDAC number prefix or fuzzy name (pg_trgm) |
| GET | `/api/v1/products/:nafdacNo` | access token | One product and its known batches |
| POST | `/api/v1/verify/manual` | access token | Typed-in check → verdict, risk score, confidence, signals; saved as a scan |
| GET | `/api/v1/scans`, `/api/v1/scans/:id` | access token | This device's scan history (paginated) / one scan |
| GET | `/health`, `/health/live` | — | Process is up |
| GET | `/health/ready` | — | Postgres and Redis answer (503 if not) |
| GET | `/metrics` | `METRICS_TOKEN` if set | Prometheus |
| GET | `/api-docs`, `/api-docs.json` | — | Swagger UI / OpenAPI spec |

### Step 10b — The registry and manual verification

```bash
npm install csv-parse@latest
npm run prisma:migrate -- --name registry_and_scans
npm run prisma:generate
npm run seed
```

| Piece | File | What it does |
|---|---|---|
| Schema | `prisma/schema.prisma` | `products` (unique NAFDAC no., GIN **trigram** indexes on brand and generic name), `batches` (unique per product, expiry, recall flag), `scans` (every check, its verdict and signals as JSONB; deleting a device keeps scans but drops the link) |
| Normalisation | `lib/nafdac.ts`, `lib/dates.ts` | `"NAFDAC Reg. No: a4 – 1234"` → `A4-1234`; `2027-08` → 31 Aug 2027 (packs print months) |
| Import | `prisma/seed.ts`, `prisma/seed/registry-import.ts`, `prisma/seed/data/` | Zod-validates every CSV row, reports `file:line field: problem`, writes **nothing** if any row is bad, upserts in one transaction, clears the registry cache. Idempotent. Demo rows are fictional (`X9-`, `source: demo`) |
| Rules | `services/risk/registrySignals.ts` | Registry facts → weighted, explained signals (pure function) |
| Scorer | `services/risk/riskScorer.ts` | Signals → 0–100 score, verdict, confidence (pure function; reused by the photo pipeline) |
| Lookup | `services/registry.service.ts`, `repositories/product.repository.ts` | Cache-aside product lookup (10 min, misses 60 s); trigram search and name similarity in parameterised `$queryRaw` |
| Flow | `services/verification.service.ts` | Look up → rules → score → save scan → emit `scan:completed` (audit row + `scans_total` metric) |

The rules (weights add up, clamped 0–100; ≥30 suspicious, ≥65 high risk):

| Signal | Weight | Effect |
|---|---|---|
| `NOT_IN_REGISTRY` | +45 | Verdict **unregistered** |
| `BATCH_RECALLED` | +50 | Always **high risk** |
| `EXPIRED` | +35 | Always **high risk**, headline "Expired — do not take it" |
| `NAME_MISMATCH` (real number, wrong product) | +40 | |
| `REGISTRATION_INACTIVE` (expired/cancelled) | +35 | |
| `EXPIRY_MISMATCH` (printed vs record, by month) | +30 | |
| `BATCH_KNOWN` | −10 | Only when nothing else about the product or batch is wrong |
| `BATCH_UNKNOWN` / `BATCH_NOT_GIVEN` | 0 | Lowers **confidence** (our batch records are incomplete) |
| `PACK_NOT_SEEN` | 0 | Typed-in checks are at most **medium** confidence — fakes copy real numbers |

### Step 11 — Observability

```bash
npm install prom-client@latest swagger-jsdoc@latest swagger-ui-express@latest
npm install -D @types/swagger-jsdoc@latest @types/swagger-ui-express@latest
```

- `lib/metrics.ts` + `middleware/metrics.ts` — request counter and duration histogram labelled by **route pattern** (`/devices/me`), never raw URLs, so ids don't explode the number of series. Plus `rate_limited_requests_total` and `security_events_total`.
- `routes/health.routes.ts` — liveness vs readiness, each check with a 2-second timeout.
- `config/swagger.ts` — OpenAPI 3.1 built from the `@openapi` comments.

### Step 12 — Startup and shutdown (`src/server.ts`)

Starts only after a real `SELECT 1` and a Redis `PING` succeed (with the Prisma 7 adapter, `$connect()` alone proves nothing). On `SIGINT`/`SIGTERM` it stops accepting requests, lets in-flight ones finish, closes Postgres and Redis, and force-exits after 10 seconds.

### Step 13 — Tests

```bash
npm install -D vitest@latest supertest@latest @types/supertest@latest
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
```

`vitest.config.ts` supplies a test environment, so tests never read your `.env`.

| File | Covers |
|---|---|
| `tests/unit/tokens.test.ts` | Sign/verify, wrong secret, `alg: none`, wrong type, expiry, refresh token hashing |
| `tests/unit/security.test.ts` | Constant-time compare, hashing, scrubbing of tokens / URLs / passwords |
| `tests/unit/token.service.test.ts` | Rotation, expired, unknown, **reuse → family revoked + event**, concurrent refresh |
| `tests/unit/device.service.test.ts` | New vs re-registration, raw install id never stored, wrong/right PIN |
| `tests/http/app.test.ts` | Health, correlation ids, security headers, 404/400/422 envelopes, mass-assignment blocked, auth errors, sanitising, **PIN rate limit → 429** |
| `tests/unit/nafdac.test.ts` | Every printed form of a NAFDAC number, batch numbers, month/day expiries, impossible dates |
| `tests/unit/riskScorer.test.ts` | Bands, clamping, the unregistered / recalled / expired overrides, confidence rules, no "100% safe" wording |
| `tests/unit/registrySignals.test.ts` | Every manual-check case: valid, unregistered, cloned number, cancelled, recalled, expired, expiry mismatch, unknown / missing batch |
| `tests/unit/registry-import.test.ts` | CSV parsing, `file:line` errors, duplicates, orphan batches, the committed demo data is valid and fictional |
| `tests/unit/verification.service.test.ts` | Lookups only when needed, scan saved, event emitted |
| `tests/http/verification.test.ts` | Auth, input normalisation, 422s, search limits, history paging, UUID params |

```bash
npm test
npm run typecheck
```

### Step 14 — Scripts in `package.json`

| Script | Runs |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` / `start` | `prisma generate && tsc -p tsconfig.build.json` / `node dist/server.js` |
| `typecheck` / `test` / `test:watch` | `tsc --noEmit` / `vitest run` / `vitest` |
| `db:up` / `db:stop` / `db:wipe` | Docker compose up / stop / down **-v** |
| `db:psql` / `redis:cli` | Shells inside the containers |
| `prisma:migrate` / `prisma:deploy` / `prisma:status` | `migrate dev` / `migrate deploy` / `migrate status` |
| `prisma:generate` / `prisma:studio` / `prisma:reset` | Client / data browser (port 5555) / wipe tables and re-migrate |
| `seed` | Load the registry CSVs (`-- --no-demo` to skip the fictional rows) |
| `smoke` | End-to-end checks against a running server |

---

## Part C — Architecture, for the defense

**One sentence:** a layered Express API — routes route, controllers translate HTTP, services hold the rules, repositories hold the queries — with validation, sanitising, auth and rate limits as middleware in front, and side effects (audit, metrics) moved out to event listeners.

**Request life cycle** (`POST /api/v1/devices/me/elevate`):

```
correlationId → requestLogger → helmet → cors → express.json → sanitizeInput → metrics
→ router: authenticate → apiLimiter → pinLimiter → validate(elevateDeviceSchema)
→ deviceController.elevate → deviceService.elevate → deviceRepository / tokenService
→ appEvents.emit("device:elevated") → audit + security listeners
→ sendSuccess (envelope)        └─ on any throw → errorHandler (envelope)
```

**Why no sign-up?** Adoption is the proposal's top risk. The device is the identity: the app generates a random UUID once, stores it in the phone's secure storage, and the server stores only its hash. That still gives per-device rate limits, history and an audit trail.

**Questions to be ready for** (from the bootcamp's defense lists, answered by this code):

| Question | Where the answer is |
|---|---|
| Why does the controller never import Prisma? | Repositories own queries — change a query in one file |
| Why validate config at startup and exit? | `lib/config.ts` — a half-configured server fails silently later |
| Why two tokens? Why hash the refresh token? | `services/token.service.ts`, `lib/tokens.ts` |
| What's a timing attack? | `lib/hash.ts` `secureEquals` (regulator PIN) |
| Why limit auth by IP but the API by device? | No device identity exists before registration |
| Why Redis-backed limits, not in-memory? | Several instances must share one counter |
| Validation vs sanitisation? | `middleware/validate.ts` (shape) vs `middleware/sanitize.ts` (content) |
| Why `default-src 'none'` on an API? | It serves no HTML; nothing should ever load |
| Liveness vs readiness? | `routes/health.routes.ts` |
| Why normalise metric paths? | `middleware/metrics.ts` — cardinality |
| Why events for audit logs? | `events/` — services stay single-purpose; a listener failure never breaks a request |
| Why is the risk score rules, not ML? | No labelled field data yet; transparent weights are explainable and tunable on the eval set (`services/risk/`) |
| Why can a typed-in check never be "high confidence genuine"? | Counterfeiters copy real numbers; only the pack itself can show that (`PACK_NOT_SEEN`) |
| Why trigram search, not embeddings, for names? | Typos and OCR misreads are character-level; pg_trgm is exact, indexed and free |
| Why cache misses too? | Repeated probing of unknown numbers would otherwise hit the database every time |
