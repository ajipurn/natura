// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router as adminRouter } from "@/apps/admin/routes";
import { PetugasDialog, type Petugas } from "@/apps/admin/petugas/petugas-dialog";
import type { Resident } from "@/apps/admin/warga/warga-dialog";
import type { Role, ScheduleDTO } from "@/lib/types";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter> | undefined;
const resident: Resident = {
  id: 1, name: "Budi", phone: "081234567890", houseId: 1, block: "A", number: "1",
  userId: 2, role: "humas", accountActive: true, familyId: 1, familyRelation: "head",
  housingStatus: "owner", residentSince: "2026-01-01",
};
const account: Petugas = {
  id: 2, name: "Budi", role: "humas", active: true, locked: false, lockedUntil: null,
  houseId: 1, house: "A-1", days: [1], lastRecordedAt: null,
};
const schedule: ScheduleDTO[] = [
  { id: 1, day: 1, position: 0, name: "Budi", block: "A", number: "1", houseId: 1, ownerName: "Budi", userId: 2, userActive: true, color: "green" },
  { id: 2, day: 1, position: 1, name: "Citra", block: "A", number: "2", houseId: 2, ownerName: "Citra", userId: null, userActive: null, color: "blue" },
];

function setRole(role: Role) {
  client.setQueryData(["auth"], { setupNeeded: false, user: { id: 99, name: "Pengguna", role } });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  setRole("humas");
  client.setQueryData(["admin", "warga"], { residents: [resident] });
  client.setQueryData(["admin", "keluarga"], { families: [{
    id: 1, headResidentId: 1, headName: "Budi", houseId: 1, block: "A", number: "1",
    housingStatus: "owner", note: null, members: [{ id: 1, name: "Budi", familyRelation: "head" }],
  }] });
  client.setQueryData(["admin", "rumah"], { houses: [{
    id: 1, block: "A", number: "1", ownerName: "Budi", token: "EXAMPLE", status: "active",
    collectionCount: 0, paymentCount: 0, paymentCadence: "daily",
    residents: [{ id: 1, name: "Budi", userId: 2, familyId: 1 }],
  }], origin: "http://localhost" });
  client.setQueryData(["admin", "pengaturan"], {
    communityName: "Natura", defaultAmount: 500, origin: "http://localhost", wargaCode: null,
    exportToken: null, cashPublic: true, logoUrl: null, fromEnv: false,
  });
  client.setQueryData(["admin", "info"], { announcements: [], contacts: [] });
  client.setQueryData(["admin", "permintaan"], { requests: [], pending: 0 });
  client.setQueryData(["jadwal"], { schedule });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose();
  router = undefined;
  client.clear();
  container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function renderPage(path: string) {
  router = createMemoryRouter(adminRouter.routes, { initialEntries: [path] });
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router!} /></QueryClientProvider>));
}

describe("dashboard Humas", () => {
  it("masuk ke Info warga dengan menu yang sesuai dan kontrol pengumuman/kontak", async () => {
    await renderPage("/admin");
    expect(router!.state.location.pathname).toBe("/admin/info");
    const links = [...container.querySelectorAll('nav[aria-label="Menu dashboard"] a')].map((link) => link.textContent);
    expect(links).toEqual([" Warga", " Rumah & QR", " Info warga", " Jadwal ronda"]);
    const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons.some((label) => label?.includes("Tulis"))).toBe(true);
    expect(buttons.some((label) => label?.includes("Tambah kontak"))).toBe(true);
  });

  it("membaca warga tanpa tombol tambah/edit maupun dialog dari tautan ubah", async () => {
    await renderPage("/admin/warga?ubah=1");
    expect(container.textContent).toContain("Budi");
    expect(container.querySelector('a[href="tel:081234567890"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Tambah warga");
    expect(container.querySelector('button[aria-label="Edit Budi"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("membaca keluarga tanpa kontrol perubahan", async () => {
    await renderPage("/admin/warga?tab=keluarga");
    expect(container.textContent).toContain("Keluarga Budi");
    expect(container.textContent).not.toContain("Tambah keluarga");
    expect(container.querySelector('button[aria-label^="Edit keluarga"]')).toBeNull();
  });

  it("membaca rumah dan QR tanpa meminta daftar akun atau menawarkan simpan", async () => {
    await renderPage("/admin/rumah?ubah=1");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Penghuni berakun: Budi");
    expect(dialog.textContent).toContain("Budi");
    expect(dialog.textContent).toContain("Stiker QR");
    expect(dialog.textContent).not.toContain("Simpan");
    expect(dialog.textContent).not.toContain("QR baru");
    expect(dialog.textContent).not.toContain("Pembayaran jimpitan");
    expect(container.textContent).not.toContain("Tambah rumah");
  });

  it("membaca seluruh jadwal termasuk baris biru tanpa editor atau impor", async () => {
    await renderPage("/admin/jadwal");
    expect(container.textContent).toContain("Budi");
    expect(container.textContent).toContain("Citra");
    const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons.some((label) => label?.includes("Ekspor gambar"))).toBe(true);
    expect(buttons.some((label) => /Impor|Tambah orang|Simpan|Tukar/.test(label ?? ""))).toBe(false);
    expect(container.querySelector('[aria-label^="Geser"]')).toBeNull();
  });

  it.each(["/admin/petugas", "/admin/pengaturan", "/admin/kas", "/admin/iuran", "/admin/riwayat", "/admin/riwayat/2026-10-10", "/admin/rekap", "/admin/denah"])("membatasi tautan langsung %s", async (path) => {
    await renderPage(path);
    expect(container.querySelector("h1")?.textContent).toBe("Akses terbatas");
  });

  it("Sekretaris tetap dapat mengubah warga", async () => {
    setRole("sekretaris");
    await renderPage("/admin/warga");
    expect(container.textContent).toContain("Tambah warga");
    expect(container.querySelector('button[aria-label="Edit Budi"]')).not.toBeNull();
  });

  it("Sekretaris tetap memakai editor dan impor jadwal", async () => {
    setRole("sekretaris");
    client.setQueryData(["admin", "petugas"], { users: [account] });
    await renderPage("/admin/jadwal");
    const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons.some((label) => label?.includes("Impor"))).toBe(true);
    expect(buttons.some((label) => label?.includes("Tambah"))).toBe(true);
  });

  it("form akun memuat Humas dan menyimpan pilihan perannya di kontrol", async () => {
    setRole("admin");
    client.setQueryData(["admin", "petugas"], { users: [account] });
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter><PetugasDialog open onClose={() => {}} petugas={{ ...account, role: "petugas" }} /></MemoryRouter></QueryClientProvider>,
    ));
    const humas = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent?.startsWith("Humas"))!;
    expect(humas.textContent).toContain("membaca warga, rumah, dan jadwal");
    await act(async () => humas.click());
    expect(humas.getAttribute("aria-checked")).toBe("true");
  });
});
