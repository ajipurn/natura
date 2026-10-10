// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddHouseDialog, EditHouseDialog, type AdminHouse } from "@/apps/admin/rumah/house-dialog";
import type { Resident } from "@/apps/admin/warga/warga-dialog";
import { queryClient as client } from "@/client/query";

let root: Root;
let container: HTMLDivElement;
const account = { id: 99, name: "Pengurus", role: "sekretaris" };
const current: Resident = {
  id: 55, name: "Eko", houseId: 1, block: "A", number: "1", userId: 2,
  role: "petugas", accountActive: true, phone: null, familyId: null, familyRelation: null,
  housingStatus: "unknown", residentSince: null,
};
const people: Resident[] = [current,
  { ...current, id: 56, name: "Dina", houseId: 2, block: "B", number: "3", userId: null, role: null },
  { ...current, id: 57, name: "Dina", houseId: 3, block: "AF", number: "4", userId: 3, role: "warga" },
];
const home: AdminHouse = {
  id: 1, block: "A", number: "1", ownerName: "Eko", token: "EXAMPLE", status: "active",
  collectionCount: 0, paymentCount: 0, paymentCadence: "daily", residents: [current],
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client.clear();
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  client.setQueryData(["auth"], { setupNeeded: false, user: account });
  client.setQueryData(["admin", "warga"], { residents: people });
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (init?.method === "PATCH" || init?.method === "POST") return Response.json({ success: "Tersimpan." });
    if (String(url) === "/api/admin/warga") return Response.json({ residents: people });
    if (String(url) === "/api/auth") return Response.json({ setupNeeded: false, user: account });
    throw new Error(`Unexpected request: ${String(url)}`);
  }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); vi.unstubAllGlobals();
});
async function render(content: ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>{content}</MemoryRouter></QueryClientProvider>));
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const combo = () => dialog().querySelector<HTMLButtonElement>('[role="combobox"]')!;
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(text: string) {
  await act(async () => combo().click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(text))!;
  await act(async () => option.click());
}
async function submit() {
  await act(async () => dialog().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
function payload(method: string) {
  const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === method)!;
  return JSON.parse(call[1]!.body as string);
}

it("Nama warga adalah pilihan berlabel yang bisa dicari berdasarkan alamat dan menyimpan ID, bukan nama", async () => {
  const done = vi.fn();
  await render(<EditHouseDialog house={home} accounts={["Eko"]} origin="http://localhost" onClose={done} />);
  expect(combo().textContent).toContain("Eko");
  const labelId = combo().getAttribute("aria-labelledby")!.split(" ").find((id) => document.getElementById(id)?.textContent === "Nama warga");
  expect(labelId).toBeDefined();
  expect([...dialog().querySelectorAll<HTMLInputElement>("input")].some((element) => element.value === "Eko")).toBe(false);
  await act(async () => combo().click());
  const search = document.querySelector<HTMLInputElement>('input[aria-label="Cari nama atau rumah"]')!;
  await input(search, "AF4");
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options).toHaveLength(1);
  expect(options[0].textContent).toContain("Dina");
  expect(options[0].textContent).toContain("AF-4");
  await act(async () => {
    search.focus();
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
  });
  await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true })));
  expect(dialog().textContent).toContain("Eko tidak lagi terhubung ke rumah ini.");
  await submit();
  expect(payload("PATCH")).toEqual({ block: "A", number: "1", status: "active", residentId: 57, previousResidentId: 55 });
  expect(done).toHaveBeenCalled();
});

it("simpan tanpa mengganti pilihan tidak mengirim isian nama atau mengganti hubungan penghuni", async () => {
  await render(<EditHouseDialog house={home} accounts={["Eko"]} origin="http://localhost" onClose={() => {}} />);
  await submit();
  expect(payload("PATCH")).toEqual({ block: "A", number: "1", status: "active" });
});

it("pilihan Belum ditentukan melepas hubungan rumah secara eksplisit", async () => {
  await render(<EditHouseDialog house={home} accounts={["Eko"]} origin="http://localhost" onClose={() => {}} />);
  await choose("Belum ditentukan");
  await submit();
  expect(payload("PATCH")).toMatchObject({ residentId: null, previousResidentId: 55 });
});

it("tambah rumah memilih profil yang sudah ada, termasuk warga tanpa akun", async () => {
  await render(<AddHouseDialog initial={{ block: "X", number: "1" }} houses={[]} onClose={() => {}} />);
  await choose("B-3");
  await submit();
  expect(payload("POST")).toEqual({ block: "X", numbers: "1", residentId: 56 });
});

it("pilihan yang dibuat untuk satu rumah tidak ikut terkirim setelah nomor diubah menjadi deret", async () => {
  await render(<AddHouseDialog initial={{ block: "X", number: "1" }} houses={[]} onClose={() => {}} />);
  await choose("B-3");
  const numbers = [...dialog().querySelectorAll<HTMLInputElement>("input")].find((element) => element.placeholder === "1-20")!;
  await input(numbers, "1-3");
  expect(combo().disabled).toBe(true);
  await submit();
  expect(payload("POST")).toEqual({ block: "X", numbers: "1-3", residentId: null });
});

it("beberapa penghuni dikelola di Warga tanpa disederhanakan menjadi satu pilihan", async () => {
  const second = { ...people[1], houseId: home.id, block: "A", number: "1" };
  client.setQueryData(["admin", "warga"], { residents: [current, second] });
  await render(<EditHouseDialog house={{ ...home, residents: [current, second] }} accounts={["Eko"]} origin="http://localhost" onClose={() => {}} />);
  expect(combo()).toBeNull();
  expect(dialog().textContent).toContain("Dina");
  expect(dialog().querySelector('a[href="/admin/warga?rumah=1"]')).not.toBeNull();
  await submit();
  expect(payload("PATCH")).toEqual({ block: "A", number: "1", status: "active" });
});
