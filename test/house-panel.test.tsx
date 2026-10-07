// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HousePanel } from "@/apps/admin/denah/house-panel";
import type { BillingPeriod } from "@/lib/payments";
import type { HouseDTO, MonthRecap } from "@/lib/types";

const house: HouseDTO = { id: 1, block: "A", number: "5", ownerName: "Warga contoh", token: "EXAMPLE", status: "active" };
const period: BillingPeriod = { houseId: 1, planId: 1, cadence: "monthly", start: "2026-10-01", end: "2026-10-31", expected: 15500, paid: 0, remaining: 15500, status: "unpaid" };
const recap: MonthRecap = {
  month: "2026-10", houses: [house], dates: Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`),
  cells: { "1:2026-10-06": { status: "empty", amount: 0 }, "1:2026-10-07": { status: "empty", amount: 0 } },
  paymentPeriods: [period], paymentCadences: { 1: ["monthly"] },
};
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(data: MonthRecap) {
  client.setQueryData(["rekap", "2026-10"], data);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HousePanel house={house} month="2026-10" tonight={{ date: "2026-10-07", collection: null, defaultAmount: 500, period: data.paymentPeriods?.[0] }} onClose={() => {}} /></MemoryRouter></QueryClientProvider>));
}

describe("status periode pada panel rumah", () => {
  it("rumah bulanan belum bayar memiliki tujuh status otomatis, bukan lima malam tidak dicek", async () => {
    await render(recap);
    const nights = container.querySelector('[aria-label="Catatan per malam"]')!;
    expect(nights.querySelectorAll("a")).toHaveLength(7);
    expect(nights.querySelectorAll('a[aria-label*="Belum bayar"]')).toHaveLength(7);
    expect(container.textContent).not.toContain("5Tidak dicek");
    expect(container.textContent).not.toContain("2 malam yang dicek");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pembayaran lunas mengganti warna catatan lama tetapi tidak menambah uang ronda", async () => {
    const paymentCells = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`1:2026-10-${String(i + 1).padStart(2, "0")}`, { amount: 500, weeklyAmount: 0, monthlyAmount: 500, paid: true }]));
    await render({ ...recap, paymentCells, paymentPeriods: [{ ...period, paid: 15500, remaining: 0, status: "paid" }] });
    const nights = container.querySelector('[aria-label="Catatan per malam"]')!;
    expect(nights.querySelectorAll('a[aria-label*="Sudah bayar"]')).toHaveLength(7);
    expect(container.textContent).not.toContain("5Tidak dicek");
    expect(container.textContent).toContain("Rp 15.500");
    expect(fetch).not.toHaveBeenCalled();
  });
});
