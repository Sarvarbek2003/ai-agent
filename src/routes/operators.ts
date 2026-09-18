import { Router } from "express";
import { asyncHandler, HttpError, routeParam } from "../http";
import { isUniqueConstraintError } from "../lib/operators";
import { prisma } from "../lib/prisma";

export const operatorsRouter = Router();

operatorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const appId = req.query.appId ? String(req.query.appId) : undefined;
    const code = req.query.code ? String(req.query.code).trim() : undefined;

    const items = await prisma.operator.findMany({
      where: {
        ...(appId ? { OR: [{ appId }, { app: { slug: appId } }] } : {}),
        ...(code ? { code } : {}),
      },
      include: { app: true },
      orderBy: [{ app: { name: "asc" } }, { code: "asc" }],
    });

    res.json({ items });
  }),
);

operatorsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const code = typeof req.body?.code === "string" || typeof req.body?.code === "number"
      ? String(req.body.code).trim()
      : "";
    const appRef = typeof req.body?.appId === "string"
      ? req.body.appId.trim()
      : typeof req.body?.app === "string"
        ? req.body.app.trim()
        : "";

    if (!name || !code || !appRef) {
      throw new HttpError(400, "name, code, and appId are required");
    }

    const app = await prisma.app.findFirst({
      where: { OR: [{ id: appRef }, { slug: appRef }, { name: appRef }] },
    });
    if (!app) {
      throw new HttpError(404, "App not found");
    }

    try {
      const operator = await prisma.operator.create({
        data: { name, code, appId: app.id },
        include: { app: true },
      });
      res.status(201).json(operator);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, `Operator code ${code} already exists`);
      }
      throw error;
    }
  }),
);

operatorsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const operator = await prisma.operator.findFirst({
      where: { OR: [{ id }, { code: id }] },
      include: { app: true },
    });
    if (!operator) {
      throw new HttpError(404, "Operator not found");
    }
    res.json(operator);
  }),
);

operatorsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.operator.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "Operator not found");
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const code = typeof req.body?.code === "string" || typeof req.body?.code === "number"
      ? String(req.body.code).trim()
      : undefined;
    const appRef = typeof req.body?.appId === "string"
      ? req.body.appId.trim()
      : typeof req.body?.app === "string"
        ? req.body.app.trim()
        : undefined;

    let appId: string | undefined;
    if (appRef) {
      const app = await prisma.app.findFirst({
        where: { OR: [{ id: appRef }, { slug: appRef }, { name: appRef }] },
      });
      if (!app) {
        throw new HttpError(404, "App not found");
      }
      appId = app.id;
    }

    try {
      const operator = await prisma.operator.update({
        where: { id: existing.id },
        data: {
          ...(name ? { name } : {}),
          ...(code ? { code } : {}),
          ...(appId ? { appId } : {}),
        },
        include: { app: true },
      });
      res.json(operator);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "Operator code already exists");
      }
      throw error;
    }
  }),
);

operatorsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.operator.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "Operator not found");
    }
    await prisma.operator.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);
