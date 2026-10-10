// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddSlotDialog } from "@/apps/admin/jadwal/add-slot-dialog";
import type { Resident } from "@/apps/admin/warga/warga-dialog";
import { toSlots } from "@/apps/admin/jadwal/draft";

let root: Root;
let container: HTMLDivElement;
const person: Resident = {
  id: 55, name: "Ipung", houseId: 4, block: "AF", number: "4", userId: null,
  role: null, accountActive: null, phone: null, familyId: null, familyRelation: null,
  housingStatus: "unknown", residentSince: null,
};
const people: Resident[] = [
  person,
  { ...person, id: 56, name: "Tetangga", userId: 52, role: "petugas", accountActive: true },
  { ...person, id: 57, name: "Pembaca", userId: 53, role: "warga", accountActive: true },
  { ...person, id: 58, name: "Nonaktif", userId: 54, role: "petugas", accountActive: false },
];
const houses = [{ id: 4, block: "AF", number: "4", ownerName: "Ipung", token: "IPUNGAF4", status: "active" as const }];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("memilih profil warga tanpa akun, meskipun ada petugas lain di rumah yang sama", async () => {
  const onAdd = vi.fn();
  await act(async () => root.render(<AddSlotDialog day={1} people={people} houses={houses} slotsOfDay={[]} onAdd={onAdd} onClose={() => {}} />));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("belum punya akun");
  expect(dialog.textContent).not.toContain("Pembaca");
  expect(dialog.textContent).not.toContain("Nonaktif");
  const button = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Ipung"))!;
  await act(async () => button.click());
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ residentId: 55, userId: null, name: "Ipung", houseId: 4 }));
  const [saved] = toSlots([{ ...onAdd.mock.calls[0][0], day: 1, key: "new-person" }]);
  expect(saved).toMatchObject({ residentId: 55, userId: null, houseId: null, name: null });
});

it("mencegah memilih orang yang sama dua kali, tetapi mengizinkan penghuni serumah lainnya", async () => {
  await act(async () => root.render(<AddSlotDialog day={1} people={people} houses={houses}
    slotsOfDay={[{ day: 1, key: "existing", residentId: 55, userId: null, userActive: null, name: "Ipung", houseId: 4, block: "AF", number: "4", ownerName: "Ipung", color: "orange" }]}
    onAdd={() => {}} onClose={() => {}} />));
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
  expect(buttons.find((b) => b.textContent?.startsWith("Ipung"))!.disabled).toBe(true);
  expect(buttons.find((b) => b.textContent?.startsWith("Tetangga"))!.disabled).toBe(false);
});

it("akun dari cache jadwal lama tetap dikenali sebagai orang yang sudah dipilih", async () => {
  await act(async () => root.render(<AddSlotDialog day={1} people={people} houses={houses}
    slotsOfDay={[{ day: 1, key: "old-cache", userId: 52, userActive: true, name: "Tetangga", houseId: 4, block: "AF", number: "4", ownerName: "Ipung", color: "orange" }]}
    onAdd={() => {}} onClose={() => {}} />));
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
  expect(buttons.find((b) => b.textContent?.startsWith("Tetangga"))!.disabled).toBe(true);
  expect(buttons.find((b) => b.textContent?.startsWith("Ipung"))!.disabled).toBe(false);
});
