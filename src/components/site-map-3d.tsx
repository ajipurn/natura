"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { MapSize } from "@/lib/site-map";
import { houseFootprint, toWorld, worldDimensions } from "@/lib/site-map-3d";
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

type SceneApi = { setMarkers: (markers: Record<number, MarkerState>) => void; resetView: () => void };

/**
 * Denah 3D (tampilan tambahan). Memakai posisi rumah yang sama dengan denah 2D;
 * gambar denah (kalau ada) jadi alasnya. Gambar hanya dirender ulang saat ada perubahan.
 */
export default function SiteMap3D({
  houses,
  size,
  imageUrl,
  markers,
  onHouseClick,
  className,
}: {
  houses: HouseDTO[];
  size: MapSize;
  imageUrl: string | null;
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

  // Data snapshot diperbarui berkala; adegan hanya dibangun ulang kalau letak rumah berubah.
  const layoutKey = useMemo(
    () =>
      JSON.stringify(
        houses.filter((h) => h.mapX != null && h.mapY != null).map((h) => [h.id, h.number, h.mapX, h.mapY]),
      ),
    [houses],
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

    // Alas: maket dengan sedikit ketebalan, dilapisi gambar denah kalau ada.
    const dims = worldDimensions({ width: mapWidth, height: mapHeight });
    const maxDim = Math.max(dims.width, dims.depth);
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T) => (disposables.push(item), item);

    const baseGeo = track(new THREE.BoxGeometry(dims.width, 1.5, dims.depth));
    const baseMat = track(new THREE.MeshLambertMaterial({ color: cssColor("--line", "#e2e8f0") }));
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.75;
    scene.add(base);

    const groundGeo = track(new THREE.PlaneGeometry(dims.width, dims.depth));
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = track(new THREE.MeshLambertMaterial({ color: imageUrl ? 0xffffff : cssColor("--card", "#ffffff") }));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = 0.01;
    scene.add(ground);

    let frame = 0;
    let disposed = false;
    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(renderFrame);
    };

    if (imageUrl) {
      new THREE.TextureLoader().load(imageUrl, (texture) => {
        if (disposed) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        track(texture);
        groundMat.map = texture;
        groundMat.needsUpdate = true;
        requestRender();
      });
    } else {
      const grid = new THREE.GridHelper(maxDim, Math.round(maxDim / 4), cssColor("--line", "#e2e8f0"), cssColor("--line", "#e2e8f0"));
      grid.scale.set(dims.width / maxDim, 1, dims.depth / maxDim);
      grid.position.y = 0.02;
      track(grid.geometry);
      track(grid.material as THREE.Material);
      scene.add(grid);
    }

    // Rumah: badan kotak + atap limas. Geometri & material dipakai bersama.
    const placed = housesRef.current.filter((h) => h.mapX != null && h.mapY != null);
    const points = placed.map((h) => toWorld({ x: h.mapX!, y: h.mapY! }, dims));
    const s = houseFootprint(points);
    const bodyGeo = track(new THREE.BoxGeometry(s, s * 0.8, s));
    bodyGeo.translate(0, s * 0.4, 0);
    const roofGeo = track(new THREE.ConeGeometry(s * 0.78, s * 0.55, 4));
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, s * 0.8 + s * 0.275, 0);
    // Rumah kosong/mudik dibuat tembus pandang.
    const material = (color: string, ghost: boolean) =>
      track(new THREE.MeshLambertMaterial({ color, transparent: ghost, opacity: ghost ? 0.45 : 1 }));
    const wallMat = material(WALL_COLOR, false);
    const ghostWallMat = material(WALL_COLOR, true);
    const roofMats = Object.fromEntries(
      Object.entries(ROOF_COLORS).map(([state, color]) => [state, material(color, state === "vacant")]),
    ) as Record<MarkerState, THREE.MeshLambertMaterial>;

    const pickables: THREE.Object3D[] = [];
    const meshes = new Map<number, { body: THREE.Mesh; roof: THREE.Mesh }>();
    const labels: HTMLDivElement[] = [];
    placed.forEach((house, i) => {
      const group = new THREE.Group();
      group.position.set(points[i].x, 0, points[i].z);
      const body = new THREE.Mesh(bodyGeo, wallMat);
      const roof = new THREE.Mesh(roofGeo, roofMats.neutral);
      body.userData.houseId = roof.userData.houseId = house.id;
      group.add(body, roof);
      pickables.push(body, roof);
      meshes.set(house.id, { body, roof });

      const label = document.createElement("div");
      label.textContent = house.number;
      label.dataset.houseId = String(house.id);
      label.setAttribute("aria-hidden", "true");
      label.className =
        "rounded border border-line bg-card/90 px-1 text-[10px] font-bold leading-tight text-fg shadow-sm";
      labels.push(label);
      const labelObject = new CSS2DObject(label);
      labelObject.position.set(0, s * 1.55, 0);
      group.add(labelObject);
      scene.add(group);
    });

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, maxDim * 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.45; // tidak bisa menembus ke bawah tanah
    controls.minDistance = Math.max(4, s * 3);
    controls.maxDistance = maxDim * 2.5;
    controls.screenSpacePanning = false; // geser sejajar tanah

    // Sudut pandang awal: miring dari depan, mundur sampai keempat sudut denah masuk layar.
    const viewDirection = new THREE.Vector3(0, 0.9, 0.45).normalize();
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => new THREE.Vector3((sx * dims.width) / 2, 0, (sz * dims.depth) / 2));
    const fitsOnScreen = () =>
      corners.every((corner) => {
        const p = corner.clone().project(camera);
        return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.9;
      });
    const resetView = () => {
      controls.target.set(0, 0, 0);
      let distance = maxDim * 0.5;
      for (let i = 0; i < 60; i++) {
        camera.position.copy(viewDirection).multiplyScalar(distance);
        camera.lookAt(controls.target);
        camera.updateMatrixWorld();
        if (fitsOnScreen() || distance >= controls.maxDistance) break;
        distance *= 1.06;
      }
      controls.update();
      requestRender();
    };

    function renderFrame() {
      frame = 0;
      controls.update();
      // Ukuran rumah di layar menentukan apakah label nomor ditampilkan.
      const distance = camera.position.distanceTo(controls.target);
      const pixelsPerUnit = renderer.domElement.clientHeight / (2 * distance * Math.tan((camera.fov * Math.PI) / 360));
      labelRenderer.domElement.style.visibility = s * pixelsPerUnit >= MIN_LABEL_PX ? "visible" : "hidden";
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
    // houses dibaca lewat ref; layoutKey mewakili perubahan letak rumah.
  }, [layoutKey, mapWidth, mapHeight, imageUrl]);

  useEffect(() => {
    apiRef.current?.setMarkers(markers);
  }, [markers]);

  const placedCount = houses.filter((h) => h.mapX != null && h.mapY != null).length;

  return (
    <div className={cx("overflow-hidden rounded-2xl border border-line bg-card", className)}>
      <div
        ref={containerRef}
        className="relative h-[60vh] min-h-72 w-full"
        role="img"
        aria-label={`Denah 3D, ${placedCount} rumah. Ketuk rumah untuk mencatat.`}
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
