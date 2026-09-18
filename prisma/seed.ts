import "dotenv/config";
import { ensureDefaultApps } from "../src/lib/operators";
import { prisma } from "../src/lib/prisma";

async function main() {
  await ensureDefaultApps();
  console.log("Seeded apps: MilliyPay, AnjirPay, Migsend");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
