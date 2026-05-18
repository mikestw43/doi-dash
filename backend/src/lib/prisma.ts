import { PrismaClient } from '../generated/prisma/client';

// Postgres — uses DATABASE_URL env var (set by Railway when the Postgres
// service is referenced from this backend service). No adapter needed.
const prisma = new PrismaClient();

export default prisma;
