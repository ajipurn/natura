import type { GuardColor } from "@/lib/guard-color";

const FILL: Record<GuardColor, string> = {
  green: "bg-guard-green text-guard-ink",
  yellow: "bg-guard-yellow text-guard-ink",
  orange: "bg-guard-orange text-guard-ink",
  blue: "bg-guard-blue text-guard-ink",
};

/** Latar sesuai warna sel di tabel jadwal; tanpa warna = putih bergaris tepi. */
export function guardColorClass(color: GuardColor | null): string {
  return color ? FILL[color] : "border border-line bg-card text-fg";
}
