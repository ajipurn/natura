import { useId, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { houseLabelLong } from "@/lib/houses";
import {
  lotFontSize,
  matchPlan,
  pointsAttr,
  polygonCentroid,
  shrinkPolygon,
  type PlanLot,
  type PlanPoint,
  type SitePlan,
} from "@/lib/site-plan";
import type { HouseDTO } from "@/lib/types";
import { STATE_TEXT, type MarkerState } from "@/lib/house-state";
import { cx } from "./ui";
import { ZoomPane, type ZoomFocus } from "./zoom-pane";

/** Posisi pengguna di denah (dari GPS) beserta jari-jari akurasinya dalam satuan denah. */
export type PlanYou = { point: PlanPoint; radius: number };

/** Warna khusus satu rumah (mis. heatmap): kelas bentuk & teks, plus keterangan untuk pembaca layar. */
export type LotPaint = { shape: string; text: string; note?: string };

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
  paint,
  selectedId,
  pending,
  onHouseClick,
  highlightMissing = false,
  onMissingClick,
  highlight,
  you,
  focus,
  anchorMarks,
  pick,
  onPlanClick,
  className,
  fitToView = false,
}: {
  plan: SitePlan;
  houses: HouseDTO[];
  /** Status tiap rumah (id → status). */
  markers?: Record<number, MarkerState>;
  /** Warna khusus per rumah (id → warna); menimpa `markers` untuk rumah itu. */
  paint?: Record<number, LotPaint>;
  /** Rumah yang sedang dipilih, diberi garis tebal. */
  selectedId?: number | null;
  /** Rumah yang catatannya belum terkirim. */
  pending?: Set<number>;
  onHouseClick?: (house: HouseDTO) => void;
  /** Tandai kavling berpenghuni yang belum ada data rumahnya (untuk admin). */
  highlightMissing?: boolean;
  /** Ketuk kavling berpenghuni yang belum ada data rumahnya (untuk admin). */
  onMissingClick?: (lot: PlanLot) => void;
  /** Kalau diisi, rumah lain dan kavling tanpa data diredupkan (mis. hasil pencarian). */
  highlight?: ReadonlySet<number> | null;
  /** "Kamu di sini" dari GPS. */
  you?: PlanYou | null;
  /** Geser tampilan ke titik ini (ganti `key` untuk mengulang). */
  focus?: { point: PlanPoint; key: number } | null;
  /** Titik acuan kalibrasi GPS (bernomor), untuk admin. */
  anchorMarks?: readonly PlanPoint[];
  /** Titik yang sedang dipilih admin (belum disimpan). */
  pick?: PlanPoint | null;
  /** Ketuk di mana saja pada denah (kavling tidak bisa diketuk selama ini dipasang). */
  onPlanClick?: (point: PlanPoint) => void;
  className?: string;
  /** Tampilkan seluruh denah saat dibuka, tanpa memperbesar otomatis untuk keterbacaan. */
  fitToView?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const { lotHouse } = useMemo(() => matchPlan(plan, houses), [plan, houses]);
  const [x, y, w, h] = plan.viewBox;
  const zoomFocus: ZoomFocus | null = focus ? { fx: (focus.point[0] - x) / w, fy: (focus.point[1] - y) / h, key: focus.key } : null;

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!onPlanClick || !matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    onPlanClick([Math.round(p.x), Math.round(p.y)]);
  }

  return (
    <ZoomPane className={className} aspectRatio={w / h} readableWidth={fitToView ? undefined : 680} focus={zoomFocus}>
      <svg
        viewBox={`${x} ${y} ${w} ${h}`}
        className={cx("block h-auto w-full select-none", onPlanClick && "cursor-crosshair")}
        role="group"
        aria-label={`Denah ${plan.name}`}
        onClick={onPlanClick ? handleClick : undefined}
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

        {plan.lots.map((lot, i) => {
          const house = lotHouse.get(lot);
          return (
            <Lot
              key={i}
              lot={lot}
              house={house}
              state={markersFor(house, markers)}
              paint={house && paint?.[house.id]}
              selected={house !== undefined && house.id === selectedId}
              pending={pending}
              hatchId={`${id}-hatch`}
              highlightMissing={highlightMissing}
              dimmed={Boolean(highlight) && !(house && highlight?.has(house.id))}
              onHouseClick={onPlanClick ? undefined : onHouseClick}
              onMissingClick={onPlanClick ? undefined : onMissingClick}
            />
          );
        })}

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

        {anchorMarks?.map(([ax, ay], i) => (
          <g key={`anchor-${i}`} className="pointer-events-none" aria-label={`Titik acuan ${i + 1}`}>
            <circle cx={ax} cy={ay} r={13} className="fill-primary stroke-card" strokeWidth={3} />
            <text x={ax} y={ay} dy="0.35em" textAnchor="middle" fontSize={15} fontWeight={800} className="fill-primary-fg">
              {i + 1}
            </text>
          </g>
        ))}
        {pick && (
          <g className="pointer-events-none" aria-label="Titik yang dipilih">
            <circle cx={pick[0]} cy={pick[1]} r={16} className="fill-none stroke-warn" strokeWidth={4} strokeDasharray="6 4" />
            <circle cx={pick[0]} cy={pick[1]} r={4} className="fill-warn" />
          </g>
        )}
        {you && (
          <g className="pointer-events-none" role="img" aria-label="Lokasimu sekarang">
            <circle cx={you.point[0]} cy={you.point[1]} r={Math.max(you.radius, 14)} className="fill-you/15 stroke-you/40" strokeWidth={2} />
            <circle cx={you.point[0]} cy={you.point[1]} r={12} className="fill-you/30">
              <animate attributeName="r" values="12;26;12" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={you.point[0]} cy={you.point[1]} r={10} className="fill-you stroke-white" strokeWidth={4} />
          </g>
        )}
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
  paint,
  selected,
  pending,
  hatchId,
  highlightMissing,
  dimmed,
  onHouseClick,
  onMissingClick,
}: {
  lot: PlanLot;
  house: HouseDTO | undefined;
  state: MarkerState;
  paint?: LotPaint;
  selected: boolean;
  pending?: Set<number>;
  hatchId: string;
  highlightMissing: boolean;
  dimmed: boolean;
  onHouseClick?: (house: HouseDTO) => void;
  onMissingClick?: (lot: PlanLot) => void;
}) {
  const [cx0, cy0] = polygonCentroid(lot.points);
  const text = lot.label ?? lot.number ?? "";
  const fontSize = lotFontSize(lot);
  // Sedikit diperkecil supaya ada sela antar-kavling.
  const points = pointsAttr(shrinkPolygon(lot.points, 0.94));

  if (!house) {
    const missing = lot.built && lot.number !== null;
    const add = missing && onMissingClick ? () => onMissingClick(lot) : undefined;
    const label = add ? `${houseLabelLong({ block: lot.block, number: lot.number! })}, belum terdaftar` : undefined;
    return (
      <g
        {...pressable(add)}
        aria-label={label}
        className={cx(add ? PRESSABLE_CLASS : "pointer-events-none", dimmed && "opacity-25")}
      >
        {label && <title>{label}</title>}
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

  const style = paint ?? LOT_STYLES[state];
  const note = paint ? paint.note : STATE_TEXT[state];
  const isPending = pending?.has(house.id);
  const label = `${houseLabelLong(house)}${note ? `, ${note}` : ""}${isPending ? ", belum terkirim" : ""}`;
  const activate = onHouseClick ? () => onHouseClick(house) : undefined;

  return (
    <g {...pressable(activate)} aria-label={label} className={cx(activate && PRESSABLE_CLASS, dimmed && "opacity-25")}>
      <title>{label}</title>
      <polygon points={points} className={style.shape} strokeWidth="2.5" strokeLinejoin="round" />
      {selected && <polygon points={points} className="pointer-events-none fill-none stroke-primary" strokeWidth="6" strokeLinejoin="round" />}
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

const PRESSABLE_CLASS = "cursor-pointer outline-none hover:[&>polygon]:stroke-primary focus-visible:[&>polygon]:stroke-primary";

/** Kavling yang bisa diketuk: tombol yang bisa difokus dan ditekan dengan Enter/Spasi. */
function pressable(activate: (() => void) | undefined) {
  if (!activate) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    },
  };
}
