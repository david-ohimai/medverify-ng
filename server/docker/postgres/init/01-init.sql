-- Runs ONLY the first time the database volume is created.
-- The tables themselves come from Prisma migrations, not from here.

-- Test database used by integration tests (never the dev data).
CREATE DATABASE medverify_test;

-- Read-only role for the AI agent's data-search tools (mvp.md §6.8).
-- It can read every table Prisma creates later, and can never write.
CREATE ROLE medverify_reader LOGIN PASSWORD 'reader';
GRANT CONNECT ON DATABASE medverify TO medverify_reader;

\connect medverify
GRANT USAGE ON SCHEMA public TO medverify_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE medverify IN SCHEMA public GRANT SELECT ON TABLES TO medverify_reader;
