import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { listPatrols } from "@/server/queries";

export const metadata: Metadata = { title: "Riwayat" };

export default async function RiwayatPage() {
  await requireUser();
  const patrols = await listPatrols(90);

  return (
    <>
      <PageHeader title="Riwayat ronda" subtitle="90 malam terakhir" />
      {patrols.length === 0 ? (
        <Card className="text-center text-muted">Belum ada catatan ronda.</Card>
      ) : (
        <ul className="space-y-2">
          {patrols.map((p) => (
            <li key={p.date}>
              <Link
                href={`/riwayat/${p.date}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 active:bg-idle-soft"
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
      )}
    </>
  );
}
