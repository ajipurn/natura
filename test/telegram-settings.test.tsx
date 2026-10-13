// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramSettings } from "@/apps/admin/pengaturan/telegram-settings";

let root: Root, container: HTMLDivElement, client: QueryClient;
const base = { enabled: true, local: false, disabled: false, pending: 0, lastSentAt: null, error: null, cronConfigured: true };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["auth"], { setupNeeded: false, user: { id: 1, role: "admin", name: "Admin" } });
  client.setQueryData(["admin", "telegram"], base);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<QueryClientProvider client={client}><TelegramSettings /></QueryClientProvider>));
const button = () => container.querySelector<HTMLButtonElement>("button")!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pengaturan Telegram", () => {
  it("development aktif menampilkan status yang benar dan menyediakan pesan uji tanpa meminta cron", async () => {
    client.setQueryData(["admin", "telegram"], { ...base, local: true, cronConfigured: false }); await render();
    expect(container.textContent).toContain("Aktif di lokal"); expect(button().disabled).toBe(false);
    expect(container.textContent).not.toContain("CRON_SECRET"); expect(fetch).not.toHaveBeenCalled();
  });
  it("pengiriman yang dinonaktifkan menampilkan alasan dan tidak bisa mengirim pesan uji", async () => {
    client.setQueryData(["admin", "telegram"], { ...base, enabled: false, disabled: true }); await render();
    expect(container.textContent).toContain("Pengiriman dinonaktifkan"); expect(button().disabled).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it("menunjukkan variabel yang dibutuhkan dan antrean yang gagal dikirim", async () => {
    client.setQueryData(["admin", "telegram"], { ...base, enabled: false }); await render();
    expect(container.textContent).toContain("TELEGRAM_BOT_TOKEN"); expect(container.textContent).toContain("TELEGRAM_CHAT_ID"); expect(button().disabled).toBe(true);
    await act(async () => { client.setQueryData(["admin", "telegram"], { ...base, pending: 2, error: "Telegram belum dapat dihubungi.", cronConfigured: false }); await tick(); });
    expect(container.textContent).toContain("2 pengingat menunggu dikirim"); expect(container.textContent).toContain("Telegram belum dapat dihubungi"); expect(container.textContent).toContain("CRON_SECRET");
  });
  it("hak baca tidak menampilkan tombol pengiriman", async () => {
    client.setQueryData(["auth"], { setupNeeded: false, user: { id: 2, role: "humas", name: "Humas" } }); await render();
    expect(container.textContent).toContain("Notifikasi Telegram"); expect(container.querySelector("button")).toBeNull();
  });
  it("pesan uji hanya dikirim setelah tombol ditekan dan menampilkan hasil pengiriman", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "POST" ? { success: "Pesan uji terkirim. Periksa chat Telegram tujuan." } : base), { headers: { "Content-Type": "application/json" } }));
    await render(); expect(fetch).not.toHaveBeenCalled();
    await act(async () => { button().click(); await tick(); await tick(); });
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/api/admin/pengaturan/telegram/test") && init?.method === "POST")).toBe(true);
    expect(container.textContent).toContain("Pesan uji terkirim");
  });
});
