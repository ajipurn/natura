import { rondaHouseState } from "./house-state";
import { CADENCE_LABEL } from "./payments";
import type { HouseDTO, MonthRecap } from "./types";

/** Label ringkas di ekspor: cara bayar periode tetap terlihat meskipun belum ada uang diterima. */
export function monthHouseStatusLabel(recap: Pick<MonthRecap, "paymentCadences">, house: Pick<HouseDTO, "id" | "status">) {
  if (house.status === "vacant") return "Mudik";
  const cadences = recap.paymentCadences?.[house.id] ?? ["daily"];
  return cadences.some((cadence) => cadence !== "daily")
    ? cadences.map((cadence) => CADENCE_LABEL[cadence]).join(" → ")
    : "Dihuni";
}

/** Status tampilan per malam; catatan dan nominal asli tetap disimpan terpisah. */
export function monthHouseNights(recap: Pick<MonthRecap, "dates" | "cells" | "paymentPeriods">, house: Pick<HouseDTO, "id" | "status">) {
  return recap.dates.map((date) => {
    const cell = recap.cells[`${house.id}:${date}`];
    const period = house.status === "active"
      ? recap.paymentPeriods?.find((p) => p.houseId === house.id && p.start <= date && p.end >= date)
      : undefined;
    const status = house.status === "active" ? rondaHouseState(house, cell, period) : cell?.status ?? "unchecked";
    return { date, cell, period, status };
  });
}

/** Baris tabel rekap bulanan: sel per malam, jumlah "ada", dan total per rumah. */
export function summarizeMonth(recap: MonthRecap) {
  const dateTotals = recap.dates.map(() => 0);
  const rows = recap.houses.map((house) => {
    let filledCount = 0;
    let total = 0;
    const nights = monthHouseNights(recap, house);
    const cells = nights.map(({ cell }, i) => {
      if (cell?.status === "filled") {
        filledCount++;
        total += cell.amount;
        dateTotals[i] += cell.amount;
      }
      return cell;
    });
    const empty = cells.filter((cell) => cell?.status === "empty").length;
    // Periode mingguan/bulanan tidak memerlukan pemeriksaan harian, termasuk sebelum lunas.
    const unchecked = house.status === "active"
      ? nights.filter((night) => !night.cell && !night.period).length
      : 0;
    const allocations = Object.entries(recap.paymentCells ?? {}).filter(([key]) => key.startsWith(house.id + ":")).map(([, c]) => c);
    const monthlyTotal = allocations.reduce((sum, c) => sum + c.monthlyAmount, 0);
    const weeklyTotal = allocations.reduce((sum, c) => sum + c.weeklyAmount, 0);
    const periodTotal = allocations.reduce((sum, c) => sum + c.amount, 0);
    return { house, cells, nights, filledCount, empty, unchecked, total: total + periodTotal, collectedTotal: total, monthlyTotal, weeklyTotal, periodTotal };
  });
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  return { rows, dateTotals, grandTotal };
}
