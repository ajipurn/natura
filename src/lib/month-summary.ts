import type { MonthRecap } from "./types";

/** Baris tabel rekap bulanan: sel per malam, jumlah "ada", dan total per rumah. */
export function summarizeMonth(recap: MonthRecap) {
  const dateTotals = recap.dates.map(() => 0);
  const rows = recap.houses.map((house) => {
    let filledCount = 0;
    let total = 0;
    const cells = recap.dates.map((date, i) => {
      const cell = recap.cells[`${house.id}:${date}`];
      if (cell?.status === "filled") {
        filledCount++;
        total += cell.amount;
        dateTotals[i] += cell.amount;
      }
      return cell;
    });
    return { house, cells, filledCount, total };
  });
  const grandTotal = dateTotals.reduce((a, b) => a + b, 0);
  return { rows, dateTotals, grandTotal };
}
