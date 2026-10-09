import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Minus, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Dialog } from "@/components/dialog";
import { HouseCalendarLegend, HouseMonthCalendar, type HouseCalendarNight } from "@/components/house-month-calendar";
import { QueryState } from "@/components/query-state";
import { Button, Card, buttonClass, cx } from "@/components/ui";
import { formatDateShort, formatMonth } from "@/lib/dates";
import type { HouseWatch } from "@/lib/house-watch";
import { recapQuery } from "./queries";
import { adminPath } from "@/lib/app-paths";

export function HouseWatchCard({ houses, month, today }: { houses: HouseWatch[]; month: string; today: string }) {
  const [selected, setSelected] = useState<HouseWatch | null>(null);
  return (
    <section aria-label="Pantauan jimpitan harian" className="min-w-0">
      <Card>
        <h2 className="font-semibold">Pantauan jimpitan harian</h2>
        <p className="mt-1 text-xs text-muted">{formatMonth(month)} · berdasarkan malam yang sudah diperiksa</p>
        {houses.length === 0 ? (
          <p className="py-5 text-sm text-muted">Belum ada wadah harian tercatat kosong.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-line">
              {houses.map((house) => (
                <li key={house.id}>
                  <Button
                    variant="plain"
                    aria-label={`Buka kalender ${house.label}${house.ownerName ? `, ${house.ownerName}` : ""}: ${house.empty} dari ${house.nights} malam kosong${house.emptyStreak > 1 ? `, ${house.emptyStreak} malam berurutan` : ""}, terakhir ${formatDateShort(house.lastChecked)}`}
                    onClick={() => setSelected(house)}
                    className="group -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors hover:bg-idle-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold tabular-nums">{house.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted" title={house.ownerName ?? undefined}>{house.ownerName ?? "Belum ada nama"}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cx("inline-block rounded-md px-2 py-0.5 text-[11px] font-medium", house.emptyStreak > 0 ? "bg-empty-soft text-empty" : "bg-filled-soft text-filled")}>
                          {house.emptyStreak > 1 ? `${house.emptyStreak} malam berurutan` : house.emptyStreak ? "Terakhir kosong" : "Terakhir terisi"}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted tabular-nums">{house.empty} dari {house.nights} malam kosong</span>
                      </span>
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex gap-1" aria-hidden>
                        {house.recent.map(({ date, status }) => (
                          <span key={date} title={`${formatDateShort(date)}: ${status === "filled" ? "ada" : status === "empty" ? "kosong" : status === "period" ? "pembayaran periode" : "belum dicek"}`} className={cx("flex size-3.5 items-center justify-center rounded-[3px] border", status === "filled" && "border-filled/40 bg-filled-soft text-filled", status === "empty" && "border-empty/40 bg-empty-soft text-empty", status === "unchecked" && "border-dashed border-muted/50", status === "period" && "border-line bg-idle-soft text-muted")}>
                            {status === "filled" ? <Check className="size-2.5" /> : status === "empty" ? <X className="size-2.5" /> : status === "period" ? <Minus className="size-2.5" /> : null}
                          </span>
                        ))}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted">Terakhir {formatDateShort(house.lastChecked).split(", ")[1]} <ChevronRight className="size-3.5 group-hover:text-primary" aria-hidden /></span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">Pola hingga 7 malam, berakhir saat pemeriksaan terakhir. Kotak putus-putus: belum dicek.</p>
          </>
        )}
        <Link to={adminPath(`/rekap?bulan=${month}`)} className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline">Lihat semua rumah <ChevronRight className="size-4" aria-hidden /></Link>
      </Card>
      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={`Rumah ${selected?.label ?? ""}`}
        description={selected?.ownerName ?? "Kalender jimpitan harian"}
        footer={selected && <Link to={adminPath(`/rekap?bulan=${month}&cari=${encodeURIComponent(selected.label)}`)} className={buttonClass("secondary", "sm")}>Rekap rumah <ChevronRight className="size-4" aria-hidden /></Link>}
      >
        {selected && <WatchCalendar houseId={selected.id} month={month} today={today} />}
      </Dialog>
    </section>
  );
}

function WatchCalendar({ houseId, month, today }: { houseId: number; month: string; today: string }) {
  const query = useQuery(recapQuery(month));
  return (
    <QueryState query={query} loading={<p className="py-10 text-center text-muted">Memuat kalender…</p>}>
      {(data) => {
        const house = data.houses.find((h) => h.id === houseId);
        if (!house) return <p className="text-sm text-muted">Rumah tidak ditemukan.</p>;
        const byDate = new Map<string, HouseCalendarNight>();
        for (const date of data.dates) {
          const cell = data.cells[`${houseId}:${date}`];
          if (cell) byDate.set(date, { date, ...cell });
        }
        return <div className="space-y-4"><HouseMonthCalendar month={month} byDate={byDate} today={today} house={house} periods={data.paymentPeriods ?? []} /><HouseCalendarLegend /></div>;
      }}
    </QueryState>
  );
}
