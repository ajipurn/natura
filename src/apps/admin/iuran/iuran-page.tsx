import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  Plus,
  ReceiptText,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { receiptImage } from "@/client/receipt-image";
import { SwitchField } from "@/components/choice";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { QueryState } from "@/components/query-state";
import { RupiahInput } from "@/components/rupiah-input";
import { Select } from "@/components/select";
import { ChipGroup } from "@/components/toggle-group";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  buttonClass,
  cx,
} from "@/components/ui";
import { adminPath } from "@/lib/app-paths";
import {
  formatDateShort,
  formatMonth,
  isMonth,
  localDate,
  shiftMonth,
} from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { getDuesMonth } from "@/server/dues";
import { DUES_REFRESH, duesQuery, housesQuery } from "../queries";

type Data = Awaited<ReturnType<typeof getDuesMonth>>;
type Bill = Data["bills"][number];
type DuesType = Omit<Data["types"][number], "createdAt">;
const STATUS: Record<string, string> = {
  paid: "Lunas",
  partial: "Sebagian",
  unpaid: "Belum bayar",
  overdue: "Lewat jatuh tempo",
  cancelled: "Dibatalkan",
};

export function IuranPage() {
  const [params, setParams] = useSearchParams();
  const thisMonth = localDate(new Date()).slice(0, 7);
  const month = isMonth(params.get("bulan") ?? "")
    ? params.get("bulan")!
    : thisMonth;
  const query = useQuery(duesQuery(month));
  const [view, setView] = useState<"bills" | "types" | "receipts">("bills");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [typeEditing, setTypeEditing] = useState<number | "new" | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [logId, setLogId] = useState<number | null>(null);
  const [proofId, setProofId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "invoice" | "receipt";
    id: number;
  } | null>(null);
  const cancel = useMutation({
    mutationFn: () =>
      confirm!.kind === "invoice"
        ? call(
            api.admin.iuran.tagihan[":id"].$delete({
              param: { id: String(confirm!.id) },
            }),
          )
        : call(
            api.admin.iuran.pembayaran[":id"].$delete({
              param: { id: String(confirm!.id) },
            }),
          ),
    onSuccess: async () => {
      await invalidate(...DUES_REFRESH);
      setConfirm(null);
    },
  });
  const restore = useMutation({
    mutationFn: (id: number) =>
      call(
        api.admin.iuran.tagihan[":id"].pulihkan.$post({
          param: { id: String(id) },
        }),
      ),
    onSuccess: () => invalidate(...DUES_REFRESH),
  });
  return (
    <>
      <PageHeader
        title="Iuran"
        subtitle="Tagihan lingkungan per rumah dan penerimaan pembayarannya."
        className="max-sm:flex-col"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to={adminPath("/kas")}
              className={buttonClass("secondary", "sm")}
            >
              Lihat kas
            </Link>
            <Button size="sm" onClick={() => setIssuing(true)}>
              <ReceiptText className="size-4" />
              Terbitkan tagihan
            </Button>
          </div>
        }
      />
      <div className="mb-5 flex items-center justify-between gap-3">
        <nav aria-label="Bulan iuran" className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan sebelumnya"
            onClick={() => setParams({ bulan: shiftMonth(month, -1) })}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <span className="text-sm font-semibold">{formatMonth(month)}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bulan berikutnya"
            onClick={() => setParams({ bulan: shiftMonth(month, 1) })}
          >
            <ChevronRight className="size-5" />
          </Button>
        </nav>
      </div>
      <QueryState query={query}>
        {(data) => {
          const active = data.bills.filter((bill) => !bill.cancelledAt);
          const outstanding = active.filter((bill) => bill.remaining > 0);
          const received = data.receipts
            .filter(
              (receipt) =>
                !receipt.cancelledAt && receipt.date.startsWith(month),
            )
            .reduce((sum, receipt) => sum + receipt.amount, 0);
          const shown = data.bills.filter(
            (bill) =>
              (status === "all" ||
                (status === "unpaid"
                  ? bill.remaining > 0 && !bill.cancelledAt
                  : bill.status === status)) &&
              (!search.trim() ||
                `${bill.block}-${bill.number} ${bill.ownerName ?? ""} ${bill.typeName}`
                  .toLocaleLowerCase("id")
                  .includes(search.trim().toLocaleLowerCase("id"))),
          );
          const selectedType =
            typeof typeEditing === "number"
              ? data.types.find((type) => type.id === typeEditing)
              : undefined;
          return (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <Stat label="Diterima bulan ini" amount={received} />
                <Stat
                  label="Sisa tagihan"
                  amount={outstanding.reduce(
                    (sum, bill) => sum + bill.remaining,
                    0,
                  )}
                />
                <Card>
                  <p className="text-2xl font-semibold tabular-nums">
                    {
                      outstanding.filter((bill) => bill.status === "overdue")
                        .length
                    }
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Tagihan lewat jatuh tempo
                  </p>
                </Card>
              </div>
              <ChipGroup
                aria-label="Bagian iuran"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "bills", label: "Tagihan" },
                  { value: "receipts", label: "Pembayaran" },
                  { value: "types", label: "Jenis iuran" },
                ]}
                className="mb-5"
              />
              {view === "bills" ? (
                <>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                    <Input
                      type="search"
                      aria-label="Cari tagihan"
                      placeholder="Cari rumah, warga, atau jenis iuran…"
                      value={search}
                      onValueChange={setSearch}
                    />
                    <div className="sm:w-56 sm:shrink-0">
                      <Select
                        aria-label="Status tagihan"
                        value={status}
                        onValueChange={setStatus}
                        options={[
                          { value: "all", label: "Semua status" },
                          { value: "unpaid", label: "Belum lunas" },
                          { value: "overdue", label: "Lewat jatuh tempo" },
                          { value: "paid", label: "Lunas" },
                          { value: "cancelled", label: "Dibatalkan" },
                        ]}
                      />
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-muted" role="status">
                    {shown.length} tagihan · termasuk periode sebelumnya yang
                    belum lunas.
                  </p>
                  {!shown.length ? (
                    <Card className="py-10 text-center">
                      <p className="font-semibold">
                        {data.bills.length
                          ? "Tidak ada tagihan yang cocok"
                          : "Belum ada tagihan"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {data.bills.length
                          ? "Ubah pencarian atau status tagihan."
                          : data.types.length
                            ? "Terbitkan tagihan untuk bulan yang dipilih."
                            : "Tambahkan jenis iuran, lalu terbitkan tagihan."}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          if (data.bills.length) {
                            setSearch("");
                            setStatus("all");
                          } else if (data.types.length) setIssuing(true);
                          else setTypeEditing("new");
                        }}
                      >
                        {data.bills.length
                          ? "Reset filter"
                          : data.types.length
                            ? "Terbitkan tagihan"
                            : "Tambah jenis iuran"}
                      </Button>
                    </Card>
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                      {shown.map((bill) => (
                        <li
                          key={bill.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-semibold">
                              {bill.block}-{bill.number}{" "}
                              <span className="text-sm font-normal text-muted">
                                · {bill.typeName}
                              </span>
                            </p>
                            <p className="mt-1 break-words text-xs text-muted">
                              {bill.ownerName || "Nama warga belum diisi"}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {formatMonth(bill.month)} · jatuh tempo{" "}
                              {formatDateShort(bill.dueDate)}
                            </p>
                          </div>
                          <div className="sm:text-right">
                            <p className="font-semibold tabular-nums">
                              {formatRupiah(bill.paid)}{" "}
                              <span className="text-xs font-normal text-muted">
                                / {formatRupiah(bill.amount)}
                              </span>
                            </p>
                            <p
                              className={cx(
                                "mt-1 text-xs font-medium",
                                bill.status === "paid"
                                  ? "text-filled"
                                  : bill.status === "overdue"
                                    ? "text-empty"
                                    : "text-muted",
                              )}
                            >
                              {STATUS[bill.status]}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {!bill.cancelledAt && bill.remaining > 0 && (
                              <Button size="sm" onClick={() => setPaying(bill)}>
                                Catat bayar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Riwayat ${bill.typeName} ${bill.block}-${bill.number}`}
                              onClick={() => setLogId(bill.id)}
                            >
                              <History className="size-4" />
                            </Button>
                            {bill.cancelledAt ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={restore.isPending}
                                onClick={() => restore.mutate(bill.id)}
                              >
                                Pulihkan
                              </Button>
                            ) : (
                              bill.paid === 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    cancel.reset();
                                    setConfirm({
                                      kind: "invoice",
                                      id: bill.id,
                                    });
                                  }}
                                >
                                  Batalkan
                                </Button>
                              )
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : view === "types" ? (
                <>
                  <div className="mb-4 flex justify-end">
                    <Button size="sm" onClick={() => setTypeEditing("new")}>
                      <Plus className="size-4" />
                      Tambah jenis iuran
                    </Button>
                  </div>
                  {!data.types.length ? (
                    <Card className="py-8 text-center text-sm text-muted">
                      Belum ada jenis iuran. Tentukan nama, nominal, dan periode
                      terlebih dahulu.
                    </Card>
                  ) : (
                    <ul className="space-y-3">
                      {data.types.map((type) => (
                        <li key={type.id}>
                          <Card className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="break-words font-semibold">
                                {type.name}
                                {!type.active && (
                                  <span className="ml-2 text-xs text-muted">
                                    Nonaktif
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-sm">
                                {formatRupiah(type.amount)} ·{" "}
                                {type.cadence === "monthly"
                                  ? "Bulanan"
                                  : "Sekali bayar"}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                Mulai {formatMonth(type.startMonth)} · jatuh
                                tempo tanggal {type.dueDay}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${type.name}`}
                              onClick={() => setTypeEditing(type.id)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  {!data.receipts.length ? (
                    <Card className="py-8 text-center text-sm text-muted">
                      Belum ada pembayaran untuk periode ini. Catat pembayaran
                      dari tab Tagihan.
                    </Card>
                  ) : (
                    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                      {data.receipts.map((receipt) => {
                        const bill = data.bills.find(
                          (invoice) => invoice.id === receipt.invoiceId,
                        )!;
                        return (
                          <li key={receipt.id} className="space-y-2 p-4">
                            <div className="flex flex-wrap justify-between gap-2">
                              <p className="font-semibold">
                                {bill.block}-{bill.number} · {bill.typeName}
                              </p>
                              <p
                                className={cx(
                                  "font-semibold tabular-nums",
                                  receipt.cancelledAt &&
                                    "text-muted line-through",
                                )}
                              >
                                {formatRupiah(receipt.amount)}
                              </p>
                            </div>
                            <p className="text-xs text-muted">
                              {formatDateShort(receipt.date)} ·{" "}
                              {receipt.method === "cash" ? "Tunai" : "Transfer"}{" "}
                              · {receipt.recordedByName ?? "Pengurus"}
                              {receipt.cancelledAt && " · Dibatalkan"}
                            </p>
                            {receipt.note && (
                              <p className="break-words text-sm">
                                {receipt.note}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {receipt.hasProof && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setProofId(receipt.id)}
                                >
                                  Lihat bukti
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLogId(receipt.invoiceId)}
                              >
                                Riwayat
                              </Button>
                              {!receipt.cancelledAt && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    cancel.reset();
                                    setConfirm({
                                      kind: "receipt",
                                      id: receipt.id,
                                    });
                                  }}
                                >
                                  Batalkan pembayaran
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
              {restore.isError && <Alert>{restore.error.message}</Alert>}
              <Dialog
                open={typeEditing !== null}
                onClose={() => setTypeEditing(null)}
                title={selectedType ? "Edit jenis iuran" : "Tambah jenis iuran"}
              >
                <TypeForm
                  key={selectedType?.id ?? "new"}
                  type={selectedType}
                  month={month}
                  onDone={() => setTypeEditing(null)}
                />
              </Dialog>
              <Dialog
                open={issuing}
                onClose={() => setIssuing(false)}
                title="Terbitkan tagihan"
                description="Tagihan yang sudah ada untuk rumah, jenis, dan bulan yang sama tetap tersimpan."
              >
                <IssueForm
                  types={data.types.filter(
                    (type) =>
                      type.active &&
                      type.startMonth <= month &&
                      (type.cadence === "monthly" || type.startMonth === month),
                  )}
                  month={month}
                  onDone={() => setIssuing(false)}
                />
              </Dialog>
            </>
          );
        }}
      </QueryState>
      <Dialog
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Catat pembayaran iuran"
      >
        {paying && (
          <ReceiptForm
            key={paying.id}
            bill={paying}
            onDone={() => setPaying(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "receipt"
            ? "Batalkan pembayaran?"
            : "Batalkan tagihan?"
        }
      >
        <p className="text-sm text-muted">
          {confirm?.kind === "receipt"
            ? "Sisa tagihan dan saldo kas akan diperbarui. Riwayat penerimaan tetap disimpan."
            : "Tagihan tidak dihitung sebagai kewajiban. Tagihan dapat dipulihkan kembali."}
        </p>
        {cancel.isError && <Alert>{cancel.error.message}</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Kembali
          </Button>
          <Button
            variant="danger"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending
              ? "Menyimpan…"
              : confirm?.kind === "receipt"
                ? "Batalkan pembayaran"
                : "Batalkan tagihan"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={proofId !== null}
        onClose={() => setProofId(null)}
        title="Bukti pembayaran"
      >
        {proofId && (
          <img
            src={`/api/admin/iuran/pembayaran/${proofId}/bukti`}
            alt="Bukti pembayaran iuran"
            className="max-h-[75dvh] w-full object-contain"
          />
        )}
      </Dialog>
      <LogDialog id={logId} onClose={() => setLogId(null)} />
    </>
  );
}

function Stat({ label, amount }: { label: string; amount: number }) {
  return (
    <Card>
      <p className="break-words text-2xl font-semibold tabular-nums">
        {formatRupiah(amount)}
      </p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}

function TypeForm({
  type,
  month,
  onDone,
}: {
  type?: DuesType;
  month: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [amount, setAmount] = useState<number | null>(type?.amount ?? null);
  const [cadence, setCadence] = useState(type?.cadence ?? "monthly");
  const [startMonth, setStartMonth] = useState(type?.startMonth ?? month);
  const [dueDay, setDueDay] = useState(type?.dueDay ?? 10);
  const [active, setActive] = useState(type?.active ?? true);
  const save = useMutation({
    mutationFn: () => {
      const json = {
        name,
        amount: amount ?? 0,
        cadence,
        startMonth,
        dueDay,
        active,
      };
      return type
        ? call(
            api.admin.iuran.jenis[":id"].$patch({
              param: { id: String(type.id) },
              json,
            }),
          )
        : call(api.admin.iuran.jenis.$post({ json }));
    },
    onSuccess: async () => {
      await invalidate(...DUES_REFRESH);
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Nama iuran">
        <Input
          required
          maxLength={80}
          value={name}
          onValueChange={setName}
          placeholder="Contoh: Iuran lingkungan"
          data-autofocus
        />
      </Field>
      <Field label="Nominal per rumah (Rp)">
        <RupiahInput required value={amount} onValueChange={setAmount} />
      </Field>
      <Select
        label="Periode"
        value={cadence}
        onValueChange={setCadence}
        options={[
          { value: "monthly", label: "Bulanan" },
          { value: "once", label: "Sekali bayar" },
        ]}
      />
      <Field label="Mulai berlaku">
        <Input
          type="month"
          required
          value={startMonth}
          onValueChange={setStartMonth}
        />
      </Field>
      <Field
        label="Tanggal jatuh tempo"
        hint="Mengikuti hari terakhir bulan bila tanggal ini tidak tersedia."
      >
        <Input
          type="number"
          min={1}
          max={31}
          required
          value={String(dueDay)}
          onValueChange={(value) => setDueDay(Number(value))}
        />
      </Field>
      {type && (
        <>
          <SwitchField
            label="Iuran aktif"
            checked={active}
            onCheckedChange={setActive}
            description="Iuran nonaktif tidak dapat menerbitkan tagihan baru."
          />
          <p className="text-xs text-muted">
            Perubahan nominal berlaku saat menerbitkan tagihan berikutnya.
          </p>
        </>
      )}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

function IssueForm({
  types,
  month,
  onDone,
}: {
  types: DuesType[];
  month: string;
  onDone: () => void;
}) {
  const homes = useQuery(housesQuery);
  const [typeId, setTypeId] = useState(String(types[0]?.id ?? ""));
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const issue = useMutation({
    mutationFn: () =>
      call(
        api.admin.iuran.tagihan.$post({
          json: {
            typeId: Number(typeId),
            month,
            ...(scope === "selected" && { houseIds: selected }),
          },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...DUES_REFRESH);
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        issue.mutate();
      }}
    >
      <p className="text-sm font-semibold">{formatMonth(month)}</p>
      {types.length ? (
        <Select
          label="Jenis iuran"
          value={typeId}
          onValueChange={setTypeId}
          options={types.map((type) => ({
            value: String(type.id),
            label: type.name,
            hint: formatRupiah(type.amount),
          }))}
        />
      ) : (
        <Alert tone="info">
          Belum ada jenis iuran aktif untuk bulan ini. Tambahkan jenis iuran
          terlebih dahulu.
        </Alert>
      )}
      <Select
        label="Rumah yang ditagih"
        value={scope}
        onValueChange={setScope}
        options={[
          { value: "all", label: "Semua rumah terdaftar" },
          { value: "selected", label: "Pilih rumah" },
        ]}
      />
      {scope === "selected" && (
        <QueryState query={homes}>
          {({ houses }) => (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line p-2">
              {houses.map((house) => (
                <label
                  key={house.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 px-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(house.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, house.id]
                          : ids.filter((id) => id !== house.id),
                      )
                    }
                    className="size-4 accent-primary"
                  />
                  <span>
                    {house.block}-{house.number}
                  </span>
                  <span className="min-w-0 break-words text-xs text-muted">
                    {house.ownerName}
                  </span>
                </label>
              ))}
            </div>
          )}
        </QueryState>
      )}
      {issue.isError && <Alert>{issue.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={issue.isPending || !types.length}>
          {issue.isPending ? "Menerbitkan…" : "Terbitkan tagihan"}
        </Button>
      </div>
    </form>
  );
}

function ReceiptForm({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const [clientId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState<number | null>(bill.remaining);
  const [date, setDate] = useState(localDate(new Date()));
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [imageError, setImageError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      call(
        api.admin.iuran.pembayaran.$post({
          json: {
            clientId,
            invoiceId: bill.id,
            amount: amount ?? 0,
            date,
            method,
            note,
            proof,
          },
        }),
      ),
    onSuccess: async () => {
      await invalidate(...DUES_REFRESH);
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm">
        <strong>
          {bill.block}-{bill.number} · {bill.typeName}
        </strong>
        <span className="mt-1 block text-muted">
          Sisa tagihan {formatRupiah(bill.remaining)}
        </span>
      </p>
      <Field
        label="Nominal diterima (Rp)"
        hint="Pembayaran sebagian diperbolehkan."
      >
        <RupiahInput required value={amount} onValueChange={setAmount} />
      </Field>
      <DatePicker
        label="Tanggal diterima"
        value={date}
        onValueChange={setDate}
        today={localDate(new Date())}
        max={localDate(new Date())}
      />
      <Select
        label="Cara pembayaran"
        value={method}
        onValueChange={setMethod}
        options={[
          { value: "transfer", label: "Transfer" },
          { value: "cash", label: "Tunai" },
        ]}
      />
      <Field label="Catatan (opsional)">
        <Input value={note} onValueChange={setNote} maxLength={200} />
      </Field>
      <label className="block text-sm font-medium">
        Bukti pembayaran (opsional)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={reading || save.isPending}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:py-2 file:text-fg"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setReading(true);
            setImageError("");
            try {
              setProof(await receiptImage(file));
            } catch (error) {
              setImageError(
                error instanceof Error ? error.message : "Gambar belum dimuat.",
              );
            } finally {
              setReading(false);
            }
          }}
        />
      </label>
      <p className="text-xs text-muted">
        PNG, JPG, atau WebP. Foto besar diperkecil otomatis.
      </p>
      {reading && (
        <p role="status" className="text-sm text-muted">
          Menyiapkan gambar…
        </p>
      )}
      {proof && (
        <div className="space-y-2">
          <img
            src={proof}
            alt="Pratinjau bukti pembayaran"
            className="max-h-48 w-full rounded-xl object-contain"
          />
          <Button variant="ghost" size="sm" onClick={() => setProof(null)}>
            Lepaskan gambar
          </Button>
        </div>
      )}
      {imageError && <Alert>{imageError}</Alert>}
      {save.isError && <Alert>{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending || reading}>
          {save.isPending ? "Menyimpan…" : "Simpan pembayaran"}
        </Button>
      </div>
    </form>
  );
}

function LogDialog({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "iuran-log", id],
    queryFn: () =>
      call(
        api.admin.iuran.tagihan[":id"].log.$get({ param: { id: String(id) } }),
      ),
    enabled: id !== null,
  });
  const labels = {
    issue: "Tagihan diterbitkan",
    cancel_invoice: "Tagihan dibatalkan",
    receive: "Pembayaran dicatat",
    cancel_receipt: "Pembayaran dibatalkan",
  };
  return (
    <Dialog open={id !== null} onClose={onClose} title="Riwayat tagihan">
      <QueryState query={query}>
        {({ logs }) => (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="rounded-xl bg-idle-soft p-3 text-sm">
                <p className="font-semibold">{labels[log.action]}</p>
                <p className="mt-1">{formatRupiah(log.amount)}</p>
                <p className="mt-1 text-xs text-muted">
                  {log.name ?? "Pengurus"} ·{" "}
                  {formatDateShort(localDate(new Date(log.createdAt)))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Dialog>
  );
}
