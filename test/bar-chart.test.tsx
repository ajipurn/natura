// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarChart, type Bar } from "@/components/bar-chart";

let container: HTMLDivElement;
let root: Root;
const bar = { key: "2026-10-05", label: "5", value: 30000, title: "Sen, 5 Okt: Rp 30.000 dari 60 rumah" };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Happy DOM tidak menjalankan layout; beri chart ukuran seperti yang dilaporkan browser.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this.classList.contains("recharts-wrapper") || this.classList.contains("recharts-surface")
      ? new DOMRect(0, 0, 600, 156)
      : new DOMRect(0, 0, (this.textContent?.length ?? 0) * 6, 14);
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function hover(index = 0, count = 1) {
  const chart = container.querySelector(".recharts-wrapper")!;
  await act(async () => {
    chart.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 20 + (560 * (index + 0.5)) / count,
      clientY: 50,
    }));
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe("informasi pada chart jimpitan", () => {
  it("menampilkan tanggal, nominal, dan jumlah rumah ketika batang dihover", async () => {
    await act(async () => root.render(<BarChart bars={[bar]} caption="Jimpitan per malam" />));
    await hover();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);
    expect(container.querySelector<HTMLElement>(".recharts-tooltip-wrapper")?.style.visibility).toBe("visible");
  });

  it("membuka informasi lewat fokus keyboard dan menutupnya dengan Escape", async () => {
    await act(async () => root.render(<BarChart bars={[bar]} caption="Jimpitan per malam" />));
    const chart = container.querySelector<SVGSVGElement>(".recharts-surface")!;
    await act(async () => chart.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);

    await act(async () => chart.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector<HTMLElement>(".recharts-tooltip-wrapper")?.style.visibility).toBe("hidden");
    expect(document.activeElement).toBe(chart);
  });

  it.each<Bar>([
    { key: "2026-10-07", label: "7", value: 0, title: "Rab, 7 Okt: tidak ada catatan ronda" },
    { key: "2026-10-08", label: "8", value: 0, title: "Kam, 8 Okt: belum tiba", blank: true },
  ])("tetap memberi keterangan untuk $title", async (night) => {
    await act(async () => root.render(<BarChart bars={[night]} caption="Jimpitan per malam" />));
    await hover();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(night.title);
    expect(container.querySelector<HTMLElement>(".recharts-tooltip-wrapper")?.style.visibility).toBe("visible");
    if (night.blank) expect(container.querySelectorAll(".recharts-bar-rectangle path")).toHaveLength(0);
  });

  it("mengganti informasi ketika berpindah ke batang lain", async () => {
    const next = { key: "2026-10-06", label: "6", value: 24500, title: "Sel, 6 Okt: Rp 24.500 dari 49 rumah" };
    await act(async () => root.render(<BarChart bars={[bar, next]} caption="Jimpitan per malam" />));
    await hover(0, 2);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);
    await hover(1, 2);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(next.title);
  });

  it("menelusuri malam berikutnya dengan tombol panah", async () => {
    const next = { ...bar, key: "2026-10-06", label: "6", title: "Sel, 6 Okt: Rp 30.000 dari 60 rumah" };
    await act(async () => root.render(<BarChart bars={[bar, next]} caption="Jimpitan per malam" />));
    const chart = container.querySelector<SVGSVGElement>(".recharts-surface")!;
    await act(async () => chart.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);
    await act(async () => chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(next.title);
  });
});
