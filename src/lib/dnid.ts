import { prisma } from "./prisma";

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length >= 12) {
    return digits;
  }
  if (digits.length === 9) {
    return `998${digits}`;
  }
  return digits;
}

export function phoneLookupKeys(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return [];
  }
  const keys = new Set<string>([digits, normalizePhone(value)]);
  if (digits.length >= 9) {
    keys.add(digits.slice(-9));
    keys.add(`998${digits.slice(-9)}`);
  }
  return [...keys].filter(Boolean);
}

export async function findAppByDnids(values: unknown[]) {
  const keys = [...new Set(values.flatMap((item) => (item ? phoneLookupKeys(String(item)) : [])))];
  if (keys.length === 0) {
    return null;
  }

  const match = await prisma.appDnid.findFirst({
    where: { phone: { in: keys } },
    include: { app: true },
    orderBy: { createdAt: "asc" },
  });
  return match?.app ?? null;
}
