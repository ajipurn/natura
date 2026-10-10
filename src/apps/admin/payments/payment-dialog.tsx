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
import { allocatePayment, billingPeriods, PAYMENT_LABEL, paymentPeriod, planAt, type PaymentCadence, type PeriodPayment } from "@/lib/payments";
import { housesQuery, paymentsQuery, PAYMENT_REFRESH, rapelQuery, settingsQuery, usersQuery } from "../queries";

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
  const [selectedHouse, setHouse] = useState(String(payment?.houseId ?? ""));
  const [cadence, setCadence] = useState<PaymentCadence | "">(payment?.cadence ?? "");
  const [selectedDates, setSelectedDates] = useState(() => new Set(payment?.allocations?.map(([date]) => date) ?? []));
  const [rapelMonth, setRapelMonth] = useState(month);
  const [receivedDate, setReceived] = useState(payment?.receivedDate ?? today);
  const [periodStart, setStart] = useState(payment?.periodStart ?? dates[0]);
  const [periodEnd, setEnd] = useState(payment?.periodEnd ?? dates[dates.length - 1]);
  const [amount, setAmount] = useState<number | null>(payment?.amount ?? null);
  const [receivedBy, setReceiver] = useState<"treasurer" | "collector">(payment?.receivedBy ?? "treasurer");
  const [collectorId, setCollector] = useState(String(payment?.collectorId ?? ""));
  const [note, setNote] = useState(payment?.note ?? "");
  const data = useQuery(paymentsQuery(periodStart.slice(0, 7)));
  const rapel = useQuery({ ...rapelQuery, enabled: cadence === "daily" });
  const count = daysBetween(periodStart, periodEnd) + 1;
  const validRange = count > 0 && count <= 366;
  const periods = validRange ? billingPeriods(data.data?.plans ?? [], {}, {}, today, periodStart, periodEnd) : [];
  const eligibleHouseIds = new Set(cadence === "daily"
    ? (rapel.data?.dates ?? []).filter((d) => d.date <= receivedDate).map((d) => d.houseId)
    : periods.filter((p) => p.cadence === cadence).map((p) => p.houseId));
  // Pembayaran lama tetap bisa dikoreksi setelah cara bayar berubah atau hari rapelnya lunas.
  if (payment?.cadence === cadence) eligibleHouseIds.add(payment.houseId);
  const houseOptions = (houses.data?.houses ?? []).filter((h) => eligibleHouseIds.has(h.id))
    .map((h) => ({ value: String(h.id), label: houseLabel(h), hint: h.ownerName ?? undefined }));
  const houseId = houseOptions.some((h) => h.value === selectedHouse) ? selectedHouse : "";
  const loadingHouses = houses.isPending || (cadence === "daily" ? rapel.isPending : data.isPending);
  const houseError = houses.isError || (cadence === "daily" ? rapel.isError : data.isError);
  const choices = new Map((rapel.data?.dates ?? []).filter((d) => d.houseId === Number(houseId)).map((d) => [d.date, d.amount]));
  if (payment?.houseId === Number(houseId)) for (const [date, value] of payment.allocations ?? []) choices.set(date, (choices.get(date) ?? 0) + value);
  const eligible = [...choices].filter(([date]) => date <= receivedDate).sort(([a], [b]) => a.localeCompare(b));
  const allocations: [string, number][] = eligible.filter(([date]) => selectedDates.has(date));
  const rapelAmount = allocations.reduce((sum, [, value]) => sum + value, 0);
  const validRapelRange = allocations.length === 0 || daysBetween(allocations[0][0], allocations.at(-1)![0]) <= 365;
  const months = [...new Set(eligible.map(([date]) => date.slice(0, 7)))].reverse();
  const visibleMonth = months.includes(rapelMonth) ? rapelMonth : months[0];
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
  function chooseCadence(mode: PaymentCadence) {
    setCadence(mode);
    setHouse("");
    setAmount(null);
    setSelectedDates(new Set());
    setRapelMonth(month);
    const period = paymentPeriod(payment?.periodStart ?? dates[0], mode);
    setStart(period.start); setEnd(period.end);
  }
  function chooseHouse(id: string) {
    setHouse(id);
    setSelectedDates(new Set());
    setRapelMonth(month);
    if (cadence && cadence !== "daily") {
      const period = periods.find((p) => p.houseId === Number(id) && p.cadence === cadence);
      if (period) { setStart(period.start); setEnd(period.end); suggest(period.start, period.end, id); }
    }
  }
  function changePeriod(from: string, to: string) {
    setStart(from); setEnd(to);
    const n = daysBetween(from, to) + 1;
    const matches = n > 0 && n <= 366 && billingPeriods(data.data?.plans ?? [], {}, {}, today, from, to)
      .some((p) => p.houseId === Number(houseId) && p.cadence === cadence);
    if (matches || (payment?.houseId === Number(houseId) && payment.cadence === cadence)) suggest(from, to);
    else { setHouse(""); setAmount(null); }
  }
  function changeReceived(date: string) {
    setReceived(date);
    setSelectedDates(new Set([...selectedDates].filter((d) => d <= date)));
    if (![...choices.keys()].some((d) => d <= date)) setHouse("");
  }
  const totalExpected = expected(periodStart, periodEnd);
  const previous = alreadyPaid(periodStart, periodEnd);
  const save = useMutation({
    mutationFn: () => {
      if (!cadence || !houseId) throw new Error("Pilih jenis pembayaran dan rumah.");
      const json = { houseId: Number(houseId), cadence, receivedDate,
        periodStart: cadence === "daily" ? allocations[0]?.[0] ?? "" : periodStart,
        periodEnd: cadence === "daily" ? allocations.at(-1)?.[0] ?? "" : periodEnd,
        allocations: cadence === "daily" ? allocations : null,
        amount: cadence === "daily" ? rapelAmount : amount ?? 0,
        receivedBy, collectorId: receivedBy === "collector" ? Number(collectorId) || null : null, note };
      return payment ? call(api.admin.pembayaran[":id"].$patch({ param: { id: String(payment.id) }, json })) : call(api.admin.pembayaran.$post({ json: { ...json, clientId } }));
    },
    onSuccess: async () => { await invalidate(...PAYMENT_REFRESH); onDone(); },
  });
  const disabled = save.isPending || !cadence || !houseId || houseError ||
    (cadence === "daily" ? !rapelAmount || !validRapelRange || rapel.isPending || rapel.isError : !amount || !validRange) ||
    data.isPending || data.isError || (receivedBy === "collector" && !collectorId);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!disabled) save.mutate(); }}>
      <Select label="Jenis pembayaran" value={cadence} onValueChange={(mode) => { if (mode) chooseCadence(mode); }} placeholder="Pilih jenis pembayaran" required options={["monthly", "weekly", "daily"].map((value) => ({ value: value as PaymentCadence, label: PAYMENT_LABEL[value as PaymentCadence] }))} />
      <div>
        <Select label="Rumah" value={houseId} onValueChange={chooseHouse} placeholder={!cadence ? "Pilih jenis pembayaran dulu" : loadingHouses ? "Memuat rumah…" : "Pilih rumah"} searchPlaceholder="Cari rumah atau nama…" required disabled={!cadence || loadingHouses || houseError || !houseOptions.length} options={houseOptions} />
        {cadence && !loadingHouses && !houseError && !(payment?.cadence === cadence && houseId) && <p role="status" className="mt-1.5 text-xs text-muted">{cadence === "daily"
          ? houseOptions.length ? `${houseOptions.length} rumah memiliki hari kosong yang belum dibayar.` : "Tidak ada rumah dengan hari kosong yang bisa dirapel."
          : houseOptions.length ? `Rumah dengan kesepakatan ${PAYMENT_LABEL[cadence].toLowerCase()} pada periode yang dipilih.` : `Belum ada rumah dengan kesepakatan ${PAYMENT_LABEL[cadence].toLowerCase()} pada periode ini.`}</p>}
        {houseError && <Alert>Daftar rumah belum berhasil dimuat. <Button variant="ghost" size="sm" onClick={() => { if (houses.isError) void houses.refetch(); if (cadence === "daily" ? rapel.isError : data.isError) void (cadence === "daily" ? rapel.refetch() : data.refetch()); }}>Coba lagi</Button></Alert>}
      </div>
      {cadence && cadence !== "daily" && <div className="grid gap-3 sm:grid-cols-2">
        <DatePicker label="Periode dari" value={periodStart} onValueChange={(d) => changePeriod(d, periodEnd)} today={today} max={addDays(today, 366)} />
        <DatePicker label="Periode sampai" value={periodEnd} onValueChange={(d) => changePeriod(periodStart, d)} today={today} max={addDays(today, 366)} />
      </div>}
      {cadence && cadence !== "daily" && !validRange && <Alert>Pilih periode berurutan, maksimal 366 hari.</Alert>}
      {cadence === "daily" && <DatePicker label="Tanggal diterima" value={receivedDate} onValueChange={changeReceived} today={today} />}
      {houseId && <>{cadence === "daily" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Hari kosong</legend>
          <p className="text-xs text-muted">Pilih hari yang dibayar. Catatan ronda asli tetap tersimpan.</p>
          {eligible.length === 0 ? <p className="text-sm text-muted">Tidak ada hari kosong yang bisa dirapel.</p> : (
            <>
              <Select label="Bulan" value={visibleMonth ?? ""} onValueChange={setRapelMonth} options={months.map((value) => ({ value, label: new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value + "-01T12:00:00+07:00")) }))} />
              <div className="max-h-60 overflow-y-auto rounded-xl border border-line">
                {eligible.filter(([date]) => date.startsWith(visibleMonth ?? "")).map(([date, value]) => <label key={date} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-idle-soft/40">
                  <input type="checkbox" className="size-4 accent-primary" checked={selectedDates.has(date)} onChange={(e) => { const next = new Set(selectedDates); if (e.target.checked) next.add(date); else next.delete(date); setSelectedDates(next); }} />
                  <span className="flex-1">{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date + "T12:00:00+07:00"))}</span>
                  <span className="tabular-nums text-muted">{formatRupiah(value)}</span>
                </label>)}
              </div>
            </>
          )}
          <p role="status" className="rounded-xl bg-filled-soft px-3 py-2 text-sm text-filled">{allocations.length} hari dipilih · {formatRupiah(rapelAmount)}</p>
          {!validRapelRange && <Alert>Pilih hari dalam rentang maksimal 366 hari. Catat pembayaran terpisah untuk rentang yang lebih lama.</Alert>}
        </fieldset>
      ) : <>
      {validRange && <p className="rounded-xl bg-idle-soft px-3 py-2 text-sm">{count} hari · nominal periode {formatRupiah(totalExpected)}{previous > 0 && " · sudah tercatat " + formatRupiah(previous)}. {!planAt(data.data?.plans ?? [], Number(houseId), periodStart) && <span className="block text-xs text-muted">Perkiraan dari nominal awal. Atur cara bayar dan nominalnya di Rumah & QR.</span>}</p>}
      <Field label="Uang diterima (Rp)" hint="Pembayaran sebagian boleh dicatat. Nominal dapat diubah sesuai uang yang benar-benar diterima."><RupiahInput value={amount} onValueChange={setAmount} required /></Field>
      <Button variant="ghost" size="sm" onClick={() => suggest(periodStart, periodEnd)} disabled={!validRange || data.isPending}>Isi sisa nominal periode</Button>
      </>}
      {cadence !== "daily" && <DatePicker label="Tanggal diterima" value={receivedDate} onValueChange={setReceived} today={today} />}
      <Select label="Uang diterima oleh" value={receivedBy} onValueChange={setReceiver} options={[{ value: "treasurer", label: "Langsung bendahara" }, { value: "collector", label: "Petugas, belum disetor" }]} />
      {receivedBy === "collector" && <Select label="Petugas penerima" value={collectorId} onValueChange={setCollector} placeholder="Pilih petugas" required options={(users.data?.users ?? []).filter((u) => u.active).map((u) => ({ value: String(u.id), label: u.name, hint: u.house ?? undefined }))} />}
      <p className="text-xs text-muted">{receivedBy === "treasurer" ? "Langsung menambah kas pada tanggal diterima. Tidak perlu dicatat lagi sebagai pemasukan lain atau setoran ronda." : "Masuk daftar setoran sesuai tanggal diterima. Kas bertambah setelah bendahara mencatat setorannya."}</p>
      <Field label="Catatan (opsional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      </>}
      {(houses.isError || data.isError || users.isError) && <Alert>Data pendukung belum berhasil dimuat. Muat ulang sebelum menyimpan.</Alert>}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onDone}>Batal</Button><Button type="submit" disabled={disabled}>{save.isPending ? "Menyimpan…" : cadence === "daily" ? "Simpan rapel" : "Simpan pembayaran"}</Button></div>
    </form>
  );
}
