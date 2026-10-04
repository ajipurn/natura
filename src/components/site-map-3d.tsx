"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { MapSize } from "@/lib/site-map";
import { houseFootprint, planProjection, toWorld, worldDimensions, type WorldPoint } from "@/lib/site-map-3d";
import {
  matchPlan,
  polygonBounds,
  polygonCentroid,
  ribbonPolygon,
  shrinkPolygon,
  type PlanPoint,
  type SitePlan,
} from "@/lib/site-plan";
import type { HouseDTO } from "@/lib/types";
import type { MarkerState } from "./site-map";
import { cx } from "./ui";

/** Warna status ada di atap, karena atap yang paling terlihat dari atas. */
const ROOF_COLORS: Record<MarkerState, string> = {
  filled: "#22c55e",
  empty: "#f43f5e",
  unchecked: "#cbd5e1",
  vacant: "#e2e8f0",
  neutral: "#cbd5e1",
};
const WALL_COLOR = "#f8fafc";
/** Label nomor rumah hanya muncul kalau rumah tampil cukup besar di layar. */
const MIN_LABEL_PX = 16;
/** Geser jari lebih dari ini = memutar kamera, bukan mengetuk rumah. */
const TAP_TOLERANCE_PX = 8;
const HOUSE_LABEL_CLASS = "rounded border border-line bg-card/90 px-1 text-[10px] font-bold leading-tight text-fg shadow-sm";

type SceneApi = { setMarkers: (markers: Record<number, MarkerState>) => void; resetView: () => void };
type HouseMeshes = { body: THREE.Mesh; roof: THREE.Mesh };
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

type BuildContext = {
  scene: THREE.Scene;
  track: <T extends { dispose: () => void }>(item: T) => T;
  cssColor: (name: string, fallback: string) => string;
  houses: HouseDTO[];
  wallMat: THREE.Material;
  neutralRoofMat: THREE.Material;
  /** Label HTML yang menempel pada objek 3D. */
  attachLabel: (el: HTMLElement, parent: THREE.Object3D, position: THREE.Vector3) => void;
  onTextureLoaded: (texture: THREE.Texture) => void;
};

type BuiltScene = {
  meshes: Map<number, HouseMeshes>;
  houseLabels: HTMLElement[];
  bounds: Bounds;
  /** Lebar rumah yang umum (satuan dunia), untuk memutuskan kapan nomor rumah ditampilkan. */
  footprint: number;
};

/**
 * Denah 3D (tampilan tambahan). Dengan denah kode (`plan`), rumah berdiri di atas kavlingnya
 * lengkap dengan jalan, taman, dan saluran. Tanpa itu, rumah memakai posisi penanda denah manual
 * dan gambar denah (kalau ada) jadi alasnya. Gambar hanya dirender ulang saat ada perubahan.
 */
export default function SiteMap3D({
  houses,
  size,
  imageUrl,
  plan,
  markers,
  onHouseClick,
  className,
}: {
  houses: HouseDTO[];
  size: MapSize;
  imageUrl: string | null;
  plan?: SitePlan | null;
  markers: Record<number, MarkerState>;
  onHouseClick?: (house: HouseDTO) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const housesRef = useRef(houses);
  const markersRef = useRef(markers);
  const onHouseClickRef = useRef(onHouseClick);
  const [error, setError] = useState<string | null>(null);
  // Angka, bukan objek: objek ukuran ikut berganti setiap data diperbarui.
  const { width: mapWidth, height: mapHeight } = size;

  useEffect(() => {
    housesRef.current = houses;
    markersRef.current = markers;
    onHouseClickRef.current = onHouseClick;
  });

  // Data snapshot diperbarui berkala; adegan hanya dibangun ulang kalau rumah/letaknya berubah.
  const layoutKey = useMemo(
    () =>
      JSON.stringify(
        plan
          ? houses.map((h) => [h.id, h.block, h.number])
          : houses.filter((h) => h.mapX != null && h.mapY != null).map((h) => [h.id, h.number, h.mapX, h.mapY]),
      ),
    [houses, plan],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL hanya bisa dicek di browser
      setError("HP ini tidak mendukung tampilan 3D. Pakai tampilan Denah atau Daftar.");
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const cssColor = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = "none";
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    Object.assign(labelRenderer.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cssColor("--bg", "#f4f6f8"));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(40, 80, 30);
    scene.add(sun);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T) => (disposables.push(item), item);
    const labels: HTMLElement[] = [];

    let frame = 0;
    let disposed = false;
    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(renderFrame);
    };

    // Rumah kosong/mudik dibuat tembus pandang.
    const material = (color: string, ghost: boolean) =>
      track(
        new THREE.MeshLambertMaterial({
          color,
          transparent: ghost,
          opacity: ghost ? 0.45 : 1,
          side: THREE.DoubleSide,
        }),
      );
    const wallMat = material(WALL_COLOR, false);
    const ghostWallMat = material(WALL_COLOR, true);
    const roofMats = Object.fromEntries(
      Object.entries(ROOF_COLORS).map(([state, color]) => [state, material(color, state === "vacant")]),
    ) as Record<MarkerState, THREE.MeshLambertMaterial>;

    const ctx: BuildContext = {
      scene,
      track,
      cssColor,
      houses: housesRef.current,
      wallMat,
      neutralRoofMat: roofMats.neutral,
      attachLabel: (el, parent, position) => {
        labels.push(el);
        const object = new CSS2DObject(el);
        object.position.copy(position);
        parent.add(object);
      },
      onTextureLoaded: (texture) => {
        if (disposed) return texture.dispose();
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        track(texture);
        requestRender();
      },
    };
    const built = plan ? buildPlanScene(ctx, plan) : buildMarkerScene(ctx, { width: mapWidth, height: mapHeight }, imageUrl);
    const { meshes, houseLabels, bounds, footprint } = built;
    const pickables = [...meshes.values()].flatMap(({ body, roof }) => [body, roof]);
    const maxDim = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, maxDim * 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.45; // tidak bisa menembus ke bawah tanah
    controls.minDistance = Math.max(4, footprint * 3);
    controls.maxDistance = maxDim * 2.5;
    controls.screenSpacePanning = false; // geser sejajar tanah

    // Sudut pandang awal: miring dari depan, mundur sampai keempat sudut denah masuk layar.
    const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    const viewDirection = new THREE.Vector3(0, 0.9, 0.45).normalize();
    const corners = [
      [bounds.minX, bounds.minZ],
      [bounds.maxX, bounds.minZ],
      [bounds.minX, bounds.maxZ],
      [bounds.maxX, bounds.maxZ],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const fitsOnScreen = () =>
      corners.every((corner) => {
        const p = corner.clone().project(camera);
        return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.9;
      });
    const resetView = () => {
      controls.target.copy(center);
      let distance = maxDim * 0.5;
      for (let i = 0; i < 60; i++) {
        camera.position.copy(viewDirection).multiplyScalar(distance).add(center);
        camera.lookAt(controls.target);
        camera.updateMatrixWorld();
        if (fitsOnScreen() || distance >= controls.maxDistance) break;
        distance *= 1.06;
      }
      controls.update();
      requestRender();
    };

    let labelsVisible: boolean | null = null;
    function renderFrame() {
      frame = 0;
      controls.update();
      // Ukuran rumah di layar menentukan apakah nomor rumah ditampilkan.
      const distance = camera.position.distanceTo(controls.target);
      const pixelsPerUnit = renderer.domElement.clientHeight / (2 * distance * Math.tan((camera.fov * Math.PI) / 360));
      const visible = footprint * pixelsPerUnit >= MIN_LABEL_PX;
      if (visible !== labelsVisible) {
        labelsVisible = visible;
        for (const el of houseLabels) el.style.visibility = visible ? "visible" : "hidden";
      }
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    controls.addEventListener("change", requestRender);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Ketuk rumah (bukan geser) → buka lembar catat.
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onPointerUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_TOLERANCE_PX) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const id = raycaster.intersectObjects(pickables, false)[0]?.object.userData.houseId as number | undefined;
      const house = id == null ? undefined : housesRef.current.find((h) => h.id === id);
      if (house) onHouseClickRef.current?.(house);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const setMarkers = (next: Record<number, MarkerState>) => {
      for (const [id, { body, roof }] of meshes) {
        const state = next[id] ?? "neutral";
        roof.material = roofMats[state];
        body.material = state === "vacant" ? ghostWallMat : wallMat;
      }
      requestRender();
    };
    apiRef.current = { setMarkers, resetView };
    setMarkers(markersRef.current);
    resize();
    resetView();

    return () => {
      disposed = true;
      apiRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      labels.forEach((l) => l.remove());
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    };
    // houses dibaca lewat ref; layoutKey mewakili perubahan rumah/letaknya.
  }, [layoutKey, plan, mapWidth, mapHeight, imageUrl]);

  useEffect(() => {
    apiRef.current?.setMarkers(markers);
  }, [markers]);

  const houseCount = plan
    ? matchPlan(plan, houses).lotHouse.size
    : houses.filter((h) => h.mapX != null && h.mapY != null).length;
  // Tinggi bingkai mengikuti bentuk denah (sedikit lebih tinggi untuk sudut pandang miring),
  // supaya denah yang melebar tidak tampil kecil dengan ruang kosong di HP.
  const [aspectW, aspectH] = plan ? [plan.viewBox[2], plan.viewBox[3]] : [mapWidth, mapHeight];

  return (
    <div className={cx("overflow-hidden rounded-2xl border border-line bg-card", className)}>
      <div
        ref={containerRef}
        className="relative max-h-[60vh] min-h-72 w-full"
        style={{ aspectRatio: `${aspectW} / ${Math.round(aspectH * 1.15)}` }}
        role="img"
        aria-label={`Denah 3D, ${houseCount} rumah. Ketuk rumah untuk mencatat.`}
      >
        {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">{error}</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5">
        <p className="text-xs text-muted">Geser untuk memutar · cubit untuk zoom · dua jari untuk menggeser</p>
        <button
          type="button"
          onClick={() => apiRef.current?.resetView()}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line"
          aria-label="Kembalikan sudut pandang"
        >
          <RotateCcw className="size-5" />
        </button>
      </div>
    </div>
  );
}

function houseLabelElement(text: string, houseId: number): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.dataset.houseId = String(houseId);
  el.setAttribute("aria-hidden", "true");
  el.className = HOUSE_LABEL_CLASS;
  return el;
}

/** Denah manual: rumah kotak di posisi penanda, gambar denah (kalau ada) sebagai alas. */
function buildMarkerScene(ctx: BuildContext, size: MapSize, imageUrl: string | null): BuiltScene {
  const { scene, track, cssColor } = ctx;
  const dims = worldDimensions(size);
  const maxDim = Math.max(dims.width, dims.depth);

  const base = new THREE.Mesh(
    track(new THREE.BoxGeometry(dims.width, 1.5, dims.depth)),
    track(new THREE.MeshLambertMaterial({ color: cssColor("--line", "#e2e8f0") })),
  );
  base.position.y = -0.75;
  scene.add(base);

  const groundGeo = track(new THREE.PlaneGeometry(dims.width, dims.depth));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = track(new THREE.MeshLambertMaterial({ color: imageUrl ? 0xffffff : cssColor("--card", "#ffffff") }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = 0.01;
  scene.add(ground);

  if (imageUrl) {
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      groundMat.map = texture;
      groundMat.needsUpdate = true;
      ctx.onTextureLoaded(texture);
    });
  } else {
    const lineColor = cssColor("--line", "#e2e8f0");
    const grid = new THREE.GridHelper(maxDim, Math.round(maxDim / 4), lineColor, lineColor);
    grid.scale.set(dims.width / maxDim, 1, dims.depth / maxDim);
    grid.position.y = 0.02;
    track(grid.geometry);
    track(grid.material as THREE.Material);
    scene.add(grid);
  }

  // Rumah: badan kotak + atap limas. Geometri dipakai bersama.
  const placed = ctx.houses.filter((h) => h.mapX != null && h.mapY != null);
  const points = placed.map((h) => toWorld({ x: h.mapX!, y: h.mapY! }, dims));
  const s = houseFootprint(points);
  const bodyGeo = track(new THREE.BoxGeometry(s, s * 0.8, s));
  bodyGeo.translate(0, s * 0.4, 0);
  const roofGeo = track(new THREE.ConeGeometry(s * 0.78, s * 0.55, 4));
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, s * 0.8 + s * 0.275, 0);

  const meshes = new Map<number, HouseMeshes>();
  const houseLabels: HTMLElement[] = [];
  placed.forEach((house, i) => {
    const group = new THREE.Group();
    group.position.set(points[i].x, 0, points[i].z);
    const body = new THREE.Mesh(bodyGeo, ctx.wallMat);
    const roof = new THREE.Mesh(roofGeo, ctx.neutralRoofMat);
    body.userData.houseId = roof.userData.houseId = house.id;
    group.add(body, roof);
    meshes.set(house.id, { body, roof });
    const label = houseLabelElement(house.number, house.id);
    houseLabels.push(label);
    ctx.attachLabel(label, group, new THREE.Vector3(0, s * 1.55, 0));
    scene.add(group);
  });

  return {
    meshes,
    houseLabels,
    bounds: { minX: -dims.width / 2, maxX: dims.width / 2, minZ: -dims.depth / 2, maxZ: dims.depth / 2 },
    footprint: s,
  };
}

/** Denah kode: maket kawasan, taman, saluran, kavling belum dibangun, dan rumah di atas kavlingnya. */
function buildPlanScene(ctx: BuildContext, plan: SitePlan): BuiltScene {
  const { scene, track, cssColor } = ctx;
  const { scale, toWorld: project } = planProjection(plan.viewBox);
  const world = (points: readonly PlanPoint[]) => points.map(project);

  const shape = (points: WorldPoint[]) => {
    const s = new THREE.Shape();
    points.forEach((p, i) => (i ? s.lineTo(p.x, p.z) : s.moveTo(p.x, p.z)));
    return s;
  };
  // Lempeng setebal `depth` dengan permukaan atas di ketinggian `top`.
  const slab = (points: WorldPoint[], depth: number, top: number, material: THREE.Material) => {
    const geometry = track(new THREE.ExtrudeGeometry(shape(points), { depth, bevelEnabled: false }));
    geometry.rotateX(Math.PI / 2); // bentuk di bidang x–z, tebal ke bawah
    geometry.translate(0, top, 0);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
  };
  const flat = (color: string) => track(new THREE.MeshLambertMaterial({ color }));

  const roadMat = flat(cssColor("--idle-soft", "#e2e8f0"));
  const parkMat = flat(cssColor("--park", "#dcebd3"));
  const waterMat = flat(cssColor("--water", "#93c5e8"));
  const yardMat = flat(cssColor("--card", "#ffffff"));
  const emptyLotMat = flat(cssColor("--line", "#e2e8f0"));

  slab(world(plan.area), 1.5, 0, roadMat);
  for (const green of plan.greens) slab(world(green), 0.3, 0.3, parkMat);
  for (const channel of plan.channels) slab(world(ribbonPolygon(channel.points, channel.width)), 0.1, 0.06, waterMat);

  const { lotHouse } = matchPlan(plan, ctx.houses);
  const meshes = new Map<number, HouseMeshes>();
  const houseLabels: HTMLElement[] = [];
  const sizes: number[] = [];

  for (const lot of plan.lots) {
    const house = lotHouse.get(lot);
    if (!house) {
      // Kavling belum dibangun (dicoret) lebih rendah; kavling berpenghuni yang belum terdaftar sedikit lebih tinggi.
      slab(world(shrinkPolygon(lot.points, 0.92)), 0.3, lot.built ? 0.5 : 0.3, lot.built ? yardMat : emptyLotMat);
      continue;
    }

    const { minX, minY, maxX, maxY } = polygonBounds(lot.points);
    const short = Math.min(maxX - minX, maxY - minY) * scale;
    sizes.push(short);
    const wallHeight = THREE.MathUtils.clamp(short * 0.55, 1.2, 3);
    const rise = THREE.MathUtils.clamp(short * 0.4, 0.8, 2);
    const yard = 0.3;

    slab(world(shrinkPolygon(lot.points, 0.95)), yard, yard, yardMat);
    const body = slab(world(shrinkPolygon(lot.points, 0.78)), wallHeight, yard + wallHeight, ctx.wallMat);
    const roofGeometry = track(hipRoof(world(shrinkPolygon(lot.points, 0.86)), yard + wallHeight, rise));
    const roof = new THREE.Mesh(roofGeometry, ctx.neutralRoofMat);
    scene.add(roof);
    body.userData.houseId = roof.userData.houseId = house.id;
    meshes.set(house.id, { body, roof });

    const center = project(polygonCentroid(lot.points));
    const label = houseLabelElement(lot.label ?? house.number, house.id);
    houseLabels.push(label);
    ctx.attachLabel(label, scene, new THREE.Vector3(center.x, yard + wallHeight + rise + 0.8, center.z));
  }

  // Nama blok selalu terlihat sebagai penunjuk arah.
  for (const blockLabel of plan.labels) {
    const el = document.createElement("div");
    el.textContent = blockLabel.text;
    el.setAttribute("aria-hidden", "true");
    el.className = "text-sm font-black tracking-wide text-muted [text-shadow:0_0_3px_var(--bg)]";
    const at = project(blockLabel.at);
    ctx.attachLabel(el, scene, new THREE.Vector3(at.x, 0.4, at.z));
  }

  const area = world(plan.area);
  sizes.sort((a, b) => a - b);
  return {
    meshes,
    houseLabels,
    bounds: {
      minX: Math.min(...area.map((p) => p.x)),
      maxX: Math.max(...area.map((p) => p.x)),
      minZ: Math.min(...area.map((p) => p.z)),
      maxZ: Math.max(...area.map((p) => p.z)),
    },
    footprint: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 3,
  };
}

/** Atap limas untuk alas poligon apa pun: tiap sisi naik ke puncak di titik tengah. */
function hipRoof(points: WorldPoint[], baseY: number, rise: number): THREE.BufferGeometry {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
  const positions: number[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    positions.push(a.x, baseY, a.z, b.x, baseY, b.z, cx, baseY + rise, cz);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
