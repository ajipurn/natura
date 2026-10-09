import { MAX_PROOF_DATA_URL } from "@/lib/community";

/** Bukti tetap cukup tajam untuk dibaca; foto besar diperkecil sebelum dikirim. */
export async function receiptImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Pilih bukti PNG, JPG, atau WebP.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Pilih gambar maksimal 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("Gambar tidak dapat dibaca. Pilih gambar lain."));
      element.src = url;
    });
    for (const side of [1800, 1400, 1000]) {
      const scale = Math.min(
        1,
        side / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", 0.82);
      if (result.length <= MAX_PROOF_DATA_URL) return result;
    }
    throw new Error(
      "Gambar masih terlalu besar. Pilih gambar dengan area bukti yang lebih kecil.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
