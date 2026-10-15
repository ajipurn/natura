// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupSettings } from "@/apps/admin/pengaturan/backup-settings";

let root: Root, container: HTMLDivElement, client: QueryClient;
const base = { enabled: false, hour: 2, telegramConfigured: true, cronConfigured: true, local: false, disabled: false, lastSentAt: null as string | null, lastFileName: null as string | null, lastError: null as string | null, inProgress: false };
const queryKey = ["admin", "backup-settings"];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["auth"], { user: { id: 1, name: "Admin", role: "admin" } });
  client.setQueryData(queryKey, base);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<QueryClientProvider client={client}><BackupSettings /></QueryClientProvider>));
const toggle = () => container.querySelector<HTMLElement>('[role="switch"]')!;
const toggleDisabled = () => toggle().hasAttribute("data-disabled");
const button = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => /Kirim SQL sekarang|Mengirim SQL/.test(button.textContent ?? ""))!;
const click = (element: HTMLElement) => act(async () => { element.click(); await tick(); await tick(); });

describe("pengaturan autobackup", () => {
  it("menampilkan jadwal harian tanpa mengirim backup saat halaman dibuka", async () => {
    await render();
    expect(container.textContent).toContain("02.00–02.59 WIB");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(button().disabled).toBe(false);
    expect(container.textContent).toContain("hanya admin yang bisa mengakses chat");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("menyimpan pilihan admin lalu menampilkan status server terbaru", async () => {
    let status = { ...base };
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        status = { ...status, ...JSON.parse(String(init.body)) };
        return json({ success: status.enabled ? "Autobackup harian diaktifkan." : "Autobackup dinonaktifkan." });
      }
      return json(status);
    });
    await render();
    await click(toggle());
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/admin/backup/settings" && init?.method === "PUT" && init.body === '{"enabled":true}')).toBe(true);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Autobackup harian diaktifkan.");
    await click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Autobackup dinonaktifkan.");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/telegram"))).toBe(false);
  });

  it("memilih jam tanpa mengaktifkan jadwal atau mengirim file, lalu memperbarui keterangan waktunya", async () => {
    let status = { ...base };
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        status = { ...status, ...JSON.parse(String(init.body)) };
        return json({ success: "Jam backup tersimpan." });
      }
      return json(status);
    });
    await render();
    const select = [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((button) => button.textContent?.includes("02.00"))!;
    await click(select);
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === "23.00")!;
    await click(option);
    expect(container.textContent).toContain("23.00–23.59 WIB");
    expect(container.textContent).toContain("Jam backup tersimpan.");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    const puts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0][1]?.body))).toEqual({ hour: 23 });
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("Telegram selalu memakai SQL meskipun pilihan unduhan JSON dan jadwal mati", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === "POST"
      ? json({ success: "File SQL terkirim. Periksa chat Telegram tujuan." })
      : json({ ...base, lastSentAt: "2026-10-15T00:15:00Z", lastFileName: "natura-backup-2026-10-15.sql" }));
    await render();
    await click([...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent?.startsWith("JSON"))!);
    await click(button());
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0][0])).toBe("/api/admin/backup/telegram");
    expect(container.textContent).toContain("File SQL terkirim.");
    expect(container.textContent).toContain("Terakhir terkirim");
    expect(container.textContent).toContain("natura-backup-2026-10-15.sql");
  });

  it("menahan kirim ganda selama proses dan mengumumkan statusnya", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === "POST"
      ? new Promise((resolve) => { finish = resolve; }) : json(base));
    await render();
    await click(button());
    expect(button().disabled).toBe(true);
    expect(container.textContent).toContain("Menyiapkan dan mengirim file SQL…");
    await click(button());
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { finish(json({ success: "File SQL terkirim." })); await tick(); await tick(); });
    expect(button().disabled).toBe(false);
  });

  it.each([
    [{ telegramConfigured: false }, "Hubungkan bot"],
    [{ telegramConfigured: false, disabled: true }, "dinonaktifkan"],
    [{ cronConfigured: false }, "CRON_SECRET"],
  ])("menjelaskan konfigurasi yang belum tersedia: %j", async (overrides, hint) => {
    client.setQueryData(queryKey, { ...base, ...overrides });
    await render();
    expect(toggleDisabled()).toBe(true);
    expect(button().disabled).toBe(!("cronConfigured" in overrides));
    expect(container.textContent).toContain(hint);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tetap bisa mematikan jadwal jika pengiriman sedang berjalan atau konfigurasi hilang", async () => {
    client.setQueryData(queryKey, { ...base, enabled: true, telegramConfigured: false, inProgress: true });
    await render();
    expect(toggleDisabled()).toBe(false);
    expect(button().disabled).toBe(true);
  });

  it("menjelaskan batas jadwal lokal dan menampilkan kegagalan tanpa menyatakan file terkirim", async () => {
    client.setQueryData(queryKey, { ...base, local: true, cronConfigured: false, lastError: "Telegram menolak file SQL (HTTP 403)." });
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === "POST"
      ? json({ error: "File SQL belum dapat dikirim." }, 503)
      : json({ ...base, local: true, cronConfigured: false, lastError: "File SQL belum dapat dikirim." }));
    await render();
    expect(toggleDisabled()).toBe(false);
    expect(container.textContent).toContain("Jadwal otomatis berjalan setelah deploy ke production");
    expect(container.textContent).toContain("HTTP 403");
    await click(button());
    expect(container.textContent).toContain("File SQL belum dapat dikirim.");
    expect(container.textContent).not.toContain("File SQL terkirim");
    expect(button().disabled).toBe(false);
  });

  it("gagal menyimpan tidak mengubah sakelar menjadi aktif", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "Peran akunmu tidak memiliki akses." }, 403));
    await render();
    await click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("tidak memiliki akses");
  });
});
