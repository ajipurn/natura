import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { drawCommunityStamp } from "@/lib/community-stamp";
import type { ReportImage } from "@/lib/recap-report";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gambar belum bisa dibaca. Pilih file PNG, JPG, atau WebP."));
    image.src = url;
  });
}

/** PNG untuk kedua generator; ukuran dan rasio logo/cap tetap terjaga. */
export async function readReportImage(file: Blob): Promise<ReportImage> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 5 MB. Pilih gambar yang lebih kecil.");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gambar belum bisa disiapkan. Coba unduh laporan lagi.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

export async function loadReportLogo(logoUrl?: string | null): Promise<ReportImage> {
  const response = await fetch(logoUrl ?? DEFAULT_LOGO_URL);
  if (!response.ok) throw new Error("Logo laporan belum berhasil dimuat. Periksa koneksi, lalu coba lagi.");
  return readReportImage(await response.blob());
}

/** Cap yang sama dengan ekspor jadwal ronda, transparan dan tajam saat dicetak. */
export async function createReportStamp(logo: ReportImage, communityName: string): Promise<ReportImage> {
  await document.fonts.ready;
  const image = await loadImage(logo.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stempel belum bisa disiapkan. Coba unduh laporan lagi.");
  context.scale(4, 4);
  drawCommunityStamp(context, image, communityName, 90, 90);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}
