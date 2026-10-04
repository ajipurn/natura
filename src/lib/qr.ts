/** Huruf/angka tanpa yang mirip (0/O, 1/I/L) supaya mudah dibaca kalau perlu diketik. */
const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TOKEN_LENGTH = 10;

export function newToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 tidak habis dibagi 31, tapi bias sekecil ini tidak berpengaruh untuk kode rumah.
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

export function houseUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${token}`;
}

const TOKEN_PATTERN = /^[A-Za-z0-9]{6,32}$/;

/**
 * Ambil kode rumah dari isi QR. Menerima URL ".../r/KODE" (dari domain mana pun,
 * supaya QR tetap terbaca kalau domain aplikasi pindah) atau kode mentah.
 */
export function parseQrToken(text: string): string | null {
  const value = text.trim();
  if (TOKEN_PATTERN.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/r\/([A-Za-z0-9]{6,32})\/?$/);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}
