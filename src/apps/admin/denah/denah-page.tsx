import { useQuery } from "@tanstack/react-query";
import { Box, Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { SitePlanMap } from "@/components/site-plan-map";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { houseLabel } from "@/lib/houses";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import { housesQuery } from "../queries";
import { RegisterPlanHouses } from "./register-plan-houses";

const SiteMap3D = lazy(() => import("@/components/site-map-3d"));

export function DenahPage() {
  const query = useQuery(housesQuery);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const builtCount = SITE_PLAN.lots.filter((l) => l.built).length;
  const emptyCount = SITE_PLAN.lots.length - builtCount;

  return (
    <>
      <PageHeader title="Denah" subtitle={`${SITE_PLAN.name} · ${SITE_PLAN.lots.length} kavling`} />
      <QueryState query={query}>
        {({ houses }) => {
          const { lotHouse, missing, notOnPlan } = matchPlan(SITE_PLAN, houses);
          return (
            <>
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
                    <Link to="/admin/rumah" className="font-semibold underline">
                      Data rumah
                    </Link>
                    . Rumah ini tetap muncul di tampilan Daftar.
                  </p>
                </Card>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <SectionTitle>Pratinjau</SectionTitle>
                <div role="tablist" aria-label="Tampilan" className="flex rounded-xl border border-line bg-card p-0.5">
                  {(
                    [
                      ["2d", "Denah", MapIcon],
                      ["3d", "3D", Box],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={view === value}
                      onClick={() => setView(value)}
                      className={cx(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold",
                        view === value ? "bg-primary text-primary-fg" : "text-muted",
                      )}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              {view === "2d" ? (
                <SitePlanMap plan={SITE_PLAN} houses={houses} highlightMissing />
              ) : (
                <Suspense fallback={<p className="py-20 text-center text-muted">Memuat tampilan 3D…</p>}>
                  <SiteMap3D plan={SITE_PLAN} houses={houses} markers={{}} />
                </Suspense>
              )}
              <p className="mt-2 text-xs text-muted">
                Kavling berarsir = kavling yang belum dibangun (dicoret di denah asli). Bentuk denah diatur di kode{" "}
                <code className="rounded bg-idle-soft px-1">src/site-plan/natura.ts</code>.
              </p>
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div>
      <p className={cx("text-2xl font-bold", tone === "warn" && "text-warn")}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
