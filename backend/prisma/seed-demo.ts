/**
 * Demo data for local UI work — run after the normal seed:
 *   npm run seed:demo
 *
 * Creates five accounts whose apiKeys match the DEMO_ORDERS table in
 * src/services/runtimeStore.ts, so the backend fills them with open
 * positions, pending orders and balances on startup and the simulator keeps
 * the numbers moving. Nothing here touches a real MT5 terminal.
 *
 * Never run this against the VPS database.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

const DEMO_ACCOUNTS = [
  { apiKey: 'xm_live_demo_gold_scalper_001', name: 'Gold Scalper', broker: 'XM', accountNumber: '50123401', server: 'XM-Real 5', currency: 'USD' },
  { apiKey: 'ex_live_demo_grid_trader_002', name: 'Grid Trader', broker: 'Exness', accountNumber: '50123402', server: 'Exness-Real 8', currency: 'USD' },
  { apiKey: 'ic_live_demo_trend_follow_003', name: 'Trend Follower', broker: 'IC Markets', accountNumber: '50123403', server: 'ICMarkets-Live 12', currency: 'USD' },
  { apiKey: 'fbs_live_demo_martingale_004', name: 'Martingale', broker: 'FBS', accountNumber: '50123404', server: 'FBS-Real 3', currency: 'USD' },
  { apiKey: 'pp_live_demo_hedge_master_005', name: 'Hedge Master', broker: 'Pepperstone', accountNumber: '50123405', server: 'Pepperstone-Live 2', currency: 'USD' },
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) {
    console.error('[Seed:demo] No admin user found — run `npx tsx prisma/seed.ts` first.');
    process.exit(1);
  }

  for (const account of DEMO_ACCOUNTS) {
    await prisma.account.upsert({
      where: { apiKey: account.apiKey },
      // isDemo marks a sandbox account that the KPI cards deliberately skip,
      // so leave it false — otherwise the summary row reads all zeros.
      update: { userId: admin.id, isDemo: false },
      create: { ...account, leverage: 100, isDemo: false, userId: admin.id },
    });
    console.log(`[Seed:demo] ${account.name} (${account.broker})`);
  }

  console.log(`[Seed:demo] ${DEMO_ACCOUNTS.length} demo accounts ready for ${admin.email}.`);
  console.log('[Seed:demo] Restart the backend so it picks up their positions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
