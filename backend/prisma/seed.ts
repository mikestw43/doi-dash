import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

async function main() {
  const passwordHash = await bcrypt.hash('password', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@doi-dash.com' },
    update: {},
    create: {
      email: 'admin@doi-dash.com',
      password: passwordHash,
      name: 'Admin',
      role: 'admin',
    },
  });

  console.log(`[Seed] Admin user: ${admin.email} (${admin.id})`);
  console.log('[Seed] Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
