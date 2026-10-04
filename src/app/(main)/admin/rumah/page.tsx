import { Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { requireAdmin } from "@/server/auth";
import { listHousesWithUsage } from "@/server/queries";
import { AddHousesForm, EditHouseForm } from "./house-forms";

export const metadata: Metadata = { title: "Data rumah" };

export default async function AdminHousesPage() {
  await requireAdmin();
  const houses = await listHousesWithUsage();
  const groups = groupByBlock(houses);

  return (
    <>
      <PageHeader
        title="Data rumah"
        subtitle={`${houses.length} rumah · ${groups.length} blok`}
        action={
          houses.length > 0 && (
            <Link href="/admin/rumah/cetak" className={buttonClass("primary", "sm")}>
              <Printer className="size-4" /> Cetak QR
            </Link>
          )
        }
      />

      <Card>
        <h2 className="mb-3 font-semibold">Tambah rumah</h2>
        <AddHousesForm />
      </Card>

      {groups.map(([block, list]) => (
        <section key={block}>
          <SectionTitle>
            Blok {block} · {list.length} rumah
          </SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {list.map((h) => (
              <li key={h.id}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="w-14 shrink-0 font-bold">{houseLabel(h)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">{h.ownerName ?? "—"}</span>
                    {h.status === "vacant" && (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">mudik</span>
                    )}
                    <span className="text-sm font-semibold text-muted group-open:hidden">Ubah</span>
                    <span className="hidden text-sm font-semibold text-muted group-open:inline">Tutup</span>
                  </summary>
                  <EditHouseForm house={h} canDelete={h.collectionCount === 0} />
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
