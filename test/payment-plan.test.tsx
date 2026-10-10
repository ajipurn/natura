// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaymentPlanSection } from "@/apps/admin/payments/plan-section";

let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00+07:00"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: "Tersimpan." })));
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["admin", "kesepakatan", 1], { plans: [{ id: 1, houseId: 1, cadence: "weekly", effectiveFrom: "2026-10-01", ratePerNight: 700, dueTiming: "end", graceDays: 0, weekStart: 6 }] });
  client.setQueryData(["admin", "pengaturan"], { defaultAmount: 500 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("pengaturan hanya menyediakan Harian/Bulanan dan menyarankan Harian dengan tarif lama untuk kesepakatan mingguan", async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><PaymentPlanSection houseId={1} /></QueryClientProvider>));
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
  await act(async () => button("Atur pembayaran").click());
  const cadence = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  expect(cadence.textContent).toBe("Harian");
  expect(container.textContent).not.toContain("Awal minggu");
  await act(async () => cadence.click());
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.map((o) => o.textContent)).toEqual(["Harian", "Bulanan"]);
  await act(async () => options[0].click());
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(fetch).toHaveBeenCalledOnce();
  const request = vi.mocked(fetch).mock.calls[0];
  expect(request[1]?.method).toBe("PUT");
  expect(JSON.parse(request[1]!.body as string)).toMatchObject({ cadence: "daily", effectiveFrom: "2026-10-10", ratePerNight: 700 });
});
