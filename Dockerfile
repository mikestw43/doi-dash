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

# Generate Prisma client (Prisma 6 reads url from schema.prisma's
# env() at runtime; build-time generation doesn't need DATABASE_URL).
COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy source
COPY backend/src ./src
COPY backend/tsconfig.json ./

EXPOSE 3000

# Sync schema → seed → start. Prisma 6 reads DATABASE_URL from schema's
# env() so no explicit --url flag is needed.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
