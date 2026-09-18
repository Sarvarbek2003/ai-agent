export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Name is empty");
  }

  return slug;
}

export const DEFAULT_APPS = [
  { name: "MilliyPay", slug: "milliy-pay" },
  { name: "AnjirPay", slug: "anjir-pay" },
  { name: "Migsend", slug: "migsend" },
] as const;
