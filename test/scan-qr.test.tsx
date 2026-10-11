// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://app.clusternatura.com/"}
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetugasLayout } from "@/apps/petugas/layout";
import type { RondaSnapshot, Role } from "@/lib/types";
import { accessibleText } from "./helpers/dom";

// Kamera fisik diganti pemicu deteksi; layout, store offline, dan form hasil scan tetap sungguhan.
vi.mock("@/components/qr-scanner", () => ({
  QrScanner: ({ onDetect, onClose, description, paused }: { onDetect: (text: string) => void; onClose: () => void; description: ReactNode; paused: boolean }) => (
    <div><p>{description}</p><button disabled={paused} onClick={() => onDetect("https://clusternatura.com/info/r/SCANTESTQR")}>Deteksi QR</button><button disabled={paused} onClick={() => onDetect("QR lain!")}>Deteksi QR lain</button><button onClick={onClose}>Tutup scanner</button></div>
  ),
}));
vi.mock("idb-keyval", () => ({ del: vi.fn(async () => {}), get: vi.fn(async () => undefined), set: vi.fn(async () => {}) }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let snapshot: RondaSnapshot;
let submitted: { entries: { method: string; houseId: number; status: string; recordedAt: string }[] }[];
let navigate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T21:00:00+07:00"));
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  snapshot = {
    date: "2026-10-10", serverTime: new Date().toISOString(),
    settings: { communityName: "Natura", defaultAmount: 500, recordingStart: "20:00", recordingEnd: "00:00" },
    user: { id: 1, name: "Petugas", role: "petugas" },
    houses: [{ id: 1, block: "A", number: "1", token: "SCANTESTQR", status: "active", ownerName: "Budi" }],
    collections: [], schedule: [{ id: 1, day: 6, position: 0, userId: 1, userActive: true, houseId: null, block: "", number: "", name: "Petugas", ownerName: null, color: null }],
  };
  submitted = [];
  navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/ronda") return Response.json(snapshot);
    if (url === "/api/ronda/catatan") {
      const input = JSON.parse(String(init?.body));
      submitted.push(input);
      return Response.json({ results: input.entries.map((e: { clientId: string }) => ({ clientId: e.clientId, ok: true, date: snapshot.date })) });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(role: Role = "petugas") {
  client.setQueryData(["auth"], { setupNeeded: false, user: { ...snapshot.user, role } });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><PetugasLayout><h1>Halaman semula</h1></PetugasLayout></MemoryRouter></QueryClientProvider>));
  expect(fetch).not.toHaveBeenCalled();
  await click("Scan QR");
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((b) => accessibleText(b) === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
const recordButtons = () => [...document.querySelectorAll("button")].filter((b) => accessibleText(b) === "Kosong" || accessibleText(b)?.startsWith("Ada ·"));

describe("Scan QR langsung dari navigasi", () => {
  it("tombol tengah langsung membuka kamera dan mencatat tanpa pindah halaman", async () => {
    await render();
    expect([...container.querySelectorAll("nav li")][2].textContent?.trim()).toBe("Scan QR");
    await click("Deteksi QR");
    expect(document.body.textContent).toContain("Blok A No. 1");
    expect(recordButtons()).toHaveLength(2);
    await click("Ada · Rp 500");
    expect(submitted).toMatchObject([{ entries: [{ houseId: 1, status: "filled", method: "scan" }] }]);
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe("Halaman semula");
  });
  it("menunggu jadwal pertama agar petugas tidak salah diarahkan ke informasi rumah", async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    await render();
    expect(container.textContent).toContain("Memuat jadwal");
    const detect = [...container.querySelectorAll("button")].find((b) => b.textContent === "Deteksi QR");
    expect(detect?.disabled).toBe(true);
    await act(async () => finish!(Response.json(snapshot)));
    await click("Deteksi QR");
    expect(recordButtons()).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });
  it.each(["warga", "petugas"] as const)("%s tanpa tugas membuka halaman QR publik tanpa pilihan Ada/Kosong", async (role) => {
    snapshot.schedule = [];
    await render(role);
    await click("Deteksi QR");
    expect(navigate).toHaveBeenCalledWith("https://clusternatura.com/info/r/SCANTESTQR");
    expect(recordButtons()).toHaveLength(0);
    expect(submitted).toEqual([]);
    if (role === "warga") expect(fetch).not.toHaveBeenCalled();
  });
  it("petugas yang dijadwalkan di luar jam tetap mendapat informasi rumah", async () => {
    vi.setSystemTime(new Date("2026-10-10T19:59:59+07:00"));
    snapshot.serverTime = new Date().toISOString();
    await render();
    expect(container.textContent).toContain("Di luar jam pencatatan");
    await click("Deteksi QR");
    expect(navigate).toHaveBeenCalledWith("https://clusternatura.com/info/r/SCANTESTQR");
    expect(recordButtons()).toHaveLength(0);
  });
  it("form yang dibuka sebelum tengah malam tidak bisa mencatat setelah jam selesai", async () => {
    vi.setSystemTime(new Date("2026-10-10T23:59:59+07:00"));
    snapshot.serverTime = new Date().toISOString();
    await render();
    await click("Deteksi QR");
    vi.setSystemTime(new Date("2026-10-11T00:00:00+07:00"));
    await click("Ada · Rp 500");
    expect(submitted).toEqual([]);
    expect(recordButtons()).toHaveLength(0);
    await click("Deteksi QR");
    expect(navigate).toHaveBeenCalledWith("https://clusternatura.com/info/r/SCANTESTQR");
  });
  it("memakai jam server saat HP salah, dan memakai pengaturan jam khusus", async () => {
    vi.setSystemTime(new Date("2026-10-10T12:00:00+07:00"));
    snapshot.serverTime = "2026-10-10T19:00:00+07:00";
    snapshot.settings.recordingStart = "18:00";
    await render();
    await click("Deteksi QR");
    expect(recordButtons()).toHaveLength(2);
    await click("Ada · Rp 500");
    expect(submitted[0].entries[0].recordedAt).toBe("2026-10-10T12:00:00.000Z");
  });
  it("tetap bisa mencatat offline dari snapshot pada jam yang diizinkan", async () => {
    localStorage.setItem("jimpitan:snapshot:v1", JSON.stringify({ ...snapshot, clockOffset: 0 }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await render();
    await click("Deteksi QR");
    await click("Ada · Rp 500");
    expect(JSON.parse(localStorage.getItem("jimpitan:pending:v1") ?? "[]")).toMatchObject([{ houseId: 1, method: "scan", date: "2026-10-10" }]);
    expect(navigate).not.toHaveBeenCalled();
  });
  it("catatan di memori bertahan saat scanner dibuka ulang walau penyimpanan HP penuh", async () => {
    localStorage.setItem("jimpitan:snapshot:v1", JSON.stringify({ ...snapshot, clockOffset: 0 }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
    await click("Deteksi QR");
    await click("Ada · Rp 500");
    await click("Tutup scanner");
    await click("Scan QR");
    await click("Deteksi QR");
    expect(document.body.textContent).toContain("belum terkirim");
  });
  it("antrean offline disinkronkan saat internet kembali meskipun scanner sudah ditutup", async () => {
    localStorage.setItem("jimpitan:snapshot:v1", JSON.stringify({ ...snapshot, clockOffset: 0 }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await render();
    await click("Deteksi QR");
    await click("Ada · Rp 500");
    await click("Tutup scanner");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/ronda") return Response.json(snapshot);
      const input = JSON.parse(String(init?.body));
      submitted.push(input);
      return Response.json({ results: input.entries.map((e: { clientId: string }) => ({ clientId: e.clientId, ok: true, date: snapshot.date })) });
    }));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(submitted).toMatchObject([{ entries: [{ houseId: 1, status: "filled", method: "scan" }] }]);
    expect(JSON.parse(localStorage.getItem("jimpitan:pending:v1") ?? "[]")).toEqual([]);
  });
  it("menolak QR lain tanpa bernavigasi atau membuat catatan", async () => {
    await render("warga");
    await click("Deteksi QR lain");
    expect(container.textContent).toContain("Ini bukan QR rumah");
    expect(navigate).not.toHaveBeenCalled();
    expect(submitted).toEqual([]);
  });
});
