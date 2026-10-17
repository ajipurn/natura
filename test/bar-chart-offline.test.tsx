// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BarChart } from "@/components/bar-chart";

vi.mock("@/components/bar-chart-content", () => { throw new Error("Chunk grafik belum tersedia offline"); });

it("kegagalan memuat grafik tetap menampilkan angka dan tidak menjatuhkan halaman", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    const bar = { key: "2026-10-17", label: "17", value: 500, title: "17 Okt: Rp 500 dari 1 rumah" };
    await act(async () => root.render(<><h1>Beranda</h1><BarChart bars={[bar]} caption="Jimpitan per malam" /></>));
    await expect.poll(async () => {
      await act(async () => {});
      return error.mock.calls.length;
    }).toBeGreaterThan(0);
    expect(container.querySelector("h1")?.textContent).toBe("Beranda");
    expect(container.querySelector("figure table")?.textContent).toContain(bar.title);
    expect(container.querySelector("figcaption")?.textContent).toBe("Jimpitan per malam");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
