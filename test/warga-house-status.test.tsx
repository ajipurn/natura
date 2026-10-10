// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HouseStatus, type HouseRow } from "@/apps/warga/house-status";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const home: HouseRow = { id: 1, block: "AA", number: "9", status: "active", filled: 2, empty: 0, unchecked: 5, total: 1000, periodTotal: 0 };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request"))));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client.setQueryData(["warga", "rumah", 1, "2026-10"], { house: home, today: "2026-10-07", through: "2026-10-07", history: [{ date: "2026-10-06", status: "filled", amount: 500 }, { date: "2026-10-07", status: "filled", amount: 500 }], paymentInfo: { periods: [], receipts: [], tonight: null } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});
async function render(houses = [home]) {
  await act(async () => root.render(<QueryClientProvider client={client}><HouseStatus perHouse={houses} month="2026-10" nights={7} through="2026-10-07" /></QueryClientProvider>));
}
async function click(selector: string) {
  const el = document.querySelector(selector)!;
  expect(el).not.toBeNull();
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("status rumah untuk warga", () => {
  it("menampilkan 2/7 dan membuka kalender dari daftar", async () => {
    await render();
    await click('button[aria-label="AA-9: 2/7 terisi. 5 belum dicatat. Lihat riwayat"]');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("7 malam berjalan");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("denah mempertahankan jumlah malam dan bisa membuka kalender yang sama", async () => {
    await render();
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Denah")!.click());
    await click('[role="button"][aria-label="Blok AA No. 9, 2/7 terisi. 5 belum dicatat"]');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Rumah AA-9");
    expect(document.querySelectorAll('[role="listitem"][aria-label*="belum dicatat"]')).toHaveLength(5);
  });
  it("rumah di luar denah tetap punya tombol riwayat", async () => {
    await render([{ ...home, block: "ZZ" }]);
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Denah")!.click());
    expect(container.textContent).toContain("Rumah di luar denah");
    expect(container.querySelector('button[aria-label^="ZZ-9:"]')).not.toBeNull();
  });
});
