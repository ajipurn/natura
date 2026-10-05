import type { HouseStatus, MonthRecap } from "./types";

export type NightStats = { date: string; filled: number; empty: number; total: number };

export type HouseMonthStats = {
  id: number;
  block: string;
  number: string;
  status: HouseStatus;
  /** Malam yang wadahnya ada isinya. */
  filled: number;
  /** Malam yang wadahnya kosong. */
  empty: number;
  /** Malam ronda yang rumah ini tidak tercatat. */
  unchecked: number;
  total: number;
};

export type MonthStats = {
  nights: number;
  total: number;
  /** Rata-rata uang terkumpul per malam ronda. */
  average: number;
  perNight: NightStats[];
  perHouse: HouseMonthStats[];
};

/** Ringkasan rekap bulanan per malam dan per rumah. */
export function monthStats({ houses, dates, cells }: MonthRecap): MonthStats {
  const perNight = dates.map((date) => ({ date, filled: 0, empty: 0, total: 0 }));
  const perHouse = houses.map((h) => {
    const stats: HouseMonthStats = {
      id: h.id,
      block: h.block,
      number: h.number,
      status: h.status,
      filled: 0,
      empty: 0,
      unchecked: 0,
      total: 0,
    };
    dates.forEach((date, i) => {
      const cell = cells[`${h.id}:${date}`];
      if (!cell) {
        stats.unchecked++;
      } else if (cell.status === "filled") {
        stats.filled++;
        stats.total += cell.amount;
        perNight[i].filled++;
        perNight[i].total += cell.amount;
      } else {
        stats.empty++;
        // Rumah kosong/mudik tidak dihitung bolong.
        if (h.status === "active") perNight[i].empty++;
      }
    });
    return stats;
  });
  const total = perNight.reduce((sum, n) => sum + n.total, 0);
  return { nights: dates.length, total, average: dates.length ? Math.round(total / dates.length) : 0, perNight, perHouse };
}
