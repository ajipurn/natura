// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RekapPage } from "@/apps/admin/rekap";
import { queryClient } from "@/client/query";
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
  client.setQueryData(["auth"], { setupNeeded: false, user: { id: 1, name: "Admin", role: "admin" } });
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
  it("sekretaris membaca rekap tanpa kontrol koreksi, pembayaran, atau token ekspor", async () => {
    await act(async () => {
      client.setQueryData(["auth"], { setupNeeded: false, user: { id: 2, name: "Sekretaris", role: "sekretaris" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).not.toContain("Ubah catatan");
    expect(container.querySelector('[aria-label="Tampilan rekap"]')).toBeNull();
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("admin bisa memilih dan menghapus catatan harian lama pada rumah bulanan", async () => {
    await click(button("Ubah catatan"));
    const cell = container.querySelector<HTMLButtonElement>('button[data-cell="2:2026-10-07"]');
    expect(cell).not.toBeNull();
    expect(cell!.getAttribute("aria-label")).toContain("Rp 500");
    expect(container.querySelector('button[data-cell="2:2026-10-08"]')).toBeNull();
    await click(cell!);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("1 kotak dipilih");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: "Tersimpan." }), { headers: { "Content-Type": "application/json" } }));
    await click(button("Hapus catatan"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/admin/riwayat");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init!.body as string)).toEqual({ entries: [{ date: "2026-10-07", houseId: 2, status: "none", amount: 0 }] });
  });

  it.each(["monthly", "weekly"] as const)("pilihan satu baris dan satu malam mencakup rumah %s, tetapi tidak tanggal mendatang", async (cadence) => {
    await act(async () => {
      client.setQueryData(["rekap", month], (previous: Record<string, unknown>) => ({ ...previous, paymentCadences: { 1: ["daily"], 2: [cadence] }, paymentPeriods: [{ ...bill, cadence }] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await click(button("Ubah catatan"));
    const row = container.querySelector<HTMLButtonElement>('[aria-label="Pilih semua malam AF-13"]')!;
    await click(row);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("7 kotak dipilih");
    expect(container.querySelector('button[data-cell="2:2026-10-07"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('button[data-cell="2:2026-10-08"]')).toBeNull();
    await click(row);
    await click(container.querySelector<HTMLButtonElement>('[aria-label="Pilih semua rumah Rab, 7 Okt"]')!);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("2 kotak dipilih");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("seretan pilihan menyertakan kotak rumah bulanan", async () => {
    await click(button("Ubah catatan"));
    const start = container.querySelector<HTMLButtonElement>('button[data-cell="1:2026-10-07"]')!;
    const end = container.querySelector<HTMLButtonElement>('button[data-cell="2:2026-10-07"]')!;
    await act(async () => {
      start.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0, buttons: 1 }));
      end.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", buttons: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    });
    expect(start.getAttribute("aria-pressed")).toBe("true");
    expect(end.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("2 kotak dipilih");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("koreksi menampilkan kosong asli sementara periode lunas kembali hijau setelah selesai", async () => {
    await act(async () => {
      client.setQueryData(["rekap", month], (previous: { cells: Record<string, unknown> }) => ({ ...previous, cells: { ...previous.cells, "2:2026-10-07": { status: "empty", amount: 0 } }, paymentPeriods: [{ ...bill, status: "paid", paid: bill.expected, remaining: 0 }] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('span[title*="Bulanan · Sudah bayar"]')?.className).toContain("bg-filled-soft");
    await click(button("Ubah catatan"));
    const cell = container.querySelector<HTMLButtonElement>('button[data-cell="2:2026-10-07"]')!;
    expect(cell.getAttribute("aria-label")).toContain("kosong");
    expect(cell.querySelector("span")?.className).toContain("bg-empty-soft");
    expect(container.textContent).toContain("Mode koreksi menampilkan catatan harian asli");
    await click(button("Selesai"));
    expect(container.querySelector('span[title*="Bulanan · Sudah bayar"]')?.className).toContain("bg-filled-soft");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("menghapus uang harian juga menyegarkan sisa pembayaran yang sudah tersimpan di cache", async () => {
    const previousClient = client;
    queryClient.clear();
    for (const query of previousClient.getQueryCache().getAll()) queryClient.setQueryData(query.queryKey, query.state.data);
    client = queryClient;
    await act(async () => root.render(<QueryClientProvider key="correction-cache" client={client}><MemoryRouter initialEntries={["/admin/rekap"]}><RekapPage /></MemoryRouter></QueryClientProvider>));
    previousClient.clear();
    const updatedRecap = { ...client.getQueryData<Record<string, unknown>>(["rekap", month])!, cells: { "1:2026-10-06": { status: "filled", amount: 500 }, "1:2026-10-07": { status: "empty", amount: 0 } }, paymentPeriods: [{ ...bill, paid: 0, remaining: bill.expected }] };
    const updatedPayments = { ...client.getQueryData<Record<string, unknown>>(["admin", "pembayaran", month])!, bills: updatedRecap.paymentPeriods };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      const data = init?.method === "PUT" ? { success: "Tersimpan." } : path.includes("pembayaran") ? updatedPayments : path.includes("rekap") ? updatedRecap : null;
      if (!data) throw new Error(`Unexpected request: ${path}`);
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    });
    await click(button("Ubah catatan"));
    await click(container.querySelector<HTMLButtonElement>('button[data-cell="2:2026-10-07"]')!);
    await click(button("Hapus catatan"));
    await vi.waitFor(() => expect(client.getQueryData(["rekap", month])).toEqual(updatedRecap));
    expect(client.getQueryState(["admin", "pembayaran", month])?.isInvalidated).toBe(true);
    await click(button("Pembayaran"));
    await vi.waitFor(() => expect(container.textContent).toContain("Sisa pembayaranRp 12.500"));
    expect(client.getQueryData(["admin", "pembayaran", month])).toEqual(updatedPayments);
  });

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
