// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLandingScene, type LandingSceneController } from "@/apps/landing/landing-scene-3d";

type Frame = (time: number) => void;
type FakeRenderer = { domElement: HTMLCanvasElement; loop: Frame | null; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn> };
const mocks = vi.hoisted(() => ({ failWebGL: false, renderers: [] as FakeRenderer[], environmentDispose: vi.fn(), pmremDispose: vi.fn(), roomDispose: vi.fn() }));
vi.mock("three", async (importOriginal) => ({
  ...await importOriginal<typeof import("three")>(),
  WebGLRenderer: class {
    domElement = document.createElement("canvas");
    loop: Frame | null = null;
    shadowMap = {};
    render = vi.fn();
    dispose = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    setClearColor = vi.fn();
    constructor() {
      if (mocks.failWebGL) throw new Error("WebGL unavailable");
      mocks.renderers.push(this);
    }
    setAnimationLoop(loop: Frame | null) { this.loop = loop; }
  },
  PMREMGenerator: class {
    fromScene() { return { texture: {}, dispose: mocks.environmentDispose }; }
    dispose = mocks.pmremDispose;
  },
}));
vi.mock("three/addons/environments/RoomEnvironment.js", () => ({ RoomEnvironment: class { dispose = mocks.roomDispose; } }));
class ViewObserver {
  static instances: ViewObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(private callback: IntersectionObserverCallback) { ViewObserver.instances.push(this); }
  show(visible: boolean) { this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
class SizeObserver {
  static instances: SizeObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor() { SizeObserver.instances.push(this); }
}
class MotionPreference extends EventTarget {
  matches = false;
  setReduced(reduced: boolean) { this.matches = reduced; this.dispatchEvent(new Event("change")); }
}
let container: HTMLDivElement;
let motion: MotionPreference;
let hidden: boolean;
let controller: LandingSceneController | undefined;
const fetchMock = vi.fn();
const lastRenderer = () => mocks.renderers.at(-1)!;
const scene = () => lastRenderer().render.mock.calls.at(-1)![0] as THREE.Scene;
const model = () => scene().getObjectByName("natura-maquette")!;

beforeEach(() => {
  mocks.failWebGL = false;
  mocks.renderers = [];
  mocks.environmentDispose.mockClear();
  mocks.pmremDispose.mockClear();
  mocks.roomDispose.mockClear();
  ViewObserver.instances = [];
  SizeObserver.instances = [];
  hidden = false;
  motion = new MotionPreference();
  vi.stubGlobal("IntersectionObserver", ViewObserver);
  vi.stubGlobal("ResizeObserver", SizeObserver);
  vi.stubGlobal("fetch", fetchMock.mockClear());
  vi.spyOn(window, "matchMedia").mockReturnValue(motion as unknown as MediaQueryList);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1280);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(560);
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("maket Three.js landing Natura", () => {
  it("mempertahankan fallback jika WebGL tidak tersedia dan tidak mengunduh model atau gambar", () => {
    mocks.failWebGL = true;
    controller = mountLandingScene(container);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.dataset.ready).toBeUndefined();
    controller.setProgress(0.5);
    controller.setPaused(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("merender geometri lokal dan menghentikan frame saat keluar layar atau tab tersembunyi", () => {
    controller = mountLandingScene(container);
    const renderer = lastRenderer();
    expect(container.dataset.ready).toBe("true");
    expect(model().children.filter((child) => child.name === "natura-house")).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderer.loop).toBeNull();
    ViewObserver.instances[0].show(true);
    const initial = model().rotation.y;
    for (const time of [0, 40, 80, 120, 160]) renderer.loop!(time);
    expect(model().rotation.y).not.toBe(initial);
    ViewObserver.instances[0].show(false);
    expect(renderer.loop).toBeNull();
    ViewObserver.instances[0].show(true);
    expect(renderer.loop).toBeTypeOf("function");
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(renderer.loop).toBeNull();
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(renderer.loop).toBeTypeOf("function");
  });
  it("mengikuti progress scroll dan membekukan adegan saat dijeda", () => {
    controller = mountLandingScene(container);
    ViewObserver.instances[0].show(true);
    controller.setProgress(0.5);
    expect(model().rotation.y).toBeCloseTo(0.02);
    controller.setPaused(true);
    const frozen = model().rotation.y;
    controller.setProgress(1);
    expect(model().rotation.y).toBe(frozen);
    expect(lastRenderer().loop).toBeNull();
    controller.setPaused(false);
    controller.setProgress(2);
    expect(model().rotation.y).toBeCloseTo(0.26);
    expect(lastRenderer().loop).toBeTypeOf("function");
  });
  it("menyediakan render statis sejak awal dan saat preferensi reduced motion berubah", () => {
    motion.matches = true;
    controller = mountLandingScene(container);
    ViewObserver.instances[0].show(true);
    expect(container.dataset.ready).toBe("true");
    expect(lastRenderer().loop).toBeNull();
    controller.setProgress(1);
    expect(model().rotation.y).toBe(-0.22);
    motion.setReduced(false);
    expect(lastRenderer().loop).toBeTypeOf("function");
    motion.setReduced(true);
    expect(lastRenderer().loop).toBeNull();
    expect(model().position.y).toBe(0);
  });
  it("mempertahankan pilihan jeda awal ketika preferensi sistem kembali normal", () => {
    controller = mountLandingScene(container, true);
    ViewObserver.instances[0].show(true);
    motion.setReduced(true);
    motion.setReduced(false);
    expect(lastRenderer().loop).toBeNull();
    controller.setPaused(false);
    expect(lastRenderer().loop).toBeTypeOf("function");
  });
  it("mengembalikan fallback pada context loss dan pulih tanpa renderer tambahan", () => {
    controller = mountLandingScene(container);
    ViewObserver.instances[0].show(true);
    const renderer = lastRenderer();
    renderer.domElement.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(container.dataset.ready).toBeUndefined();
    expect(renderer.loop).toBeNull();
    renderer.domElement.dispatchEvent(new Event("webglcontextrestored"));
    expect(container.dataset.ready).toBe("true");
    expect(renderer.loop).toBeTypeOf("function");
    expect(mocks.renderers).toHaveLength(1);
  });
  it("melepas geometri, material, environment, observer, dan canvas tepat sekali", () => {
    controller = mountLandingScene(container);
    const renderer = lastRenderer();
    const disposers = new Map<Resource, ReturnType<typeof vi.spyOn>>();
    type Resource = THREE.BufferGeometry | THREE.Material;
    scene().traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const resource of [child.geometry, ...materials]) if (!disposers.has(resource)) disposers.set(resource, vi.spyOn(resource, "dispose"));
    });
    ViewObserver.instances[0].show(true);
    controller.dispose();
    controller.dispose();
    expect(renderer.loop).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(mocks.environmentDispose).toHaveBeenCalledOnce();
    expect(mocks.pmremDispose).toHaveBeenCalledOnce();
    expect(mocks.roomDispose).toHaveBeenCalledOnce();
    for (const spy of disposers.values()) expect(spy).toHaveBeenCalledOnce();
    expect(ViewObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(SizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.dataset.ready).toBeUndefined();
    controller.setPaused(false);
    motion.setReduced(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(renderer.loop).toBeNull();
  });
});
