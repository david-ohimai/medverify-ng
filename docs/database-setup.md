# Database setup — PostgreSQL + Redis in Docker, managed with Prisma

> Audience: me, on Windows 11, running the MedVerify database for the first time.
> Goal: start PostgreSQL (with PostGIS, pgvector, pg_trgm) and Redis, create the tables with Prisma, run the server against them, run the tests, and **see the data** in Prisma Studio. Everything here is free.

Commands are for **Git Bash** (the VS Code terminal can use it). Where PowerShell differs, the PowerShell version is given too. Run everything from `medverify-ng/server/` unless a step says otherwise.

---

## What you'll end up with

| Thing | Where | Login |
|---|---|---|
| PostgreSQL 18 + PostGIS 3.6 + pgvector + pg_trgm | `localhost:5433` | `medverify` / `medverify` |
| Dev database | `medverify` | — |
| Test database | `medverify_test` | — |
| Read-only user (for the AI agent's tools) | `medverify_reader` | `medverify_reader` / `reader` |
| Redis 8 (rate limits, cache, queues) | `localhost:6379` | no password (local only) |
| Prisma Studio (browse and edit data) | http://localhost:5555 | — |

**Why port 5433 and not 5432?** This laptop already runs a Windows PostgreSQL service (`postgresql-x64-18`) on 5432. The Docker database uses 5433 so the two never clash. Leave the Windows service alone.

These passwords are for your laptop only. Never reuse them on a hosted database.

---

## How the pieces fit

```
schema.prisma ──(prisma migrate dev)──► prisma/migrations/*.sql ──► PostgreSQL tables
      │
      └──(prisma generate)──► src/generated/prisma  ◄── imported by src/lib/prisma.ts
```

| File | What it is |
|---|---|
| `docker-compose.yml` | Starts the `db` (Postgres) and `redis` containers |
| `docker/postgres/Dockerfile` | The official PostGIS image plus pgvector |
| `docker/postgres/init/01-init.sql` | Runs once on a fresh volume: creates `medverify_test` and the read-only role |
| `prisma/schema.prisma` | **The source of truth for tables.** Models, enums, indexes, extensions |
| `prisma.config.ts` | Prisma 7 settings: where the schema and migrations are, and `DATABASE_URL` |
| `prisma/migrations/` | Generated SQL, one folder per change. Committed to git |
| `src/generated/prisma/` | Generated TypeScript client. **Not** committed — rebuild with `npm run prisma:generate` |
| `src/lib/prisma.ts` | The one `PrismaClient` the app uses (Prisma 7 connects through the `pg` driver adapter) |

Prisma 7 differences from the bootcamp's Prisma 6 (worth knowing for the defense):
- The database URL lives in `prisma.config.ts`, not in `schema.prisma`, and `.env` is loaded by `import "dotenv/config"` there — Prisma no longer reads `.env` by itself.
- The client is generated into `src/generated/prisma`, not `node_modules`, and connects through a **driver adapter** (`@prisma/adapter-pg`).
- `migrate dev` no longer runs `generate` or the seed for you — they are separate commands.

---

## 1. Install Docker Desktop (once)

1. Install it — either download from docker.com, or in PowerShell:
   ```powershell
   winget install --id Docker.DockerDesktop -e
   ```
2. During install keep **"Use WSL 2"** ticked. If it asks for WSL, run in PowerShell **as administrator**, then restart Windows:
   ```powershell
   wsl --install
   ```
3. Open Docker Desktop and wait for **Engine running** (bottom-left).
4. Check it from a new terminal:
   ```bash
   docker --version
   docker compose version
   ```

---

## 2. Create your `.env` (once)

```bash
cp .env.example .env
```
PowerShell: `Copy-Item .env.example .env`

Generate a real token secret and paste it into `.env` as `JWT_ACCESS_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The database and Redis URLs in `.env.example` already point at the Docker containers (`localhost:5433` and `localhost:6379`).

---

## 3. Start PostgreSQL and Redis

```bash
npm install          # first time only
npm run db:up        # = docker compose up -d --build
docker compose ps
```

The first run downloads the images and builds the Postgres one (a few minutes). Both containers should show `Up ... (healthy)` after ~10 seconds. If not:

```bash
docker compose logs db
docker compose logs redis
```

---

## 4. Check the containers work

**PostgreSQL** — open `psql` inside the container (nothing to install on Windows):

```bash
npm run db:psql
```

```sql
\l                                   -- medverify and medverify_test are listed
SELECT version();                    -- PostgreSQL 18.x
\du                                  -- medverify_reader is listed
\q
```

**Redis:**

```bash
npm run redis:cli
```
```
ping        → PONG
exit
```

---

## 5. Create the tables with Prisma

Two migrations are already in the repo:

| Migration | What it does |
|---|---|
| `20261023120000_init` | Enables the `postgis`, `vector` and `pg_trgm` extensions; creates `devices`, `refresh_tokens`, `audit_logs` |
| `20261023180000_token_version_and_revoke_reason` | Adds `devices.token_version` (instant token revocation) and `refresh_tokens.revoked_reason` |

```bash
npm run prisma:migrate      # = prisma migrate dev   → applies every pending migration
npm run prisma:generate     # = prisma generate      → builds src/generated/prisma
npm run prisma:status       # = prisma migrate status → "Database schema is up to date!"
```

Check the extensions really are there:

```bash
npm run db:psql
```
```sql
SELECT extname, extversion FROM pg_extension ORDER BY extname;
-- pg_trgm, plpgsql, postgis, vector
SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;   -- 1
\dt                                                         -- the three tables + _prisma_migrations
\q
```

> **If you were building this from an empty folder**, these are the commands that created what's in the repo:
> ```bash
> npm install -D prisma@7.10.1
> npm install @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg dotenv
> npx prisma init --datasource-provider postgresql     # creates prisma/schema.prisma + a config file
> # write the models in prisma/schema.prisma, then:
> npx prisma format
> npx prisma validate
> npx prisma migrate dev --name init                   # writes prisma/migrations/<timestamp>_init and applies it
> npx prisma generate
> ```

---

## 6. Changing the schema later (the everyday loop)

Every time a model changes (for example adding `products` on day 2):

```bash
# 1. edit prisma/schema.prisma
npx prisma format                                  # tidy + catch syntax errors
npm run prisma:migrate -- --name add_products      # writes and applies a new migration
npm run prisma:generate                            # refresh the TypeScript client
npm run typecheck                                  # the compiler shows every place that needs updating
npm test
```

Want to read the SQL before it runs?
```bash
npm run prisma:migrate -- --name add_products --create-only    # writes the SQL, doesn't apply it
# review prisma/migrations/<timestamp>_add_products/migration.sql, then:
npm run prisma:migrate
```

Columns Prisma can't express natively (`vector(768)`, `geography(Point)`) are declared as `Unsupported("…")` in the schema and read or written with `prisma.$queryRaw` tagged templates, which are always parameterised. Never use `$queryRawUnsafe` with user input.

---

## 7. Start the server and try it

```bash
npm run dev
```

You should see `Database connected`, `Redis connected` and `Server listening on http://localhost:3000`.

In a **second terminal**:

```bash
curl -s http://localhost:3000/health/ready
# {"status":"ready","checks":[{"name":"database","ok":true,...},{"name":"redis","ok":true,...}]}
```

Register a device, the way the app does silently on first launch (Git Bash):

```bash
API=http://localhost:3000/api/v1

RESPONSE=$(curl -s -X POST $API/devices/register \
  -H "Content-Type: application/json" \
  -d '{"installId":"3f1c2b7e-8d4a-4f6b-9c2e-1a5b7d9e0f12","platform":"android","appVersion":"1.0.0+1","language":"en"}')
echo $RESPONSE

ACCESS=$(echo $RESPONSE | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.tokens.accessToken')
REFRESH=$(echo $RESPONSE | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.tokens.refreshToken')

# Who am I?
curl -s $API/devices/me -H "Authorization: Bearer $ACCESS"

# Unlock regulator mode (PIN from .env)
curl -s -X POST $API/devices/me/elevate -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" -d '{"pin":"246810"}'

# Swap the refresh token for a new pair...
curl -s -X POST $API/devices/refresh -H "Content-Type: application/json" -d "{\"refreshToken\":\"$REFRESH\"}"
# ...then try the SAME refresh token again: REFRESH_REUSED, and its whole chain is revoked
curl -s -X POST $API/devices/refresh -H "Content-Type: application/json" -d "{\"refreshToken\":\"$REFRESH\"}"
```

The same in **PowerShell**:

```powershell
$api = "http://localhost:3000/api/v1"
$body = @{ installId = "3f1c2b7e-8d4a-4f6b-9c2e-1a5b7d9e0f12"; platform = "android"; appVersion = "1.0.0+1"; language = "en" } | ConvertTo-Json
$res = Invoke-RestMethod -Method Post -Uri "$api/devices/register" -ContentType "application/json" -Body $body
$access = $res.data.tokens.accessToken
Invoke-RestMethod -Uri "$api/devices/me" -Headers @{ Authorization = "Bearer $access" }
```

Interactive docs for every endpoint: **http://localhost:3000/api-docs** (use *Authorize* to paste the access token).

---

## 8. See the data

### Prisma Studio (recommended)

In another terminal:

```bash
npm run prisma:studio
```

Open **http://localhost:5555**. Click a model to see its rows:

- **Device** — the registered device. Note `installIdHash` is a hash; the raw install id is never stored.
- **RefreshToken** — one row per token. After the refresh test above, the old ones have `revokedAt` set, and the reuse revoked the whole family.
- **AuditLog** — `device.registered`, `device.elevated`, `token.reuse_detected`, each with the request's `correlationId` (it matches the `X-Correlation-Id` response header and the server log line).

Studio can also edit rows — handy for testing, but remember it writes to the real dev database.

### psql

```bash
npm run db:psql
```
```sql
SELECT id, platform, role, created_at FROM devices ORDER BY created_at DESC LIMIT 5;
SELECT device_id, family_id, revoked_at IS NOT NULL AS revoked, expires_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 10;
SELECT action, device_id, correlation_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

### Redis (rate-limit counters)

```bash
npm run redis:cli
```
```
KEYS medverify:rl:*        (fine locally; the app itself uses SCAN, never KEYS)
TTL <one of the keys>
```

### Metrics

```bash
curl -s http://localhost:3000/metrics | grep -E "http_requests_total|security_events_total"
```

---

## 9. Run the tests

```bash
npm test               # unit + HTTP tests — no database or Redis needed (repositories are mocked)
npm run typecheck
```

Integration tests that use the real `medverify_test` database arrive with the scan pipeline; they will read `DATABASE_URL_TEST`, never the dev database.

---

## 10. Everyday commands

| I want to… | Command (from `server/`) |
|---|---|
| Start Postgres + Redis | `npm run db:up` |
| Stop them (data kept) | `npm run db:stop` |
| See if they're running | `docker compose ps` |
| Apply new migrations | `npm run prisma:migrate` |
| Rebuild the Prisma client | `npm run prisma:generate` |
| Is the DB up to date? | `npm run prisma:status` |
| Browse data | `npm run prisma:studio` |
| psql shell | `npm run db:psql` |
| redis-cli | `npm run redis:cli` |
| Empty all tables, re-run migrations | `npm run prisma:reset` |
| Delete **everything** (volumes) and start over | `npm run db:wipe` → `npm run db:up` → `npm run prisma:migrate` |
| Back up the dev data | `docker exec medverify-db pg_dump -U medverify medverify > backup.sql` |
| Restore it | `docker exec -i medverify-db psql -U medverify -d medverify < backup.sql` |

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `password authentication failed for user "medverify"` | You're hitting the **Windows** Postgres on 5432. Check `.env` says `localhost:5433`. |
| `Bind for 0.0.0.0:5433 failed: port is already allocated` | Something else uses 5433. Change `"5433:5432"` in `docker-compose.yml` and the port in `.env` to another free port. |
| `docker: command not found` / engine not running | Start Docker Desktop and wait for *Engine running*. Open a new terminal. |
| Docker says *WSL update required* | `wsl --update` in an admin PowerShell, then restart Docker Desktop. |
| `Cannot find module '../generated/prisma/client.js'` | Run `npm run prisma:generate`. |
| `Environment variable not found: DATABASE_URL` | `.env` is missing or not in `server/`. `cp .env.example .env`. |
| `migrate dev` asks to reset because of *drift* | The database was changed outside migrations. Locally it's safe to accept (data is lost), or run `npm run prisma:reset`. |
| `type "vector" does not exist` | Migrations didn't run on this database. `npm run prisma:migrate`. |
| Changed `01-init.sql` but nothing happened | Init scripts only run on an **empty** volume: `npm run db:wipe`, then `npm run db:up`. |
| Postgres container restarts with a data-directory error | PostgreSQL 18 images mount `/var/lib/postgresql`, not `/var/lib/postgresql/data`. Check `docker-compose.yml`, then `npm run db:wipe`. |
| `/health/ready` returns 503 | One check failed — the response says which. Usually Docker isn't running: `npm run db:up`. |
| Server exits with *Server failed to start* | Same: it refuses to start without both Postgres and Redis. That's deliberate. |

---

## 12. Hosted database and Redis for the deployed demo (free)

| Service | Free plan | Use |
|---|---|---|
| **Neon** | Postgres with PostGIS + pgvector, no card | `DATABASE_URL` |
| **Render Key Value** | Redis-compatible, no card | `REDIS_URL` |

1. Create a Neon project. In its SQL editor:
   ```sql
   CREATE ROLE medverify_reader LOGIN PASSWORD '<a strong password>';
   GRANT USAGE ON SCHEMA public TO medverify_reader;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medverify_reader;
   ```
   The extensions are created by the first migration.
2. Copy the connection string (it ends with `?sslmode=require`).
3. Apply migrations to Neon from your laptop — `migrate deploy`, never `migrate dev`, against a hosted database:
   ```bash
   DATABASE_URL="<neon url>" npx prisma migrate deploy
   ```
   PowerShell: `$env:DATABASE_URL="<neon url>"; npx prisma migrate deploy`
4. Create a Render Key Value instance and copy its internal URL into the Render web service as `REDIS_URL`.

Free databases sleep when idle; the first request after a pause is slow. Hit `/health/ready` two minutes before the demo.
