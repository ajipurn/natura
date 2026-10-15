// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/apps/landing/landing-page";

const mocks = vi.hoisted(() => ({
  setPaused: vi.fn(),
  setProgress: vi.fn(),
  dispose: vi.fn(),
  mount: vi.fn(),
  revertMedia: vi.fn(),
  revertMotion: vi.fn(),
}));
vi.mock("@/apps/landing/landing-motion", () => ({
  mountLandingMotion: () => mocks.revertMotion,
}));
vi.mock("@/apps/landing/landing-scene-3d", () => ({
  mountLandingScene: mocks.mount,
}));
vi.mock("gsap", () => ({
  gsap: {
    registerPlugin() {},
    matchMedia: () => ({ add() {}, revert: mocks.revertMedia }),
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

class MotionPreference extends EventTarget {
  matches = false;
  setReduced(reduced: boolean) {
    this.matches = reduced;
    this.dispatchEvent(new Event("change"));
  }
}
class ViewObserver {
  static instances: ViewObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) {
    ViewObserver.instances.push(this);
  }
  show(visible: boolean) {
    this.callback(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
let container: HTMLDivElement;
let root: Root;
let motion: MotionPreference;
let unmounted: boolean;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", ViewObserver);
  ViewObserver.instances = [];
  for (const mock of Object.values(mocks)) mock.mockClear();
  mocks.mount.mockReturnValue({
    setPaused: mocks.setPaused,
    setProgress: mocks.setProgress,
    dispose: mocks.dispose,
  });
  motion = new MotionPreference();
  unmounted = false;
  vi.spyOn(window, "matchMedia").mockReturnValue(
    motion as unknown as MediaQueryList,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(<LandingPage />));
const page = () => container.querySelector<HTMLElement>(".landing-page")!;
const toggle = () =>
  container.querySelector<HTMLButtonElement>(".landing-motion-toggle")!;
const loadScene = () =>
  act(async () => {
    ViewObserver.instances[0].show(true);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

describe("landing page dan kontrol motion Natura", () => {
  it("tidak memuat gambar dan meneruskan jeda serta putar ke adegan Three.js", async () => {
    await render();
    expect(container.querySelector("img")).toBeNull();
    expect(page().dataset.motion).toBe("running");
    await loadScene();
    expect(mocks.mount).toHaveBeenCalledWith(
      container.querySelector(".landing-scene__stage"),
      false,
    );
    await act(async () => toggle().click());
    expect(page().dataset.motion).toBe("paused");
    expect(toggle().textContent).toBe("Putar animasi");
    expect(mocks.setPaused).toHaveBeenLastCalledWith(true);
    await act(async () => toggle().click());
    expect(page().dataset.motion).toBe("running");
    expect(mocks.setPaused).toHaveBeenLastCalledWith(false);
  });
  it("mengikuti reduced motion sejak awal dan mempertahankan pilihan jeda warga", async () => {
    motion.matches = true;
    await render();
    await loadScene();
    expect(mocks.mount).toHaveBeenCalledWith(
      container.querySelector(".landing-scene__stage"),
      true,
    );
    expect(toggle().disabled).toBe(true);
    expect(toggle().textContent).toBe("Gerakan dikurangi");
    await act(async () => motion.setReduced(false));
    expect(page().dataset.motion).toBe("running");
    expect(toggle().disabled).toBe(false);
    await act(async () => toggle().click());
    await act(async () => motion.setReduced(true));
    await act(async () => motion.setReduced(false));
    expect(page().dataset.motion).toBe("paused");
    expect(mocks.setPaused).toHaveBeenLastCalledWith(true);
  });
  it("melepas scene, observer, preferensi, dan animasi GSAP saat halaman ditutup", async () => {
    const removePreferenceListener = vi.spyOn(motion, "removeEventListener");
    await render();
    await loadScene();
    await act(async () => root.unmount());
    unmounted = true;
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.revertMedia).toHaveBeenCalledOnce();
    expect(mocks.revertMotion).toHaveBeenCalledOnce();
    expect(ViewObserver.instances[0].disconnect).toHaveBeenCalled();
    expect(removePreferenceListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
  it("membatalkan inisialisasi scene jika modul selesai dimuat setelah unmount", async () => {
    await render();
    await act(async () => {
      ViewObserver.instances[0].show(true);
      root.unmount();
    });
    unmounted = true;
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("menutup menu mobile dengan Escape dan mengembalikan fokus ke pemicunya", async () => {
    await render();
    const menu = container.querySelector<HTMLDetailsElement>(
      ".landing-mobile-nav",
    )!;
    const summary = menu.querySelector("summary")!;
    menu.open = true;
    await act(async () =>
      summary.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
