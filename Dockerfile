FROM node:22-bookworm-slim

# Prisma needs libssl/openssl on Debian slim — without it Prisma emits the
# "failed to detect libssl/openssl version" warning and falls back to a
# bundled binary that may not match the OS.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install dependencies (including tsx for runtime)
COPY backend/package*.json ./
RUN npm install

# Generate Prisma client — dummy DATABASE_URL keeps Prisma 7's schema
# validator happy at build time; the real URL is injected at runtime
# from Railway's Postgres reference.
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copy source
COPY backend/src ./src
COPY backend/tsconfig.json ./

EXPOSE 3000

# Pass DATABASE_URL explicitly to `prisma db push` so it doesn't rely on
# config-file discovery (unreliable in our runtime). `--skip-generate`
# was removed in Prisma 7 — db push no longer regenerates the client
# by default. Seed is idempotent. Then start the server.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --url=\"$DATABASE_URL\" && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
