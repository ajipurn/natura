import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, SectionTitle, buttonClass, cx, inputClass } from "@/components/ui";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import { housesQuery } from "../queries";
import { AddHousesForm, EditHouseForm } from "./house-forms";

export function RumahPage() {
  const query = useQuery(housesQuery);
  const [search, setSearch] = useState("");

  return (
    <QueryState query={query}>
      {({ houses }) => {
        const shown = search.trim() ? searchHouses(houses, search, houses.length) : houses;
        const groups = groupByBlock(shown);
        return (
          <>
            <PageHeader
              title="Data rumah"
              subtitle={`${houses.length} rumah · ${groupByBlock(houses).length} blok`}
              action={
                houses.length > 0 && (
                  <Link to="/admin/rumah/cetak" className={buttonClass("primary", "sm")}>
                    <Printer className="size-4" /> Cetak QR
                  </Link>
                )
              }
            />

            <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
              <Card className="lg:sticky lg:top-6">
                <h2 className="mb-3 font-semibold">Tambah rumah</h2>
                <AddHousesForm />
              </Card>

              <div>
                {houses.length > 0 && (
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari nomor atau nama KK…"
                      aria-label="Cari rumah"
                      className={cx(inputClass, "pl-10")}
                    />
                  </label>
                )}
                {shown.length === 0 && search && <p className="py-6 text-center text-muted">Tidak ada rumah yang cocok.</p>}
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
              </div>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
