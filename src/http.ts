import { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = typeof (error as { status?: number }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error ? error.message : "Internal server error";

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: message,
    status,
  });
}
