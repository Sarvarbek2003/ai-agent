import { promisify } from "util";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";

const scrypt = promisify(scryptCb);
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const key = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== key.length) {
    return false;
  }
  return timingSafeEqual(expected, key);
}
