// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentDialog } from "@/apps/admin/payments/payment-dialog";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let done: ReturnType<typeof vi.fn<() => void>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["admin", "rumah"], { houses: [{ id: 1, block: "AF", number: "13", ownerName: "Warga", status: "active", token: "TOKEN" }] });
  client.setQueryData(["admin", "petugas"], { users: [{ id: 2, name: "Petugas", active: true }] });
  client.setQueryData(["admin", "pengaturan"], { defaultAmount: 500 });
  const data = { month: "2026-10", plans: [], payments: [], dailyCells: {}, history: [], bills: [] };
  client.setQueryData(["admin", "pembayaran", "2026-10"], data);
  client.setQueryData(["admin", "pembayaran", "2026-09"], data);
  client.setQueryData(["admin", "rapel", "1"], { dates: [{ date: "2026-09-30", amount: 500 }, { date: "2026-10-01", amount: 500 }, { date: "2026-10-03", amount: 700 }] });
  done = vi.fn<() => void>();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><PaymentDialog open month="2026-10" onClose={done} /></QueryClientProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function select(label: string, text: string) {
  const title = [...document.querySelectorAll<HTMLElement>("[id]")].find((e) => e.textContent === label)!;
  const combo = [...document.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].find((e) => e.getAttribute("aria-labelledby")?.split(" ").includes(title.id))!;
  await click(combo);
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((e) => e.textContent?.includes(text))!;
  await click(option);
}
function submit() { return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Simpan rapel")!; }

describe("form rapel", () => {
  it("rumah harian menampilkan pilihan tanggal berlabel, nominal otomatis, dan mengirim tanggal yang dipilih saja", async () => {
    await select("Rumah", "AF-13");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Hari kosong");
    expect(submit().disabled).toBe(true);
    const checks = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.closest("label")?.textContent?.includes("Rp"))).toBe(true);
    await click(checks[0]); await click(checks[1]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("2 hari dipilih · Rp 1.200");
    expect(submit().disabled).toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: "Pembayaran tersimpan." }));
    await click(submit());
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/admin/pembayaran");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      houseId: 1, cadence: "daily", periodStart: "2026-10-01", periodEnd: "2026-10-03", amount: 1200,
      receivedDate: "2026-10-10", receivedBy: "treasurer", allocations: [["2026-10-01", 500], ["2026-10-03", 700]],
    });
  });

  it("pilihan tidak hilang saat pindah bulan dan hari yang tidak dipilih tetap tidak dibayar", async () => {
    await select("Rumah", "AF-13");
    await click(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await select("Bulan", "September 2026");
    await click(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("2 hari dipilih · Rp 1.000");
    await select("Bulan", "Oktober 2026");
    const checks = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checks.map((c) => c.checked)).toEqual([true, false]);
    await click(checks[0]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("1 hari dipilih · Rp 500");
    expect(fetch).not.toHaveBeenCalled();
  });
});
