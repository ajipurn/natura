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
import { buildRecapDocx } from "@/lib/recap-report-docx";
import { buildRecapPdf } from "@/lib/recap-report-pdf";
import { createReportStamp, loadReportLogo, readReportImage } from "@/client/report-image";

vi.mock("@/lib/recap-report-pdf", () => ({ buildRecapPdf: vi.fn() }));
vi.mock("@/lib/recap-report-docx", () => ({ buildRecapDocx: vi.fn() }));
vi.mock("@/client/report-image", () => ({ createReportStamp: vi.fn(), loadReportLogo: vi.fn(), readReportImage: vi.fn() }));
const reportImage = { dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFElEQVR4nGPkL8v7z4AEmJA5WAUAXcEB+OGNog0AAAAASUVORK5CYII=", width: 4, height: 3 };

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
  vi.mocked(buildRecapPdf).mockReset().mockReturnValue(new Blob(["pdf"], { type: "application/pdf" }));
  vi.mocked(buildRecapDocx).mockReset().mockResolvedValue(new Blob(["docx"]));
  vi.mocked(loadReportLogo).mockReset().mockResolvedValue(reportImage);
  vi.mocked(readReportImage).mockReset().mockResolvedValue(reportImage);
  vi.mocked(createReportStamp).mockReset().mockResolvedValue(reportImage);
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
  vi.restoreAllMocks();
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

async function addVacantHouse() {
  await act(async () => {
    client.setQueryData(["rekap", month], (previous: { houses: HouseDTO[]; cells: Record<string, unknown> }) => ({
      ...previous,
      houses: [...previous.houses, { id: 3, block: "B", number: "1", ownerName: "Warga mudik", token: "DEMO3", status: "vacant" }],
      cells: { ...previous.cells, "3:2026-10-06": { status: "filled", amount: 500 } },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("rekap bulanan yang dikelompokkan", () => {
  it("laporan rentang memuat seluruh bulan pilihan dan memberi nama berkas sesuai periode", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:range-report"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.mocked(fetch).mockImplementation(async (url) => {
      const selectedMonth = new URL(String(url), "http://localhost").searchParams.get("bulan")!;
      return new Response(JSON.stringify({ month: selectedMonth, houses, dates: [`${selectedMonth}-01`], cells: { [`1:${selectedMonth}-01`]: { status: "filled", amount: 500 } } }), { headers: { "Content-Type": "application/json" } });
    });
    await click(button("Buat laporan"));
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="month"]')];
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setValue.call(inputs[0], "2026-09"); inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      setValue.call(inputs[1], "2026-11"); inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Unduh PDF")); await vi.waitFor(() => expect(buildRecapPdf).toHaveBeenCalledOnce());
    expect(vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url), "http://localhost").searchParams.get("bulan"))).toEqual(["2026-09", "2026-10", "2026-11"]);
    const report = vi.mocked(buildRecapPdf).mock.calls[0][0]; expect(report.monthLabel).toBe("September - November 2026");
    expect(report.metrics.find((m) => m.label === "Total jimpitan")?.value).toBe("Rp 1.500"); expect(report.monthlySummary?.rows).toHaveLength(3);
    expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe("laporan-jimpitan-2026-09-sampai-2026-11.pdf");
  });

  it("rentang terbalik mencegah unduh; kegagalan memuat satu bulan tidak menghasilkan laporan sebagian", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:range-report"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await click(button("Buat laporan")); const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="month"]')];
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(inputs[0], "2026-11"); inputs[0].dispatchEvent(new Event("input", { bubbles: true })); });
    expect(button("Unduh PDF").disabled).toBe(true); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Bulan akhir harus");
    await act(async () => { setValue.call(inputs[0], "2026-09"); inputs[0].dispatchEvent(new Event("input", { bubbles: true })); });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ month: "2026-09", houses, dates: [], cells: {} }), { headers: { "Content-Type": "application/json" } })).mockRejectedValueOnce(new Error("offline"));
    await click(button("Unduh PDF")); await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Laporan belum berhasil dibuat"));
    expect(buildRecapPdf).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(button("Unduh PDF").disabled).toBe(false);
  });

  it("membatalkan pemuatan periode menghentikan request dan tidak mengunduh di belakang dialog", async () => {
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true })));
    await click(button("Buat laporan")); const input = document.querySelector<HTMLInputElement>('input[type="month"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-09"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await click(button("Unduh PDF")); await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await click(button("Batal")); await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true); expect(save).not.toHaveBeenCalled(); expect(buildRecapPdf).not.toHaveBeenCalled();
  });

  it("laporan PDF mencakup seluruh bulan dan rumah walaupun tabel sedang difilter", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
    const release = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await addVacantHouse();
    await click(container.querySelector<HTMLElement>('[role="switch"]')!);
    await click(button("Buat laporan"));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Rekap jimpitan Oktober 2026");
    expect(dialog.textContent).toContain("Mencakup semua rumah");
    expect([...dialog.querySelectorAll<HTMLTextAreaElement>("textarea")][0].value).toBe("Karangsari, Kebumen");
    expect([...dialog.querySelectorAll<HTMLInputElement>("input")].some((input) => input.value === "April Bambang Sumariawan")).toBe(true);
    await click(button("Unduh PDF"));
    await vi.waitFor(() => expect(buildRecapPdf).toHaveBeenCalledOnce());
    expect(vi.mocked(buildRecapPdf).mock.calls[0][0].tables[3].rows).toHaveLength(3);
    expect(vi.mocked(buildRecapPdf).mock.calls[0][0].letterhead.logo).toEqual(reportImage);
    expect(vi.mocked(buildRecapPdf).mock.calls[0][0].approval.chairName).toBe("April Bambang Sumariawan");
    expect(createReportStamp).toHaveBeenCalledWith(reportImage, "Natura");
    expect(vi.mocked(buildRecapPdf).mock.calls[0][0].approval.stamp).toEqual(reportImage);
    expect(save).toHaveBeenCalledOnce();
    expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe("laporan-jimpitan-2026-10.pdf");
    expect(create).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledWith("blob:report");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("alamat dan ketua dapat diubah, gambar cap hanya dimasukkan ke laporan", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:formal-report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await click(button("Buat laporan"));
    const dialog = document.querySelector('[role="dialog"]')!;
    const address = dialog.querySelector("textarea")!;
    const chair = [...dialog.querySelectorAll<HTMLInputElement>("input")].find((input) => input.value === "April Bambang Sumariawan")!;
    await act(async () => {
      const setTextarea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setTextarea.call(address, "Alamat baru"); address.dispatchEvent(new Event("input", { bubbles: true }));
      setInput.call(chair, "Ketua berikutnya"); chair.dispatchEvent(new Event("input", { bubbles: true }));
      const file = new File(["image"], "cap-resmi.png", { type: "image/png" });
      const upload = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(upload, "files", { value: [file], configurable: true });
      upload.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await vi.waitFor(() => expect(dialog.querySelector('img[alt="Pratinjau stempel"]')).not.toBeNull());
    await click(button("Unduh PDF"));
    await vi.waitFor(() => expect(buildRecapPdf).toHaveBeenCalledOnce());
    const report = vi.mocked(buildRecapPdf).mock.calls[0][0];
    expect(report.letterhead.address).toBe("Alamat baru");
    expect(report.approval.chairName).toBe("Ketua berikutnya");
    expect(report.approval.stamp).toEqual(reportImage);
    expect(createReportStamp).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("laporan Word dapat dipilih dan kegagalan unduh memberi pesan yang bisa dicoba ulang", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:word-report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.mocked(buildRecapDocx).mockRejectedValueOnce(new Error("Import failed"));
    await click(button("Buat laporan"));
    await click(button("Word (.docx)"));
    await click(button("Unduh Word"));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Laporan belum berhasil dibuat"));
    expect(buildRecapDocx).toHaveBeenCalledOnce();
    expect(button("Unduh Word").disabled).toBe(false);
    expect(save).not.toHaveBeenCalled();
    await click(button("Unduh Word"));
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe("laporan-jimpitan-2026-10.docx");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rapel tampil hijau dengan tanda R dan total terpisah, koreksi tetap menampilkan kosong asli", async () => {
    await act(async () => {
      client.setQueryData(["rekap", month], (previous: Record<string, unknown>) => ({
        ...previous, paymentCells: { "1:2026-10-07": { amount: 500, monthlyAmount: 0, weeklyAmount: 0, rapelAmount: 500, paid: true } },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const marker = container.querySelector('span[title*="Rapel lunas"]')!;
    expect(marker.textContent).toBe("R");
    expect(marker.className).toContain("bg-filled-soft");
    expect(marker.getAttribute("aria-label")).toContain("catatan ronda kosong");
    expect(headers()).toContain("Rapel");
    const row = [...container.querySelectorAll('[data-recap] tr')].find((r) => r.querySelector('th[scope="row"]')?.textContent?.includes("Warga harian"))!;
    expect(row.textContent).toContain("2/2");
    expect(row.textContent).toContain("Rp 1.000");
    await click(button("Ubah catatan"));
    const original = container.querySelector<HTMLButtonElement>('button[data-cell="1:2026-10-07"]')!;
    expect(original.getAttribute("aria-label")).toContain("kosong");
    expect(original.querySelector("span")?.className).toContain("bg-empty-soft");
    await click(button("Selesai"));
    expect(container.querySelector('span[title*="Rapel lunas"]')?.textContent).toBe("R");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("toggle mudik/kosong menyaring rumah tanpa menghilangkan catatan kosong rumah aktif atau uang dari ringkasan bulan", async () => {
    await addVacantHouse();
    const toggle = container.querySelector<HTMLElement>('[role="switch"]')!;
    expect(document.getElementById(toggle.getAttribute("aria-labelledby")!)?.textContent).toBe("Mudik/kosong");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga mudik");

    await click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[data-recap]')?.textContent).not.toContain("Warga mudik");
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga harian");
    const activeRow = [...container.querySelectorAll('[data-recap] tr')].find((row) => row.querySelector('th[scope="row"]')?.textContent?.includes("Warga harian"));
    expect(activeRow).toBeDefined();
    expect(activeRow!.querySelector('span[title="Rab, 7 Okt: kosong"]')).not.toBeNull();
    expect(container.textContent).toContain("2 dari 3 rumah");
    expect(container.querySelector("dl")?.textContent).toContain("Rp 1.500");
    expect(container.querySelector('[data-recap] tfoot')?.textContent).toContain("Rp 1.000");

    await click(button("Reset filter"));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga mudik");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("menghapus pilihan koreksi saat rumah mudik disembunyikan dan bisa menampilkannya kembali", async () => {
    await addVacantHouse();
    await click(button("Ubah catatan"));
    await click(container.querySelector<HTMLButtonElement>('button[data-cell="3:2026-10-06"]')!);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')?.textContent).toContain("1 kotak dipilih");

    const toggle = container.querySelector<HTMLElement>('[role="switch"]')!;
    await click(toggle);
    expect(container.querySelector('[aria-label="Isi kotak terpilih"]')).toBeNull();
    expect(container.querySelector('button[data-cell="3:2026-10-06"]')).toBeNull();
    expect(container.querySelector('button[data-cell="1:2026-10-07"]')?.getAttribute("aria-label")).toContain("kosong");

    await click(toggle);
    expect(container.querySelector('button[data-cell="3:2026-10-06"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(fetch).not.toHaveBeenCalled();
  });

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
    expect([...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.includes("Mingguan"))).toBe(false);
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

  it("filter Mingguan tetap tersedia untuk membaca riwayat bulan yang memilikinya", async () => {
    await act(async () => {
      client.setQueryData(["rekap", month], (previous: Record<string, unknown>) => ({ ...previous, paymentCadences: { 1: ["daily"], 2: ["weekly"] }, paymentPeriods: [{ ...bill, cadence: "weekly" }] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await click(button("Filter"));
    const label = [...container.querySelectorAll("[id]")].find((l) => l.textContent === "Cara bayar")!;
    const combo = [...container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].find((b) => b.getAttribute("aria-labelledby")?.split(" ").includes(label.id))!;
    await click(combo);
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes("Mingguan"))!;
    expect(option).toBeDefined();
    await click(option);
    expect(container.querySelector('[data-recap]')?.textContent).toContain("Warga bulanan");
    expect(container.querySelector('[data-recap]')?.textContent).not.toContain("Warga harian");
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
