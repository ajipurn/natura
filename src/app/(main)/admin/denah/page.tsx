import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { getSiteMapInfo, listHouses } from "@/server/queries";
import { MapEditor } from "./map-editor";

export const metadata: Metadata = { title: "Denah" };

export default async function AdminSiteMapPage() {
  await requireAdmin();
  const [houses, info] = await Promise.all([listHouses(), getSiteMapInfo()]);

  return (
    <>
      <PageHeader title="Denah" subtitle="Posisi rumah untuk tampilan denah saat ronda" />
      {houses.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">Belum ada data rumah</p>
          <p className="mt-1 text-sm text-muted">Tambahkan rumah dulu, baru atur posisinya di denah.</p>
          <Link href="/admin/rumah" className={`${buttonClass("primary")} mt-4`}>
            Tambah rumah
          </Link>
        </Card>
      ) : (
        <MapEditor houses={houses} info={info} />
      )}
    </>
  );
}
