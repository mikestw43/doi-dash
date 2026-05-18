FROM node:22-bookworm-slim

WORKDIR /app/backend

# Install dependencies (including tsx for runtime)
COPY backend/package*.json ./
RUN npm install

# Generate Prisma client
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
RUN npx prisma generate

# Copy source
COPY backend/src ./src
COPY backend/tsconfig.json ./

EXPOSE 3000

# On every container start: sync schema to Postgres (db push, idempotent),
# seed the admin user (no-op if it already exists), then start the server.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
