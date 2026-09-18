import { Router } from "express";
import { asyncHandler, HttpError, routeParam } from "../http";
import { isUniqueConstraintError } from "../lib/operators";
import { prisma } from "../lib/prisma";
import { slugify } from "../lib/slug";

export const appsRouter = Router();

appsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const apps = await prisma.app.findMany({
      include: {
        _count: { select: { operators: true } },
        operators: String(req.query.includeOperators) === "true"
          ? { orderBy: { code: "asc" } }
          : false,
      },
      orderBy: { name: "asc" },
    });
    res.json({ items: apps });
  }),
);

appsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      throw new HttpError(400, "name is required");
    }

    const slug = typeof req.body?.slug === "string" && req.body.slug.trim()
      ? slugify(req.body.slug)
      : slugify(name);

    try {
      const app = await prisma.app.create({
        data: { name, slug },
      });
      res.status(201).json(app);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "App name or slug already exists");
      }
      throw error;
    }
  }),
);

appsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const app = await prisma.app.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { operators: { orderBy: { code: "asc" } } },
    });
    if (!app) {
      throw new HttpError(404, "App not found");
    }
    res.json(app);
  }),
);

appsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.app.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "App not found");
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const slug = typeof req.body?.slug === "string" && req.body.slug.trim()
      ? slugify(req.body.slug)
      : undefined;

    try {
      const app = await prisma.app.update({
        where: { id: existing.id },
        data: {
          ...(name ? { name } : {}),
          ...(slug ? { slug } : {}),
        },
        include: { operators: { orderBy: { code: "asc" } } },
      });
      res.json(app);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "App name or slug already exists");
      }
      throw error;
    }
  }),
);

appsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.app.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { _count: { select: { operators: true } } },
    });
    if (!existing) {
      throw new HttpError(404, "App not found");
    }
    if (existing._count.operators > 0) {
      throw new HttpError(409, "Delete operators of this app first");
    }
    await prisma.app.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);
