// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatrolDetail } from "@/features/riwayat/patrol-detail";
import { PatrolList } from "@/features/riwayat/patrol-list";
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

const completedNight = {
  date: "2026-10-07", filled: 1, empty: 1, total: 500,
  checked: 2, unchecked: 0, expected: 2, collectors: "Aji",
};

async function renderHistory(patrols = [completedNight]) {
  client.setQueryData(["riwayat"], { patrols, activeHouses: 2, today: "2026-10-10" });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><PatrolList basePath="/admin/riwayat" /></MemoryRouter></QueryClientProvider>));
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

  it("daftar memakai jumlah pemeriksaan rumah aktif dari API meskipun ada catatan uang dari rumah mudik", async () => {
    client.setQueryData(["riwayat"], {
      patrols: [{ date: "2026-10-07", filled: 2, empty: 1, total: 500, checked: 2, unchecked: 1, expected: 3, collectors: null }],
      activeHouses: 3, today: "2026-10-07",
    });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><PatrolList basePath="/admin/riwayat" /></MemoryRouter></QueryClientProvider>));
    const night = container.querySelector('a[href="/admin/riwayat/2026-10-07"]')!;
    expect(night.textContent).toContain("2/3 dicek");
    expect(night.textContent).toContain("1 belum dicek");
    expect(night.textContent).toContain("Rp 500");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("stempel selesai pada riwayat", () => {
  it("hanya memberi stempel pada malam lengkap, termasuk rumah yang dicatat kosong", async () => {
    await renderHistory([
      { ...completedNight, date: "2026-10-09" },
      { ...completedNight, date: "2026-10-08" },
      { ...completedNight, checked: 1, unchecked: 1 },
    ]);
    const stamps = container.querySelectorAll('[data-stamp-side]');
    expect(stamps).toHaveLength(2);
    expect([...stamps].map((el) => el.getAttribute("data-stamp-side"))).toEqual(["right", "right"]);
    expect(container.querySelector('a[href="/admin/riwayat/2026-10-09"]')?.getAttribute("aria-label")).toContain("jimpitan selesai");
    expect(container.querySelector('a[href="/admin/riwayat/2026-10-07"] [data-stamp-side]')).toBeNull();
    expect(container.querySelector('a[href="/admin/riwayat/2026-10-10"] [data-stamp-side]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tidak memberi stempel 0/0 meskipun ada uang dari rumah yang sekarang mudik", async () => {
    await renderHistory([{ ...completedNight, checked: 0, expected: 0, empty: 0 }]);
    expect(container.textContent).toContain("Rp 500");
    expect(container.querySelector('[data-stamp-side]')).toBeNull();
  });

  it("posisi dan kemiringan tetap sama setelah dimuat ulang dan ketika detail malam dibuka", async () => {
    await renderHistory();
    const stamp = container.querySelector<HTMLElement>('[data-stamp-side]')!;
    const side = stamp.dataset.stampSide;
    expect(side).toBe("right");
    const transform = stamp.style.transform;
    await act(async () => root.render(null));
    await renderHistory();
    const reloaded = container.querySelector<HTMLElement>('[data-stamp-side]')!;
    expect(reloaded.dataset.stampSide).toBe(side);
    expect(reloaded.style.transform).toBe(transform);
    await act(async () => root.render(null));
    await render(period);
    const detail = container.querySelector<HTMLElement>('[data-stamp-side]')!;
    expect(detail.dataset.stampSide).toBe(side);
    expect(detail.style.transform).toBe(transform);
  });

  it("stempel hilang jika koreksi membuat satu rumah belum tercatat, dan kembali saat lengkap", async () => {
    await renderHistory();
    const transform = container.querySelector<HTMLElement>('[data-stamp-side]')!.style.transform;
    await renderHistory([{ ...completedNight, checked: 1, unchecked: 1 }]);
    expect(container.querySelector('[data-stamp-side]')).toBeNull();
    await renderHistory();
    expect(container.querySelector<HTMLElement>('[data-stamp-side]')?.style.transform).toBe(transform);
    expect(fetch).not.toHaveBeenCalled();
  });
});
