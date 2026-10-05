import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, buttonClass, cx } from "@/components/ui";
import { formatMonth, isMonth, rondaDate, shiftMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import { summarizeMonth } from "@/lib/month-summary";
import { buildRecapCsv } from "@/lib/recap-csv";
import type { MonthRecap } from "@/lib/types";
import { recapQuery } from "./queries";

function downloadCsv(month: string, recap: MonthRecap) {
  const url = URL.createObjectURL(new Blob([buildRecapCsv(recap)], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `jimpitan-${month}.csv` });
  link.click();
  URL.revokeObjectURL(url);
}

export function RekapPage() {
  const [params] = useSearchParams();
  const bulan = params.get("bulan") ?? "";
  const month = isMonth(bulan) ? bulan : rondaDate(new Date()).slice(0, 7);
  const query = useQuery({ ...recapQuery(month), placeholderData: (previous) => previous });

  return (
    <>
      <PageHeader
        title="Rekap bulanan"
        subtitle={formatMonth(month)}
        action={
          <button
            type="button"
            disabled={!query.data || query.data.month !== month}
            onClick={() => query.data && downloadCsv(month, query.data)}
            className={buttonClass("secondary", "sm")}
          >
            <Download className="size-4" /> CSV
          </button>
        }
      />

      <div className="mb-4 flex items-center justify-between text-sm">
        <Link to={`/admin/rekap?bulan=${shiftMonth(month, -1)}`} className="flex items-center gap-1 text-muted">
          <ChevronLeft className="size-4" /> {formatMonth(shiftMonth(month, -1))}
        </Link>
        <Link to={`/admin/rekap?bulan=${shiftMonth(month, 1)}`} className="flex items-center gap-1 text-muted">
          {formatMonth(shiftMonth(month, 1))} <ChevronRight className="size-4" />
        </Link>
      </div>

      <QueryState query={query}>
        {(data) => {
          const { rows, dateTotals, grandTotal } = summarizeMonth(data);
          return (
            <div className={cx(query.isPlaceholderData && "opacity-60")}>
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <p className="whitespace-nowrap text-base font-bold sm:text-lg">{formatRupiah(grandTotal)}</p>
                  <p className="text-xs text-muted">Total</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="whitespace-nowrap text-base font-bold sm:text-lg">{data.dates.length}</p>
                  <p className="text-xs text-muted">Malam ronda</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="whitespace-nowrap text-base font-bold sm:text-lg">
                    {formatRupiah(data.dates.length ? Math.round(grandTotal / data.dates.length) : 0)}
                  </p>
                  <p className="text-xs text-muted">Rata-rata/malam</p>
                </Card>
              </div>

              {data.dates.length === 0 || rows.length === 0 ? (
                <Card className="mt-4 text-center text-muted">Belum ada catatan di bulan ini.</Card>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
                  <table className="w-max min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-muted">
                        <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Rumah</th>
                        {data.dates.map((d) => (
                          <th key={d} className="px-1 py-2 font-medium">
                            <Link
                              to={`/admin/riwayat/${d}`}
                              className="block min-w-6 underline-offset-2 hover:underline"
                            >
                              {Number(d.slice(8))}
                            </Link>
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right">Ada</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ house, cells, filledCount, total }) => (
                        <tr key={house.id} className="border-b border-line last:border-0">
                          <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-semibold">
                            {houseLabel(house)}
                          </th>
                          {cells.map((cell, i) => (
                            <td key={data.dates[i]} className="px-1 py-1.5 text-center">
                              <span
                                className={cx(
                                  "inline-block size-5 rounded",
                                  cell?.status === "filled" && "bg-filled",
                                  cell?.status === "empty" && "bg-empty",
                                  !cell && "bg-idle-soft",
                                )}
                                title={
                                  cell?.status === "filled"
                                    ? formatRupiah(cell.amount)
                                    : cell?.status === "empty"
                                      ? "Kosong"
                                      : "Belum dicek"
                                }
                              />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right">{filledCount}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">
                            {formatRupiah(total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line font-semibold">
                        <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left">
                          Total
                        </th>
                        {dateTotals.map((t, i) => (
                          <td key={data.dates[i]} className="px-1 py-2 text-center text-[10px] text-muted">
                            {t > 0 ? formatAmountShort(t) : "-"}
                          </td>
                        ))}
                        <td />
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatRupiah(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        }}
      </QueryState>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-filled" /> Ada
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-empty" /> Kosong
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-idle-soft" /> Belum dicek
        </span>
      </p>
    </>
  );
}
