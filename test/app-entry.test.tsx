// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://app.clusternatura.com/"}
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router as browserRouter } from "@/apps/petugas/routes";
import { HousePage } from "@/apps/warga/rumah";
import { queryClient } from "@/client/query";
import { formatDateLong } from "@/lib/dates";
import type { SessionUser } from "@/server/auth";

// happy-dom tidak menyediakan IndexedDB; cache memori dan alur autentikasi tetap diuji sungguhan.
vi.mock("idb-keyval", () => ({ del: vi.fn(async () => {}), get: vi.fn(async () => undefined), set: vi.fn(async () => {}) }));

// Pencatatan diuji tersendiri; di sini router dan menu Beranda dirender sungguhan.
vi.mock("@/apps/petugas/ronda/ronda-page", () => ({ RondaPage: () => <h1>Ronda</h1> }));
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
const petugas: SessionUser = { id: 1, name: "Petugas contoh", role: "petugas" };
const warga: SessionUser = { id: 2, name: "Warga contoh", role: "warga" };
const history = { patrols: [{ date: "2026-10-09", filled: 1, empty: 0, checked: 1, unchecked: 0, expected: 1, total: 500, collectors: "Petugas contoh" }], today: "2026-10-10" };
const schedule = { schedule: [{ id: 1, day: 6, position: 0, userId: 1, houseId: 1, block: "AF", number: "13", name: "Petugas contoh", ownerName: "Petugas contoh", color: "green" }] };
const requests = { requests: [] };
const pages = [
  ["/ronda", "Ronda", "/ronda"],
  ["/riwayat", "Riwayat ronda", "/riwayat"],
  ["/riwayat/2026-10-09", formatDateLong("2026-10-09"), "/riwayat"],
  ["/jadwal", "Jadwal ronda", "/jadwal"],
  ["/akun", "Akun", "/akun"],
] as const;


beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T13:00:00Z"));
  localStorage.clear();
  client = queryClient;
  client.clear();
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  client.setQueryData(["warga", "akses"], { access: true, communityName: "Cluster Natura", logoUrl: null });
  client.setQueryData(["auth", "users"], { users: [{ ...petugas, house: "AF-13" }] });
  client.setQueryData(["warga", "info"], { announcements: [{ id: 1, title: "Kerja bakti", body: "Minggu pagi", pinned: true, createdAt: "2026-10-10T12:00:00Z" }], schedule: [], tonight: 6, date: "2026-10-10", today: "2026-10-10", contacts: [], cash: null });
  client.setQueryData(["warga", "rekap", "2026-10"], { month: "2026-10", today: "2026-10-10", through: "2026-10-10", nights: 0, total: 0, average: 0, perNight: [], perHouse: [], paymentPeriods: [] });
  client.setQueryData(["riwayat"], history);
  client.setQueryData(["riwayat", "bulan", "2026-10"], history);
  for (const date of ["2026-10-08", "2026-10-09", "2026-10-10"]) client.setQueryData(["riwayat", date], { houses: [], collections: [], settings: { communityName: "Cluster Natura", defaultAmount: 500 }, paymentPeriods: [] });
  client.setQueryData(["jadwal"], schedule);
  client.setQueryData(["jadwal", "permintaan"], requests);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  client.clear();
  container.remove();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(path = "/", user: SessionUser | null = null) {
  client.setQueryData(["auth"], { setupNeeded: false, user });
  router = createMemoryRouter(browserRouter.routes, { initialEntries: [path] });
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
}

describe("Beranda di dalam app dengan login", () => {
  it.each(["/", "/?kode=6G7Z5AFG", "/app", "/app?kode=6G7Z5AFG", "/petugas", "/info?kode=6G7Z5AFG"])("%s meminta login akun meskipun data warga tersimpan", async (path) => {
    await render(path);
    expect(router.state.location.pathname).toBe("/masuk");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe(`/${path.includes("?") ? "?kode=6G7Z5AFG" : ""}`);
    expect(container.querySelector("h1")?.textContent).toBe("Masuk");
    expect(container.querySelector('input[name="pin"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Kerja bakti");
    expect(container.querySelector('[aria-label="Kode warga"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(pages)("%s juga meminta login sebelum isi halaman tampil", async (path) => {
    await render(path);
    expect(router.state.location.pathname).toBe("/masuk");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe(path);
    expect(container.querySelector("h1")?.textContent).toBe("Masuk");
    expect(container.textContent).toContain("Info warga & ronda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(pages)("login kembali ke %s dan menandai menu yang sesuai", async (path, title, active) => {
    await render(`/masuk?next=${encodeURIComponent(path)}`, petugas);
    expect(router.state.location.pathname).toBe(path);
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe(active);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Beranda menjadi menu pertama dan halaman awal akun yang sudah masuk", async () => {
    await render("/", petugas);
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
    expect(container.textContent).toContain("Kerja bakti");
    expect([...container.querySelectorAll("nav a")].map((a) => a.textContent)).toEqual(["Beranda", "Ronda", "Riwayat", "Jadwal", "Akun"]);
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe("/");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Warga membuka Beranda dengan empat menu tanpa Ronda", async () => {
    await render("/", warga);
    expect(container.textContent).toContain("Kerja bakti");
    expect([...container.querySelectorAll("nav a")].map((a) => a.textContent)).toEqual(["Beranda", "Riwayat", "Jadwal", "Akun"]);
    expect(container.querySelector("nav ul")?.classList.contains("grid-cols-4")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tanggal 10 sebelum pukul 20.00 menampilkan sembilan malam yang sama di status dan grafik", async () => {
    client.setQueryData(["warga", "rekap", "2026-10"], {
      month: "2026-10", today: "2026-10-10", through: "2026-10-09", nights: 9, total: 4500, average: 500,
      perNight: Array.from({ length: 9 }, (_, i) => ({ date: `2026-10-0${i + 1}`, filled: 1, empty: 0, total: 500 })),
      perHouse: [{ id: 1, block: "AA", number: "9", status: "active", filled: 9, empty: 0, unchecked: 0, total: 4500, periodTotal: 0 }],
      paymentPeriods: [],
    });
    await render("/", warga);
    expect(container.textContent).toContain("9 malam berjalan · tanggal 1–9");
    expect(container.querySelector('button[aria-label="AA-9: 9/9 terisi. Semua malam terisi. Lihat riwayat"]')?.classList.contains("bg-filled-soft")).toBe(true);
    const bars = [...container.querySelectorAll("figure table tr")];
    expect(bars).toHaveLength(9);
    expect(bars.at(-1)?.textContent).toContain("9 Okt");
    expect(container.textContent).toContain("20.00–00.00 WIB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bulan baru setelah tengah malam membuka bulan kalender walaupun jadwal masih malam sebelumnya", async () => {
    client.setQueryData(["warga", "info"], { announcements: [], schedule: [], tonight: 6, date: "2026-10-31", today: "2026-11-01", contacts: [], cash: null });
    client.setQueryData(["warga", "rekap", "2026-11"], {
      month: "2026-11", today: "2026-11-01", through: "2026-10-31", nights: 0, total: 0, average: 0, perNight: [],
      perHouse: [{ id: 1, block: "AA", number: "9", status: "active", filled: 0, empty: 0, unchecked: 0, total: 0, periodTotal: 0 }], paymentPeriods: [],
    });
    await render("/", warga);
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toContain("November 2026");
    expect(container.textContent).toContain("Belum ada malam berjalan");
    expect(container.textContent).not.toContain("tanggal 1–31");
    expect(container.querySelector('button[aria-label="AA-9: Belum berjalan. Belum ada malam berjalan. Lihat riwayat"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/ronda", "/app/ronda", "/petugas/ronda", "/masuk?next=%2Fronda"])("Warga tidak membuka Ronda melalui %s", async (path) => {
    await render(path, warga);
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/jadwal", "/akun", "/riwayat", "/riwayat/2026-10-09"])("Warga tetap membaca %s tanpa kontrol tugas jaga", async (path) => {
    client.removeQueries({ queryKey: ["jadwal", "permintaan"], exact: true });
    await render(path, warga);
    expect(router.state.location.pathname).toBe(path);
    expect(container.textContent).not.toContain("Jadwal jagamu");
    expect(container.textContent).not.toContain("Minta ubah jadwal");
    expect(container.textContent).not.toContain("Tukar jadwal");
    expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { label: "Warga", user: warga, recording: false },
    { label: "Petugas", user: petugas, recording: true },
    { label: "publik", user: null, recording: false },
  ])("QR rumah untuk $label membatasi kontrol pencatatan sesuai peran", async ({ user, recording }) => {
    client.setQueryData(["rumah", "WARGAAF4"], {
      communityName: "Natura", logoUrl: null, defaultAmount: 500, tonight: "2026-10-10",
      canRecord: true, user, house: { block: "AF", number: "4", token: "WARGAAF4", status: "active", ownerName: "Ipung" },
      history: [], paymentInfo: { periods: [], receipts: [], cells: {}, tonight: null },
    });
    router = createMemoryRouter([{ path: "/r/:token", element: <HousePage /> }], { initialEntries: ["/r/WARGAAF4"] });
    await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
    expect(container.querySelector("h1")?.textContent).toBe("Blok AF No. 4");
    expect(container.textContent?.includes("Catat malam ini")).toBe(recording);
    expect(Boolean(container.querySelector('a[href="/ronda"]'))).toBe(recording);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("menu Ronda dan Beranda berpindah di router yang sama", async () => {
    await render("/", petugas);
    await act(async () => (container.querySelector('nav a[href="/ronda"]') as HTMLAnchorElement).click());
    expect(router.state.location.pathname).toBe("/ronda");
    expect(container.querySelector("h1")?.textContent).toBe("Ronda");
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe("/ronda");
    await act(async () => (container.querySelector('nav a[href="/"]') as HTMLAnchorElement).click());
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("login akun yang sudah masuk kembali ke halaman awal Beranda", async () => {
    await render("/masuk", petugas);
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
  });

  it("bookmark petugas lama tetap membuka submenu saat shell dipakai offline", async () => {
    await render("/petugas/ronda", petugas);
    expect(router.state.location.pathname).toBe("/ronda");
    expect(container.querySelector("h1")?.textContent).toBe("Ronda");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(pages)("bookmark /app lama untuk %s tetap membuka halaman yang sama", async (path, title, active) => {
    await render(`/app${path}?hari=1#malam`, petugas);
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.location.search).toBe("?hari=1");
    expect(router.state.location.hash).toBe("#malam");
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe(active);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tautan Jadwal lama membawa query dan fragmen melewati login", async () => {
    await render("/app/jadwal?hari=1#malam");
    expect(router.state.location.pathname).toBe("/masuk");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/jadwal?hari=1#malam");
    await act(async () => {
      client.setQueryData(["auth"], { setupNeeded: false, user: petugas });
      await expect.poll(() => router.state.location.pathname).toBe("/jadwal");
    });
    expect(router.state.location.pathname).toBe("/jadwal");
    expect(router.state.location.search).toBe("?hari=1");
    expect(router.state.location.hash).toBe("#malam");
    expect(container.querySelector("h1")?.textContent).toBe("Jadwal ronda");
  });

  it("Riwayat membuka detail, berpindah malam, lalu kembali ke daftar di root app", async () => {
    await render("/riwayat", petugas);
    await act(async () => (container.querySelector('a[href="/riwayat/2026-10-09"]') as HTMLAnchorElement).click());
    expect(container.querySelector("h1")?.textContent).toBe(formatDateLong("2026-10-09"));
    await act(async () => (container.querySelector('[aria-label^="Malam sebelumnya"]') as HTMLAnchorElement).click());
    expect(router.state.location.pathname).toBe("/riwayat/2026-10-08");
    await act(async () => (container.querySelector('nav[aria-label="Navigasi riwayat"] a[href="/riwayat"]') as HTMLAnchorElement).click());
    expect(container.querySelector("h1")?.textContent).toBe("Riwayat ronda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Akun membuka Beranda melalui navigasi bawah", async () => {
    await render("/akun", petugas);
    await act(async () => (container.querySelector('nav a[href="/"]') as HTMLAnchorElement).click());
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("halaman yang tidak dikenal menyediakan jalan kembali ke Beranda", async () => {
    await render("/tidak-ada", petugas);
    expect(container.textContent).toContain("Halaman tidak ditemukan");
    await act(async () => (container.querySelector('main a[href="/"], .text-center a[href="/"]') as HTMLAnchorElement).click());
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
  });

  it("masuk dengan PIN dari tautan Jadwal kembali ke Jadwal, bukan halaman awal", async () => {
    const accounts = { users: [{ ...petugas, house: "AF-13" }] };
    vi.mocked(fetch).mockImplementation(async (url) => {
      const path = String(url);
      const data = path === "/api/auth/login" ? { user: petugas }
        : path === "/api/auth/users" ? accounts
        : path === "/api/auth" ? { setupNeeded: false, user: petugas }
        : path === "/api/jadwal" ? schedule : requests;
      return Response.json(data);
    });
    localStorage.setItem("jimpitan:last-user", "1");
    await render("/masuk?next=%2Fapp%2Fjadwal");
    const pin = container.querySelector<HTMLInputElement>('input[name="pin"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pin, "1234");
      pin.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await expect.poll(() => router.state.location.pathname).toBe("/jadwal");
    });
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: 1, pin: "1234" }) }));
    expect(container.querySelector("h1")?.textContent).toBe("Jadwal ronda");
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe("/jadwal");
  });

  it("keluar dari Akun menghapus akses Beranda dan kembali ke login app", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => Response.json(String(url) === "/api/auth/users"
      ? { users: [{ ...petugas, house: "AF-13" }] }
      : String(url) === "/api/auth" ? { setupNeeded: false, user: null } : { ok: true }));
    localStorage.setItem("jimpitan:auth", JSON.stringify({ setupNeeded: false, user: petugas }));
    await render("/akun", petugas);
    const logout = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Keluar dari akun"))!;
    await act(async () => {
      logout.click();
      await expect.poll(() => router.state.location.pathname).toBe("/masuk");
    });
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(router.state.location.pathname).toBe("/masuk");
    expect(localStorage.getItem("jimpitan:auth")).toBeNull();
    expect(client.getQueryData(["warga", "info"])).toBeUndefined();
    await act(async () => router.navigate("/"));
    expect(router.state.location.pathname).toBe("/masuk");
    expect(container.textContent).not.toContain("Kerja bakti");
  });

});
