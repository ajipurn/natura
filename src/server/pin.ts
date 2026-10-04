import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
