import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export function getPrismaModels() {
  return Prisma.dmmf.datamodel.models;
}

export function getPrismaEnums() {
  return Prisma.dmmf.datamodel.enums;
}

function quoteIdent(name: string): string {
  return `"${name}"`;
}

function fieldSqlName(field: { name: string; dbName?: string | null }): string {
  return quoteIdent(field.dbName || field.name);
}

export function getDatabaseSchema(): string {
  const enums = getPrismaEnums()
    .map((item) => `${item.name}: ${item.values.map((value) => value.dbName || value.name).join(" | ")}`)
    .join("\n");

  const models = getPrismaModels()
    .map((model) => {
      const table = quoteIdent(model.dbName || model.name);
      const columns = model.fields
        .filter((field) => field.kind !== "object")
        .map((field) => {
          const flags = [
            field.isId ? "PK" : "",
            field.isUnique ? "unique" : "",
            field.isRequired ? "not null" : "null",
            field.isList ? "[]" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `  ${fieldSqlName(field)} ${field.type} ${flags}`.trimEnd();
        })
        .join("\n");

      const relations = model.fields
        .filter((field) => field.kind === "object" && field.relationFromFields && field.relationFromFields.length > 0)
        .map((field) => {
          const from = (field.relationFromFields ?? []).map(quoteIdent).join(", ");
          const to = (field.relationToFields ?? []).map(quoteIdent).join(", ");
          return `  ${field.name} -> ${quoteIdent(field.type)} (${from} = ${to})`;
        })
        .join("\n");

      return `${table} (\n${columns}${relations ? `\nrelations:\n${relations}` : ""}\n)`;
    })
    .join("\n\n");

  return [
    "PostgreSQL. Use Prisma.dmmf table/column names; quote identifiers.",
    enums ? `Enums:\n${enums}` : "",
    models,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const MAX_ROWS = 50;

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export async function runSql(sql: string): Promise<unknown> {
  const query = sql.trim();
  if (!query) {
    return { error: "SQL is empty" };
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(query);
    const list = Array.isArray(rows) ? rows : [rows];
    return {
      kind: "query",
      rowCount: list.length,
      truncated: list.length > MAX_ROWS,
      rows: serialize(list.slice(0, MAX_ROWS)),
    };
  } catch (queryError) {
    try {
      const rowCount = await prisma.$executeRawUnsafe(query);
      return {
        kind: "execute",
        rowCount,
      };
    } catch (executeError) {
      const queryMessage = queryError instanceof Error ? queryError.message : String(queryError);
      const executeMessage = executeError instanceof Error ? executeError.message : String(executeError);
      return {
        error: executeMessage || queryMessage,
        queryError: queryMessage,
      };
    }
  }
}
