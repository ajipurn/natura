import { CalendarRange, Moon, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { SegmentedControl } from "@/components/toggle-group";
import { PageHeader } from "@/components/ui";
import { SITE_PLAN } from "@/site-plan";
import { AturDenah } from "./atur-denah";
import { MonthMap } from "./month-map";
import { TonightMap } from "./tonight-map";

// Di HP ikonnya disembunyikan supaya ketiga labelnya muat.
const MODES = [
  {
    value: "malam",
    label: "Malam ini",
    icon: Moon,
    className: "max-sm:[&>svg]:hidden",
  },
  {
    value: "bulan",
    label: "Bulanan",
    icon: CalendarRange,
    className: "max-sm:[&>svg]:hidden",
  },
  {
    value: "atur",
    label: "Atur denah",
    icon: Settings2,
    className: "max-sm:[&>svg]:hidden",
  },
] as const;

type Mode = (typeof MODES)[number]["value"];

/**
 * Peta ronda: memantau jimpitan di denah (malam ini dan per bulan). Data rumahnya diubah di
 * Rumah & QR; tab "Atur denah" untuk kecocokan denah, kalibrasi GPS, dan pratinjau 3D.
 */
export function DenahPage() {
  const [params, setParams] = useSearchParams();
  const mode: Mode =
    MODES.find((m) => m.value === params.get("mode"))?.value ?? "malam";

  return (
    <>
      <PageHeader
        title="Peta ronda"
        subtitle={`${SITE_PLAN.name} | ${SITE_PLAN.lots.length} kavling`}
      />
      <SegmentedControl
        aria-label="Tampilan peta"
        fill
        value={mode}
        onValueChange={(next) =>
          setParams(next === "malam" ? {} : { mode: next }, { replace: true })
        }
        options={MODES}
        className="mb-4 sm:w-fit"
      />
      {mode === "malam" ? (
        <TonightMap />
      ) : mode === "bulan" ? (
        <MonthMap />
      ) : (
        <AturDenah />
      )}
    </>
  );
}
