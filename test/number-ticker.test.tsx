// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NumberTicker } from "@/components/number-ticker";
import { formatRupiah } from "@/lib/format";
import { accessibleText } from "./helpers/dom";

let root: Root;
let container: HTMLDivElement;
let reducedMotion = false;
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const originalGetAnimations = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
// happy-dom belum menjalankan WAAPI; Torph tetap dirender sungguhan untuk menguji slot dan a11y.
const animate = vi.fn(() => ({ currentTime: 0, onfinish: null, cancel: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reducedMotion = false;
  animate.mockClear();
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const media = matchMedia(query);
    Object.defineProperty(media, "matches", { get: () => reducedMotion });
    return media;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  for (const [key, descriptor] of [["animate", originalAnimate], ["getAnimations", originalGetAnimations]] as const) {
    if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
    else Reflect.deleteProperty(Element.prototype, key);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(value: number | string) {
  await act(async () => root.render(<NumberTicker value={value} />));
}
function accessibleValue() {
  return accessibleText(container);
}
function visibleValue() {
  return [...container.querySelector("[torph-root]")!.children]
    .filter((node) => !node.hasAttribute("torph-sr") && !node.hasAttribute("torph-exiting"))
    .map((node) => node.textContent).join("").replaceAll("\u00a0", " ");
}

describe("NumberTicker dengan Torph", () => {
  it("menampilkan nol dan satu nilai untuk pembaca layar", async () => {
    await render(formatRupiah(0));
    expect(animate).not.toHaveBeenCalled();
    expect(accessibleValue()).toBe("Rp 0");
    expect(visibleValue()).toBe("Rp 0");
    expect(container.querySelectorAll("[torph-sr]")).toHaveLength(1);
    for (const slot of container.querySelectorAll("[torph-item]")) expect(slot.getAttribute("aria-hidden")).toBe("true");
  });

  it("menampilkan nominal langsung tanpa animasi saat masuk halaman dan pindah kembali", async () => {
    for (let visit = 0; visit < 2; visit++) {
      animate.mockClear();
      await render(formatRupiah(82_500));
      expect(accessibleValue()).toBe("Rp 82.500");
      expect(visibleValue()).toBe("Rp 82.500");
      expect(animate).not.toHaveBeenCalled();
      await act(async () => root.render(null));
    }
  });

  it("menggulir perubahan digit dengan format rupiah, termasuk ribuan, negatif, dan nol", async () => {
    await render(formatRupiah(999));
    const element = container.querySelector("[torph-root]");
    for (const amount of [1_000, -12_500, 0]) {
      animate.mockClear();
      await render(formatRupiah(amount));
      expect(container.querySelector("[torph-root]")).toBe(element);
      expect(accessibleValue()).toBe(formatRupiah(amount));
      expect(visibleValue()).toBe(formatRupiah(amount));
      expect(animate).toHaveBeenCalled();
      expect(container.querySelectorAll("[torph-sr]")).toHaveLength(1);
    }
  });

  it("tidak mengulang animasi ketika render lain tidak mengubah nominal", async () => {
    await render(formatRupiah(1_500));
    animate.mockClear();
    await render(formatRupiah(1_500));
    expect(animate).not.toHaveBeenCalled();
  });

  it("counter tick mempertahankan digit ratusan dan puluhan ketika hanya satuan berubah", async () => {
    await render(102);
    const digits = () => [...container.querySelectorAll('[torph-kind="digit"]:not([torph-exiting])')];
    const before = digits();
    animate.mockClear();
    await render(103);
    const after = digits();
    expect(after.map((digit) => digit.textContent)).toEqual(["1", "0", "3"]);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(animate.mock.contexts).not.toContain(before[0]);
    expect(animate.mock.contexts).not.toContain(before[1]);
    expect(animate).toHaveBeenCalled();
  });

  it("menampilkan nilai terbaru ketika pembaruan cepat saling menyusul", async () => {
    await render(9);
    await render(10);
    await render(8);
    await render(12);
    expect(accessibleValue()).toBe("12");
    expect(visibleValue()).toBe("12");
  });

  it("menggulir digit nominal ringkas dengan satuan rb yang tetap", async () => {
    await render("1,5rb");
    animate.mockClear();
    await render("2rb");
    expect(accessibleValue()).toBe("2rb");
    expect(visibleValue()).toBe("2");
    expect(container.querySelector('[aria-hidden="true"]')?.lastChild?.textContent).toBe("rb");
    expect(animate).toHaveBeenCalled();
  });

  it("memperbarui nilai langsung saat gerakan dikurangi", async () => {
    reducedMotion = true;
    await render(formatRupiah(500));
    await render(formatRupiah(1_500));
    expect(accessibleValue()).toBe("Rp 1.500");
    expect(animate).not.toHaveBeenCalled();
  });

  it("tetap menampilkan nilai di browser tanpa Web Animations API", async () => {
    Reflect.deleteProperty(Element.prototype, "animate");
    await render(formatRupiah(500));
    await render(formatRupiah(1_000));
    expect(container.textContent).toBe("Rp 1.000");
    expect(animate).not.toHaveBeenCalled();
  });
});
