# PostgreSQL 18 + PostGIS 3.6 (official image) + pgvector (from the PostgreSQL apt repo,
# which the base image already has configured). The package's major version must match (18).
FROM postgis/postgis:18-3.6

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgvector \
 && rm -rf /var/lib/apt/lists/*
