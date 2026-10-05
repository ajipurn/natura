import { useQuery } from "@tanstack/react-query";
import { Box, Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router";
import { QueryState } from "@/components/query-state";
import { SegmentedControl } from "@/components/toggle-group";
import { Card, SectionTitle, cx } from "@/components/ui";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import { housesQuery } from "../queries";
import { PlanCalibration } from "./plan-calibration";

const SiteMap3D = lazy(() => import("@/components/site-map-3d"));

const VIEWS = [
  { value: "2d", label: "Denah", icon: MapIcon },
  { value: "3d", label: "3D", icon: Box },
] as const;

/**
 * Tab "Atur denah": ringkasan kecocokan denah dengan data rumah (rumahnya didaftarkan di Rumah & QR),
 * kalibrasi GPS, dan pratinjau 3D.
 */
export function AturDenah() {
  const query = useQuery(housesQuery);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const builtCount = SITE_PLAN.lots.filter((l) => l.built).length;
  const emptyCount = SITE_PLAN.lots.length - builtCount;

  return (
    <>
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
                {(missing.length > 0 || notOnPlan.length > 0) && (
                  <p className="text-sm text-muted">
                    {[
                      missing.length > 0 && `${missing.length} kavling berpenghuni belum terdaftar`,
                      notOnPlan.length > 0 && `${notOnPlan.length} rumah terdaftar tidak cocok dengan kavling mana pun`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    .{" "}
                    <Link to="/admin/rumah?tampilan=denah" className="font-semibold text-primary underline">
                      Atur di Rumah &amp; QR
                    </Link>
                  </p>
                )}
              </Card>

              <div className="mt-6 flex items-center justify-between gap-3">
                <SectionTitle>Pratinjau</SectionTitle>
                <SegmentedControl aria-label="Tampilan" size="sm" value={view} onValueChange={setView} options={VIEWS} />
              </div>
              {view === "2d" ? (
                <PlanCalibration houses={houses} />
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
