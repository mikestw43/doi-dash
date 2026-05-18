FROM node:20-alpine

WORKDIR /app

# Install OS deps Prisma needs (openssl) and tini for proper signal handling
RUN apk add --no-cache openssl tini

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client — dummy DATABASE_URL satisfies any residual env() checks;
# the real URL is injected at runtime from Railway's Postgres reference.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

RUN npm run build

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
