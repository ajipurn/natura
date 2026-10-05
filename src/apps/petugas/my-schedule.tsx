import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { guardColorClass } from "@/components/guard-color-class";
import { Alert, Card, Field, buttonClass, cx, inputClass } from "@/components/ui";
import { myRequestsQuery, scheduleQuery } from "@/features/jadwal/queries";
import { REQUEST_STATUS, requestChange } from "@/lib/request-text";
import { DAY_NAMES, dayLabel, slotHouseLabel } from "@/lib/schedule";

/** Malam jaga petugas yang sedang masuk, plus permintaan ubah jadwal ke admin. */
export function MySchedule() {
  const user = useAuth().data?.user;
  const schedule = useQuery(scheduleQuery);
  const requests = useQuery(myRequestsQuery);
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: (id: number) => call(api.jadwal.permintaan[":id"].batal.$post({ param: { id: String(id) } })),
    onSuccess: () => invalidate(["jadwal"]),
  });
  if (!user) return null;

  const mySlots = schedule.data?.schedule.filter((s) => s.userId === user.id) ?? [];
  const list = requests.data?.requests ?? [];
  const pending = list.find((r) => r.status === "pending");
  // Keputusan admin yang terakhir, supaya petugas tahu hasil permintaannya.
  const recent = list.filter((r) => r.status !== "pending" && r.status !== "cancelled" && r.decidedAt).slice(0, 2);

  return (
    <Card className="space-y-3">
      <div className="flex gap-3 text-sm">
        <CalendarDays className="size-5 shrink-0 text-primary" />
        {schedule.isPending ? (
          <p className="text-muted">Memuat…</p>
        ) : mySlots.length ? (
          <ul className="flex-1 space-y-1">
            {mySlots.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span aria-hidden className={cx("size-3 shrink-0 rounded-full", guardColorClass(s.color))} />
                <strong>{dayLabel(s.day)}</strong>
                {s.block && <span className="text-muted">· {slotHouseLabel(s)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Kamu belum dijadwalkan.</p>
        )}
      </div>

      {pending ? (
        <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <p className="font-semibold">Menunggu persetujuan admin: {requestChange(pending.fromDay, pending.toDay)}</p>
          {pending.note && <p className="mt-0.5">“{pending.note}”</p>}
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(pending.id)}
            className="mt-1 font-semibold underline"
          >
            Batalkan permintaan
          </button>
        </div>
      ) : user.role === "admin" ? (
        <a href="/admin/jadwal" className={cx(buttonClass("secondary", "sm"), "w-full")}>
          <LayoutDashboard className="size-4" /> Ubah jadwal di dashboard admin
        </a>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={cx(buttonClass("secondary", "sm"), "w-full")}>
          <CalendarClock className="size-4" /> Minta ubah jadwal
        </button>
      )}

      {recent.map((r) => (
        <p key={r.id} className="text-sm">
          <span className={cx("mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", REQUEST_STATUS[r.status].tone)}>
            {REQUEST_STATUS[r.status].label}
          </span>
          {requestChange(r.fromDay, r.toDay)}
          {r.response && <span className="text-muted"> · “{r.response}”</span>}
        </p>
      ))}
      {cancel.isError && <Alert>{cancel.error.message}</Alert>}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Minta ubah jadwal"
        description="Permintaan dikirim ke admin. Jadwalmu berubah setelah disetujui."
      >
        <RequestForm myDays={mySlots.map((s) => s.day)} onDone={() => setOpen(false)} />
      </Dialog>
    </Card>
  );
}

function RequestForm({ myDays, onDone }: { myDays: number[]; onDone: () => void }) {
  const [fromDay, setFromDay] = useState<number | null>(myDays[0] ?? null);
  const [toDay, setToDay] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => call(api.jadwal.permintaan.$post({ json: { fromDay, toDay: toDay!, note } })),
    onSuccess: async () => {
      await invalidate(["jadwal"]);
      onDone();
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      {myDays.length > 0 && (
        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Malam yang mau diganti</legend>
          <div className="grid gap-1.5">
            {[...myDays.map((d) => [d, dayLabel(d)] as const), [null, "Tambah malam jaga (yang sekarang tetap)"] as const].map(
              ([day, label]) => (
                <label
                  key={String(day)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                    fromDay === day ? "border-primary bg-primary/10" : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="fromDay"
                    checked={fromDay === day}
                    onChange={() => setFromDay(day)}
                    className="accent-[var(--primary)]"
                  />
                  {label}
                </label>
              ),
            )}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">{myDays.length ? "Pindah ke malam" : "Mau jaga malam"}</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {DAY_NAMES.map((label, day) => {
            const taken = myDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={taken}
                aria-pressed={toDay === day}
                title={taken ? "Sudah jagamu" : dayLabel(day)}
                onClick={() => setToDay(day)}
                className={cx(
                  "h-10 rounded-xl border text-sm font-semibold disabled:opacity-35",
                  toDay === day ? "border-primary bg-primary text-primary-fg" : "border-line bg-card",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Field label="Alasan (opsional)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Mis. mulai bulan depan shift malam di hari Ahad."
          className={cx(inputClass, "h-auto py-2")}
        />
      </Field>
      {send.isError && <Alert>{send.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          Batal
        </button>
        <button type="submit" disabled={toDay === null || send.isPending} className={buttonClass("primary")}>
          {send.isPending ? "Mengirim…" : "Kirim ke admin"}
        </button>
      </div>
    </form>
  );
}
