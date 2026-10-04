import type { Metadata } from "next";
import Link from "next/link";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { houseLabel } from "@/lib/houses";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import { requireAdmin } from "@/server/auth";
import { getSiteMapInfo, listHouses } from "@/server/queries";
import { MapEditor } from "./map-editor";
import { RegisterPlanHouses } from "./register-plan-houses";

export const metadata: Metadata = { title: "Denah" };

export default async function AdminSiteMapPage() {
  await requireAdmin();
  const [houses, info] = await Promise.all([listHouses(), getSiteMapInfo()]);

  if (SITE_PLAN) {
    const { lotHouse, missing, notOnPlan } = matchPlan(SITE_PLAN, houses);
    const builtCount = SITE_PLAN.lots.filter((l) => l.built).length;
    const emptyCount = SITE_PLAN.lots.length - builtCount;

    return (
      <>
        <PageHeader title="Denah" subtitle={`${SITE_PLAN.name} · ${SITE_PLAN.lots.length} kavling`} />

        <Card className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rumah terdaftar" value={`${lotHouse.size}/${builtCount}`} />
            <Stat label="Belum terdaftar" value={missing.length} tone={missing.length ? "warn" : undefined} />
            <Stat label="Belum dibangun" value={emptyCount} />
          </div>
          {missing.length > 0 && (
            <p className="text-sm text-muted">
              Kavling berpenghuni yang belum ada data rumahnya (bergaris oranye di denah):{" "}
              <span className="font-medium text-fg">
                {missing.map((lot) => houseLabel({ block: lot.block, number: lot.number! })).join(", ")}
              </span>
            </p>
          )}
          <RegisterPlanHouses count={missing.length} />
        </Card>

        {notOnPlan.length > 0 && (
          <Card className="mt-4 border-warn/40 bg-warn-soft text-sm text-warn">
            <p className="font-semibold">{notOnPlan.length} rumah terdaftar tidak ada di denah</p>
            <p className="mt-1">
              {notOnPlan.map(houseLabel).join(", ")}. Periksa blok/nomornya di{" "}
              <Link href="/admin/rumah" className="font-semibold underline">
                Data rumah
              </Link>
              . Rumah ini tetap muncul di tampilan Daftar.
            </p>
          </Card>
        )}

        <SectionTitle>Pratinjau</SectionTitle>
        <SitePlanMap plan={SITE_PLAN} houses={houses} highlightMissing />
        <p className="mt-2 text-xs text-muted">
          Kavling berarsir = kavling yang belum dibangun (dicoret di denah asli). Bentuk denah diatur di kode{" "}
          <code className="rounded bg-idle-soft px-1">src/site-plan/natura.ts</code>.
        </p>
      </>
    );
  }

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

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
