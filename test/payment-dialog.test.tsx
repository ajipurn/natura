// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaymentDialog, type AdminPayment } from "@/apps/admin/payments/payment-dialog";
import type { PaymentPlanDTO } from "@/lib/payments";

const month = "2026-10";
const homes = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, block: "A", number: String(i + 1), ownerName: `Warga ${i + 1}`, status: "active", token: `HOME${i + 1}` }));
const plan = (houseId: number, cadence: PaymentPlanDTO["cadence"], effectiveFrom = "2026-10-01"): PaymentPlanDTO => ({ id: houseId, houseId, cadence, effectiveFrom, ratePerNight: 500, weekStart: 6, dueTiming: "end", graceDays: 0 });
const plans = [plan(1, "monthly"), plan(2, "weekly", "2026-09-01"), plan(4, "monthly", "2026-11-01"), plan(5, "monthly"), { ...plan(5, "daily", "2026-10-09"), id: 7 }];
const rapelDates = [{ houseId: 1, date: "2026-09-30", amount: 500 }, { houseId: 3, date: "2026-10-07", amount: 500 }, { houseId: 5, date: "2026-10-09", amount: 700 }];
const receipt: AdminPayment = { id: 9, clientId: "828ac34b-0a72-4c45-aa9d-a820d333efaa", houseId: 6, cadence: "monthly", receivedDate: "2026-10-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", amount: 1000, receivedBy: "treasurer", collectorId: null, collectorName: null, note: "Catatan lama" };
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00+07:00"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init?.method === "POST" || init?.method === "PATCH") return Response.json({ success: "Tersimpan." });
    throw new Error("Unexpected network request");
  }));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["admin", "rumah"], { houses: homes });
  client.setQueryData(["admin", "petugas"], { users: [] });
  client.setQueryData(["admin", "pengaturan"], { defaultAmount: 500 });
  client.setQueryData(["admin", "pembayaran", "rapel"], { dates: rapelDates });
  for (const value of ["2026-09", month]) client.setQueryData(["admin", "pembayaran", value], { plans, payments: [], dailyCells: {} });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  onClose = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function render(payment?: AdminPayment) {
  await act(async () => root.render(<QueryClientProvider client={client}><PaymentDialog open onClose={onClose} month={month} payment={payment} /></QueryClientProvider>));
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
function control(label: string) {
  return [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((element) => element.getAttribute("aria-labelledby")?.split(" ").some((id) => document.getElementById(id)?.textContent === label))!;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function choose(label: string, text: string) {
  await click(control(label));
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(text))!;
  expect(option).toBeDefined();
  await click(option);
}
async function houseOptions() {
  await click(control("Rumah"));
  const labels = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.textContent);
  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  return labels;
}
const save = () => dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
async function submit() { await act(async () => dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function payload() { return JSON.parse(vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST" || init?.method === "PATCH")![1]!.body as string); }

it("meminta jenis pembayaran terlebih dahulu dan menahan pengiriman sebelum memilih rumah", async () => {
  await render();
  expect(dialog().querySelector('[role="combobox"]')).toBe(control("Jenis pembayaran"));
  expect(control("Jenis pembayaran").textContent).toContain("Pilih jenis pembayaran");
  expect(control("Rumah").disabled).toBe(true);
  expect(dialog().textContent).not.toContain("Uang diterima (Rp)");
  expect(save().disabled).toBe(true);
  await submit();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { label: "Bulanan", previous: "monthly", current: "daily" },
  { label: "Bulanan", previous: "monthly", current: "weekly" },
] as const)("pembayaran $label tetap menawarkan periode lama setelah rumah beralih dari $previous ke $current", async ({ label, previous, current }) => {
  const changedPlans = [plan(1, previous, "2026-09-01"), plan(5, previous, "2026-09-01"), { ...plan(5, current, "2026-10-09"), id: 7 }];
  for (const value of ["2026-09", month]) client.setQueryData(["admin", "pembayaran", value], { plans: changedPlans, payments: [], dailyCells: {} });
  await render();
  await choose("Jenis pembayaran", label);
  expect(await houseOptions()).toEqual(["A-1 Warga 1", "A-5 Warga 5"]);
  expect(fetch).not.toHaveBeenCalled();
});

it("bulanan mengikuti kesepakatan pada periode, termasuk sisa tagihan sebelum beralih ke harian", async () => {
  client.setQueryData(["admin", "pembayaran", month], { plans, payments: [], dailyCells: { "5:2026-10-01": { status: "filled", amount: 3000 } } });
  await render(); await choose("Jenis pembayaran", "Bulanan");
  expect(await houseOptions()).toEqual(["A-1 Warga 1", "A-5 Warga 5"]);
  await choose("Rumah", "A-5");
  expect(control("Jenis pembayaran").textContent).toBe("Bulanan");
  expect(control("Periode sampai").textContent).toContain("8 Okt 2026");
  expect(dialog().textContent).toContain("8 hari · nominal periode Rp 4.000 · sudah tercatat Rp 3.000");
  await submit();
  expect(payload()).toMatchObject({ houseId: 5, cadence: "monthly", amount: 1000, periodStart: "2026-10-01", periodEnd: "2026-10-08", allocations: null });
  expect(onClose).toHaveBeenCalled();
});

it.each([
  { effectiveFrom: "2026-10-01", options: ["A-1 Warga 1"] },
  { effectiveFrom: "2026-10-10", options: ["A-1 Warga 1", "A-5 Warga 5"] },
  { effectiveFrom: "2026-10-11", options: ["A-1 Warga 1", "A-5 Warga 5"] },
])("peralihan ke harian mulai $effectiveFrom mengikuti tanggal berlakunya", async ({ effectiveFrom, options }) => {
  client.setQueryData(["admin", "pembayaran", month], { plans: [plan(1, "monthly"), plan(5, "monthly", "2026-09-01"), { ...plan(5, "daily", effectiveFrom), id: 7 }], payments: [], dailyCells: {} });
  await render(); await choose("Jenis pembayaran", "Bulanan");
  expect(await houseOptions()).toEqual(options);
  expect(fetch).not.toHaveBeenCalled();
});

it("perubahan kesepakatan saat form terbuka menghapus pilihan rumah bila tidak ada lagi periode bulanan yang sesuai", async () => {
  await render(); await choose("Jenis pembayaran", "Bulanan"); await choose("Rumah", "A-1");
  expect(save().disabled).toBe(false);
  await act(async () => {
    client.setQueryData(["admin", "pembayaran", month], { plans: plans.map((p) => p.houseId === 1 ? { ...p, cadence: "daily" } : p), payments: [], dailyCells: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(control("Rumah").textContent).toContain("Pilih rumah");
  expect(await houseOptions()).toEqual(["A-5 Warga 5"]);
  expect(save().disabled).toBe(true);
  await submit(); expect(fetch).not.toHaveBeenCalled();
});

it("pembayaran baru hanya menyediakan Bulanan dan Rapel meskipun ada kesepakatan mingguan lama", async () => {
  await render(); await click(control("Jenis pembayaran"));
  expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(["Bulanan", "Rapel"]);
  expect(fetch).not.toHaveBeenCalled();
});

it("rumah bulanan yang sudah lunas tetap tersedia tanpa menyarankan pembayaran tambahan", async () => {
  client.setQueryData(["admin", "pembayaran", month], { plans, dailyCells: {}, payments: [{ ...receipt, houseId: 1, amount: 15500 }] });
  await render(); await choose("Jenis pembayaran", "Bulanan");
  expect(await houseOptions()).toContain("A-1 Warga 1");
  await choose("Rumah", "A-1");
  expect(dialog().querySelector<HTMLInputElement>('input[inputmode="numeric"]')!.value).toBe("0");
  expect(save().disabled).toBe(true);
});

it("perubahan periode menghapus rumah bila kesepakatan bulanan tidak mencakup periode pilihan", async () => {
  await render(); await choose("Jenis pembayaran", "Bulanan"); await choose("Rumah", "A-5");
  await click(control("Periode dari"));
  await click(document.querySelector<HTMLButtonElement>('button[data-date="2026-10-09"]')!);
  await click(control("Periode sampai"));
  await click(document.querySelector<HTMLButtonElement>('button[data-date="2026-10-31"]')!);
  expect(control("Rumah").textContent).toContain("Pilih rumah");
  expect(await houseOptions()).toEqual(["A-1 Warga 1"]);
  expect(save().disabled).toBe(true);
  await submit(); expect(fetch).not.toHaveBeenCalled();
});

it("rapel menawarkan rumah dengan bolong belum dibayar, termasuk bolong sebelum beralih ke bulanan", async () => {
  await render(); await choose("Jenis pembayaran", "Rapel");
  expect(await houseOptions()).toEqual(["A-1 Warga 1", "A-3 Warga 3", "A-5 Warga 5"]);
  await choose("Rumah", "A-1");
  expect(dialog().textContent).toContain("September 2026");
  expect(dialog().textContent).toContain("30 Sep 2026");
  await click(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
  await submit();
  expect(payload()).toMatchObject({ houseId: 1, cadence: "daily", amount: 500, allocations: [["2026-09-30", 500]] });
});

const variedDates = [{ houseId: 3, date: "2026-09-30", amount: 500 }, { houseId: 3, date: "2026-10-01", amount: 500 }, { houseId: 3, date: "2026-10-03", amount: 700 }];
it("rumah harian menampilkan pilihan tanggal berlabel, nominal otomatis, dan mengirim tanggal yang dipilih saja", async () => {
  client.setQueryData(["admin", "pembayaran", "rapel"], { dates: variedDates });
  await render(); await choose("Jenis pembayaran", "Rapel"); await choose("Rumah", "A-3");
  const checks = [...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(checks).toHaveLength(2);
  expect(checks.every((c) => c.closest("label")?.textContent?.includes("Rp"))).toBe(true);
  expect(save().disabled).toBe(true);
  await click(checks[0]); await click(checks[1]);
  expect(dialog().textContent).toContain("2 hari dipilih · Rp 1.200");
  await submit();
  expect(fetch).toHaveBeenCalledOnce();
  expect(payload()).toMatchObject({ houseId: 3, cadence: "daily", periodStart: "2026-10-01", periodEnd: "2026-10-03", amount: 1200, receivedDate: "2026-10-10", receivedBy: "treasurer", allocations: [["2026-10-01", 500], ["2026-10-03", 700]] });
});

it("pilihan tidak hilang saat pindah bulan dan hari yang tidak dipilih tetap tidak dibayar", async () => {
  client.setQueryData(["admin", "pembayaran", "rapel"], { dates: variedDates });
  await render(); await choose("Jenis pembayaran", "Rapel"); await choose("Rumah", "A-3");
  await click(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
  await choose("Bulan", "September 2026");
  await click(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
  expect(dialog().textContent).toContain("2 hari dipilih · Rp 1.000");
  await choose("Bulan", "Oktober 2026");
  const checks = [...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(checks.map((c) => c.checked)).toEqual([true, false]);
  await click(checks[0]);
  expect(dialog().textContent).toContain("1 hari dipilih · Rp 500");
  expect(fetch).not.toHaveBeenCalled();
});

it("pergantian jenis mengosongkan rumah dan hari rapel agar pilihan lama tidak terkirim", async () => {
  await render(); await choose("Jenis pembayaran", "Rapel"); await choose("Rumah", "A-3");
  await click(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
  expect(save().disabled).toBe(false);
  await choose("Jenis pembayaran", "Bulanan");
  expect(control("Rumah").textContent).toContain("Pilih rumah");
  expect(save().disabled).toBe(true);
  await submit(); expect(fetch).not.toHaveBeenCalled();
  await choose("Jenis pembayaran", "Rapel"); await choose("Rumah", "A-3");
  expect(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(save().disabled).toBe(true);
});

it("tanggal penerimaan menyaring rumah rapel dan menghapus hari yang belum bisa dibayar", async () => {
  await render(); await choose("Jenis pembayaran", "Rapel"); await choose("Rumah", "A-3");
  await click(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!);
  await click(control("Tanggal diterima"));
  await click(document.querySelector<HTMLButtonElement>('button[data-date="2026-10-01"]')!);
  expect(control("Rumah").textContent).toContain("Pilih rumah");
  expect(await houseOptions()).toEqual(["A-1 Warga 1"]);
  await click(control("Tanggal diterima"));
  await click(document.querySelector<HTMLButtonElement>('button[data-date="2026-10-10"]')!);
  await choose("Rumah", "A-3");
  expect(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(save().disabled).toBe(true);
});

it("menjelaskan daftar kosong dan tetap menyediakan tanggal penerimaan untuk rapel", async () => {
  client.setQueryData(["admin", "pembayaran", "rapel"], { dates: [] });
  await render(); await choose("Jenis pembayaran", "Rapel");
  expect(control("Rumah").disabled).toBe(true);
  expect(dialog().textContent).toContain("Tidak ada rumah dengan hari kosong yang bisa dirapel.");
  expect(control("Tanggal diterima")).toBeDefined();
  expect(save().disabled).toBe(true);
});

it("memuat pilihan rapel sekali untuk semua rumah dan menyediakan percobaan ulang saat gagal", async () => {
  client.removeQueries({ queryKey: ["admin", "pembayaran", "rapel"] });
  await render(); await choose("Jenis pembayaran", "Rapel");
  await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(dialog().textContent).toContain("Daftar rumah belum berhasil dimuat."); });
  expect(control("Rumah").disabled).toBe(true);
  expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(["/api/admin/pembayaran/rapel"]);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ dates: rapelDates }));
  await click([...dialog().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Coba lagi")!);
  await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(control("Rumah").disabled).toBe(false); });
  expect(await houseOptions()).toHaveLength(3);
});

it("pembayaran lama tetap bisa dikoreksi walau rumah tidak lagi memiliki kesepakatan yang sama", async () => {
  await render(receipt);
  expect(control("Rumah").textContent).toContain("A-6");
  await submit();
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("PATCH");
  expect(payload()).toMatchObject({ houseId: 6, cadence: "monthly", amount: 1000, note: "Catatan lama" });
});

it("koreksi pembayaran bulanan lama mempertahankan rumah yang sekarang harian", async () => {
  await render({ ...receipt, houseId: 5, periodEnd: "2026-10-08", amount: 4000 });
  expect(control("Rumah").textContent).toContain("A-5");
  expect(await houseOptions()).toEqual(["A-1 Warga 1", "A-5 Warga 5"]);
  await submit();
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("PATCH");
  expect(payload()).toMatchObject({ houseId: 5, cadence: "monthly", amount: 4000, periodEnd: "2026-10-08" });
});

it("koreksi pembayaran mingguan lama tetap menyimpan jenis dan periode aslinya setelah beralih ke harian", async () => {
  client.setQueryData(["admin", "pembayaran", month], { plans: [...plans, { ...plan(2, "daily", "2026-10-10"), id: 8 }], payments: [], dailyCells: {} });
  await render({ ...receipt, houseId: 2, cadence: "weekly", periodStart: "2026-10-03", periodEnd: "2026-10-09", amount: 3500 });
  expect(control("Jenis pembayaran").textContent).toContain("Mingguan");
  expect(control("Rumah").textContent).toContain("A-2");
  await submit();
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("PATCH");
  expect(payload()).toMatchObject({ houseId: 2, cadence: "weekly", periodStart: "2026-10-03", periodEnd: "2026-10-09", amount: 3500 });
});

it("koreksi rapel mempertahankan rumah dan tanggal yang sudah lunas", async () => {
  client.setQueryData(["admin", "pembayaran", "rapel"], { dates: [] });
  await render({ ...receipt, cadence: "daily", periodStart: "2026-10-07", periodEnd: "2026-10-07", allocations: [["2026-10-07", 500]], amount: 500 });
  expect(control("Rumah").textContent).toContain("A-6");
  expect(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  await submit();
  expect(payload()).toMatchObject({ houseId: 6, cadence: "daily", allocations: [["2026-10-07", 500]], amount: 500 });
});
