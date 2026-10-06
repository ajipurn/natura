/** Sisi terpanjang logo setelah diperkecil: cukup tajam untuk stiker cetak (±7 mm) dan layar HP. */
const SIDES = [256, 192, 128];
/** Sedikit di bawah batas server (`MAX_LOGO_DATA_URL` di src/server/logo.ts). */
const MAX_DATA_URL = 260_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("File ini bukan gambar yang bisa dibaca. Pilih file PNG atau JPG."));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

function draw(img: HTMLImageElement, side: number, background?: string): HTMLCanvasElement {
  // SVG tanpa ukuran bisa terbaca 0 × 0.
  const width = img.naturalWidth || side;
  const height = img.naturalHeight || side;
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * File gambar → data URL logo yang kecil: PNG (latar transparan tetap) dengan sisi terpanjang
 * ≤ 256 px, diperkecil lagi kalau masih terlalu besar. Gambar yang rumit (mis. foto) jadi JPEG
 * berlatar putih.
 */
export async function resizeLogo(file: File): Promise<string> {
  const img = await loadImage(file);
  for (const side of SIDES) {
    const png = draw(img, side).toDataURL("image/png");
    if (png.length <= MAX_DATA_URL) return png;
  }
  const jpeg = draw(img, SIDES[0], "#ffffff").toDataURL("image/jpeg", 0.85);
  if (jpeg.length <= MAX_DATA_URL) return jpeg;
  throw new Error("Gambar ini terlalu besar untuk logo. Coba gambar yang lebih sederhana.");
}
