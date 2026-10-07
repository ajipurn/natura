// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatrolDetail } from "@/features/riwayat/patrol-detail";
import type { BillingPeriod } from "@/lib/payments";

const period: BillingPeriod = { houseId: 1, planId: 1, cadence: "monthly", start: "2026-10-01", end: "2026-10-31", expected: 15500, paid: 0, remaining: 15500, status: "unpaid" };
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

async function render(bill: BillingPeriod) {
  client.setQueryData(["riwayat", "2026-10-07"], {
    houses: [{ id: 1, block: "A", number: "5", ownerName: "Warga contoh", token: "TEST", status: "active" }],
    collections: [], settings: { communityName: "Natura", defaultAmount: 500 }, paymentPeriods: [bill],
  });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/admin/riwayat/2026-10-07"]}><Routes><Route path="/admin/riwayat/:tanggal" element={<PatrolDetail basePath="/admin/riwayat" canCorrect />} /></Routes></MemoryRouter></QueryClientProvider>));
}

describe("detail riwayat mengikuti pembayaran periode", () => {
  it("rumah tanpa scan yang belum membayar tampil kosong otomatis dan tidak masuk isian massal", async () => {
    await render(period);
    expect(container.textContent).toContain("Bulanan · Belum bayar");
    expect(container.textContent).not.toContain("Isi yang belum dicek (");
    expect(container.textContent).toContain("Nominal terkumpul hanya uang yang diambil saat ronda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rumah lunas ditampilkan hijau tanpa membuat uang ronda", async () => {
    await render({ ...period, status: "paid", paid: 15500, remaining: 0 });
    const badge = [...container.querySelectorAll("span")].find((el) => el.textContent === "Bulanan · Sudah bayar")!;
    expect(badge.className).toContain("bg-filled-soft");
    expect(container.textContent).toContain("Rp 0");
    expect(container.textContent).not.toContain("Rp 15.500");
    expect(fetch).not.toHaveBeenCalled();
  });
});
