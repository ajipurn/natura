import { useId, useMemo, type KeyboardEvent } from "react";
import { houseLabelLong } from "@/lib/houses";
import {
  lotFontSize,
  matchPlan,
  pointsAttr,
  polygonCentroid,
  shrinkPolygon,
  type PlanLot,
  type SitePlan,
} from "@/lib/site-plan";
import type { HouseDTO } from "@/lib/types";
import { STATE_TEXT, type MarkerState } from "@/lib/house-state";
import { cx } from "./ui";
import { ZoomPane } from "./zoom-pane";

const LOT_STYLES: Record<MarkerState, { shape: string; text: string }> = {
  filled: { shape: "fill-filled-soft stroke-filled", text: "fill-filled" },
  empty: { shape: "fill-empty-soft stroke-empty", text: "fill-empty" },
  unchecked: { shape: "fill-card stroke-fg/50", text: "fill-fg" },
  vacant: { shape: "fill-card stroke-muted [stroke-dasharray:5_4]", text: "fill-muted" },
  neutral: { shape: "fill-card stroke-fg/40", text: "fill-fg" },
};

/**
 * Denah dari kode (SVG): kavling diwarnai sesuai status rumahnya.
 * Kavling dicoret (belum ada rumah) diarsir; kavling berpenghuni yang belum terdaftar tampil polos.
 */
export function SitePlanMap({
  plan,
  houses,
  markers,
  pending,
  onHouseClick,
  highlightMissing = false,
  className,
}: {
  plan: SitePlan;
  houses: HouseDTO[];
  /** Status tiap rumah (id → status). */
  markers?: Record<number, MarkerState>;
  /** Rumah yang catatannya belum terkirim. */
  pending?: Set<number>;
  onHouseClick?: (house: HouseDTO) => void;
  /** Tandai kavling berpenghuni yang belum ada data rumahnya (untuk admin). */
  highlightMissing?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const { lotHouse } = useMemo(() => matchPlan(plan, houses), [plan, houses]);
  const [x, y, w, h] = plan.viewBox;

  return (
    <ZoomPane className={className} readableWidth={680}>
      <svg
        viewBox={`${x} ${y} ${w} ${h}`}
        className="block h-auto w-full select-none"
        role="group"
        aria-label={`Denah ${plan.name}`}
      >
        <defs>
          <pattern id={`${id}-park`} width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" className="fill-park" />
            <circle cx="3" cy="3" r="1.6" className="fill-park-dot" />
            <circle cx="9" cy="9" r="1.6" className="fill-park-dot" />
          </pattern>
          <pattern id={`${id}-hatch`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" className="fill-bg" />
            <line x1="0" y1="0" x2="0" y2="10" className="stroke-line" strokeWidth="3" />
          </pattern>
        </defs>

        <polygon points={pointsAttr(plan.area)} className="fill-idle-soft stroke-line" strokeWidth="3" strokeLinejoin="round" />
        {plan.greens.map((points, i) => (
          <polygon key={i} points={pointsAttr(points)} fill={`url(#${id}-park)`} />
        ))}
        {plan.channels.map((c, i) => (
          <polyline
            key={i}
            points={pointsAttr(c.points)}
            fill="none"
            className="stroke-water"
            strokeWidth={c.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {plan.lots.map((lot, i) => (
          <Lot
            key={i}
            lot={lot}
            house={lotHouse.get(lot)}
            state={markersFor(lotHouse.get(lot), markers)}
            pending={pending}
            hatchId={`${id}-hatch`}
            highlightMissing={highlightMissing}
            onHouseClick={onHouseClick}
          />
        ))}

        {plan.labels.map((label, i) => (
          <text
            key={i}
            x={label.at[0]}
            y={label.at[1]}
            textAnchor="middle"
            fontSize={label.size ?? 28}
            fontWeight={800}
            className="pointer-events-none fill-muted stroke-bg [paint-order:stroke]"
            strokeWidth="6"
          >
            {label.text}
          </text>
        ))}
      </svg>
    </ZoomPane>
  );
}

function markersFor(house: HouseDTO | undefined, markers: Record<number, MarkerState> | undefined): MarkerState {
  if (!house) return "neutral";
  return markers?.[house.id] ?? "neutral";
}

function Lot({
  lot,
  house,
  state,
  pending,
  hatchId,
  highlightMissing,
  onHouseClick,
}: {
  lot: PlanLot;
  house: HouseDTO | undefined;
  state: MarkerState;
  pending?: Set<number>;
  hatchId: string;
  highlightMissing: boolean;
  onHouseClick?: (house: HouseDTO) => void;
}) {
  const [cx0, cy0] = polygonCentroid(lot.points);
  const text = lot.label ?? lot.number ?? "";
  const fontSize = lotFontSize(lot);
  // Sedikit diperkecil supaya ada sela antar-kavling.
  const points = pointsAttr(shrinkPolygon(lot.points, 0.94));

  if (!house) {
    const missing = lot.built && lot.number !== null;
    return (
      <g className="pointer-events-none">
        <polygon
          points={points}
          fill={missing ? undefined : `url(#${hatchId})`}
          className={cx(
            missing ? "fill-card" : "stroke-line",
            missing && (highlightMissing ? "stroke-warn [stroke-dasharray:6_4]" : "stroke-line"),
          )}
          strokeWidth={missing && highlightMissing ? 3 : 2}
          strokeLinejoin="round"
        />
        {text && (
          <text
            x={cx0}
            y={cy0}
            dy="0.35em"
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight={700}
            className={missing && highlightMissing ? "fill-warn" : "fill-muted"}
          >
            {text}
          </text>
        )}
      </g>
    );
  }

  const style = LOT_STYLES[state];
  const isPending = pending?.has(house.id);
  const label = `${houseLabelLong(house)}${STATE_TEXT[state] ? `, ${STATE_TEXT[state]}` : ""}${isPending ? ", belum terkirim" : ""}`;
  const activate = onHouseClick ? () => onHouseClick(house) : undefined;

  return (
    <g
      role={activate ? "button" : undefined}
      tabIndex={activate ? 0 : undefined}
      aria-label={label}
      onClick={activate}
      onKeyDown={
        activate
          ? (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
      className={cx(activate && "cursor-pointer outline-none focus-visible:[&>polygon]:stroke-primary")}
    >
      <title>{label}</title>
      <polygon points={points} className={style.shape} strokeWidth="2.5" strokeLinejoin="round" />
      <text
        x={cx0}
        y={cy0}
        dy="0.35em"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        className={cx("pointer-events-none", style.text)}
      >
        {text}
      </text>
      {isPending && <circle cx={cx0 + fontSize} cy={cy0 - fontSize} r={5} className="fill-warn stroke-card" strokeWidth="1.5" />}
    </g>
  );
}
