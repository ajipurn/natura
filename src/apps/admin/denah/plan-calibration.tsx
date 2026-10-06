import { useMutation, useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { PlanWithLocation } from "@/components/plan-with-location";
import { Alert, Button, Card, Input, cx } from "@/components/ui";
import {
  fitGeoTransform,
  formatLatLng,
  MAX_ANCHORS,
  MIN_ANCHORS,
  parseLatLng,
  type GeoAnchor,
} from "@/lib/geo";
import type { PlanPoint } from "@/lib/site-plan";
import type { HouseDTO } from "@/lib/types";
import { SITE_PLAN } from "@/site-plan";
import { planAnchorsQuery } from "../queries";

/** Selisih (meter) yang dianggap wajar untuk satu titik acuan. */
const OK_RESIDUAL = 15;

/**
 * Denah admin dengan kalibrasi lokasi: admin menandai beberapa titik di denah beserta koordinat
 * GPS-nya, supaya petugas bisa melihat "Lokasi saya" di denah.
 */
export function PlanCalibration({ houses }: { houses: HouseDTO[] }) {
  const query = useQuery(planAnchorsQuery);
  const anchors = useMemo(() => query.data?.anchors ?? [], [query.data]);
  const transform = useMemo(() => fitGeoTransform(anchors), [anchors]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<PlanPoint | null>(null);
  const [coords, setCoords] = useState("");
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: GeoAnchor[]) =>
      call(api.admin.denah.lokasi.$put({ json: { anchors: next } })),
    onSuccess: async () => {
      await invalidate(["admin", "denah-lokasi"], ["ronda"]);
      closeForm();
    },
  });

  function closeForm() {
    setAdding(false);
    setPick(null);
    setCoords("");
    setGpsNote(null);
  }

  function fillFromMyPosition() {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setGpsNote("Lokasi hanya bisa dipakai lewat alamat https.");
      return;
    }
    setGpsNote("Mencari lokasi…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords(
          formatLatLng({ lat: p.coords.latitude, lng: p.coords.longitude }),
        );
        const accuracy = Math.round(p.coords.accuracy);
        setGpsNote(
          accuracy > 20
            ? `Akurasi ±${accuracy} m, kurang tepat. Tunggu sebentar lalu coba lagi.`
            : `Akurasi ±${accuracy} m.`,
        );
      },
      () =>
        setGpsNote("Lokasi tidak didapat. Izinkan lokasi dan nyalakan GPS."),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  }

  const parsed = parseLatLng(coords);
  const worst = transform ? Math.max(...transform.residuals) : 0;

  return (
    <>
      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <MapPin className="size-5 text-primary" /> Lokasi GPS di denah
            </h2>
            <p className="text-sm text-muted">
              {transform
                ? `Aktif: petugas bisa menyalakan "Lokasi saya" di denah. ${anchors.length} titik acuan, selisih terbesar ±${Math.round(worst)} m.`
                : `Belum aktif. Tambahkan minimal ${MIN_ANCHORS} titik acuan yang berjauhan, misalnya pojok-pojok cluster.`}
            </p>
          </div>
          {!adding && anchors.length < MAX_ANCHORS && (
            <Button
              onClick={() => setAdding(true)}
              variant="secondary"
              size="sm"
            >
              <Plus className="size-4" /> Tambah titik acuan
            </Button>
          )}
        </div>

        {anchors.length > 0 && (
          <ol className="divide-y divide-line text-sm">
            {anchors.map((a, i) => {
              const residual = transform?.residuals[i];
              return (
                <li key={i} className="flex items-center gap-3 py-1.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {formatLatLng(a)}
                  </span>
                  {residual !== undefined && (
                    <span
                      className={cx(
                        "shrink-0 text-xs",
                        residual > OK_RESIDUAL
                          ? "font-semibold text-warn"
                          : "text-muted",
                      )}
                    >
                      selisih ±{Math.round(residual)} m
                      {residual > OK_RESIDUAL && " | mungkin salah"}
                    </span>
                  )}
                  <Button
                    variant="plain"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate(anchors.filter((_, j) => j !== i))
                    }
                    className="shrink-0 rounded-lg p-1.5 text-muted hover:text-empty"
                    aria-label={`Hapus titik acuan ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        {adding && (
          <form
            className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pick && parsed)
                save.mutate([
                  ...anchors,
                  { x: pick[0], y: pick[1], ...parsed },
                ]);
            }}
          >
            <p className="text-sm">
              <strong>1.</strong>{" "}
              {pick
                ? "Titik di denah sudah dipilih (ketuk lagi untuk mengganti)."
                : "Ketuk titik di denah yang mudah dikenali di lapangan: pojok kavling, gerbang, atau ujung taman."}
            </p>
            <label className="block text-sm">
              <span>
                <strong>2.</strong> Koordinat GPS titik itu
              </span>
              <Input
                value={coords}
                onChange={(e) => setCoords(e.target.value)}
                placeholder="-6.208800, 106.845600"
                inputMode="decimal"
                aria-label="Koordinat GPS"
                className="mt-1 font-mono"
              />
              <span className="mt-1 block text-xs text-muted">
                Di Google Maps: klik kanan titik yang sama, lalu klik angka
                koordinatnya untuk menyalin. Atau berdiri di titik itu dan tekan
                Pakai lokasi saya.
              </span>
            </label>
            {gpsNote && <p className="text-xs text-muted">{gpsNote}</p>}
            {coords.trim() && !parsed && (
              <p className="text-xs text-empty">
                Format koordinat belum benar.
              </p>
            )}
            {save.isError && <Alert>{save.error.message}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={fillFromMyPosition}
                variant="secondary"
                size="sm"
              >
                <LocateFixed className="size-4" /> Pakai lokasi saya
              </Button>
              <span className="flex-1" />
              <Button onClick={closeForm} variant="ghost" size="sm">
                Batal
              </Button>
              <Button
                type="submit"
                disabled={!pick || !parsed || save.isPending}
                size="sm"
              >
                {save.isPending ? "Menyimpan…" : "Simpan titik"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <PlanWithLocation
        plan={SITE_PLAN}
        houses={houses}
        highlightMissing
        anchors={anchors}
        calibrateHint="Tambahkan titik acuan di atas."
        anchorMarks={anchors.map((a) => [a.x, a.y] as const)}
        pick={pick}
        onPlanClick={adding ? setPick : undefined}
      />
    </>
  );
}
