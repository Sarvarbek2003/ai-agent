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

export type AppHint = {
  id: string;
  name: string;
  slug: string;
};

export function normalizeAppKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/pay\b/g, "pay")
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

export function matchKnownAppName(detected: string | undefined, apps: AppHint[]): AppHint | null {
  const key = normalizeAppKey(detected ?? "");
  if (!key || key === "unknown") {
    return null;
  }

  let best: { app: AppHint; distance: number } | null = null;

  for (const app of apps) {
    const candidates = [
      normalizeAppKey(app.name),
      normalizeAppKey(app.slug),
      normalizeAppKey(app.name.replace(/pay$/i, "")),
      normalizeAppKey(app.slug.replace(/-?pay$/i, "")),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (key === candidate) {
        return app;
      }
      if (candidate.length >= 4 && (key.includes(candidate) || candidate.includes(key))) {
        return app;
      }

      const distance = levenshtein(key, candidate);
      const allowed = Math.max(1, Math.floor(candidate.length / 4));
      if (distance <= allowed && (!best || distance < best.distance)) {
        best = { app, distance };
      }
    }
  }

  return best?.app ?? null;
}
