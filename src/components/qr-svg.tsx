import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { cx } from "./ui";

/** Gambar QR (SVG hitam di atas putih) untuk teks/alamat. */
export function QrSvg({ text, className }: { text: string; className?: string }) {
  const svg = useQuery({
    queryKey: ["qr", text],
    // Koreksi galat "Q" supaya tetap terbaca walau stiker kotor/tergores.
    queryFn: () => QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "Q" }),
    staleTime: Infinity,
  });
  return <div className={cx("aspect-square [&>svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: svg.data ?? "" }} />;
}
