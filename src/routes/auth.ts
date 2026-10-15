import { Router } from "express";
import { asyncHandler, HttpError } from "../http";
import { publicUser, requireAuth, signAuthToken } from "../lib/auth";
import { verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

export const authRouter = Router();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;

function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function assertLoginAllowed(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > LOGIN_MAX_ATTEMPTS) {
    throw new HttpError(429, "Too many login attempts. Try again later.");
  }
}

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    assertLoginAllowed(clientKey(req));
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : typeof req.body?.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      throw new HttpError(400, "email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Email yoki parol noto‘g‘ri");
    }

    loginAttempts.delete(clientKey(req));
    const token = signAuthToken(publicUser(user));
    res.json({
      token,
      user: publicUser(user),
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new HttpError(401, "Unauthorized");
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      throw new HttpError(401, "Unauthorized");
    }
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(204).end();
  }),
);
