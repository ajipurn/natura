import { can, canRonda } from "@/lib/permissions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, CalendarClock, CalendarDays, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { invalidate } from "@/client/query";
import { RadioCards } from "@/components/choice";
import { Dialog } from "@/components/dialog";
import { Alert, Button, Card, Field, Textarea, buttonClass, cx } from "@/components/ui";
import { myRequestsQuery, scheduleQuery } from "@/features/jadwal/queries";
import { REQUEST_STATUS, requestChange } from "@/lib/request-text";
import { DAY_NAMES, dayLabel, slotHouseLabel } from "@/lib/schedule";
import { SwapRequestForm } from "./swap-request-form";
import { adminPath } from "@/lib/app-paths";

/** Malam jaga petugas yang sedang masuk, plus permintaan ubah jadwal ke admin. */
export function MySchedule() {
  const user = useAuth().data?.user;
  const enabled = Boolean(user && canRonda(user.role));
  const schedule = useQuery({ ...scheduleQuery, refetchInterval: 30_000, enabled });
  const requests = useQuery({ ...myRequestsQuery, enabled });
  const [open, setOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: (id: number) => call(api.jadwal.permintaan[":id"].batal.$post({ param: { id: String(id) } })),
    onSuccess: () => invalidate(["jadwal"]),
  });
  if (!user || !enabled) return null;

  const mySlots = schedule.data?.schedule.filter((s) => s.userId === user.id) ?? [];
  const list = requests.data?.requests ?? [];
  const pending = list.find((r) => r.status === "pending");
  // Keputusan admin yang terakhir, supaya petugas tahu hasil permintaannya.
  const recent = list.filter((r) => r.status !== "pending" && r.status !== "cancelled" && r.decidedAt).slice(0, 2);
  const change = (r: (typeof list)[number]) =>
    r.targetUserId === user.id
      ? requestChange(r.toDay, r.fromDay!, r.userName)
      : requestChange(r.fromDay, r.toDay, r.targetUserId ? r.targetUserName ?? "petugas lain" : null);

  return (
    <Card className="space-y-3">
      <div className="flex gap-3 text-sm">
        <CalendarDays className="size-5 shrink-0 text-primary" />
        {schedule.isPending ? (
          <p className="text-muted">Memuat…</p>
        ) : mySlots.length ? (
          <ul className="flex-1 space-y-1">
            {mySlots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
          <p className="font-semibold">Menunggu persetujuan admin: {change(pending)}</p>
          {pending.userId !== user.id && <p className="mt-1">Diajukan oleh {pending.userName}.</p>}
          {pending.note && <p className="mt-0.5">“{pending.note}”</p>}
          {pending.userId === user.id && (
            <Button
              variant="plain"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(pending.id)}
              className="mt-1 min-h-11 font-semibold underline"
            >
              Batalkan permintaan
            </Button>
          )}
        </div>
      ) : can(user.role, "schedule", true) ? (
        <a href={adminPath("/jadwal")} className={cx(buttonClass("secondary", "sm"), "min-h-11 h-auto w-full py-2")}>
          <LayoutDashboard className="size-4 shrink-0" aria-hidden /> Ubah jadwal jaga
        </a>
      ) : (
        <Button onClick={() => setOpen(true)} variant="secondary" size="sm" className="min-h-11 h-auto w-full py-2">
          <CalendarClock className="size-4 shrink-0" aria-hidden /> Minta ubah jadwal
        </Button>
      )}

      {!pending && mySlots.length > 0 && (
        <Button onClick={() => setSwapOpen(true)} variant="secondary" size="sm" className="min-h-11 h-auto w-full py-2">
          <ArrowRightLeft className="size-4 shrink-0" aria-hidden /> Tukar jadwal
        </Button>
      )}

      {recent.map((r) => (
        <p key={r.id} className="text-sm">
          <span className={cx("mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", REQUEST_STATUS[r.status].tone)}>
            {REQUEST_STATUS[r.status].label}
          </span>
          {change(r)}
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
      <Dialog
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        title="Tukar jadwal"
        description="Setelah admin menyetujui, kalian bertukar malam jaga untuk seterusnya."
      >
        <SwapRequestForm schedule={schedule.data?.schedule ?? []} userId={user.id} onDone={() => setSwapOpen(false)} />
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
        <RadioCards
          legend="Malam yang mau diganti"
          // Nilai pilihan berupa teks: nomor hari, atau "baru" untuk menambah malam jaga.
          value={fromDay === null ? "baru" : String(fromDay)}
          onValueChange={(v) => setFromDay(v === "baru" ? null : Number(v))}
          options={[
            ...myDays.map((d) => ({ value: String(d), label: dayLabel(d) })),
            { value: "baru", label: "Tambah malam jaga (yang sekarang tetap)" },
          ]}
          // `!`: kelas bawaan RadioCards (grid-cols-2) menang urutan CSS atas grid-cols-1 biasa.
          className="grid-cols-1"
        />
      )}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">{myDays.length ? "Pindah ke malam" : "Mau jaga malam"}</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {DAY_NAMES.map((label, day) => {
            const taken = myDays.includes(day);
            return (
              <Button
                key={day}
                variant="plain"
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
              </Button>
            );
          })}
        </div>
      </fieldset>
      <Field label="Alasan (opsional)">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Mis. mulai bulan depan shift malam di hari Ahad."
        />
      </Field>
      {send.isError && <Alert>{send.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} variant="ghost">
          Batal
        </Button>
        <Button type="submit" disabled={toDay === null || send.isPending}>
          {send.isPending ? "Mengirim…" : "Kirim ke admin"}
        </Button>
      </div>
    </form>
  );
}
