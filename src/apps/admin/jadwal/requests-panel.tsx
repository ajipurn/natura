import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, X } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Alert, Card, buttonClass, cx, inputClass } from "@/components/ui";
import { formatDateShort, formatTime } from "@/lib/dates";
import { REQUEST_STATUS, requestChange } from "@/lib/request-text";
import { DAY_NAMES } from "@/lib/schedule";
import { requestsQuery } from "../queries";

type Request = {
  id: number;
  userName: string;
  house: string | null;
  days: number[];
  fromDay: number | null;
  toDay: number;
  note: string | null;
  status: string;
  response: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

const when = (at: string) => `${formatDateShort(new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }))} ${formatTime(at)}`;

/**
 * Permintaan ubah jadwal dari petugas. Saat ada perubahan jadwal yang belum disimpan, keputusan
 * ditahan dulu supaya tidak tertimpa saat jadwal disimpan.
 */
export function RequestsPanel({ locked }: { locked: boolean }) {
  const query = useQuery(requestsQuery);
  const requests = (query.data?.requests ?? []) as Request[];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  if (requests.length === 0) return null;

  return (
    <Card className={cx("mb-4", pending.length > 0 && "border-warn/50")}>
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-5 text-warn" /> Permintaan ubah jadwal
        {pending.length > 0 && <span className="rounded-full bg-warn px-2 py-0.5 text-xs font-bold text-card">{pending.length}</span>}
      </h2>
      {locked && pending.length > 0 && (
        <p className="mt-1 text-sm text-muted">Simpan atau batalkan perubahan jadwal dulu sebelum memutuskan permintaan.</p>
      )}
      {pending.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Tidak ada permintaan yang menunggu.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {pending.map((r) => (
            <PendingRequest key={r.id} request={r} locked={locked} />
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">Sudah diproses ({decided.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {decided.map((r) => (
              <li key={r.id}>
                <span className={cx("mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", REQUEST_STATUS[r.status].tone)}>
                  {REQUEST_STATUS[r.status].label}
                </span>
                <strong>{r.userName}</strong> {requestChange(r.fromDay, r.toDay)}
                <span className="text-muted">
                  {r.decidedAt && ` · ${when(r.decidedAt)}`}
                  {r.decidedBy && ` oleh ${r.decidedBy}`}
                  {r.response && ` · “${r.response}”`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function PendingRequest({ request: r, locked }: { request: Request; locked: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [response, setResponse] = useState("");
  const decide = useMutation({
    mutationFn: (keputusan: "setujui" | "tolak") =>
      call(api.admin.permintaan[":id"][":keputusan"].$post({ param: { id: String(r.id), keputusan }, json: { response } })),
    onSuccess: () => invalidate(["admin"], ["jadwal"], ["ronda"]),
  });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p>
            <strong>{r.userName}</strong>
            {r.house && <span className="text-muted"> · {r.house}</span>}
          </p>
          <p className="font-semibold text-primary">{requestChange(r.fromDay, r.toDay)}</p>
          <p className="text-xs text-muted">
            Dikirim {when(r.createdAt)}
            {r.days.length > 0 && ` · sekarang jaga ${r.days.map((d) => DAY_NAMES[d]).join(", ")}`}
          </p>
          {r.note && <p className="mt-1 text-sm">“{r.note}”</p>}
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={locked || decide.isPending}
              onClick={() => setRejecting(true)}
              className={buttonClass("secondary", "sm")}
            >
              <X className="size-4" /> Tolak
            </button>
            <button
              type="button"
              disabled={locked || decide.isPending}
              onClick={() => decide.mutate("setujui")}
              className={buttonClass("primary", "sm")}
            >
              <Check className="size-4" /> {decide.isPending ? "Menyimpan…" : "Setujui"}
            </button>
          </div>
        )}
      </div>
      {rejecting && (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decide.mutate("tolak");
          }}
        >
          <input
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            maxLength={300}
            autoFocus
            placeholder="Alasan (opsional), mis. malam Rabu sudah penuh"
            aria-label="Alasan menolak"
            className={cx(inputClass, "h-9 min-w-0 flex-1 text-sm")}
          />
          <button type="button" onClick={() => setRejecting(false)} className={buttonClass("ghost", "sm")}>
            Batal
          </button>
          <button type="submit" disabled={locked || decide.isPending} className={buttonClass("danger", "sm")}>
            Tolak permintaan
          </button>
        </form>
      )}
      {decide.isError && (
        <div className="mt-2">
          <Alert>{decide.error.message}</Alert>
        </div>
      )}
    </li>
  );
}
