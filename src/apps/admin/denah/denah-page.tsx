import { CalendarRange, Moon } from "lucide-react";
import { useSearchParams } from "react-router";
import { SegmentedControl } from "@/components/toggle-group";
import { PageHeader } from "@/components/ui";
import { SITE_PLAN } from "@/site-plan";
import { MonthMap } from "./month-map";
import { TonightMap } from "./tonight-map";

const MODES = [
  { value: "malam", label: "Malam ini", icon: Moon },
  { value: "bulan", label: "Bulanan", icon: CalendarRange },
] as const;

type Mode = (typeof MODES)[number]["value"];

/**
 * Peta ronda: memantau jimpitan di denah (malam ini dan per bulan). Data rumah, kecocokannya dengan
 * denah, dan lokasi GPS diatur di Rumah & QR (tampilan Denah).
 */
export function DenahPage() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = MODES.find((m) => m.value === params.get("mode"))?.value ?? "malam";

  return (
    <>
      <PageHeader title="Peta ronda" subtitle={`${SITE_PLAN.name} · ${SITE_PLAN.lots.length} kavling`} />
      <SegmentedControl
        aria-label="Tampilan peta"
        fill
        value={mode}
        onValueChange={(next) => setParams(next === "malam" ? {} : { mode: next }, { replace: true })}
        options={MODES}
        className="mb-4 sm:w-fit"
      />
      {mode === "bulan" ? <MonthMap /> : <TonightMap />}
    </>
  );
}
