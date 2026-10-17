import { rondaHouseState } from "./house-state";
import { CADENCE_LABEL, type PaymentCell } from "./payments";
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
export function monthHouseNights(recap: Pick<MonthRecap, "dates" | "cells" | "paymentPeriods" | "paymentCells">, house: Pick<HouseDTO, "id" | "status">) {
  const periods = house.status === "active" ? recap.paymentPeriods?.filter((p) => p.houseId === house.id) : undefined;
  return recap.dates.map((date) => {
    const cell = recap.cells[`${house.id}:${date}`];
    const period = periods?.find((p) => p.start <= date && p.end >= date);
    const payment = recap.paymentCells?.[`${house.id}:${date}`];
    const rapel = (payment?.rapelAmount ?? 0) > 0 && payment?.paid ? payment : undefined;
    const status = rapel ? "filled" : house.status === "active" ? rondaHouseState(house, cell, period) : cell?.status ?? "unchecked";
    return { date, cell, period, rapel, status };
  });
}

/** Baris tabel rekap bulanan: sel per malam, jumlah "ada", dan total per rumah. */
export function summarizeMonth(recap: MonthRecap) {
  const dateTotals = recap.dates.map(() => 0);
  const allocationsByHouse = new Map<number, PaymentCell[]>();
  for (const [key, cell] of Object.entries(recap.paymentCells ?? {})) {
    const houseId = Number(key.split(":")[0]);
    const allocations = allocationsByHouse.get(houseId) ?? [];
    allocations.push(cell);
    allocationsByHouse.set(houseId, allocations);
  }
  const rows = recap.houses.map((house) => {
    let filledCount = 0;
    let total = 0;
    const nights = monthHouseNights(recap, house);
    const cells = nights.map(({ cell, rapel }, i) => {
      if (cell?.status === "filled") {
        filledCount++;
        total += cell.amount;
        dateTotals[i] += cell.amount;
      }
      else if (rapel) filledCount++;
      return cell;
    });
    const empty = nights.filter((night) => night.cell?.status === "empty" && !night.rapel).length;
    // Periode mingguan/bulanan tidak memerlukan pemeriksaan harian, termasuk sebelum lunas.
    const unchecked = house.status === "active"
      ? nights.filter((night) => !night.cell && !night.period).length
      : 0;
    const allocations = allocationsByHouse.get(house.id) ?? [];
    const monthlyTotal = allocations.reduce((sum, c) => sum + c.monthlyAmount, 0);
    const weeklyTotal = allocations.reduce((sum, c) => sum + c.weeklyAmount, 0);
    const rapelTotal = allocations.reduce((sum, c) => sum + (c.rapelAmount ?? 0), 0);
    const periodTotal = allocations.reduce((sum, c) => sum + c.amount, 0);
    return { house, cells, nights, filledCount, empty, unchecked, total: total + periodTotal, collectedTotal: total, monthlyTotal, weeklyTotal, rapelTotal, periodTotal };
  });
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  return { rows, dateTotals, grandTotal };
}
