// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupSettings } from "@/apps/admin/pengaturan/backup-settings";
import { ROLES } from "@/lib/permissions";

let root: Root, container: HTMLDivElement, client: QueryClient;
const backup = { format: "natura-database-backup", version: 1, createdAt: "2026-10-15T01:02:03.456Z", schema: "public", migrations: [], tables: { houses: [{ id: 1, token: "QR-RAHASIA" }] } };
const headers = { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="natura-backup-2026-10-15T01-02-03-456Z.json"' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["auth"], { setupNeeded: false, user: { id: 1, name: "Admin", role: "admin" } });
  client.setQueryData(["admin", "backup-settings"], { enabled: false, hour: 2, telegramConfigured: true, cronConfigured: true, local: false, disabled: false, lastSentAt: null, lastFileName: null, lastError: null, inProgress: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = () => act(async () => root.render(<QueryClientProvider client={client}><BackupSettings /></QueryClientProvider>));
const button = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Unduh backup"))!;
const click = () => act(async () => { button().click(); await tick(); await tick(); });
const selectFormat = (format: "sql" | "json") => act(async () => {
  [...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent?.startsWith(format.toUpperCase()))!.click();
});

describe("tombol backup di Pengaturan", () => {
  it.each(ROLES.filter((role) => role !== "admin"))("menyembunyikan backup dari %s tanpa meminta data", async (role) => {
    client.setQueryData(["auth"], { setupNeeded: false, user: { id: 2, name: role, role } });
    await render();
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mengunduh isi backup dengan nama bertanggal hanya setelah tombol ditekan", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(backup), { headers }));
    await render();
    await selectFormat("json");
    expect(button().textContent).toContain("Unduh backup");
    expect(fetch).not.toHaveBeenCalled();
    await click();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("/api/admin/backup?format=json");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(JSON.parse(await blob.text())).toEqual(backup);
    expect(blob.type).toContain("application/json");
    const link = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("natura-backup-2026-10-15T01-02-03-456Z.json");
    expect(link.href).toBe("blob:backup");
    expect(document.body.contains(link)).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("disiapkan untuk diunduh");
    expect(client.getQueryData(["admin", "backup"])).toBeUndefined();
  });

  it("memilih SQL secara awal dan mengunduh file SQL dari API", async () => {
    const content = "BEGIN;\nCREATE TABLE public.example (id integer);\nCOMMIT;\n";
    vi.mocked(fetch).mockResolvedValue(new Response(content, { headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": 'attachment; filename="natura-backup-2026-10-15T01-02-03-456Z.sql"',
    } }));
    await render();
    expect(container.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain("SQL (.sql)");
    expect(fetch).not.toHaveBeenCalled();
    await click();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("/api/admin/backup?format=sql");
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(content);
    expect(blob.type).toContain("application/sql");
    const link = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("natura-backup-2026-10-15T01-02-03-456Z.sql");
  });

  it("mencegah unduhan ganda selama proses dan mengumumkan statusnya", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    await render();
    await click();
    expect(button().disabled).toBe(true);
    expect([...container.querySelectorAll('[role="radio"]')].every((radio) => radio.hasAttribute("disabled") || radio.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Menyiapkan backup…");
    await click();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(new Response(JSON.stringify(backup), { headers }));
      await tick(); await tick();
    });
    expect(button().disabled).toBe(false);
  });

  it("menghapus status hasil unduhan ketika format diganti", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(backup), { headers }));
    await render();
    await click();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("disiapkan untuk diunduh");
    await selectFormat("json");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("menampilkan penolakan API tanpa membuat file, lalu mengizinkan percobaan ulang", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Peran akunmu tidak memiliki akses ke tindakan ini." }), { status: 403, headers: { "Content-Type": "application/json" } }));
    await render();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("tidak memiliki akses");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(backup), { headers }));
    await click();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("menjelaskan kegagalan koneksi tanpa menyiapkan file kosong", async () => {
    await render();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Tidak ada koneksi internet. Coba lagi.");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it("tidak mengunduh file parsial ketika koneksi terputus saat membaca backup", async () => {
    const response = new Response(null, { headers });
    vi.spyOn(response, "blob").mockRejectedValue(new Error("connection reset"));
    vi.mocked(fetch).mockResolvedValue(response);
    await render();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unduhan backup terputus. Periksa koneksi dan coba lagi.");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
