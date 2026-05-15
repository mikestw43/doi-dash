FROM node:22-bookworm-slim

# Build tools required for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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

CMD ["sh", "-c", "npx prisma db push && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
