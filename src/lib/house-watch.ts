import { addDays, daysInMonth } from "./dates";
import { houseLabel } from "./houses";
import type { CollectionStatus, MonthRecap } from "./types";

export type HouseWatch = {
  id: number;
  label: string;
  ownerName: string | null;
  empty: number;
  nights: number;
  lastChecked: string;
  emptyStreak: number;
  recent: { date: string; status: CollectionStatus | "unchecked" | "period" }[];
};

/** Pantauan harian bulan ini. Celah pemeriksaan dan periode otomatis memutus rangkaian kosong. */
export function houseWatch(recap: MonthRecap, today: string): HouseWatch[] {
  const dates = daysInMonth(today.slice(0, 7)).filter((date) => date <= today);
  const isPeriod = (id: number, date: string) => recap.paymentPeriods?.some((p) => p.houseId === id && p.start <= date && p.end >= date) ?? false;
  const rows: HouseWatch[] = [];
  for (const house of recap.houses) {
    if (house.status !== "active" || isPeriod(house.id, today)) continue;
    const checked = dates.filter((date) => !isPeriod(house.id, date) && recap.cells[`${house.id}:${date}`]);
    const empty = checked.filter((date) => recap.cells[`${house.id}:${date}`].status === "empty").length;
    if (!empty) continue;
    const lastChecked = checked.at(-1)!;
    let emptyStreak = 0;
    for (let date = lastChecked; date >= dates[0]; date = addDays(date, -1)) {
      if (isPeriod(house.id, date) || recap.cells[`${house.id}:${date}`]?.status !== "empty") break;
      emptyStreak++;
    }
    const end = dates.indexOf(lastChecked) + 1;
    rows.push({
      id: house.id, label: houseLabel(house), ownerName: house.ownerName,
      empty, nights: checked.length, lastChecked, emptyStreak,
      recent: dates.slice(Math.max(0, end - 7), end).map((date) => ({
        date, status: isPeriod(house.id, date) ? "period" : recap.cells[`${house.id}:${date}`]?.status ?? "unchecked",
      })),
    });
  }
  return rows.sort((a, b) => b.emptyStreak - a.emptyStreak || b.empty - a.empty || b.lastChecked.localeCompare(a.lastChecked) || a.label.localeCompare(b.label, "id", { numeric: true })).slice(0, 6);
}
