# Server build guide — MedVerify NG API

> Audience: me. Every command, in order, that builds the server in `server/`, and why each piece exists.
> Part A runs what's already built. Part B rebuilds it from an empty folder, step by step. Part C explains the architecture for the defense.

Shell: **Git Bash** unless noted. Working folder: `medverify-ng/server/`.

**Stack (latest stable versions, Oct 2026):** Node 24 · TypeScript 7 · Express 5 · Prisma 7 (PostgreSQL 18 + PostGIS + pgvector) · Redis 8 (ioredis 6) · BullMQ 6 · Zod 4 · Pino 10 · Vitest 5 · Supertest · Helmet · express-rate-limit 8 + rate-limit-redis · prom-client · Swagger · `@google/genai` 2 (Gemini) · `openai` 7 (OpenRouter) · opossum 10 · multer 2 · sharp 0.35.

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
| 6 | Open https://aistudio.google.com → **Get API key** → **Create API key** | Free, no card. Paste it into `.env` as `GEMINI_API_KEY=…` — never into a chat, an issue or a commit. Optional: an OpenRouter key as `OPENROUTER_API_KEY` for the fallback. Without a key, everything except photo scans still works |
| 7 | `npm run db:up` | Starts Postgres (port 5433) and Redis (6379) in Docker — needs Docker Desktop running ([database guide §1](database-setup.md#1-install-docker-desktop-once)) |
| 8 | `npm run prisma:migrate` | Creates the tables |
| 9 | `npm run prisma:generate` | Builds the typed Prisma client into `src/generated/prisma` |
| 9b | `npm run seed` | Loads the registry CSVs, the genuine-pack reference photos and the AI prompt versions |
| 9c | `npm test` | 186 unit + HTTP tests; no database, Redis or AI key needed |
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
| Server · typecheck, test, build | `prisma validate`, strict typecheck, 186 tests, production build |
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
├── ai/                # model control plane: providers, tasks, prompts, retry/circuit breaker, quota
├── queues/            # BullMQ queues, photo store, dead-letter queue
├── workers/           # BullMQ workers (scan pipeline)
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
| `verify` | device | 20 typed-in checks / min (public), 60 (regulator) |
| `search` | device | 60 searches / min (public), 120 (regulator) |
| `scan-upload` | device | 10 photo scans / min (public), 30 (regulator) |
| `scan-daily` | device | 60 photo scans / day (public), 200 (regulator) — also protects the shared free AI quota |
| `chat` | device | added with the agent |

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
| GET | `/api/v1/products/:nafdacNo` | access token | One product, its known batches and its reference photos (metadata) |
| GET | `/api/v1/products/:nafdacNo/reference-images/:id` | access token | A genuine-pack photo (JPEG, ETag) |
| POST | `/api/v1/verify/manual` | access token | Typed-in check → verdict, risk score, confidence, signals; saved as a scan |
| GET | `/api/v1/scans`, `/api/v1/scans/:id` | access token | This device's scan history (paginated) / one scan (with `status`: pending → processing → done / failed) |
| POST | `/api/v1/scans` | access token | Pack photo (multipart field `image`) → **202** `{ scanId, eventsUrl, statusUrl }`; the AI reads it in the background |
| GET | `/api/v1/scans/:id/events` | access token | **SSE**: `step` events as the pipeline runs, then `verdict` or `error` |
| GET | `/api/v1/ai/status` | regulator | Provider chain, circuit state, today's free quota, active prompt versions, 24 h usage |
| GET / POST | `/api/v1/ai/prompts` | regulator | List prompt versions / add a new one (optionally activate) |
| POST | `/api/v1/ai/prompts/:id/activate` | regulator | Switch (or roll back) a task's prompt — takes effect immediately |
| GET | `/api/v1/ai/calls` | regulator | Recent rows of `ai_audit_logs` |
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
| Import | `prisma/seed.ts`, `prisma/seed/registry-import.ts`, `repositories/registryImport.repository.ts`, `prisma/seed/data/` | Zod-validates every CSV row, reports `file:line field: problem`, writes **nothing** if any row is bad. Then, in one transaction, bulk upserts (`INSERT … SELECT FROM unnest(…) ON CONFLICT`, 1,000 rows per statement) and **removes rows no longer in the CSVs**, so the database always matches them. Refuses to empty the registry. Clears the registry cache. Demo rows are fictional (`X9-`, `source: demo`) |
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
| `DEMO_RECORD` | 0 | The match is fictional test data: says so, and confidence is always **low** |

### Step 10c — The AI layer and photo scans

```bash
npm install @google/genai@latest openai@latest opossum@latest multer@latest sharp@latest
npm install -D @types/opossum@latest @types/multer@latest
npm run prisma:migrate -- --name ai_layer_and_photo_scans
npm run prisma:generate
npm run seed                      # also stores prompt version 1 of every AI task
```

Then put `GEMINI_API_KEY` in `.env` (Part A, step 6) and restart `npm run dev`. The startup log shows `AI provider chain ready` with the models in use.

**The model control plane** (`src/ai/`) — nothing outside it imports a vendor SDK:

| Piece | File | What it does |
|---|---|---|
| Interface | `ai/types.ts` | `LlmProvider.generateJson()`; `LlmError` says whether a failure is retryable and carries the provider's Retry-After |
| Providers | `ai/providers/gemini.provider.ts`, `openrouter.provider.ts` | Gemini via `@google/genai` (`responseJsonSchema`); OpenRouter via the `openai` SDK with a different `baseURL`. SDK retries off — ours are smarter |
| Tasks | `ai/tasks.ts` | Each task fixes its **Zod output schema**, model tier and token cap. Zod 4's `z.toJSONSchema()` turns the schema into the provider's JSON Schema, and the same schema validates the reply |
| Prompts | `ai/prompts.ts`, `repositories/prompt.repository.ts` | Prompt text is **versioned in `prompt_versions`**: one active version per task, cached 5 min; the built-in prompt is the fallback |
| Resilience | `ai/resilience.ts` | `withRetry` (exponential backoff, **Retry-After wins**, gives up at once if the wait is too long so the fallback answers) inside an **opossum circuit breaker** per provider |
| Budget | `ai/quota.ts` | A Redis counter per provider per UTC day, kept under the free tier's cap; spent → next provider; all spent → `429 AI_QUOTA_EXHAUSTED` |
| Orchestrator | `ai/llm.service.ts` | Prompt → provider chain (skip open circuit / spent budget) → retry → validate → **one repair round** with the validation errors → next provider. Emits `ai:called` per attempt |
| Audit | `events/audit.events.ts` → `ai_audit_logs` | Task, provider, model, prompt version, success / error code, fallback used, tokens, latency, scan id, correlation id. Inputs are summarised — **never the image** |
| Metrics | `events/metrics.events.ts` | `ai_calls_total`, `ai_call_duration_seconds`, `ai_tokens_total`, `scan_jobs_total` |

**The photo pipeline:**

```
POST /scans ── multer (memory, 8 MB cap) ── prepareImage (decode = real type check, ≥480 px,
   │             rotate, resize to 1600 px, re-encode JPEG → EXIF/GPS stripped, SHA-256)
   ├─ scans row: status pending      ├─ photo → Redis (30 min TTL, never disk or a bucket)
   └─ BullMQ "scan-pipeline" job (jobId = scanId, 3 attempts, exponential backoff) → 202
worker (in-process, or `npm run worker`):
   claim (pending → processing, once) → read_label (cache by photo hash + prompt version,
   else Gemini → OpenRouter) → registry → batch_check → compare_pack (Step 10d) → score
   → scans row done → scan:completed → SSE "verdict" → photo deleted
   final failure → scan failed with a reason code → dead-letter queue "scan-pipeline-dlq"
```

| Piece | File |
|---|---|
| Upload + validation | `middleware/upload.ts`, `lib/image.ts` |
| Queue, photo store, DLQ | `queues/scan.queue.ts` (connections opened on first use, so tests need no Redis) |
| Worker | `workers/scan.worker.ts`, `worker.ts` (standalone) |
| Pipeline | `services/photoScan.service.ts` — `submit` and `process`; `factsFromLabel` ignores any field the model was under 60 % sure of |
| Shared rules | `services/verification.service.ts` `checkAgainstRegistry` — the **same** registry rules and scorer as a typed-in check, with `packNotSeen: false` |
| Progress | `lib/scanProgress.ts` — each step goes into a Redis list (replay for late or reconnecting clients) **and** a pub/sub channel (live). Works across processes |
| SSE | `controllers/photoScan.controller.ts` — subscribes before replaying, `id:` on every event (`Last-Event-ID` resumes), 15 s heartbeat, closes after `verdict`/`error` or 3 min |
| Control plane API | `routes/ai.routes.ts`, `services/aiAdmin.service.ts` — regulator only |

A photo that can't be read ends as `failed` with a reason the user can act on — `NOT_A_MEDICINE_PACK`, `NAFDAC_NO_UNREADABLE`, `IMAGE_EXPIRED`, `AI_UNAVAILABLE`, `AI_QUOTA_EXHAUSTED` — not as a guess.

**Try it** (server running, key set; Git Bash):

```bash
API=http://localhost:3000/api/v1
TOKEN=$(curl -s -X POST $API/devices/register -H 'Content-Type: application/json' \
  -d "{\"installId\":\"$(node -e 'console.log(crypto.randomUUID())')\",\"platform\":\"android\",\"appVersion\":\"1.0.0+1\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.tokens.accessToken')

# 1. Upload a pack photo → 202 with a scanId
curl -s -X POST $API/scans -H "Authorization: Bearer $TOKEN" -F "image=@/c/path/to/pack.jpg"

# 2. Watch it think (paste the scanId)
curl -N $API/scans/<scanId>/events -H "Authorization: Bearer $TOKEN"

# 3. The stored result
curl -s $API/scans/<scanId> -H "Authorization: Bearer $TOKEN"
```

Then look at `ai_audit_logs` and `prompt_versions` in Prisma Studio (`npm run prisma:studio`). The control-plane endpoints need regulator mode: `POST $API/devices/me/elevate` with `{"pin":"246810"}`, then use the new access token on `GET $API/ai/status`.

Scanning the same photo again is answered from the cache: no AI call, no quota used (`llmProvider: "cache"`).

### Step 10d — Pack comparison, photo signals and the eval set

```bash
npm run prisma:migrate -- --name reference_images
npm run prisma:generate
npm run demo-images        # draws the fictional demo packs (already committed; only to regenerate)
npm run seed               # registry + reference photos + prompt versions (now also compare_pack)
npm run eval               # golden eval set, cached answers
npm run eval -- --fresh    # golden eval set, real AI calls
```

| Piece | File | What it does |
|---|---|---|
| Reference photos | `prisma/seed/reference/<NAFDAC no>/front-1.jpg`, `prisma/seed/reference-import.ts`, `repositories/referenceImage.repository.ts` | Photos of the **genuine** pack, validated and re-encoded to 1024 px, stored in `reference_images` (bytes in Postgres — no bucket). The seed syncs the table to the folder. See the folder's README |
| Comparison task | `ai/tasks.ts` `compare_pack` | Up to two references (front first) + the scan in one vision call → `comparable`, `same_product`, logo / colour / typography / layout / print scores, real differences (lighting and angle excluded), overall similarity |
| Photo rules | `services/risk/photoSignals.ts` | Pure function, weights from the plan (below). `combineSignals` drops `BATCH_KNOWN` when the pack itself looks wrong — fakes copy batch numbers |
| Pipeline | `services/photoScan.service.ts` `analysePhoto` | read_label → registry → batch → **compare_pack** (skipped for unregistered numbers; no reference / AI down → `PACK_NOT_COMPARED`, the scan still completes) → score. Comparison answers are cached by photo hash + references + prompt version |
| Genuine photo for the app | `GET /products/:nafdacNo/reference-images/:id` | The JPEG, with an ETag, to show "yours vs genuine" side by side |
| Eval | `eval/cases.json`, `eval/fixtures/`, `scripts/eval.ts` | Runs `analysePhoto` on every case; reports fakes passed as genuine (must be 0), false alarms, verdict and field accuracy, latency → `eval/results/latest.md`. See `eval/README.md` |
| Demo packs | `scripts/generate-demo-images.ts` | Draws the fictional X9- packs (reference + 8 scans) so the pipeline can be shown without real photos |

Photo signals (they add to the registry signals in Step 10b):

| Signal | Weight | Effect |
|---|---|---|
| `VISUAL_MISMATCH` (similarity < 0.80) | (0.80 − similarity) × 75, 1–30 | Detail lists the major differences |
| `VISUAL_MISMATCH` (a different product) | +30 | |
| `TEXT_ANOMALIES` | +10 each, max +20 | Misspellings, odd fonts, smudged reprinting |
| `VISUAL_MATCH` (similarity ≥ 0.85) | −20 | Only with clean records and no text anomalies |
| `PACK_NOT_COMPARED` | 0 | No reference / other side / AI unavailable: a clean result is at most **medium** confidence |
| `POOR_IMAGE` | 0 | **Low** confidence — retake the photo |

Confidence is now: demo record → low; a hard fact behind a warning → high; any uncertainty (unknown batch, poor photo) → low; a warning built only on inferences (looks, spelling) → medium; clean but pack not seen / not compared → medium; otherwise high.

Every AI attempt also has a hard deadline (`LLM_TIMEOUT_MS`, 30 s): a hung free model is cut off and the fallback answers.

### Step 11 — Observability

```bash
npm install prom-client@latest swagger-jsdoc@latest swagger-ui-express@latest
npm install -D @types/swagger-jsdoc@latest @types/swagger-ui-express@latest
```

- `lib/metrics.ts` + `middleware/metrics.ts` — request counter and duration histogram labelled by **route pattern** (`/devices/me`), never raw URLs, so ids don't explode the number of series. Plus `rate_limited_requests_total` and `security_events_total`.
- `routes/health.routes.ts` — liveness vs readiness, each check with a 2-second timeout.
- `config/swagger.ts` — OpenAPI 3.1 built from the `@openapi` comments.

### Step 12 — Startup and shutdown (`src/server.ts`)

Starts only after a real `SELECT 1` and a Redis `PING` succeed (with the Prisma 7 adapter, `$connect()` alone proves nothing), logs the AI provider chain, and starts the scan worker if `SCAN_WORKER_ENABLED=true`. On `SIGINT`/`SIGTERM` it stops accepting requests, lets in-flight ones finish (open SSE streams are cut after 3 seconds), lets running scan jobs finish, closes the queues, Postgres and Redis, and force-exits after 10 seconds.

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
| `tests/unit/registry.service.test.ts` | When a search query counts as a NAFDAC number prefix ("nafdac" never matches everything) |
| `tests/http/verification.test.ts` | Auth, input normalisation, 422s, search limits, history paging, UUID params |
| `tests/unit/llm.service.test.ts` | Primary answers; retry then fallback (`fallbackUsed`); long Retry-After → fallback at once; repair round for invalid JSON; spent budget skipped / `AI_QUOTA_EXHAUSTED`; `AI_UNAVAILABLE`; circuit opens and stops calling a failing provider; audit events |
| `tests/unit/resilience.test.ts` | Retry-After honoured, too-long waits not, non-retryable errors never retried; Gemini retry-delay parsing |
| `tests/unit/photoScan.test.ts` | AI reading → registry facts (normalised, unsure fields dropped); image validation: not an image → 415, too small → 422, resized and **EXIF stripped** |
| `tests/unit/photoSignals.test.ts` | Visual match / mismatch weights and bands, different product, text anomalies, not compared, poor photo, `BATCH_KNOWN` dropped when the pack looks wrong, the new confidence rules |
| `tests/unit/reference-import.test.ts` | Reference folder loading: resize + hash, file/folder naming errors, non-images, skipped demo folders |
| `tests/http/scans.test.ts` | Upload auth, 202 + Location, missing / wrong-field file, 413 over 8 MB, SSE 404 for another device, control plane regulator-only |

```bash
npm test
npm run typecheck
```

### Step 14 — Scripts in `package.json`

| Script | Runs |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` / `start` | `prisma generate && tsc -p tsconfig.build.json` / `node dist/server.js` |
| `worker` / `worker:dev` | Scan worker on its own (`node dist/worker.js` / `tsx watch src/worker.ts`) — set `SCAN_WORKER_ENABLED=false` on the API then |
| `typecheck` / `test` / `test:watch` | `tsc --noEmit` / `vitest run` / `vitest` |
| `db:up` / `db:stop` / `db:wipe` | Docker compose up / stop / down **-v** |
| `db:psql` / `redis:cli` | Shells inside the containers |
| `prisma:migrate` / `prisma:deploy` / `prisma:status` | `migrate dev` / `migrate deploy` / `migrate status` |
| `prisma:generate` / `prisma:studio` / `prisma:reset` | Client / data browser (port 5555) / wipe tables and re-migrate |
| `seed` | Load the registry CSVs (`-- --no-demo` to skip the fictional rows), sync the reference photos, and ensure every AI task has a stored prompt version |
| `eval` | Golden eval set (`-- --fresh` for real AI calls) |
| `demo-images` | Redraw the fictional demo packs |
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
| Why 202 + a queue instead of answering the upload directly? | An AI call takes seconds and can fail; the request returns at once, the job retries with backoff, a dead job lands in the DLQ (`queues/scan.queue.ts`) |
| Why SSE, not WebSockets? | One-way server → app progress over plain HTTP; auth header, proxies and reconnection (`Last-Event-ID`) just work |
| How do you switch AI provider or model? | Configuration (`LLM_PRIMARY`, `GEMINI_VISION_MODEL`…), not code: everything goes through `LlmProvider` (`ai/types.ts`) |
| What happens when Gemini is down or rate-limited? | Retry (Retry-After) → circuit breaker → OpenRouter fallback → clear 503/429; every attempt is in `ai_audit_logs` |
| How do you stop the model hallucinating a NAFDAC number? | Prompt says "null rather than guess"; JSON validated by Zod; fields under 60 % confidence are ignored; the number must match the NAFDAC format; and the **registry**, not the model, decides the verdict |
| How do you change a prompt safely? | New row in `prompt_versions`, activate it; roll back by activating the old one. Every AI call records its prompt version |
| What about privacy? | Photos are re-encoded (GPS/EXIF gone), kept in Redis ≤ 30 min, never stored; audit rows hold a hash, not the image |
| How do you know it works? | `npm run eval`: a golden set of packs with known answers; the headline metric is fakes passed as genuine (must be 0) — `eval/results/latest.md` |
| Can the AI's opinion of the pack override the registry? | No. A recall, expiry or unregistered number decides on its own; looks only add or remove weight, and a warning built only on looks is never high confidence |
| What if there's no photo of the genuine pack? | The scan still completes on the registry facts, with `PACK_NOT_COMPARED` capping a clean result at medium confidence |
| How do you protect the free quota? | Per-device scan limits, a daily budget per provider in Redis, and a cache keyed by photo hash + prompt version |
