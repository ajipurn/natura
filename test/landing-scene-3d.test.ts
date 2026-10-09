// @vitest-environment happy-dom
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLandingScene } from "@/apps/landing/landing-scene-3d";

type Frame = (time: number) => void;
type FakeRenderer = {
  domElement: HTMLCanvasElement;
  loop: Frame | null;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  failWebGL: false,
  renderers: [] as FakeRenderer[],
  parse: vi.fn(),
}));
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
}));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class { parseAsync = mocks.parse; },
}));

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
  setReduced(reduced: boolean) {
    this.matches = reduced;
    this.dispatchEvent(new Event("change"));
  }
}

let container: HTMLDivElement;
let motion: MotionPreference;
let hidden: boolean;
let dispose: (() => void) | undefined;
const fetchMock = vi.fn<typeof fetch>();
const lastRenderer = () => mocks.renderers.at(-1)!;
const scene = () => lastRenderer().render.mock.calls.at(-1)![0] as THREE.Scene;
const trees = () => scene().children.filter((child) => child.name.startsWith("natura-tree-"));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  mocks.failWebGL = false;
  mocks.renderers = [];
  mocks.parse.mockReset();
  ViewObserver.instances = [];
  SizeObserver.instances = [];
  hidden = false;
  motion = new MotionPreference();
  vi.stubGlobal("IntersectionObserver", ViewObserver);
  vi.stubGlobal("ResizeObserver", SizeObserver);
  vi.stubGlobal("fetch", fetchMock.mockReset().mockRejectedValue(new Error("CDN unavailable")));
  vi.spyOn(window, "matchMedia").mockReturnValue(motion as unknown as MediaQueryList);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(384);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await flush();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("adegan 3D landing page", () => {
  it("tetap menyediakan ilustrasi SVG ketika WebGL tidak tersedia", () => {
    mocks.failWebGL = true;
    dispose = mountLandingScene(container);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.dataset.ready).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("menggerakkan pohon dari pangkal dan berhenti saat ilustrasi/tab tidak terlihat", () => {
    dispose = mountLandingScene(container);
    const renderer = lastRenderer();
    expect(renderer.loop).toBeNull();
    ViewObserver.instances[0].show(true);
    const positions = trees().map((tree) => tree.position.clone());
    for (const time of [0, 40, 80, 120, 160]) renderer.loop!(time);
    expect(trees().some((tree) => Math.abs(tree.rotation.z) > 0.001)).toBe(true);
    expect(trees().map((tree) => tree.position)).toEqual(positions);

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

  it("menampilkan 3D diam saat reduced motion aktif, termasuk ketika preferensi berubah", () => {
    motion.matches = true;
    dispose = mountLandingScene(container);
    ViewObserver.instances[0].show(true);
    const renderer = lastRenderer();
    expect(container.dataset.ready).toBe("true");
    expect(renderer.loop).toBeNull();
    motion.setReduced(false);
    for (const time of [0, 40, 80]) renderer.loop!(time);
    motion.setReduced(true);
    expect(renderer.loop).toBeNull();
    expect(trees().every((tree) => tree.rotation.x === 0 && tree.rotation.z === 0)).toBe(true);
  });

  it("menampilkan cadangan ketika context WebGL hilang, lalu kembali setelah pulih", () => {
    dispose = mountLandingScene(container);
    ViewObserver.instances[0].show(true);
    const renderer = lastRenderer();
    renderer.domElement.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(container.dataset.ready).toBeUndefined();
    expect(renderer.loop).toBeNull();
    renderer.domElement.dispatchEvent(new Event("webglcontextrestored"));
    expect(container.dataset.ready).toBe("true");
    expect(renderer.loop).toBeTypeOf("function");
  });

  it("mempertahankan rumah dan pohon cadangan ketika CDN Polyfork gagal", async () => {
    dispose = mountLandingScene(container);
    await flush();
    expect(container.dataset.ready).toBe("true");
    expect(container.dataset.treeSource).toBeUndefined();
    expect(trees()).toHaveLength(3);
    expect(trees().every((tree) => tree.children.length > 0)).toBe(true);
  });

  it("memakai model Polyfork gratis dan menjaga ukuran serta pangkal pohon", async () => {
    motion.matches = true;
    const model = new THREE.Group();
    const geometry = new THREE.BoxGeometry(3, 6, 3);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 3;
    model.add(mesh);
    fetchMock.mockResolvedValue(new Response(new ArrayBuffer(8)));
    mocks.parse.mockResolvedValue({ scene: model });
    dispose = mountLandingScene(container);
    await flush();
    expect(container.dataset.treeSource).toBe("polyfork");
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.credentials).toBe("omit");
    for (const tree of trees()) {
      const bounds = new THREE.Box3().setFromObject(tree);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeLessThanOrEqual(2.5);
    }
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    dispose();
    dispose = undefined;
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("menghentikan request dan melepas GPU serta observer setelah halaman ditutup", () => {
    dispose = mountLandingScene(container);
    const renderer = lastRenderer();
    const geometryDisposers = new Map<THREE.BufferGeometry, ReturnType<typeof vi.spyOn>>();
    scene().traverse((child) => {
      if (child instanceof THREE.Mesh && !geometryDisposers.has(child.geometry)) geometryDisposers.set(child.geometry, vi.spyOn(child.geometry, "dispose"));
    });
    ViewObserver.instances[0].show(true);
    dispose();
    dispose = undefined;
    expect(renderer.loop).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(ViewObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(SizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    for (const spy of geometryDisposers.values()) expect(spy).toHaveBeenCalledOnce();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.dataset.ready).toBeUndefined();
    motion.setReduced(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(renderer.loop).toBeNull();
  });

  it("melepas model yang selesai dimuat setelah halaman ditutup", async () => {
    let finishParsing!: (value: { scene: THREE.Group }) => void;
    mocks.parse.mockReturnValue(new Promise((resolve) => { finishParsing = resolve; }));
    fetchMock.mockResolvedValue(new Response(new ArrayBuffer(8)));
    dispose = mountLandingScene(container);
    await flush();
    dispose();
    dispose = undefined;
    const model = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    model.add(new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    finishParsing({ scene: model });
    await flush();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(container.dataset.ready).toBeUndefined();
    expect(container.dataset.treeSource).toBeUndefined();
  });
});
