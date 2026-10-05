/**
 * Hash PIN dengan PBKDF2 (WebCrypto, tersedia di Node dan browser).
 * Iterasinya sengaja tidak besar: PIN 4–6 angka dilindungi oleh batas percobaan login.
 * Mengubahnya membuat PIN yang sudah tersimpan tidak cocok lagi.
 */
const ITERATIONS = 10_000;
const KEY_BITS = 256;

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iterations, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !saltHex || !hashHex || !/^\d+$/.test(iterations)) return false;
  const actual = await derive(pin, fromHex(saltHex), Number(iterations));
  const expected = fromHex(hashHex);
  // Bandingkan tanpa berhenti di byte pertama yang beda.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
