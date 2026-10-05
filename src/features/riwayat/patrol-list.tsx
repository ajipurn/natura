import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { patrolsQuery } from "./queries";

/** Daftar malam ronda. `basePath` = alamat halaman ini di app (mis. /petugas/riwayat). */
export function PatrolList({ basePath }: { basePath: string }) {
  const query = useQuery(patrolsQuery);

  return (
    <>
      <PageHeader title="Riwayat ronda" subtitle="90 malam terakhir" />
      <QueryState query={query}>
        {({ patrols }) =>
          patrols.length === 0 ? (
            <Card className="text-center text-muted">Belum ada catatan ronda.</Card>
          ) : (
            <ul className="space-y-2">
              {patrols.map((p) => (
                <li key={p.date}>
                  <Link
                    to={`${basePath}/${p.date}`}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 hover:border-primary/40 active:bg-idle-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{formatDateLong(p.date)}</span>
                        <span className="font-bold">{formatRupiah(p.total)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        <span className="text-filled">{p.filled} ada</span> ·{" "}
                        <span className="text-empty">{p.empty} kosong</span>
                        {p.collectors && ` · ${p.collectors}`}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
