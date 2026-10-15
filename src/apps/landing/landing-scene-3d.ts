import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type Resource = { dispose: () => void };
export type LandingSceneController = {
  setPaused: (paused: boolean) => void;
  setProgress: (progress: number) => void;
  dispose: () => void;
};

/** Maket dekoratif, seluruhnya geometri. Tidak mengambil gambar atau model dari jaringan. */
export function mountLandingScene(container: HTMLDivElement, initiallyPaused = false): LandingSceneController {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return { setPaused() {}, setProgress() {}, dispose() {} };
  }
  const resources = new Set<Resource>();
  const track = <T extends Resource>(resource: T): T => (resources.add(resource), resource);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = track(pmrem.fromScene(room, 0.04));
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  const model = buildMaquette(track);
  scene.add(model);
  const sun = new THREE.DirectionalLight(0xfff1db, 2.5);
  sun.position.set(-5, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.1, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, new THREE.HemisphereLight(0xecefe8, 0x9c9788, 1));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(30, 30)), track(new THREE.ShadowMaterial({ opacity: 0.13 })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.42;
  shadow.receiveShadow = true;
  scene.add(shadow);
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 60);
  camera.position.set(12, 12, 16);

  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = initiallyPaused;
  let disposed = false;
  let inView = false;
  let contextLost = false;
  let progress = 0;
  let elapsed = 0;
  let lastFrame: number | null = null;
  const pose = () => {
    const still = paused || preference.matches;
    model.rotation.y = -0.22 + progress * 0.48 + (still ? 0 : Math.sin(elapsed * 0.18) * 0.055);
    model.position.y = still ? 0 : Math.sin(elapsed * 0.65) * 0.045;
  };
  const draw = () => {
    if (disposed || contextLost || !container.clientWidth || !container.clientHeight) return;
    pose();
    renderer.render(scene, camera);
    container.dataset.ready = "true";
  };
  const frame = (time: number) => {
    lastFrame ??= time;
    const delta = time - lastFrame;
    if (delta < 1000 / 30) return;
    lastFrame = time;
    elapsed += Math.min(delta, 80) / 1000;
    draw();
  };
  const syncMotion = () => {
    lastFrame = null;
    const active = !disposed && !contextLost && inView && !document.hidden && !paused && !preference.matches;
    renderer.setAnimationLoop(active ? frame : null);
    if (inView && !document.hidden) draw();
  };
  const resize = () => {
    if (disposed || contextLost) return;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const aspect = width / height;
    const narrow = window.innerWidth <= 1050;
    const halfHeight = narrow ? Math.max(4.8, 5.8 / aspect) : 5.25;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.lookAt(narrow ? 0 : -3.2, 0.8, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    draw();
  };
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(container);
  const viewObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    syncMotion();
  });
  viewObserver.observe(container);
  document.addEventListener("visibilitychange", syncMotion);
  preference.addEventListener("change", syncMotion);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    delete container.dataset.ready;
    syncMotion();
  };
  const onContextRestored = () => {
    if (disposed) return;
    contextLost = false;
    resize();
    syncMotion();
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
  resize();
  return {
    setPaused(value) {
      if (disposed) return;
      paused = value;
      syncMotion();
    },
    setProgress(value) {
      if (disposed || paused || preference.matches) return;
      progress = THREE.MathUtils.clamp(value, 0, 1);
      if (inView && !document.hidden) draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", syncMotion);
      preference.removeEventListener("change", syncMotion);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      sun.shadow.map?.dispose();
      for (const resource of resources) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      delete container.dataset.ready;
    },
  };
}

function buildMaquette(track: <T extends Resource>(resource: T) => T): THREE.Group {
  const model = new THREE.Group();
  model.name = "natura-maquette";
  const material = (color: string, roughness = 0.8, metalness = 0) => track(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const stone = material("#e4ddce");
  const wall = material("#f1eadf", 0.72);
  const roof = material("#4e5c46", 0.56);
  const wood = material("#9c7c57", 0.65);
  const glass = material("#657a71", 0.22, 0.35);
  const path = material("#c7bcaa");
  const grass = material("#a1aa87");
  const leaves = [material("#4c6147"), material("#687451"), material("#87906a")];
  const mesh = (geometry: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Group = model) => {
    const object = new THREE.Mesh(track(geometry), surface);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, surface: THREE.Material, parent = model) => mesh(new RoundedBoxGeometry(w, h, d, 2, 0.035), surface, parent);

  const plinthShape = new THREE.Shape();
  const w = 4.75, d = 3.45, r = 0.55;
  plinthShape.moveTo(-w + r, -d);
  plinthShape.lineTo(w - r, -d);
  plinthShape.quadraticCurveTo(w, -d, w, -d + r);
  plinthShape.lineTo(w, d - r);
  plinthShape.quadraticCurveTo(w, d, w - r, d);
  plinthShape.lineTo(-w + r, d);
  plinthShape.quadraticCurveTo(-w, d, -w, d - r);
  plinthShape.lineTo(-w, -d + r);
  plinthShape.quadraticCurveTo(-w, -d, -w + r, -d);
  const plinth = mesh(new THREE.ExtrudeGeometry(plinthShape, { depth: 0.22, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.06, bevelThickness: 0.055 }), stone);
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.y = -0.26;
  box(8.4, 0.03, 0.65, path).position.set(0, 0.03, 0);
  box(0.65, 0.03, 5.65, path).position.set(0, 0.035, 0);

  const archShape = new THREE.Shape();
  archShape.moveTo(-1.15, 0);
  archShape.lineTo(-1.15, 1.25);
  archShape.absarc(0, 1.25, 1.15, Math.PI, 0, true);
  archShape.lineTo(1.15, 0);
  archShape.lineTo(0.91, 0);
  archShape.lineTo(0.91, 1.25);
  archShape.absarc(0, 1.25, 0.91, 0, Math.PI, false);
  archShape.lineTo(-0.91, 0);
  archShape.closePath();
  const archGeometry = track(new THREE.ExtrudeGeometry(archShape, { depth: 0.23, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 32 }));
  for (const z of [-0.72, 0, 0.72]) {
    const arch = new THREE.Mesh(archGeometry, wall);
    arch.position.set(0, 0.09, z - 0.115);
    arch.castShadow = true;
    arch.receiveShadow = true;
    model.add(arch);
  }
  box(2.65, 0.08, 2.55, stone).position.set(0, 0.04, 0);
  box(1.6, 0.12, 0.36, wood).position.set(0, 0.18, 0.68);
  for (const x of [-0.63, 0.63]) box(0.08, 0.23, 0.3, stone).position.set(x, 0.1, 0.68);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.92, 0);
  roofShape.lineTo(0, 0.62);
  roofShape.lineTo(0.92, 0);
  roofShape.lineTo(0.8, -0.11);
  roofShape.lineTo(0, 0.42);
  roofShape.lineTo(-0.8, -0.11);
  roofShape.closePath();
  const roofGeometry = track(new THREE.ExtrudeGeometry(roofShape, { depth: 1.83, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 1, steps: 1 }));
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-0.8, 0);
  gableShape.lineTo(0, 0.42);
  gableShape.lineTo(0.8, 0);
  gableShape.closePath();
  const gableGeometry = track(new THREE.ExtrudeGeometry(gableShape, { depth: 1.6, bevelEnabled: false, steps: 1 }));
  for (const [x, z, angle] of [[-2.9, -1.75, 0.2], [2.9, -1.75, -0.2], [-2.9, 1.75, Math.PI - 0.2], [2.9, 1.75, Math.PI + 0.2]]) {
    const house = new THREE.Group();
    house.name = "natura-house";
    house.position.set(x, 0.07, z);
    house.rotation.y = angle;
    model.add(house);
    box(1.6, 1.06, 1.6, wall, house).position.y = 0.56;
    const gable = new THREE.Mesh(gableGeometry, wall);
    gable.position.set(0, 1.1, -0.8);
    gable.castShadow = true;
    house.add(gable);
    const top = new THREE.Mesh(roofGeometry, roof);
    top.position.set(0, 1.1, -0.915);
    top.castShadow = true;
    top.receiveShadow = true;
    house.add(top);
    box(0.65, 0.65, 0.045, glass, house).position.set(-0.25, 0.6, 0.812);
    box(0.37, 0.87, 0.06, wood, house).position.set(0.46, 0.48, 0.82);
    for (let i = 0; i < 5; i++) box(0.025, 0.92, 0.065, stone, house).position.set(0.305 + i * 0.073, 0.5, 0.853);
    box(0.045, 0.63, 0.06, wall, house).position.set(-0.25, 0.6, 0.84);
    box(0.65, 0.035, 0.06, wall, house).position.set(-0.25, 0.65, 0.84);
    box(0.8, 0.11, 0.37, stone, house).position.set(0.4, 0.06, 1.04);
    box(0.045, 0.6, 0.66, glass, house).position.set(0.812, 0.65, 0);
  }
  const trunkGeometry = track(new THREE.CylinderGeometry(0.055, 0.075, 0.95, 7));
  const crownGeometry = track(new THREE.IcosahedronGeometry(0.58, 2));
  const locations = [[-4, -2.6, 1], [4, -2.6, 1.1], [-4, 0, 1.15], [4.1, 0.1, 0.92], [-4, 2.6, 1], [4, 2.5, 1.15], [-1.3, -2.45, 0.78], [1.3, 2.55, 0.82]];
  locations.forEach(([x, z, scale], i) => {
    const tree = new THREE.Group();
    tree.position.set(x, 0.05, z);
    tree.scale.setScalar(scale);
    model.add(tree);
    const trunk = new THREE.Mesh(trunkGeometry, wood);
    trunk.position.y = 0.52;
    trunk.castShadow = true;
    tree.add(trunk);
    for (const [dx, dy, dz, size] of [[0, 1.15, 0, 1], [-0.25, 0.97, 0.1, 0.72], [0.23, 1.03, -0.14, 0.8]]) {
      const crown = new THREE.Mesh(crownGeometry, leaves[i % leaves.length]);
      crown.position.set(dx, dy, dz);
      crown.scale.set(size, size * 1.15, size);
      crown.rotation.set(i * 0.6, i * 0.8, i * 0.2);
      crown.castShadow = true;
      crown.receiveShadow = true;
      tree.add(crown);
    }
    const bed = new THREE.Mesh(track(new THREE.CylinderGeometry(0.6, 0.6, 0.025, 32)), grass);
    bed.position.set(x, 0.035, z);
    bed.receiveShadow = true;
    model.add(bed);
  });
  for (const x of [-1.4, 1.4]) {
    box(0.28, 0.23, 1.6, grass).position.set(x, 0.13, 0);
    box(0.38, 0.07, 1.75, stone).position.set(x, 0.03, 0);
  }
  return model;
}
