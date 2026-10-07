import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { DatePicker } from "@/components/date-picker";
import { Select } from "@/components/select";
import { RupiahInput } from "@/components/rupiah-input";
import { Alert, Button, Field } from "@/components/ui";
import { addDays, formatDateShort, localDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { CADENCE_LABEL, planAt, type PaymentCadence, type PaymentPlanDTO } from "@/lib/payments";
import { PAYMENT_REFRESH, settingsQuery } from "../queries";

export function PaymentPlanSection({ houseId }: { houseId: number }) {
  const today = localDate(new Date());
  const query = useQuery({
    queryKey: ["admin", "kesepakatan", houseId],
    queryFn: () => call(api.admin.pembayaran.kesepakatan[":id"].$get({ param: { id: String(houseId) } })),
  });
  const settings = useQuery(settingsQuery);
  const [editing, setEditing] = useState(false);
  const current = planAt(query.data?.plans ?? [], houseId, today);
  const remove = useMutation({
    mutationFn: (id: number) => call(api.admin.pembayaran.kesepakatan[":id"].$delete({ param: { id: String(id) } })),
    onSuccess: () => invalidate(...PAYMENT_REFRESH),
  });
  return (
    <section className="space-y-3 border-t border-line pt-4" aria-label="Kesepakatan pembayaran">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Pembayaran jimpitan</h3>
        <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>{editing ? "Tutup pengaturan" : "Atur pembayaran"}</Button>
      </div>
      {query.isError && <Alert>{query.error.message}</Alert>}
      {query.isPending ? <p className="text-sm text-muted">Memuat kesepakatan…</p> : !current ? (
        <p className="text-sm text-muted">Belum ada kesepakatan pembayaran. Rumah ini tetap memakai pencatatan ronda harian.</p>
      ) : (
        <p className="text-sm">{CADENCE_LABEL[current.cadence]} · {formatRupiah(current.ratePerNight)}/hari</p>
      )}
      {(query.data?.plans ?? []).map((p) => (
        <div key={p.id} className="flex items-start justify-between gap-2 text-xs text-muted">
          <p>Mulai {formatDateShort(p.effectiveFrom)} {p.effectiveFrom.slice(0, 4)}: {CADENCE_LABEL[p.cadence]}, {formatRupiah(p.ratePerNight)}/hari.</p>
          {p.effectiveFrom > today && <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>Hapus</Button>}
        </div>
      ))}
      {remove.isError && <Alert>{remove.error.message}</Alert>}
      {editing && query.data && <PlanForm houseId={houseId} today={today} current={current} defaultAmount={settings.data?.defaultAmount ?? 500} onDone={() => setEditing(false)} />}
    </section>
  );
}

function PlanForm({ houseId, today, current, defaultAmount, onDone }: { houseId: number; today: string; current?: PaymentPlanDTO; defaultAmount: number; onDone: () => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [cadence, setCadence] = useState<PaymentCadence>(current?.cadence ?? "monthly");
  const [ratePerNight, setRate] = useState<number | null>(current?.ratePerNight ?? defaultAmount);
  const [weekStart, setWeekStart] = useState(String(current?.weekStart ?? 1));
  const save = useMutation({
    mutationFn: () => call(api.admin.pembayaran.kesepakatan[":id"].$put({ param: { id: String(houseId) }, json: { effectiveFrom, cadence, ratePerNight: ratePerNight ?? 0, weekStart: Number(weekStart), dueTiming: "end", graceDays: 0 } })),
    onSuccess: async () => { await invalidate(...PAYMENT_REFRESH); onDone(); },
  });
  return (
    <form className="space-y-3 rounded-xl bg-idle-soft/50 p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Select label="Cara pembayaran" value={cadence} onValueChange={setCadence} options={Object.entries(CADENCE_LABEL).map(([value, label]) => ({ value: value as PaymentCadence, label }))} />
      <Field label="Nominal per hari (Rp)" hint="Mingguan = jumlah hari × nominal ini. Bulanan mengikuti jumlah hari dalam bulan."><RupiahInput value={ratePerNight} onValueChange={setRate} required /></Field>
      <DatePicker label="Mulai berlaku" value={effectiveFrom} onValueChange={setEffectiveFrom} today={today} max={addDays(today, 366)} />
      <p className="text-xs text-muted">Harian dicatat saat ronda. Mingguan dan bulanan mengikuti status pembayaran periode secara otomatis.</p>
      {cadence === "weekly" && <Select label="Awal minggu" value={weekStart} onValueChange={setWeekStart} options={["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((label, i) => ({ value: String(i), label }))} />}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onDone}>Batal</Button><Button type="submit" disabled={save.isPending || !ratePerNight}>{save.isPending ? "Menyimpan…" : "Simpan kesepakatan"}</Button></div>
    </form>
  );
}
