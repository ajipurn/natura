import type { GuardColor } from "@/lib/guard-color";

/** Teks putih di hijau dan oranye; bayangan tipis supaya tetap terbaca di oranye yang terang. */
const ON_DARK = "text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]";

const FILL: Record<GuardColor, string> = {
  green: `bg-guard-green ${ON_DARK}`,
  yellow: "bg-guard-yellow text-guard-ink",
  orange: `bg-guard-orange ${ON_DARK}`,
};

/** Latar sesuai warna sel di tabel jadwal; tanpa warna = putih bergaris tepi. */
export function guardColorClass(color: GuardColor | null): string {
  return color ? FILL[color] : "border border-line bg-card text-fg";
}
