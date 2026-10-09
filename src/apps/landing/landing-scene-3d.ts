import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Aset gratis, tanpa akun atau kunci API. Lisensi: https://polyfork.dev/licensing
const TREE_URL = "https://polyfork.dev/cdn/ornamental-front-yard-tree-c6781a.glb";
type Resource = { dispose: () => void };
type WindTree = { root: THREE.Group; crown?: THREE.Group; phase: number };

/** Adegan dekoratif; kamera tetap dan canvas tidak menangkap interaksi pengguna. */
export function mountLandingScene(container: HTMLDivElement): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const resources = new Set<Resource>();
  const track = <T extends Resource>(resource: T): T => (resources.add(resource), resource);
  const primary = getComputedStyle(container).getPropertyValue("--primary").trim() || "#0f766e";
  const { scene, trees, sun } = buildNeighborhood(primary, track);
  const camera = new THREE.OrthographicCamera(-4.5, 4.5, 3.75, -3.75, 0.1, 40);
  camera.position.set(7, 6, 9);
  camera.lookAt(0, 0.85, 0);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let inView = false;
  let contextLost = false;
  let elapsed = 0;
  let lastFrame: number | null = null;

  const moveTrees = (strength: number) => {
    for (const { root, crown, phase } of trees) {
      root.rotation.z = (Math.sin(elapsed * 0.75 + phase) * 0.028 + Math.sin(elapsed * 1.4 + phase) * 0.008) * strength;
      root.rotation.x = Math.sin(elapsed * 0.6 + phase) * 0.012 * strength;
      if (crown) crown.rotation.z = Math.sin(elapsed * 1.1 + phase + 0.7) * 0.035 * strength;
    }
  };
  const draw = () => {
    if (disposed || contextLost || !container.clientWidth || !container.clientHeight) return;
    renderer.render(scene, camera);
    container.dataset.ready = "true";
  };
  const frame = (time: number) => {
    lastFrame ??= time;
    const delta = time - lastFrame;
    // Dekorasi cukup 30 fps, termasuk pada layar dengan refresh rate tinggi.
    if (delta < 1000 / 30) return;
    lastFrame = time;
    elapsed += Math.min(delta, 80) / 1000;
    moveTrees(1);
    draw();
  };
  const syncMotion = () => {
    lastFrame = null;
    const active = !disposed && !contextLost && inView && !document.hidden && !reduceMotion.matches;
    renderer.setAnimationLoop(active ? frame : null);
    if (reduceMotion.matches) {
      moveTrees(0);
      draw();
    }
  };
  const resize = () => {
    if (disposed || contextLost) return;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const halfHeight = 3.75;
    camera.left = -halfHeight * width / height;
    camera.right = halfHeight * width / height;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    draw();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    syncMotion();
  });
  visibilityObserver.observe(container);
  document.addEventListener("visibilitychange", syncMotion);
  reduceMotion.addEventListener("change", syncMotion);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    delete container.dataset.ready;
    syncMotion();
  };
  const onContextRestored = () => {
    contextLost = false;
    resize();
    syncMotion();
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
  resize();
  syncMotion();

  // Model cadangan sudah dirender; CDN yang lambat/gagal tidak menahan halaman.
  const request = new AbortController();
  const timeout = window.setTimeout(() => request.abort(), 8000);
  void (async () => {
    try {
      const response = await fetch(TREE_URL, { signal: request.signal, credentials: "omit" });
      if (!response.ok) return;
      const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "https://polyfork.dev/cdn/");
      if (disposed) {
        collectResources(asset.scene).forEach((resource) => resource.dispose());
        return;
      }
      const bounds = new THREE.Box3().setFromObject(asset.scene);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) {
        collectResources(asset.scene).forEach((resource) => resource.dispose());
        return;
      }
      collectResources(asset.scene).forEach(track);
      const center = bounds.getCenter(new THREE.Vector3());
      asset.scene.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      asset.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      for (const tree of trees) {
        const height = tree.root.scale.y * 2.5;
        tree.root.clear();
        tree.root.scale.setScalar(1);
        const model = asset.scene.clone(true);
        model.scale.multiplyScalar(Math.min(height / size.y, 1.65 / Math.max(size.x, size.z)));
        tree.root.add(model);
        tree.crown = undefined;
      }
      container.dataset.treeSource = "polyfork";
      moveTrees(reduceMotion.matches ? 0 : 1);
      draw();
    } catch {
      // Polyfork sedang tidak tersedia atau diblokir: model buatan sendiri tetap tampil.
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  return () => {
    disposed = true;
    request.abort();
    window.clearTimeout(timeout);
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", syncMotion);
    reduceMotion.removeEventListener("change", syncMotion);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
    resources.forEach((resource) => resource.dispose());
    sun.shadow.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    delete container.dataset.ready;
    delete container.dataset.treeSource;
  };
}

function collectResources(object: THREE.Object3D): Set<Resource> {
  const resources = new Set<Resource>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    resources.add(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  return resources;
}

function buildNeighborhood(primary: string, track: <T extends Resource>(resource: T) => T) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9cfc6, 1.8));
  const sun = new THREE.DirectionalLight(0xfffaf0, 2.2);
  sun.position.set(-3, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -5;
  sun.shadow.camera.right = sun.shadow.camera.top = 5;
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const tint = (white: number) => new THREE.Color(primary).lerp(new THREE.Color("#ffffff"), white);
  const material = (color: THREE.ColorRepresentation) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  const walls = material("#fafaf5");
  const roof = material(primary);
  const windows = material(tint(0.25));
  const paving = material("#e5eae6");
  const ground = material("#cbdccd");
  const soil = material("#acc4ac");
  const bark = material("#979581");
  const leaves = [material(tint(0.05)), material(tint(0.15)), material(tint(0.22))];
  const cube = track(new THREE.BoxGeometry(1, 1, 1));
  const foliage = track(new THREE.IcosahedronGeometry(1, 1));
  const trunk = track(new THREE.CylinderGeometry(0.065, 0.095, 1.2, 8));

  const box = (parent: THREE.Object3D, mat: THREE.Material, size: [number, number, number], position: [number, number, number]) => {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const outline = new THREE.Shape();
  outline.moveTo(-2.7, -2.1);
  outline.lineTo(2.7, -2.1);
  outline.quadraticCurveTo(3.2, -2.1, 3.2, -1.6);
  outline.lineTo(3.2, 1.6);
  outline.quadraticCurveTo(3.2, 2.1, 2.7, 2.1);
  outline.lineTo(-2.7, 2.1);
  outline.quadraticCurveTo(-3.2, 2.1, -3.2, 1.6);
  outline.lineTo(-3.2, -1.6);
  outline.quadraticCurveTo(-3.2, -2.1, -2.7, -2.1);
  const base = new THREE.Mesh(track(new THREE.ExtrudeGeometry(outline, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.045, bevelSegments: 2 })), soil);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.22;
  base.receiveShadow = true;
  scene.add(base);
  const lawn = new THREE.Mesh(track(new THREE.ShapeGeometry(outline)), ground);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.006;
  lawn.receiveShadow = true;
  scene.add(lawn);
  box(scene, paving, [5.7, 0.035, 0.45], [0, 0.025, 1.28]);

  const house = (x: number, z: number, scale: number) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    scene.add(group);

    const face = new THREE.Shape();
    face.moveTo(-0.85, 0);
    face.lineTo(0.85, 0);
    face.lineTo(0.85, 1.22);
    face.lineTo(0, 1.87);
    face.lineTo(-0.85, 1.22);
    face.closePath();
    const body = new THREE.Mesh(track(new THREE.ExtrudeGeometry(face, { depth: 1.45, bevelEnabled: false })), walls);
    body.position.z = -0.725;
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    for (const direction of [-1, 1]) {
      const panel = box(group, roof, [1.17, 0.085, 1.68], [direction * 0.44, 1.55, 0]);
      panel.rotation.z = -direction * Math.atan2(0.65, 0.85);
    }

    box(group, windows, [0.32, 0.66, 0.035], [0, 0.35, 0.745]);
    box(group, paving, [0.58, 0.07, 0.42], [0, 0.035, 0.92]);
    for (const windowX of [-0.53, 0.53]) {
      box(group, windows, [0.36, 0.36, 0.035], [windowX, 0.84, 0.745]);
      box(group, walls, [0.026, 0.38, 0.045], [windowX, 0.84, 0.77]);
      box(group, walls, [0.38, 0.026, 0.045], [windowX, 0.84, 0.77]);
    }
    box(group, windows, [0.035, 0.38, 0.42], [0.87, 0.79, 0.04]);
    box(group, walls, [0.045, 0.4, 0.026], [0.89, 0.79, 0.04]);
    for (const pathZ of [0.65, 0.92]) box(scene, paving, [0.42, 0.025, 0.2], [x, 0.026, pathZ]);
  };
  house(-0.95, -0.5, 1);
  house(1.15, -0.48, 0.8);

  const trees: WindTree[] = [];
  const tree = (x: number, z: number, scale: number, phase: number) => {
    const root = new THREE.Group();
    root.name = `natura-tree-${trees.length}`;
    root.position.set(x, 0, z);
    root.scale.setScalar(scale);
    const stem = new THREE.Mesh(trunk, bark);
    stem.position.y = 0.6;
    stem.castShadow = true;
    root.add(stem);
    const crown = new THREE.Group();
    crown.position.y = 1.07;
    root.add(crown);
    [[0, 0.65, 0, 0.64, 0.87, 0.61], [-0.32, 0.48, 0.1, 0.46, 0.6, 0.5], [0.3, 0.5, -0.08, 0.45, 0.58, 0.49]].forEach((part, index) => {
      const leaf = new THREE.Mesh(foliage, leaves[index]);
      leaf.position.set(part[0], part[1], part[2]);
      leaf.scale.set(part[3], part[4], part[5]);
      leaf.castShadow = true;
      crown.add(leaf);
    });
    scene.add(root);
    trees.push({ root, crown, phase });
  };
  tree(-2.45, -0.12, 1, 0);
  tree(2.45, 0.18, 0.86, 1.7);
  tree(0.65, -1.55, 0.88, 3.2);

  for (const [x, z, scale] of [[-1.7, 0.45, 0.22], [-1.4, 0.5, 0.26], [1.8, 0.3, 0.23], [2.2, -1.3, 0.26], [-2.6, 1.3, 0.2]]) {
    const shrub = new THREE.Mesh(foliage, leaves[2]);
    shrub.position.set(x, scale * 0.7, z);
    shrub.scale.set(scale, scale * 0.8, scale);
    shrub.castShadow = true;
    scene.add(shrub);
  }
  return { scene, trees, sun };
}
