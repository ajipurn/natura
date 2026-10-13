// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositRequest } from "@/apps/petugas/ronda/deposit-request";
import type { ComponentProps } from "react";

let root: Root, container: HTMLDivElement, client: QueryClient;
const base: ComponentProps<typeof DepositRequest> = {
  date: "2026-10-12", total: 1500, submission: { requestedAt: null, requestedByName: null, receivedAmount: null, periodAmount: 2000 },
  syncStatus: "idle", pendingCount: 0, hasRejections: false, onRefresh: vi.fn(async () => {}),
};
const render = async (props: Partial<typeof base> = {}) => act(async () => root.render(<StrictMode><QueryClientProvider client={client}><DepositRequest {...base} {...props} /></QueryClientProvider></StrictMode>));
const sent = () => Response.json({ success: "Terkirim", depositSubmission: { ...base.submission, requestedAt: "2026-10-12T14:00:00Z", requestedByName: "Yusuf" } });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected request"))));
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

describe("pengajuan setoran otomatis", () => {
  it("langsung mengajukan sekali setelah siap, termasuk StrictMode, lalu menunggu admin", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sent());
    await render();
    expect(container.textContent).toContain("Rp 3.500");
    await vi.waitFor(() => expect(container.textContent).toContain("Pengajuan setoran terkirim"));
    expect(container.querySelector("button")).toBeNull();
    await render();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(base.onRefresh).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/ronda/setoran");
    expect(JSON.parse(init!.body as string)).toEqual({ date: "2026-10-12" });
    expect(container.textContent).toContain("Setoran akan dicatat setelah uang diterima");
  });

  it.each([{ pendingCount: 1 }, { syncStatus: "syncing" as const }, { syncStatus: "offline" as const }, { syncStatus: "auth" as const }, { hasRejections: true }, { submission: undefined }])("menunggu saat catatan belum siap: %j", async (props) => {
    await render(props);
    expect(container.querySelector("button")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ pendingCount: 1 }, { syncStatus: "offline" as const }, { hasRejections: true }])("otomatis mengajukan setelah koneksi dan catatan siap kembali: %j", async (props) => {
    await render(props);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(sent());
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain("Pengajuan setoran terkirim"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("kegagalan tidak mengulang tanpa henti; percobaan ulang bisa dilakukan dan berhasil", async () => {
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain("Tidak ada koneksi internet"));
    expect(container.textContent).not.toContain("Pengajuan setoran terkirim");
    await render();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(container.querySelector("button")!.textContent).toContain("Coba lagi");
    vi.mocked(fetch).mockResolvedValueOnce(sent());
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await vi.waitFor(() => expect(container.textContent).toContain("Pengajuan setoran terkirim"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("mencoba ulang otomatis setelah pengiriman gagal lalu HP tersambung kembali", async () => {
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain("Tidak ada koneksi internet"));
    await render({ syncStatus: "offline" });
    vi.mocked(fetch).mockResolvedValueOnce(sent());
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain("Pengajuan setoran terkirim"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("setoran yang sudah dicatat tidak menawarkan pengajuan ulang", async () => {
    await render({ submission: { ...base.submission!, requestedAt: "2026-10-12T14:00:00Z", receivedAmount: 3500 } });
    expect(container.textContent).toContain("Setoran sudah dicatat");
    expect(container.querySelector("button")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });

  it("pengajuan dari server langsung ditampilkan tanpa mengirim ulang", async () => {
    await render({ submission: { ...base.submission!, requestedAt: "2026-10-12T14:00:00Z" } });
    expect(container.textContent).toContain("Pengajuan setoran terkirim");
    expect(container.querySelector("button")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
});
