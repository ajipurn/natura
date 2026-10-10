// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RingkasanPage } from "@/apps/admin/ringkasan-page";
import type { Dashboard } from "@/server/dashboard";
import { houseWatch } from "@/lib/house-watch";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const fixture: Dashboard = {
  communityName: "Natura", date: "2026-10-08", month: "2026-10",
  tonight: { expected: 58, checked: 5, filled: 0, empty: 5, unchecked: 53, vacant: 18, total: 0, collectors: [], guards: [], daily: { expected: 53, checked: 0, unchecked: 53 }, automatic: 5, collectedHouses: 0 },
  monthSummary: { nights: 7, total: 49500, average: 7071 },
  paymentOverview: { unpaidHouses: 5, unpaidAmount: 77000, receivedToday: 0, receivedMonth: 0 },
  trend: [], oftenEmpty: [], cash: { balance: 49500, undeposited: 0 },
  todo: { noHouses: false, planMissing: 0, noSchedule: false, onlyOneUser: false, pendingRequests: 0, offDuty: 0, undeposited: 0, unpaidPayments: 5 },
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["auth"], { setupNeeded: false, user: { id: 1, name: "Admin", role: "admin" } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});
async function render(tonight = fixture.tonight, oftenEmpty = fixture.oftenEmpty) {
  client.setQueryData(["admin", "ringkasan"], { ...fixture, tonight, oftenEmpty });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><RingkasanPage /></MemoryRouter></QueryClientProvider>));
}
describe("indikator ronda di ringkasan", () => {
  it("pengingat uang belum disetor membuka tab setoran jimpitan", async () => {
    client.setQueryData(["admin", "ringkasan"], { ...fixture, todo: { ...fixture.todo, undeposited: 2 } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><RingkasanPage /></MemoryRouter></QueryClientProvider>));
    const reminder = [...container.querySelectorAll("a")].find((a) => a.textContent?.includes("2 malam belum dicatat setorannya"));
    expect(reminder?.getAttribute("href")).toBe("/admin/kas?view=deposits");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("tidak menampilkan bagian hijau saat Ada nol meskipun lima rumah sudah berstatus kosong", async () => {
    await render();
    const bar = container.querySelector('[role="progressbar"]')!;
    const green = bar.querySelector<HTMLElement>(".bg-filled");
    expect(!green || green.style.width === "0%").toBe(true);
    expect(bar.querySelector<HTMLElement>(".bg-empty")?.style.width).toBe(`${5 / 58 * 100}%`);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("membedakan pemeriksaan harian dari lima status pembayaran otomatis", async () => {
    await render();
    const ronda = container.querySelector('section[aria-label="Ronda malam ini"]')!;
    expect(ronda.textContent).toContain("0/53");
    expect(ronda.textContent).toContain("5 rumah dengan pembayaran periode otomatis");
    const bar = ronda.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("5");
    expect(bar.getAttribute("aria-valuemax")).toBe("58");
    expect(bar.getAttribute("aria-valuetext")).toContain("0 ada, 5 kosong, 53 belum dicek");
  });
  it("bagian hijau dan merah proporsional dengan statusnya saat ronda sebagian selesai", async () => {
    await render({ ...fixture.tonight, expected: 3, checked: 2, filled: 1, empty: 1, unchecked: 1, daily: { expected: 2, checked: 1, unchecked: 1 }, automatic: 1 });
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.querySelector<HTMLElement>(".bg-filled")?.style.width).toBe(`${1 / 3 * 100}%`);
    expect(bar.querySelector<HTMLElement>(".bg-empty")?.style.width).toBe(`${1 / 3 * 100}%`);
  });
  it("semua rumah otomatis tidak ditampilkan sebagai progres scan 0/0", async () => {
    await render({ ...fixture.tonight, expected: 5, checked: 5, filled: 3, empty: 2, unchecked: 0, daily: { expected: 0, checked: 0, unchecked: 0 } });
    expect(container.textContent).toContain("Tidak ada rumah harian");
    expect(container.textContent).not.toContain("0/0");
    expect(container.textContent).not.toContain("rumah berstatus hijau");
  });
  it("tanpa rumah aktif menampilkan keadaan kosong yang jelas", async () => {
    await render({ ...fixture.tonight, expected: 0, checked: 0, filled: 0, empty: 0, unchecked: 0, automatic: 0, daily: { expected: 0, checked: 0, unchecked: 0 } });
    expect(container.textContent).toContain("Belum ada rumah aktif");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  it("baris pantauan membuka kalender rumah dengan celah pemeriksaan dan tautan rekap yang tersaring", async () => {
    const data = {
      month: "2026-10", defaultAmount: 500, communityName: "Natura",
      houses: [{ id: 1, block: "AB", number: "3", ownerName: "Nama warga", status: "active" as const, token: "EXAMPLE" }],
      dates: ["2026-10-06", "2026-10-07"],
      cells: { "1:2026-10-06": { status: "empty" as const, amount: 0 }, "1:2026-10-07": { status: "empty" as const, amount: 0 } },
    };
    client.setQueryData(["rekap", "2026-10"], data);
    await render(fixture.tonight, houseWatch(data, fixture.date));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label^="Buka kalender AB-3"]')!;
    expect(trigger.textContent).toContain("Nama warga");
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Rumah AB-3");
    expect(dialog.textContent).toContain("8 malam berjalan");
    expect(dialog.querySelectorAll('[role="listitem"][aria-label$=": kosong"]')).toHaveLength(2);
    expect(dialog.querySelectorAll('[role="listitem"][aria-label$=": belum dicatat"]')).toHaveLength(6);
    expect(dialog.querySelector('a')?.getAttribute("href")).toBe("/admin/rekap?bulan=2026-10&cari=AB-3");
    expect(fetch).not.toHaveBeenCalled();
  });
});
