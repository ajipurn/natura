// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RekapPage } from "@/apps/admin/rekap";
import type { BillingPeriod } from "@/lib/payments";
import type { HouseDTO } from "@/lib/types";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const month = "2026-10";
const houses: HouseDTO[] = [
  { id: 1, block: "A", number: "1", ownerName: "Warga harian", token: "DEMO1", status: "active" },
  { id: 2, block: "AF", number: "13", ownerName: "Warga bulanan", token: "DEMO2", status: "active" },
];
const bill: BillingPeriod = { houseId: 2, planId: 1, cadence: "monthly", start: "2026-10-07", end: "2026-10-31", expected: 12500, paid: 500, remaining: 12000, status: "unpaid" };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["rekap", month], {
    month, communityName: "Natura", defaultAmount: 500, houses, dates: ["2026-10-06", "2026-10-07"],
    cells: { "1:2026-10-06": { status: "filled", amount: 500 }, "1:2026-10-07": { status: "empty", amount: 0 }, "2:2026-10-07": { status: "filled", amount: 500 } },
    paymentCadences: { 1: ["daily"], 2: ["monthly"] }, paymentCells: {}, paymentPeriods: [bill], periodPayments: [],
  });
  client.setQueryData(["admin", "rumah"], { houses });
  client.setQueryData(["admin", "pembayaran", month], { month, plans: [], bills: [bill], previousUnpaidBills: [], payments: [], history: [], dailyCells: {} });
  client.setQueryData(["admin", "petugas"], { users: [] });
  client.setQueryData(["admin", "pengaturan"], { defaultAmount: 500 });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/admin/rekap"]}><RekapPage /></MemoryRouter></QueryClientProvider>));
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
function headers() {
  return [...container.querySelectorAll('[data-recap] table[role="presentation"] thead th')].map((th) => th.textContent?.trim());
}

describe("rekap bulanan yang dikelompokkan", () => {
  it("menyederhanakan tanggal tanpa menghilangkan tanggal untuk koreksi, lalu membersihkan pilihan saat pindah tampilan", async () => {
    expect(headers()).toHaveLength(7); // Rumah, dua malam, Terisi, Harian, Bulanan, Total.
    expect(headers()).not.toContain("Mingguan");
    expect(container.querySelector('button[data-cell="1:2026-10-01"]')).toBeNull();
    await click(button("Ubah catatan"));
    expect(headers()).toHaveLength(36); // Seluruh 31 tanggal dapat dilihat dalam mode koreksi.
    await click(container.querySelector<HTMLButtonElement>('button[data-cell="1:2026-10-01"]')!);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("1 kotak dipilih");
    await click(button("Pembayaran"));
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')).toBeNull();
    expect(container.textContent).toContain("Sisa pembayaranRp 12.000");
    await click(button("Per rumah"));
    expect(button("Ubah catatan").getAttribute("aria-pressed")).toBe("false");
    expect(headers()).toHaveLength(7);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("filter cara bayar menyaring tabel dan totalnya, sementara ringkasan bulan tetap utuh", async () => {
    await click(button("Filter"));
    const label = [...container.querySelectorAll("[id]")].find((l) => l.textContent === "Cara bayar")!;
    const combo = [...container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].find((b) => b.getAttribute("aria-labelledby")?.split(" ").includes(label.id))!;
    await click(combo);
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.replace(/\s/g, "") === "Bulanan1")!;
    await click(option);
    expect(container.querySelector('[data-recap]')?.textContent).not.toContain("Warga harian");
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga bulanan");
    expect(container.querySelector("dl")?.textContent).toContain("Rp 1.000");
    expect(container.querySelector('[data-recap] tfoot')?.textContent).toContain("Rp 500");
    await click(button("Reset filter"));
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga harian");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rincian pembayaran dan form tetap tersedia dari tampilan pembayaran", async () => {
    expect(container.textContent).not.toContain("Catat pembayaran");
    await click(button("Pembayaran"));
    expect(container.textContent).toContain("Belum bayar");
    await click(button("Riwayat pembayaran 0"));
    expect(container.textContent).toContain("Belum ada pembayaran tercatat");
    await click(button("Catat pembayaran"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Catat pembayaran");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Simpan pembayaran");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bulan tanpa ronda tetap bisa diisi tanpa menampilkan kalender kosong sejak awal", async () => {
    await act(async () => {
      client.setQueryData(["rekap", month], (previous: Record<string, unknown>) => ({ ...previous, dates: [], cells: {} }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Belum ada ronda tercatat untuk bulan ini.");
    expect(headers()).toHaveLength(5);
    await click(button("Ubah catatan"));
    expect(headers()).toHaveLength(36);
    expect(container.querySelector('button[data-cell="1:2026-10-01"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
