import { PrismaClient } from '../generated/prisma/client';

// Postgres — DATABASE_URL injected by Railway from the Postgres service.
// Prisma 7 removed `url = env(...)` from schema.prisma, and the CLI/config
// auto-discovery has been unreliable in our Railway runtime, so we wire
// the URL through the client constructor explicitly.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

export default prisma;
