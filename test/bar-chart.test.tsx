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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function hover(trigger: HTMLElement) {
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

describe("informasi pada chart jimpitan", () => {
  it("menampilkan tanggal, nominal, dan jumlah rumah ketika batang dihover", async () => {
    await act(async () => root.render(<BarChart bars={[bar]} caption="Jimpitan per malam" />));
    const trigger = [...container.querySelectorAll<HTMLElement>("[title], [aria-label]")]
      .find((element) => element.title === bar.title || element.getAttribute("aria-label") === bar.title)!;
    expect(trigger).toBeDefined();

    await hover(trigger);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);
  });

  it("membuka informasi lewat fokus keyboard dan menutupnya dengan Escape", async () => {
    await act(async () => root.render(<BarChart bars={[bar]} caption="Jimpitan per malam" />));
    const trigger = container.querySelector("button")!;
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      trigger.focus();
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(bar.title);

    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="tooltip"][data-open]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each<Bar>([
    { key: "2026-10-07", label: "7", value: 0, title: "Rab, 7 Okt: tidak ada catatan ronda" },
    { key: "2026-10-08", label: "8", value: 0, title: "Kam, 8 Okt: belum tiba", blank: true },
  ])("tetap memberi keterangan untuk $title", async (night) => {
    await act(async () => root.render(<BarChart bars={[night]} caption="Jimpitan per malam" />));
    await hover(container.querySelector("button")!);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(night.title);
  });

  it("mengganti informasi ketika berpindah ke batang lain", async () => {
    const next = { key: "2026-10-06", label: "6", value: 24500, title: "Sel, 6 Okt: Rp 24.500 dari 49 rumah" };
    await act(async () => root.render(<BarChart bars={[bar, next]} caption="Jimpitan per malam" />));
    const triggers = container.querySelectorAll("button");
    await hover(triggers[0]);
    expect(document.querySelector('[role="tooltip"][data-open]')?.textContent).toBe(bar.title);
    await hover(triggers[1]);
    expect(document.querySelectorAll('[role="tooltip"][data-open]')).toHaveLength(1);
    expect(document.querySelector('[role="tooltip"][data-open]')?.textContent).toBe(next.title);
  });
});
