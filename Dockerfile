# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

# Build tools required for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching)
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Generate Prisma client
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
RUN cd backend && npx prisma generate

# Copy source & build TypeScript
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
RUN cd backend && npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY --from=builder /app/backend/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src/generated ./src/generated
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/prisma.config.ts ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
