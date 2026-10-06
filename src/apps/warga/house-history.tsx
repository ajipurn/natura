import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api, call } from "@/client/api";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { Button, cx } from "@/components/ui";
import { daysInMonth, formatDateShort, formatMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { scheduleDay } from "@/lib/schedule";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type Night = {
  date: string;
  status: "filled" | "empty" | null;
  amount: number | null;
};

/** Riwayat jimpitan satu rumah (± 3 bulan), sebagai kalender per bulan. Tanpa nama warga. */
export function HouseHistoryDialog({
  houseId,
  label,
  onClose,
  myHouse,
  onMyHouse,
}: {
  houseId: number | null;
  label: string;
  onClose: () => void;
  myHouse: number | null;
  onMyHouse: (id: number | null) => void;
}) {
  const isMine = houseId !== null && houseId === myHouse;
  return (
    <Dialog
      open={houseId !== null}
      onClose={onClose}
      title={`Rumah ${label}`}
      description="Riwayat jimpitan ± 3 bulan terakhir"
      footer={
        houseId !== null && (
          <Button
            variant={isMine ? "primary" : "secondary"}
            size="sm"
            onClick={() => onMyHouse(isMine ? null : houseId)}
            aria-pressed={isMine}
          >
            <Star className={cx("size-4", isMine && "fill-current")} />{" "}
            {isMine ? "Rumah saya" : "Tandai sebagai rumah saya"}
          </Button>
        )
      }
    >
      {houseId !== null && <HistoryBody houseId={houseId} />}
    </Dialog>
  );
}

function HistoryBody({ houseId }: { houseId: number }) {
  const query = useQuery({
    queryKey: ["warga", "rumah", houseId],
    queryFn: () =>
      call(api.warga.rumah[":id"].$get({ param: { id: String(houseId) } })),
  });
  return (
    <QueryState
      query={query}
      loading={<p className="py-10 text-center text-muted">Memuat riwayat…</p>}
    >
      {({ house, history, today }) => {
        const byDate = new Map((history as Night[]).map((n) => [n.date, n]));
        // Bulan-bulan yang punya malam ronda, terbaru dulu.
        const months = [...new Set(history.map((n) => n.date.slice(0, 7)))]
          .sort()
          .reverse()
          .slice(0, 3);
        return (
          <div className="space-y-5">
            {house.status === "vacant" && (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                Ditandai rumah kosong/mudik: tidak dihitung bolong walau
                wadahnya kosong.
              </p>
            )}
            {months.length === 0 ? (
              <p className="py-6 text-center text-muted">
                Belum ada malam ronda sejak rumah ini terdaftar.
              </p>
            ) : (
              months.map((month) => (
                <MonthCalendar
                  key={month}
                  month={month}
                  byDate={byDate}
                  today={today}
                />
              ))
            )}
            <Legend />
          </div>
        );
      }}
    </QueryState>
  );
}

function MonthCalendar({
  month,
  byDate,
  today,
}: {
  month: string;
  byDate: Map<string, Night>;
  today: string;
}) {
  const days = daysInMonth(month);
  const nights = days
    .map((d) => byDate.get(d))
    .filter((n): n is Night => n !== undefined);
  const filled = nights.filter((n) => n.status === "filled");
  const checked = nights.filter((n) => n.status !== null).length;
  const unchecked = nights.length - checked;
  const total = filled.reduce((sum, n) => sum + (n.amount ?? 0), 0);
  // Kalender mulai Senin.
  const lead = (scheduleDay(days[0]) + 6) % 7;

  return (
    <section aria-label={formatMonth(month)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">{formatMonth(month)}</h3>
        <p className="text-sm font-semibold">{formatRupiah(total)}</p>
      </div>
      <p className="text-sm text-muted">
        Ada isinya {filled.length} dari {checked} malam dicek
        {unchecked > 0 && ` | ${unchecked} malam tidak dicek`}
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="list">
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            aria-hidden
            className="text-[11px] font-medium text-muted"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((date) => {
          const night = byDate.get(date);
          const state = !night ? "none" : (night.status ?? "unchecked");
          const text =
            state === "filled"
              ? `ada ${formatRupiah(night?.amount ?? 0)}`
              : state === "empty"
                ? "kosong"
                : state === "unchecked"
                  ? "tidak dicek"
                  : "tidak ada catatan ronda";
          return (
            <span
              key={date}
              role="listitem"
              aria-label={`${formatDateShort(date)}: ${text}`}
              title={`${formatDateShort(date)}: ${text}`}
              className={cx(
                "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm leading-none",
                state === "filled" &&
                  "border-filled/40 bg-filled-soft font-semibold text-filled",
                state === "empty" &&
                  "border-empty/40 bg-empty-soft font-semibold text-empty",
                state === "unchecked" &&
                  "border-dashed border-muted/60 text-muted",
                state === "none" && "border-transparent text-muted/50",
                date === today &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              {Number(date.slice(8))}
              {state === "filled" && (
                <span className="mt-0.5 text-[10px] font-medium">
                  {formatAmountShort(night?.amount ?? 0)}
                </span>
              )}
              {state === "empty" && (
                <span className="mt-0.5 text-[10px] font-medium">kosong</span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["border-filled/40 bg-filled-soft", "ada isinya"],
    ["border-empty/40 bg-empty-soft", "kosong"],
    ["border-dashed border-muted/60", "tidak dicek"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([cls, text]) => (
        <span key={text} className="flex items-center gap-1.5">
          <span className={cx("inline-block size-3 rounded border", cls)} />
          {text}
        </span>
      ))}
      <span>Tanggal tanpa kotak = tidak ada catatan ronda malam itu.</span>
    </div>
  );
}
