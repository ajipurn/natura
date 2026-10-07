import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { RupiahInput } from "@/components/rupiah-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { addDays, daysBetween, daysInMonth, localDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { houseLabel } from "@/lib/houses";
import { allocatePayment, CADENCE_LABEL, paymentPeriod, planAt, type PeriodPayment } from "@/lib/payments";
import { housesQuery, paymentsQuery, PAYMENT_REFRESH, settingsQuery, usersQuery } from "../queries";

export type AdminPayment = PeriodPayment & {
  clientId: string; receivedBy: "treasurer" | "collector"; collectorId: number | null; collectorName: string | null; note: string | null;
};

export function PaymentDialog({ open, onClose, month, payment }: { open: boolean; onClose: () => void; month: string; payment?: AdminPayment }) {
  return <Dialog open={open} onClose={onClose} title={payment ? "Ubah pembayaran" : "Catat pembayaran"} description="Tanggal uang diterima dan periode yang dibayar dicatat terpisah.">{open && <PaymentForm month={month} payment={payment} onDone={onClose} />}</Dialog>;
}

function PaymentForm({ month, payment, onDone }: { month: string; payment?: AdminPayment; onDone: () => void }) {
  const today = localDate(new Date());
  const houses = useQuery(housesQuery);
  const users = useQuery(usersQuery);
  const settings = useQuery(settingsQuery);
  const dates = daysInMonth(month);
  const [clientId] = useState(() => payment?.clientId ?? crypto.randomUUID());
  const [houseId, setHouse] = useState(String(payment?.houseId ?? ""));
  const [cadence, setCadence] = useState<"weekly" | "monthly">(payment?.cadence === "weekly" ? "weekly" : "monthly");
  const [receivedDate, setReceived] = useState(payment?.receivedDate ?? today);
  const [periodStart, setStart] = useState(payment?.periodStart ?? dates[0]);
  const [periodEnd, setEnd] = useState(payment?.periodEnd ?? dates[dates.length - 1]);
  const [amount, setAmount] = useState<number | null>(payment?.amount ?? null);
  const [receivedBy, setReceiver] = useState<"treasurer" | "collector">(payment?.receivedBy ?? "treasurer");
  const [collectorId, setCollector] = useState(String(payment?.collectorId ?? ""));
  const [note, setNote] = useState(payment?.note ?? "");
  const data = useQuery(paymentsQuery(periodStart.slice(0, 7)));
  const count = daysBetween(periodStart, periodEnd) + 1;
  const validRange = count > 0 && count <= 366;
  const expected = (from: string, to: string, id = houseId) => {
    const n = daysBetween(from, to) + 1;
    if (n < 1 || n > 366) return 0;
    return Array.from({ length: n }, (_, i) => planAt(data.data?.plans ?? [], Number(id), addDays(from, i))?.ratePerNight ?? settings.data?.defaultAmount ?? 500).reduce((sum, rate) => sum + rate, 0);
  };
  const alreadyPaid = (from: string, to: string, id = houseId) => {
    let paid = 0;
    for (const p of data.data?.payments ?? []) {
      if (p.houseId !== Number(id) || p.id === payment?.id) continue;
      paid += allocatePayment(p).filter(([d]) => d >= from && d <= to).reduce((sum, [, value]) => sum + value, 0);
    }
    for (const [key, cell] of Object.entries(data.data?.dailyCells ?? {})) {
      const [h, date] = key.split(":");
      if (h === id && date >= from && date <= to) paid += cell.amount;
    }
    return paid;
  };
  function suggest(from: string, to: string, id = houseId) { setAmount(Math.max(0, expected(from, to, id) - alreadyPaid(from, to, id))); }
  function chooseHouse(id: string) {
    setHouse(id);
    const plan = planAt(data.data?.plans ?? [], Number(id), periodStart);
    const mode = plan?.cadence === "daily" ? cadence : plan?.cadence ?? cadence;
    setCadence(mode);
    const period = paymentPeriod(periodStart, mode, plan?.weekStart);
    setStart(period.start); setEnd(period.end); suggest(period.start, period.end, id);
  }
  const totalExpected = expected(periodStart, periodEnd);
  const previous = alreadyPaid(periodStart, periodEnd);
  const save = useMutation({
    mutationFn: () => {
      const json = { houseId: Number(houseId), cadence, receivedDate, periodStart, periodEnd, amount: amount ?? 0, receivedBy, collectorId: receivedBy === "collector" ? Number(collectorId) || null : null, note };
      return payment ? call(api.admin.pembayaran[":id"].$patch({ param: { id: String(payment.id) }, json })) : call(api.admin.pembayaran.$post({ json: { ...json, clientId } }));
    },
    onSuccess: async () => { await invalidate(...PAYMENT_REFRESH); onDone(); },
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Select label="Rumah" value={houseId} onValueChange={chooseHouse} placeholder="Pilih rumah" required disabled={houses.isPending} options={(houses.data?.houses ?? []).map((h) => ({ value: String(h.id), label: houseLabel(h), hint: h.ownerName ?? undefined }))} />
      <Select label="Jenis pembayaran" value={cadence} onValueChange={(mode) => { setCadence(mode); const p = paymentPeriod(periodStart, mode, planAt(data.data?.plans ?? [], Number(houseId), periodStart)?.weekStart); setStart(p.start); setEnd(p.end); suggest(p.start, p.end); }} options={[{ value: "weekly", label: CADENCE_LABEL.weekly }, { value: "monthly", label: CADENCE_LABEL.monthly }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <DatePicker label="Periode dari" value={periodStart} onValueChange={(d) => { setStart(d); suggest(d, periodEnd); }} today={today} max={addDays(today, 366)} />
        <DatePicker label="Periode sampai" value={periodEnd} onValueChange={(d) => { setEnd(d); suggest(periodStart, d); }} today={today} max={addDays(today, 366)} />
      </div>
      {validRange ? <p className="rounded-xl bg-idle-soft px-3 py-2 text-sm">{count} hari · nominal periode {formatRupiah(totalExpected)}{previous > 0 && " · sudah tercatat " + formatRupiah(previous)}. {houseId && !planAt(data.data?.plans ?? [], Number(houseId), periodStart) && <span className="block text-xs text-muted">Perkiraan dari nominal awal. Atur kesepakatan di Rumah & QR untuk menentukan jatuh tempo.</span>}</p> : <Alert>Pilih periode berurutan, maksimal 366 hari.</Alert>}
      <Field label="Uang diterima (Rp)" hint="Pembayaran sebagian boleh dicatat. Nominal dapat diubah sesuai uang yang benar-benar diterima."><RupiahInput value={amount} onValueChange={setAmount} required /></Field>
      {houseId && <Button variant="ghost" size="sm" onClick={() => suggest(periodStart, periodEnd)} disabled={!validRange || data.isPending}>Isi sisa nominal periode</Button>}
      <DatePicker label="Tanggal diterima" value={receivedDate} onValueChange={setReceived} today={today} />
      <Select label="Uang diterima oleh" value={receivedBy} onValueChange={setReceiver} options={[{ value: "treasurer", label: "Langsung bendahara" }, { value: "collector", label: "Petugas, belum disetor" }]} />
      {receivedBy === "collector" && <Select label="Petugas penerima" value={collectorId} onValueChange={setCollector} placeholder="Pilih petugas" required options={(users.data?.users ?? []).filter((u) => u.active).map((u) => ({ value: String(u.id), label: u.name, hint: u.house ?? undefined }))} />}
      <p className="text-xs text-muted">{receivedBy === "treasurer" ? "Langsung menambah kas pada tanggal diterima. Tidak perlu dicatat lagi sebagai pemasukan lain atau setoran ronda." : "Masuk daftar setoran sesuai tanggal diterima. Kas bertambah setelah bendahara mencatat setorannya."}</p>
      <Field label="Catatan (opsional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      {(houses.isError || data.isError || users.isError) && <Alert>Data pendukung belum berhasil dimuat. Muat ulang sebelum menyimpan.</Alert>}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onDone}>Batal</Button><Button type="submit" disabled={save.isPending || !houseId || !amount || !validRange || data.isPending || data.isError || (receivedBy === "collector" && !collectorId)}>{save.isPending ? "Menyimpan…" : "Simpan pembayaran"}</Button></div>
    </form>
  );
}
