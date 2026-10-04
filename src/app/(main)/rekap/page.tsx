import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, buttonClass, cx } from "@/components/ui";
import { formatMonth, isMonth, rondaDate, shiftMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import { requireUser } from "@/server/auth";
import { getMonthRecap } from "@/server/queries";
import { summarizeMonth } from "./summarize";

export const metadata: Metadata = { title: "Rekap bulanan" };

export default async function RekapPage({ searchParams }: PageProps<"/rekap">) {
  await requireUser();
  const { bulan } = await searchParams;
  const month = typeof bulan === "string" && isMonth(bulan) ? bulan : rondaDate(new Date()).slice(0, 7);
  const recap = await getMonthRecap(month);
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);

  return (
    <>
      <PageHeader
        title="Rekap bulanan"
        subtitle={formatMonth(month)}
        action={
          <a href={`/rekap/csv?bulan=${month}`} className={buttonClass("secondary", "sm")} download>
            <Download className="size-4" /> CSV
          </a>
        }
      />

      <div className="mb-4 flex items-center justify-between text-sm">
        <Link href={`/rekap?bulan=${shiftMonth(month, -1)}`} className="flex items-center gap-1 text-muted">
          <ChevronLeft className="size-4" /> {formatMonth(shiftMonth(month, -1))}
        </Link>
        <Link href={`/rekap?bulan=${shiftMonth(month, 1)}`} className="flex items-center gap-1 text-muted">
          {formatMonth(shiftMonth(month, 1))} <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="whitespace-nowrap text-base font-bold sm:text-lg">{formatRupiah(grandTotal)}</p>
          <p className="text-xs text-muted">Total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="whitespace-nowrap text-base font-bold sm:text-lg">{recap.dates.length}</p>
          <p className="text-xs text-muted">Malam ronda</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="whitespace-nowrap text-base font-bold sm:text-lg">
            {formatRupiah(recap.dates.length ? Math.round(grandTotal / recap.dates.length) : 0)}
          </p>
          <p className="text-xs text-muted">Rata-rata/malam</p>
        </Card>
      </div>

      {recap.dates.length === 0 || rows.length === 0 ? (
        <Card className="mt-4 text-center text-muted">Belum ada catatan di bulan ini.</Card>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Rumah</th>
                {recap.dates.map((d) => (
                  <th key={d} className="px-1 py-2 font-medium">
                    <Link href={`/riwayat/${d}`} className="block min-w-6 underline-offset-2 hover:underline">
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
                    <td key={recap.dates[i]} className="px-1 py-1.5 text-center">
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
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">{formatRupiah(total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-semibold">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left">
                  Total
                </th>
                {dateTotals.map((t, i) => (
                  <td key={recap.dates[i]} className="px-1 py-2 text-center text-[10px] text-muted">
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
