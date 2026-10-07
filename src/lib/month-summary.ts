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
    const allocations = Object.entries(recap.paymentCells ?? {}).filter(([key]) => key.startsWith(house.id + ":")).map(([, c]) => c);
    const monthlyTotal = allocations.reduce((sum, c) => sum + c.monthlyAmount, 0);
    const weeklyTotal = allocations.reduce((sum, c) => sum + c.weeklyAmount, 0);
    const periodTotal = allocations.reduce((sum, c) => sum + c.amount, 0);
    return { house, cells, filledCount, total: total + periodTotal, collectedTotal: total, monthlyTotal, weeklyTotal, periodTotal };
  });
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  return { rows, dateTotals, grandTotal };
}
