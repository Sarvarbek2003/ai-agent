import { createHmac, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { HttpError } from "../http";
import { prisma } from "./prisma";
import { hashPassword } from "./password";

const PUBLIC_PATHS = [
  /^\/$/,
  /^\/health$/,
  /^\/auth\/login$/,
  /^\/webhooks(?:\/|$)/,
  /^\/ask(?:\/|$)/,
  /^\/docs(?:\/|$)/,
  /^\/openapi\.json$/,
];

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function b64url(value: string | Buffer): string {
  return Buffer.from(typeof value === "string" ? value : value).toString("base64url");
}

export function signAuthToken(user: AuthUser): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + config.authTokenTtlSec,
  } satisfies TokenPayload));
  const sig = createHmac("sha256", config.authSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new HttpError(401, "Unauthorized");
  }
  const expected = createHmac("sha256", config.authSecret).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "Unauthorized");
  }
  let data: TokenPayload;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    throw new HttpError(401, "Unauthorized");
  }
  if (!data.sub || !data.email || data.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, "Unauthorized");
  }
  return data;
}

export function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

export async function ensureDashboardUser(): Promise<void> {
  const email = config.dashboardEmail;
  const password = config.dashboardPassword;
  if (!email) {
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (password && process.env.DASHBOARD_PASSWORD_RESET === "true") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password), name: config.dashboardName || existing.name },
      });
      console.log(`Dashboard password reset for ${email}`);
    }
    return;
  }

  if (!password) {
    const count = await prisma.user.count();
    if (count === 0) {
      console.error("No dashboard users. Set DASHBOARD_EMAIL and DASHBOARD_PASSWORD to create the first login.");
    }
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: config.dashboardName || "Admin",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Dashboard user created: ${email}`);
}

function isPublicPath(req: Request): boolean {
  if (req.method === "OPTIONS") {
    return true;
  }
  const path = req.path;
  return PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization?.trim();
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    return token || null;
  }
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (isPublicPath(req)) {
    next();
    return;
  }

  const token = readBearerToken(req);
  if (!token) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Unauthorized"));
  }
}
