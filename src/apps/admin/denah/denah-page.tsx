import { CalendarRange, Moon, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { PageHeader, cx } from "@/components/ui";
import { SITE_PLAN } from "@/site-plan";
import { AturDenah } from "./atur-denah";
import { MonthMap } from "./month-map";
import { TonightMap } from "./tonight-map";

const MODES = [
  { value: "malam", label: "Malam ini", icon: Moon },
  { value: "bulan", label: "Bulanan", icon: CalendarRange },
  { value: "atur", label: "Atur denah", icon: Settings2 },
] as const;

type Mode = (typeof MODES)[number]["value"];

/**
 * Peta ronda: memantau jimpitan di denah (malam ini dan per bulan). Data rumahnya diubah di
 * Rumah & QR; tab "Atur denah" untuk kecocokan denah, kalibrasi GPS, dan pratinjau 3D.
 */
export function DenahPage() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = MODES.find((m) => m.value === params.get("mode"))?.value ?? "malam";

  return (
    <>
      <PageHeader title="Peta ronda" subtitle={`${SITE_PLAN.name} · ${SITE_PLAN.lots.length} kavling`} />
      <div role="tablist" aria-label="Tampilan peta" className="mb-4 flex rounded-xl border border-line bg-card p-0.5 sm:w-fit">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setParams(value === "malam" ? {} : { mode: value }, { replace: true })}
            className={cx(
              "flex h-9.5 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold",
              mode === value ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-4 max-sm:hidden" /> {label}
          </button>
        ))}
      </div>
      {mode === "malam" ? <TonightMap /> : mode === "bulan" ? <MonthMap /> : <AturDenah />}
    </>
  );
}
