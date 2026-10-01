import mammoth from "mammoth";
import { HttpError } from "../http";

const DOCX_EXT = /\.docx$/i;
const DOCX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

export function assertDocxFile(
  file: { originalname: string; mimetype: string } | undefined,
  field: string,
): asserts file is { originalname: string; mimetype: string } {
  if (!file) {
    throw new HttpError(400, `${field} .docx file is required`);
  }
  if (!DOCX_EXT.test(file.originalname) || !DOCX_MIME.has(file.mimetype)) {
    throw new HttpError(400, `${field} must be a .docx file`);
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\u0000/g, "").trim();
  if (!text) {
    throw new HttpError(400, "The .docx file has no readable text");
  }
  return text.slice(0, 120_000);
}
