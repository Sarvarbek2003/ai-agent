import { Router } from "express";
import { asyncHandler, HttpError, routeParam } from "../http";
import { normalizePhone } from "../lib/dnid";
import { isUniqueConstraintError } from "../lib/operators";
import { prisma } from "../lib/prisma";

export const dnidsRouter = Router();

async function resolveApp(appRef: string) {
  return prisma.app.findFirst({
    where: { OR: [{ id: appRef }, { slug: appRef }, { name: appRef }] },
  });
}

dnidsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const appId = req.query.appId ? String(req.query.appId) : undefined;
    const items = await prisma.appDnid.findMany({
      where: appId ? { OR: [{ appId }, { app: { slug: appId } }] } : {},
      include: { app: true },
      orderBy: [{ app: { name: "asc" } }, { phone: "asc" }],
    });
    res.json({ items });
  }),
);

dnidsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const rawPhone = typeof req.body?.phone === "string" || typeof req.body?.dnid === "string"
      ? String(req.body.phone ?? req.body.dnid).trim()
      : "";
    const appRef = typeof req.body?.appId === "string"
      ? req.body.appId.trim()
      : typeof req.body?.app === "string"
        ? req.body.app.trim()
        : "";

    const phone = normalizePhone(rawPhone);
    if (!phone || !appRef) {
      throw new HttpError(400, "phone and appId are required");
    }

    const app = await resolveApp(appRef);
    if (!app) {
      throw new HttpError(404, "App not found");
    }

    try {
      const item = await prisma.appDnid.create({
        data: { phone, appId: app.id },
        include: { app: true },
      });
      res.status(201).json(item);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, `DNID ${phone} already exists`);
      }
      throw error;
    }
  }),
);

dnidsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.appDnid.findFirst({
      where: { OR: [{ id }, { phone: normalizePhone(id) || id }] },
    });
    if (!existing) {
      throw new HttpError(404, "DNID mapping not found");
    }

    const rawPhone = typeof req.body?.phone === "string" || typeof req.body?.dnid === "string"
      ? String(req.body.phone ?? req.body.dnid).trim()
      : undefined;
    const appRef = typeof req.body?.appId === "string"
      ? req.body.appId.trim()
      : typeof req.body?.app === "string"
        ? req.body.app.trim()
        : undefined;

    let appId: string | undefined;
    if (appRef) {
      const app = await resolveApp(appRef);
      if (!app) {
        throw new HttpError(404, "App not found");
      }
      appId = app.id;
    }

    try {
      const item = await prisma.appDnid.update({
        where: { id: existing.id },
        data: {
          ...(rawPhone ? { phone: normalizePhone(rawPhone) } : {}),
          ...(appId ? { appId } : {}),
        },
        include: { app: true },
      });
      res.json(item);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "DNID already exists");
      }
      throw error;
    }
  }),
);

dnidsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.appDnid.findFirst({
      where: { OR: [{ id }, { phone: normalizePhone(id) || id }] },
    });
    if (!existing) {
      throw new HttpError(404, "DNID mapping not found");
    }
    await prisma.appDnid.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
