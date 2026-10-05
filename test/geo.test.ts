import { describe, expect, it } from "vitest";
import { fitGeoTransform, locateOnPlan, parseLatLng, type GeoAnchor } from "@/lib/geo";
import { polygonCentroid } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";

// Denah buatan: 0,5 m per satuan, diputar 20°, berpusat di sekitar -6.3, 106.7.
const ORIGIN = { lat: -6.3, lng: 106.7 };
const M = 111_320;
function gpsOf([x, y]: readonly [number, number]) {
  const angle = (20 * Math.PI) / 180;
  const [dx, dy] = [(x - 1000) * 0.5, (y - 500) * 0.5];
  // Sumbu y denah mengarah ke selatan.
  const east = dx * Math.cos(angle) + dy * Math.sin(angle);
  const north = dx * Math.sin(angle) - dy * Math.cos(angle);
  return { lat: ORIGIN.lat + north / M, lng: ORIGIN.lng + east / (M * Math.cos((ORIGIN.lat * Math.PI) / 180)) };
}
const anchorAt = (x: number, y: number): GeoAnchor => ({ x, y, ...gpsOf([x, y]) });

describe("kalibrasi lokasi denah", () => {
  it("tiga titik acuan cukup untuk menaruh posisi GPS di denah dengan tepat", () => {
    const t = fitGeoTransform([anchorAt(400, 300), anchorAt(1600, 350), anchorAt(900, 950)])!;
    expect(t.metersPerUnit).toBeCloseTo(0.5, 2);
    expect(Math.max(...t.residuals)).toBeLessThan(0.05);
    const [x, y] = t.toPlan(gpsOf([1234, 567]));
    expect(x).toBeCloseTo(1234, 0);
    expect(y).toBeCloseTo(567, 0);
  });

  it("titik acuan yang salah terlihat dari selisihnya", () => {
    const wrong = { ...anchorAt(1200, 800), lat: anchorAt(1200, 800).lat + 60 / M };
    const t = fitGeoTransform([anchorAt(400, 300), anchorAt(1600, 350), anchorAt(900, 950), wrong])!;
    expect(Math.max(...t.residuals)).toBeGreaterThan(10);
  });

  it("kurang dari tiga titik, titik segaris, atau berdempetan ditolak", () => {
    expect(fitGeoTransform([anchorAt(400, 300), anchorAt(1600, 350)])).toBeNull();
    expect(fitGeoTransform([anchorAt(400, 300), anchorAt(800, 300), anchorAt(1200, 300)])).toBeNull();
    expect(fitGeoTransform([anchorAt(400, 300), anchorAt(402, 301), anchorAt(401, 303)])).toBeNull();
  });

  it("membaca koordinat dari Google Maps", () => {
    expect(parseLatLng("-6.208800, 106.845600")).toEqual({ lat: -6.2088, lng: 106.8456 });
    expect(parseLatLng("-6.2088 106.8456")).toEqual({ lat: -6.2088, lng: 106.8456 });
    expect(parseLatLng("(-6.2088,106.8456)")).toEqual({ lat: -6.2088, lng: 106.8456 });
    expect(parseLatLng("-6,2088 106,8456")).toEqual({ lat: -6.2088, lng: 106.8456 });
    expect(parseLatLng("Jl. Natura")).toBeNull();
    expect(parseLatLng("120, 10")).toBeNull();
  });

  it("menyebut kavling tempat petugas berada, yang terdekat, atau di luar cluster", () => {
    const lot = SITE_PLAN.lots.find((l) => l.block === "AD" && l.number === "3")!;
    expect(locateOnPlan(SITE_PLAN, polygonCentroid(lot.points), 0.5)).toMatchObject({ kind: "lot", lot });
    const [x, y] = SITE_PLAN.viewBox;
    expect(locateOnPlan(SITE_PLAN, [x - 400, y - 400], 0.5)).toMatchObject({ kind: "outside" });
  });
});
