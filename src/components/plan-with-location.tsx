import { Crosshair, Locate, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { fitGeoTransform, locateOnPlan, type GeoAnchor, type PlanLocation } from "@/lib/geo";
import { lotKey } from "@/lib/site-plan";
import { SitePlanMap } from "./site-plan-map";
import { Button } from "./ui";

type Fix = { lat: number; lng: number; accuracy: number };
type LocationState =
  | { status: "off" }
  | { status: "locating" }
  | { status: "ok"; fix: Fix }
  | { status: "error"; message: string };

function errorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Izin lokasi ditolak. Izinkan lokasi untuk situs ini di pengaturan browser.";
  if (error.code === error.TIMEOUT) return "Lokasi belum didapat. Coba di tempat terbuka.";
  return "Lokasi tidak tersedia. Pastikan GPS/lokasi HP menyala.";
}

/** Pantau lokasi HP selama `enabled`; berhenti (dan GPS dimatikan) begitu dimatikan. */
function useMyLocation(enabled: boolean): LocationState {
  const [state, setState] = useState<LocationState>({ status: "locating" });
  // Browser hanya memberi lokasi di https (atau localhost).
  const supported = typeof window !== "undefined" && window.isSecureContext && "geolocation" in navigator;
  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: "ok", fix: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => setState({ status: "error", message: errorMessage(e) }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      // Lokasi lama tidak ditampilkan lagi saat dinyalakan berikutnya.
      setState({ status: "locating" });
    };
  }, [enabled, supported]);
  if (!enabled) return { status: "off" };
  if (!supported) return { status: "error", message: "Lokasi hanya bisa dipakai lewat alamat https." };
  return state;
}

function describe(location: PlanLocation): string {
  if (location.kind === "outside") return `Di luar cluster, ±${Math.round(location.meters)} m dari denah`;
  const { block, number } = location.lot;
  const name = number ? lotKey(block, number) : `kavling kosong blok ${block}`;
  return location.kind === "lot" ? `Kamu di ${name} · Blok ${block}` : `Dekat ${name} · Blok ${block}`;
}

/**
 * Denah dengan tombol "Lokasi saya": posisi GPS ditaruh di denah lewat titik acuan kalibrasi
 * dari admin, lengkap dengan kavling/blok terdekat. Lokasi tidak dikirim ke server.
 */
export function PlanWithLocation({
  anchors,
  calibrateHint,
  ...map
}: ComponentProps<typeof SitePlanMap> & {
  /** Titik acuan kalibrasi; kurang dari 3 = denah belum bisa menampilkan lokasi. */
  anchors: readonly GeoAnchor[];
  /** Teks/tautan kalau denah belum dikalibrasi. */
  calibrateHint?: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const transform = useMemo(() => fitGeoTransform(anchors), [anchors]);
  const location = useMyLocation(enabled && transform !== null);
  const fix = location.status === "ok" ? location.fix : null;
  const point = fix && transform ? transform.toPlan(fix) : null;
  const where = point && transform ? locateOnPlan(map.plan, point, transform.metersPerUnit) : null;
  const radius = fix && transform ? fix.accuracy / transform.metersPerUnit : 0;

  // Lokasi pertama: langsung tuju titiknya.
  const [centeredFirst, setCenteredFirst] = useState(false);
  if (point && !centeredFirst) {
    setCenteredFirst(true);
    setFocusKey((k) => k + 1);
  }
  if (!enabled && centeredFirst) setCenteredFirst(false);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button
          variant={enabled ? "primary" : "secondary"}
          size="sm"
          aria-pressed={enabled}
          onClick={() => setEnabled((v) => !v)}
          className="shrink-0"
        >
          {enabled ? <LocateFixed className="size-4" /> : <Locate className="size-4" />}
          {enabled ? "Lokasi menyala" : "Lokasi saya"}
        </Button>
        {enabled && point && (
          <Button variant="ghost" size="sm" onClick={() => setFocusKey((k) => k + 1)} className="shrink-0">
            <Crosshair className="size-4" /> Pusatkan
          </Button>
        )}
        <p className="basis-full text-sm empty:hidden" role="status" aria-live="polite">
          {!enabled ? null : !transform ? (
            <span className="text-warn">Denah belum dikalibrasi untuk lokasi. {calibrateHint}</span>
          ) : location.status === "error" ? (
            <span className="text-empty">{location.message}</span>
          ) : where && fix ? (
            <>
              <strong>{describe(where)}</strong>
              <span className="text-muted"> · akurasi ±{Math.round(fix.accuracy)} m</span>
            </>
          ) : (
            <span className="text-muted">Mencari lokasi…</span>
          )}
        </p>
      </div>
      <SitePlanMap
        {...map}
        you={point ? { point, radius } : null}
        focus={point ? { point, key: focusKey } : null}
      />
    </div>
  );
}
