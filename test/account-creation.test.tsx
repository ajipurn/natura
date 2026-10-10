// @vitest-environment happy-dom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PetugasDialog } from "@/apps/admin/petugas/petugas-dialog";
import type { Resident } from "@/apps/admin/warga/warga-dialog";
import { queryClient } from "@/client/query";

let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let createdRole = "petugas";
const resident: Resident = {
  id: 55, name: "Ipung", houseId: 4, block: "AF", number: "4", userId: null,
  role: null, accountActive: null, phone: null, familyId: null, familyRelation: null,
  housingStatus: "unknown", residentSince: null,
};
const houses = { houses: [{ id: 4, block: "AF", number: "4", ownerName: "Ipung", token: "IPUNGAF4", status: "active" }] };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  createdRole = "petugas";
  client = queryClient;
  client.clear();
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  client.setQueryData(["admin", "warga"], { residents: [resident] });
  client.setQueryData(["admin", "petugas"], { users: [] });
  client.setQueryData(["admin", "rumah"], houses);
  client.setQueryData(["jadwal"], { schedule: [] });
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = String(url);
    if (path === "/api/admin/petugas") {
      if (init?.method === "POST") createdRole = JSON.parse(init.body as string).role;
      return Response.json({ users: [], id: 52, success: "Akun dibuat." });
    }
    if (path === "/api/admin/warga") return Response.json({ residents: [{ ...resident, userId: 52, role: createdRole, accountActive: true }] });
    if (path === "/api/admin/rumah") return Response.json(houses);
    if (path === "/api/jadwal") return Response.json({ schedule: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it.each(["petugas", "warga"])("PIN akun %s dari profil warga tetap tampil setelah penyegaran menghubungkan profil itu", async (role) => {
  await act(async () => root.render(
    <QueryClientProvider client={client}><MemoryRouter>
      <PetugasDialog open onClose={() => {}} initialResidentId={55} />
    </MemoryRouter></QueryClientProvider>,
  ));
  const dialog = document.querySelector('[role="dialog"]')!;
  if (role === "warga") {
    const radio = [...dialog.querySelectorAll<HTMLElement>('[role="radio"]')].find((item) => item.textContent?.startsWith("Warga"))!;
    await act(async () => radio.click());
    expect(dialog.textContent).not.toContain("Jaga malam");
  }
  const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
  const pin = [...inputs].find((input) => input.pattern === "\\d{4,6}")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pin, "1234");
    pin.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await expect.poll(() => client.getQueryData<{ residents: Resident[] }>(["admin", "warga"])?.residents[0].userId).toBe(52);
    await expect.poll(() => client.isMutating()).toBe(0);
  });
  expect(dialog.textContent).toContain("Ipung ditambahkan. PIN-nya:");
  expect(dialog.textContent).toContain("1234");
  expect(dialog.textContent).not.toContain("Warga ini sudah memiliki akun");
  expect(fetch).toHaveBeenCalledWith("/api/admin/petugas", expect.objectContaining({
    method: "POST", body: JSON.stringify({ name: "Ipung", pin: "1234", role, houseId: 4, residentId: 55 }),
  }));
});
