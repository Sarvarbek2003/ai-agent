import { Client } from "minio";
import { config } from "../config";

let client: Client | null = null;
let bucketReady = false;

export function getMinio(): Client {
  if (!client) {
    client = new Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }

  return client;
}

export async function ensureRecordingsBucket(): Promise<void> {
  if (bucketReady) {
    return;
  }

  const minio = getMinio();
  const exists = await minio.bucketExists(config.minio.bucket);
  if (!exists) {
    await minio.makeBucket(config.minio.bucket);
  }

  bucketReady = true;
}

export function objectPublicUrl(objectKey: string): string {
  const base =
    config.minio.publicUrl ||
    `${config.minio.useSSL ? "https" : "http"}://${config.minio.endPoint}:${config.minio.port}`;
  return `${base}/${config.minio.bucket}/${objectKey}`;
}

export async function uploadRecordingObject(params: {
  objectKey: string;
  body: Buffer;
  mimeType: string;
}): Promise<{ bucket: string; objectKey: string; url: string; sizeBytes: number }> {
  await ensureRecordingsBucket();
  const minio = getMinio();

  await minio.putObject(
    config.minio.bucket,
    params.objectKey,
    params.body,
    params.body.length,
    { "Content-Type": params.mimeType },
  );

  return {
    bucket: config.minio.bucket,
    objectKey: params.objectKey,
    url: objectPublicUrl(params.objectKey),
    sizeBytes: params.body.length,
  };
}

export async function getRecordingObject(objectKey: string): Promise<Buffer> {
  await ensureRecordingsBucket();
  const stream = await getMinio().getObject(config.minio.bucket, objectKey);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function presignRecordingUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
  await ensureRecordingsBucket();
  return getMinio().presignedGetObject(config.minio.bucket, objectKey, expirySeconds);
}

export async function minioStatus(): Promise<"up" | "down"> {
  try {
    await ensureRecordingsBucket();
    return "up";
  } catch {
    bucketReady = false;
    return "down";
  }
}
