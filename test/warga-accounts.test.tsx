// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { router as adminRouter } from "@/apps/admin/routes";
import type { Petugas } from "@/apps/admin/petugas/petugas-dialog";
import type { Resident } from "@/apps/admin/warga/warga-dialog";
import { queryClient as client } from "@/client/query";
import type { Role } from "@/lib/types";

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
let created: boolean;
let viewerRole: Role;
const resident: Resident = {
  id: 10, name: "Budi", houseId: 1, block: "A", number: "1", userId: 2,
  role: "petugas", accountActive: true, phone: null, familyId: null, familyRelation: null,
  housingStatus: "unknown", residentSince: null,
};
const withoutAccount: Resident = { ...resident, id: 11, name: "Ipung", userId: null, role: null, accountActive: null };
const account: Petugas = {
  id: 2, name: "Budi", role: "petugas", active: true, locked: false, lockedUntil: null,
  houseId: 1, house: "A-1", days: [1, 4], lastRecordedAt: "2026-10-10T00:00:00Z",
};
const me = () => ({ id: 99, name: "Pengurus", role: viewerRole });
const accounts = () => ({ users: [account, { ...account, id: 4, name: "Nonaktif", active: false }, ...(created ? [{ ...account, id: 3, name: "Ipung", days: [] }] : [])], me: me() });
const directory = () => ({ residents: [resident, created ? { ...withoutAccount, userId: 3, role: "petugas", accountActive: true } : withoutAccount] });
const houses = { houses: [{ id: 1, block: "A", number: "1", ownerName: "Budi", token: "EXAMPLE", status: "active" }] };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  created = false; viewerRole = "admin";
  client.clear();
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  client.setQueryData(["auth"], { setupNeeded: false, user: me() });
  client.setQueryData(["admin", "warga"], directory());
  client.setQueryData(["admin", "petugas"], accounts());
  client.setQueryData(["admin", "rumah"], houses);
  client.setQueryData(["admin", "pengaturan"], { communityName: "Natura" });
  client.setQueryData(["admin", "permintaan"], { pending: 0, requests: [] });
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = String(url);
    if (path === "/api/admin/petugas" && init?.method === "POST") {
      created = true;
      return Response.json({ id: 3, success: "Akun dibuat." });
    }
    if (path === "/api/admin/petugas/2" && init?.method === "PATCH") return Response.json({ success: "Tersimpan." });
    if (path === "/api/admin/petugas") return Response.json(accounts());
    if (path === "/api/admin/warga") return Response.json(directory());
    if (path === "/api/admin/rumah") return Response.json(houses);
    if (path === "/api/admin/pengaturan") return Response.json({ communityName: "Natura" });
    if (path === "/api/admin/permintaan") return Response.json({ pending: 0, requests: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose(); client.clear(); container.remove(); vi.unstubAllGlobals();
});
function role(value: Role) {
  viewerRole = value;
  client.setQueryData(["auth"], { setupNeeded: false, user: me() });
  client.setQueryData(["admin", "petugas"], accounts());
}
async function render(path: string) {
  router = createMemoryRouter(adminRouter.routes, { initialEntries: [path] });
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
function buttons(text: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent?.trim() === text); }
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;

it("Warga mempunyai tab Akun dan sidebar tidak lagi memuat halaman Akun & akses", async () => {
  await render("/admin/warga");
  const tabs = container.querySelector('[aria-label="Pendataan warga"]')!;
  expect([...tabs.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Daftar warga", "Keluarga", "Akun"]);
  expect(container.querySelector('nav[aria-label="Menu dashboard"]')!.textContent).not.toContain("Akun & akses");
  await click(buttons("Akun")[0]);
  expect(router.state.location).toMatchObject({ pathname: "/admin/warga", search: "?tab=akun" });
  expect(container.querySelector("h1")?.textContent).toBe("Warga");
  expect(container.textContent).not.toMatch(/Jaga per malam|Malam jaga|Terakhir mencatat|Belum dijadwalkan/);
  expect(container.querySelector('[aria-label="Atur akun Budi"]')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("tautan akun lama dialihkan ke Warga dengan ID warga tetap dibawa", async () => {
  await render("/admin/petugas?warga=11");
  expect(router.state.location.pathname).toBe("/admin/warga");
  expect(new URLSearchParams(router.state.location.search).get("warga")).toBe("11");
  expect(new URLSearchParams(router.state.location.search).get("tab")).toBe("akun");
  expect(dialog().textContent).toContain("Ipung");
  expect(dialog().textContent).not.toContain("Jaga malam");
  expect(fetch).not.toHaveBeenCalled();
});

it("akun warga bisa dibuka dari barisnya dan perubahan akses tidak mengirim perubahan jadwal", async () => {
  await render("/admin/warga");
  await click(container.querySelector<HTMLElement>('a[aria-label="Akun Budi"]')!);
  expect(dialog().textContent).toContain("Peran");
  expect(dialog().textContent).toContain("Akun aktif");
  expect(dialog().textContent).toContain("Atur ulang PIN");
  expect(dialog().textContent).not.toContain("Jaga malam");
  await act(async () => dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const [, init] = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === "/api/admin/petugas/2" && init?.method === "PATCH")!;
  expect(JSON.parse(init!.body as string)).toEqual({ name: "Budi", role: "petugas", active: true, houseId: 1 });
});

it("buat akun dari daftar Warga tetap menampilkan PIN setelah profil terhubung dan tab Akun diperbarui", async () => {
  await render("/admin/warga");
  await click(container.querySelector<HTMLElement>('a[href="/admin/warga?tab=akun&warga=11"]')!);
  const pin = [...dialog().querySelectorAll<HTMLInputElement>("input")].find((input) => input.pattern === "\\d{4,6}")!;
  const generatedPin = pin.value;
  await act(async () => dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => {
    await expect.poll(() => client.getQueryData<{ residents: Resident[] }>(["admin", "warga"])?.residents.find((r) => r.id === 11)?.userId).toBe(3);
    await expect.poll(() => client.isMutating()).toBe(0);
  });
  expect(dialog().textContent).toContain("Ipung ditambahkan. PIN-nya:");
  expect(dialog().textContent).toContain(generatedPin);
  expect(dialog().textContent).not.toContain("Warga ini sudah memiliki akun");
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("/api/jadwal"))).toHaveLength(0);
});

it.each(["sekretaris", "bendahara"] as const)("%s dapat membaca tab Akun tanpa kontrol perubahan akses", async (viewer) => {
  role(viewer);
  await render("/admin/warga?tab=akun&akun=2&buat=1");
  expect(container.textContent).toContain("Budi");
  expect(buttons("Buat akun")).toHaveLength(0);
  expect(container.querySelector('[aria-label="Atur akun Budi"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("Bendahara membuka Warga pada tab Akun tanpa mengambil data profil atau keluarga", async () => {
  role("bendahara");
  client.removeQueries({ queryKey: ["admin", "warga"] });
  await render("/admin/warga");
  expect(container.textContent).toContain("Budi");
  const tabs = container.querySelector('[aria-label="Pendataan warga"]')!;
  expect([...tabs.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Akun"]);
  expect(container.querySelector('nav a[href="/admin/warga"]')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => { await router.navigate("/admin/warga?tab=keluarga"); });
  expect(container.querySelector("h1")?.textContent).toBe("Akses terbatas");
  expect(fetch).not.toHaveBeenCalled();
});

it("Humas tidak dapat membuka tab Akun melalui URL langsung", async () => {
  role("humas");
  await render("/admin/warga?tab=akun");
  expect(container.querySelector("h1")?.textContent).toBe("Akses terbatas");
  expect(fetch).not.toHaveBeenCalled();
});

it("saringan nonaktif tetap bisa membuka pengaturan akun yang nonaktif", async () => {
  await render("/admin/warga?tab=akun");
  expect(container.querySelector('[aria-label="Atur akun Nonaktif"]')).toBeNull();
  const filter = [...container.querySelectorAll<HTMLElement>('[aria-label="Saring akun"] button')].find((button) => button.textContent?.startsWith("Nonaktif"))!;
  await click(filter);
  await click(container.querySelector<HTMLElement>('[aria-label="Atur akun Nonaktif"]')!);
  expect(dialog().textContent).toContain("Ubah Nonaktif");
});
