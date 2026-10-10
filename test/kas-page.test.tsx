// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KasPage } from "@/apps/admin/kas/kas-page";
import { cashFixture } from "./fixtures/cash";

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["admin", "kas", "2026-10"], structuredClone(cashFixture));
  client.setQueryData(["admin", "pengaturan"], { cashPublic: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/admin/kas"]}><KasPage /></MemoryRouter></QueryClientProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const activePanel = () => container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const tab = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.startsWith(label))!;
const rows = () => [...activePanel().querySelectorAll('table[aria-labelledby="transaksi"] tbody tr')];
const search = () => activePanel().querySelector<HTMLInputElement>('input[type="search"]')!;
async function selectStatus(label: string) {
  await click(activePanel().querySelector<HTMLElement>('[role="combobox"]')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.startsWith(label))!);
}
const depositDates = () => [...activePanel().querySelectorAll('ul a')].map((a) => a.getAttribute("href"));

describe("kas lingkungan", () => {
  it("membuka tab transaksi sesudah overview dan donut serta memisahkan setoran jimpitan", () => {
    expect(container.querySelector("h1")?.textContent).toBe("Kas lingkungan");
    expect(tab("Transaksi").getAttribute("aria-selected")).toBe("true");
    expect(tab("Setoran jimpitan").getAttribute("aria-selected")).toBe("false");
    expect(tab("Setoran jimpitan").textContent).toContain("1 malam perlu dicek");
    expect(activePanel().querySelector("h2")?.textContent).toBe("Transaksi kas");
    expect(activePanel().querySelector('section[aria-labelledby="setoran"]')).toBeNull();
    expect(rows()).toHaveLength(5);
    expect(rows().map((row) => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("Setoran ronda"), expect.stringContaining("Jimpitan bulanan · AF-13"), expect.stringContaining("Kebersihan · AF-13"),
    ]));
    expect(container.querySelector('[aria-label="Overview kas"] figure[aria-label="Komposisi pemasukan"]')?.textContent).toContain("Rp 520.000");
    expect(container.querySelector('[aria-label="Rincian pemasukan"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/rekap?bulan=2026-11&view=payments"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/iuran?bulan=2026-10&view=receipts"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("memadukan pencarian dan filter sumber tanpa mengubah overview", async () => {
    await click(activePanel().querySelector<HTMLElement>('[role="combobox"]')!);
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((e) => e.textContent === "Jimpitan")!);
    expect(rows()).toHaveLength(2);
    await fill(search(), "AF-13");
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Jimpitan bulanan");
    expect(container.querySelector('[aria-label="Overview kas"]')?.textContent).toContain("Rp 670.000");
    expect(activePanel().querySelector('[role="status"]')?.textContent).toBe("1 dari 5 transaksi");
    await fill(search(), "Tidak ada");
    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("Tidak ada transaksi yang cocok");
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Hapus filter")!);
    expect(rows()).toHaveLength(5);
  });

  it("mengubah transaksi manual lewat dialog serta endpoint asalnya", async () => {
    await click(container.querySelector<HTMLButtonElement>('button[aria-label^="Ubah Lampu"]')!);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Ubah transaksi kas");
    expect([...dialog.querySelectorAll<HTMLInputElement>("input")].some((input) => input.value === "Lampu dan kabel pos ronda")).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: "Tersimpan." }));
    await click(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/admin/kas/transaksi/2");
    expect(init!.method).toBe("PATCH");
    expect(JSON.parse(init!.body as string)).toMatchObject({ amount: 50000, direction: "out", date: "2026-10-10" });
  });

  it("mengubah setoran dari tabel memakai tanggal ronda, tanpa membuat transaksi manual", async () => {
    await click(container.querySelector<HTMLButtonElement>('button[aria-label^="Ubah Setoran ronda"]')!);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Ubah setoran jimpitan");
    expect(dialog.textContent).toContain("Rp 215.000");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: "Setoran tersimpan." }));
    await click(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/admin/kas/setoran/2026-10-07");
    expect(init!.method).toBe("PUT");
    expect(JSON.parse(init!.body as string)).toEqual({ amount: 215000, note: "Diterima lengkap" });
  });

  it("tetap bisa mencatat uang ronda yang belum disetor dari bagian pencocokan", async () => {
    await click(tab("Setoran jimpitan"));
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-09"]);
    await click([...activePanel().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Catat setoran")!);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Catat setoran jimpitan");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Rp 24.500");
  });

  it("mendahulukan yang belum disetor, lalu selisih, dan menyediakan semua riwayat lewat filter", async () => {
    const settled = cashFixture.nights[1];
    await act(async () => client.setQueryData(["admin", "kas", "2026-10"], {
      ...cashFixture,
      nights: [{ ...settled, date: "2026-10-10", recorded: 220000 }, ...cashFixture.nights],
    }));
    await click(tab("Setoran jimpitan"));
    expect(tab("Setoran jimpitan").textContent).toContain("2 malam perlu dicek");
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-09", "/admin/riwayat/2026-10-10"]);
    expect(activePanel().textContent).toContain("Kurang Rp 5.000");
    await selectStatus("Ada selisih");
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-10"]);
    await selectStatus("Belum disetor");
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-09"]);
    await selectStatus("Semua setoran");
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-09", "/admin/riwayat/2026-10-10", "/admin/riwayat/2026-10-07"]);
    expect(activePanel().querySelector('[role="status"]')?.textContent).toBe("3 dari 3 malam");
    await selectStatus("Perlu dicek");
    expect(depositDates()).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("semua setoran sesuai tampil ringkas dan riwayatnya tetap dapat dibuka", async () => {
    await act(async () => client.setQueryData(["admin", "kas", "2026-10"], {
      ...cashFixture, nights: [cashFixture.nights[1]], undeposited: [],
    }));
    await click(tab("Setoran jimpitan"));
    expect(activePanel().textContent).toContain("Semua setoran sudah sesuai");
    expect(depositDates()).toHaveLength(0);
    expect(tab("Setoran jimpitan").textContent).not.toContain("perlu dicek");
    await click([...activePanel().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Lihat semua setoran")!);
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-07"]);
    await selectStatus("Belum disetor");
    expect(activePanel().textContent).toContain("Tidak ada setoran dengan status ini");
  });

  it("menjaga pencarian transaksi dan filter setoran saat berpindah tab", async () => {
    await fill(search(), "AF-13");
    expect(rows()).toHaveLength(2);
    await click(tab("Setoran jimpitan"));
    await selectStatus("Semua setoran");
    expect(depositDates()).toHaveLength(2);
    await click(tab("Transaksi"));
    expect(search().value).toBe("AF-13");
    expect(rows()).toHaveLength(2);
    await click(tab("Setoran jimpitan"));
    expect(depositDates()).toHaveLength(2);
    expect(container.querySelector('[aria-label="Overview kas"]')?.textContent).toContain("Rp 670.000");
  });

  it("peringatan membuka tab setoran dan navigasi bulan mempertahankan tab tersebut", async () => {
    await act(async () => {
      client.setQueryData(["admin", "kas", "2026-10"], { ...cashFixture, undeposited: ["2026-09-30"] });
      client.setQueryData(["admin", "kas", "2026-09"], { ...cashFixture, month: "2026-09", nights: [], transactions: [], undeposited: [] });
    });
    await vi.waitFor(() => expect(container.querySelector('a[href="/admin/kas?bulan=2026-09&view=deposits"]')).not.toBeNull());
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Periksa setoran"))!);
    expect(tab("Setoran jimpitan").getAttribute("aria-selected")).toBe("true");
    const previousMonth = container.querySelector<HTMLAnchorElement>('a[aria-label^="Bulan sebelumnya"]')!;
    expect(previousMonth.getAttribute("href")).toBe("/admin/kas?bulan=2026-09&view=deposits");
    await click(previousMonth);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Overview kas"]')?.textContent).toContain("September 2026"));
    expect(tab("Setoran jimpitan").getAttribute("aria-selected")).toBe("true");
    expect(activePanel().textContent).toContain("Belum ada jimpitan tercatat bulan ini");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tautan langsung membuka tab setoran", async () => {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter key="setoran" initialEntries={["/admin/kas?view=deposits"]}><KasPage /></MemoryRouter></QueryClientProvider>));
    expect(tab("Setoran jimpitan").getAttribute("aria-selected")).toBe("true");
    expect(depositDates()).toEqual(["/admin/riwayat/2026-10-09"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bulan kosong menampilkan donut kosong dan petunjuk mencatat transaksi", async () => {
    await act(async () => client.setQueryData(["admin", "kas", "2026-10"], {
      ...cashFixture, deposits: 0, directPayments: 0, duesIncome: 0, income: 0, expenses: 0,
      transactions: [], entries: [], nights: [], undeposited: [],
    }));
    await vi.waitFor(() => expect(container.textContent).toContain("Belum ada transaksi bulan ini"));
    expect(container.textContent).toContain("Belum ada pemasukan bulan ini.");
    expect(container.querySelectorAll('figure[aria-label="Komposisi pemasukan"] [role="tooltip"]')).toHaveLength(0);
    await click(tab("Setoran jimpitan"));
    expect(activePanel().textContent).toContain("Belum ada jimpitan tercatat bulan ini");
    expect(activePanel().textContent).not.toContain("Semua setoran sudah sesuai");
    expect(fetch).not.toHaveBeenCalled();
  });
});
