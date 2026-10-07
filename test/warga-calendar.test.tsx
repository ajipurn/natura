// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HouseHistoryDialog } from "@/apps/warga/house-history";
import type { BillingPeriod } from "@/lib/payments";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
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
async function render(history: unknown[], periods: BillingPeriod[] = [], status = "active", month?: string) {
  client.setQueryData(month ? ["warga", "rumah", 1, month] : ["warga", "rumah", 1], { house: { id: 1, block: "AA", number: "9", status }, today: "2026-10-07", history, paymentInfo: { periods, receipts: [], tonight: null } });
  await act(async () => root.render(<QueryClientProvider client={client}><HouseHistoryDialog houseId={1} label="AA-9" month={month} myHouse={null} onMyHouse={() => {}} onClose={() => {}} /></QueryClientProvider>));
}
describe("kalender rumah dari awal bulan", () => {
  it("menandai 1–5 belum dicatat, 6–7 terisi, dan 8–31 belum tiba", async () => {
    await render([{ date: "2026-10-05", status: null, amount: null }, { date: "2026-10-06", status: "filled", amount: 500 }, { date: "2026-10-07", status: "filled", amount: 500 }]);
    const month = document.querySelector('section[aria-label="Oktober 2026"]')!;
    expect(month.textContent).toContain("7 malam berjalan");
    expect(month.querySelectorAll('[role="listitem"][aria-label*="belum dicatat"]')).toHaveLength(5);
    expect(month.querySelectorAll('[role="listitem"][aria-label*="belum tiba"]')).toHaveLength(24);
    expect(month.querySelectorAll('[role="listitem"][aria-label*="ada Rp 500"]')).toHaveLength(2);
    expect(month.textContent).toContain("Rp 1.000");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bulan ini tetap terlihat walaupun belum ada catatan sama sekali", async () => {
    await render([]);
    expect(document.querySelector('section[aria-label="Oktober 2026"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="listitem"][aria-label*="belum dicatat"]')).toHaveLength(7);
  });
  it("periode lunas memberi status otomatis tanpa menampilkan nominal harian buatan", async () => {
    await render([], [{ houseId: 1, planId: 1, cadence: "monthly", start: "2026-10-01", end: "2026-10-31", expected: 15500, paid: 15500, remaining: 0, status: "paid" }]);
    expect(document.querySelectorAll('[role="listitem"][aria-label*="Bulanan · Sudah bayar"]')).toHaveLength(7);
    const month = document.querySelector('section[aria-label="Oktober 2026"]')!;
    expect(month.textContent).not.toContain("500");
  });
  it("minggu lunas dan minggu belum bayar dibedakan, sementara isian harian lama tetap diakui", async () => {
    const base = { houseId: 1, planId: 1, cadence: "weekly" as const, expected: 3500, remaining: 0 };
    await render([{ date: "2026-10-02", status: "filled", amount: 500 }, { date: "2026-10-06", status: "empty", amount: 0 }], [
      { ...base, start: "2026-09-28", end: "2026-10-04", status: "unpaid", paid: 500, remaining: 3000 },
      { ...base, start: "2026-10-05", end: "2026-10-11", status: "paid", paid: 3500 },
    ]);
    expect(document.querySelectorAll('[role="listitem"][aria-label*="Mingguan · Sudah bayar"]')).toHaveLength(3);
    expect(document.querySelectorAll('[role="listitem"][aria-label*="Mingguan · Belum bayar"]')).toHaveLength(3);
    expect(document.querySelectorAll('[role="listitem"][aria-label*="ada Rp 500"]')).toHaveLength(1);
  });
  it("rumah mudik tidak diberi status otomatis belum bayar atau malam bolong", async () => {
    await render([], [{ houseId: 1, planId: 1, cadence: "monthly", start: "2026-10-01", end: "2026-10-31", expected: 15500, paid: 0, remaining: 15500, status: "unpaid" }], "vacant");
    expect(document.querySelectorAll('[role="listitem"][aria-label*="mudik"]')).toHaveLength(7);
    expect(document.querySelector('[role="note"]')).toBeNull();
  });
  it("kalender mengikuti bulan yang dipilih dan menghitung bulan lalu sampai tanggal terakhir", async () => {
    await render([], [], "active", "2026-09");
    const month = document.querySelector('section[aria-label="September 2026"]')!;
    expect(month.textContent).toContain("30 malam berjalan");
    expect(month.querySelectorAll('[role="listitem"][aria-label*="belum dicatat"]')).toHaveLength(30);
    expect(month.querySelector('[role="listitem"][aria-label*="belum tiba"]')).toBeNull();
  });
});
