import { Operator, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_APPS } from "./slug";

export type OperatorWithApp = Operator & { app: { id: string; name: string; slug: string } };

export async function ensureDefaultApps() {
  for (const app of DEFAULT_APPS) {
    await prisma.app.upsert({
      where: { slug: app.slug },
      update: { name: app.name },
      create: app,
    });
  }
}

export function collectOperatorCodes(values: unknown[]): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item === null || item === undefined || item === "") {
        continue;
      }
      const code = String(item).trim();
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

export async function findOperatorByCodes(codes: string[]): Promise<OperatorWithApp | null> {
  for (const code of codes) {
    const operator = await prisma.operator.findUnique({
      where: { code },
      include: { app: true },
    });
    if (operator) {
      return operator;
    }
  }

  return null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
