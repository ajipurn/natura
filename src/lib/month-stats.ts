import type { HouseStatus, MonthRecap } from "./types";
import { monthHouseNights } from "./month-summary";

export type NightStats = { date: string; filled: number; empty: number; total: number };

export type HouseMonthStats = {
  id: number;
  block: string;
  number: string;
  status: HouseStatus;
  /** Malam berstatus ada: isi wadah atau pembayaran periode yang lunas. */
  filled: number;
  /** Malam berstatus kosong: wadah kosong atau periode belum lunas. */
  empty: number;
  /** Malam ronda tanpa catatan maupun status periode otomatis. */
  unchecked: number;
  total: number;
  periodTotal: number;
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
export function monthStats({ houses, dates, cells, paymentCells = {}, paymentPeriods }: MonthRecap): MonthStats {
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
      periodTotal: 0,
    };
    monthHouseNights({ dates, cells, paymentPeriods, paymentCells }, h).forEach(({ cell, status }, i) => {
      // Status otomatis tidak membuat transaksi uang baru.
      if (cell?.status === "filled") {
        stats.total += cell.amount;
        perNight[i].total += cell.amount;
      }
      if (status === "unchecked") {
        stats.unchecked++;
      } else if (status === "filled") {
        stats.filled++;
        perNight[i].filled++;
      } else {
        stats.empty++;
        // Rumah kosong/mudik tidak dihitung bolong.
        if (h.status === "active") perNight[i].empty++;
      }
    });
    stats.periodTotal = Object.entries(paymentCells).filter(([key]) => key.startsWith(h.id + ":")).reduce((sum, [, cell]) => sum + cell.amount, 0);
    stats.total += stats.periodTotal;
    return stats;
  });
  const collectedTotal = perNight.reduce((sum, n) => sum + n.total, 0);
  const total = perHouse.reduce((sum, h) => sum + h.total, 0);
  return { nights: dates.length, total, average: dates.length ? Math.round(collectedTotal / dates.length) : 0, perNight, perHouse };
}
