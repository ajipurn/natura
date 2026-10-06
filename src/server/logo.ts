/** Batas ukuran gambar logo. Logo yang diperkecil browser ke ±256 px biasanya jauh di bawahnya. */
export const MAX_LOGO_BYTES = 200 * 1024;
/** Panjang data URL untuk `MAX_LOGO_BYTES` (base64 = 4/3 ukuran aslinya) plus awalannya. */
export const MAX_LOGO_DATA_URL = Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 64;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** Tanda awal tiap jenis file, supaya isi yang bukan gambar tidak ikut tersimpan dengan label gambar. */
const SIGNATURE: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
};

/** Data URL logo → jenis dan isi gambarnya, atau null kalau bukan PNG/JPEG/WebP yang sah atau terlalu besar. */
export function parseLogo(dataUrl: string): { type: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(match[2]), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 12 || bytes.length > MAX_LOGO_BYTES || !SIGNATURE[match[1]](bytes)) return null;
  return { type: match[1], bytes };
}
