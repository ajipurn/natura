import { formatDateLong } from "./dates";
import { formatRupiah } from "./format";
import { compareHouses, houseLabel, type HouseRef } from "./houses";
import type { CollectionStatus, HouseStatus } from "./types";

type RecapHouse = HouseRef & { id: number; status: HouseStatus };
type RecapCollection = {
  houseId: number;
  status: CollectionStatus;
  amount: number;
  collectorName: string | null;
};

export type RecapSummary = {
  filled: RecapHouse[];
  /** Rumah aktif yang wadahnya kosong (rumah kosong/mudik tidak dihitung). */
  empty: RecapHouse[];
  unchecked: RecapHouse[];
  vacant: RecapHouse[];
  /** Jumlah rumah aktif. */
  expected: number;
  /** Rumah aktif yang sudah dicek (ada atau kosong). */
  checked: number;
  total: number;
  collectors: string[];
};

export function summarize(
  houses: RecapHouse[],
  collections: RecapCollection[],
): RecapSummary {
  const byHouse = new Map(collections.map((c) => [c.houseId, c]));
  const summary: RecapSummary = {
    filled: [],
    empty: [],
    unchecked: [],
    vacant: [],
    expected: 0,
    checked: 0,
    total: 0,
    collectors: [],
  };
  const collectors = new Set<string>();

  for (const house of [...houses].sort(compareHouses)) {
    const c = byHouse.get(house.id);
    if (c?.collectorName) collectors.add(c.collectorName);
    if (c?.status === "filled") summary.total += c.amount;

    if (house.status === "vacant") {
      summary.vacant.push(house);
      if (c?.status === "filled") summary.filled.push(house);
      continue;
    }

    summary.expected++;
    if (!c) {
      summary.unchecked.push(house);
      continue;
    }
    summary.checked++;
    if (c.status === "filled") summary.filled.push(house);
    else summary.empty.push(house);
  }

  summary.collectors = [...collectors].sort((a, b) => a.localeCompare(b, "id"));
  return summary;
}

function labelList(houses: RecapHouse[], limit = 40): string {
  const labels = houses.slice(0, limit).map(houseLabel);
  if (houses.length > limit) labels.push(`dan ${houses.length - limit} lainnya`);
  return labels.join(", ");
}

/** Teks rekap siap dikirim ke grup WhatsApp. */
export function buildRecapText(input: {
  communityName: string;
  date: string;
  houses: RecapHouse[];
  collections: RecapCollection[];
}): string {
  const s = summarize(input.houses, input.collections);
  const lines = [
    `*Jimpitan ${input.communityName}*`,
    formatDateLong(input.date),
    "",
    `✅ Ada: ${s.filled.length} rumah`,
    s.empty.length > 0
      ? `⭕ Kosong: ${s.empty.length} rumah (${labelList(s.empty)})`
      : "⭕ Kosong: 0 rumah",
  ];
  if (s.unchecked.length > 0) {
    lines.push(`⬜ Belum dicek: ${s.unchecked.length} rumah (${labelList(s.unchecked)})`);
  }
  if (s.vacant.length > 0) {
    lines.push(`🏠 Rumah kosong/mudik: ${s.vacant.length} rumah`);
  }
  lines.push(`💰 Total: ${formatRupiah(s.total)}`);
  if (s.collectors.length > 0) {
    lines.push(`👮 Petugas: ${s.collectors.join(", ")}`);
  }
  return lines.join("\n");
}
