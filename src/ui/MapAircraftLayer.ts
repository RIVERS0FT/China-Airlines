import {
  Box3, BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, InstancedMesh, Material,
  Matrix4, Mesh, MeshBasicMaterial, Object3D, OrthographicCamera, Scene, SphereGeometry,
  Texture, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GameState } from '../core/game.js';
import type { GlobeCamera } from './globe-geometry.js';
import { aircraftFrame, projectAircraftFrame } from './globe-aircraft-pose.js';

export interface AircraftModelOptions {
  /** Local, self-contained GLB, supplied by the asset intake step. */
  url: string;
  /** Rotation measured from the actual asset: normalize to +Z nose / +Y roof. */
  rotation: readonly [number, number, number];
  hiddenNodes?: readonly string[];
}

interface Part { geometry: BufferGeometry; material: Material | Material[] }
export interface AircraftMarker { id: string; x: number; y: number; visible: boolean }

export const AIRLINER_A = {
  file: 'low-poly-airliner.glb',
  rotation: [0, 0, 0],
  // GLTFLoader sanitizes the source node names Cylinder.001 / .002 / .003.
  hiddenNodes: ['Cylinder001', 'Cylinder002', 'Cylinder003'],
} as const;

/** Per-layer ownership: instances share the loaded model; teardown frees it once. */
export function disposeAircraftModel(model: Object3D) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    material.dispose();
  }
  const images = new Set<unknown>();
  for (const texture of textures) {
    for (const image of Array.isArray(texture.source.data) ? texture.source.data : [texture.source.data]) images.add(image);
    texture.dispose();
  }
  for (const image of images) if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
  for (const geometry of geometries) geometry.dispose();
}

/** Flatten rigid glTF parts once, preserving material groups and vertex normals. */
export function prepareAircraftModel(model: Group, options: Pick<AircraftModelOptions, 'rotation' | 'hiddenNodes'>): Part[] {
  const root = new Group(); root.rotation.set(...options.rotation); root.add(model);
  const hidden = new Set(options.hiddenNodes ?? []);
  model.traverse(node => { if (hidden.has(node.name)) node.visible = false; });
  root.updateMatrixWorld(true);
  const parts: Part[] = [], bounds = new Box3();
  try {
    root.traverseVisible(node => {
      if (!(node instanceof Mesh)) return;
      if ('isSkinnedMesh' in node || node.morphTargetInfluences?.length) throw new Error('Map aircraft must be a rigid mesh');
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!);
      parts.push({ geometry, material: node.material });
    });
  } catch (error) { for (const part of parts) part.geometry.dispose(); throw error; }
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
  if (!parts.length || !Number.isFinite(size.z) || size.z <= 1e-8) {
    for (const part of parts) part.geometry.dispose();
    throw new Error('Map aircraft has no usable length');
  }
  for (const part of parts) {
    part.geometry.translate(-center.x, -center.y, -center.z).scale(1 / size.z, 1 / size.z, 1 / size.z);
    part.geometry.computeBoundingSphere();
  }
  return parts;
}

/** Transparent sibling canvas; MapView owns input and calls render only when dirty. */
export class MapAircraftLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly globe = new Mesh(new SphereGeometry(1, 96, 64), new MeshBasicMaterial({ colorWrite: false }));
  private readonly model: Group;
  private readonly parts: Part[];
  private batches: InstancedMesh[] = [];
  private capacity = 0;
  private destroyed = false;

  static async load(options: AircraftModelOptions, signal: AbortSignal): Promise<MapAircraftLayer> {
    const response = await fetch(options.url, { signal });
    if (!response.ok) throw new Error(`Aircraft model HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    // An HTML SPA fallback must not be treated as a valid model.
    if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) throw new Error('Expected aircraft GLB');
    const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', new URL(options.url, location.href)).href);
    if (signal.aborted) { disposeAircraftModel(gltf.scene); throw new DOMException('Aborted', 'AbortError'); }
    try { return new MapAircraftLayer(gltf.scene, options); }
    catch (error) { disposeAircraftModel(gltf.scene); throw error; }
  }

  private constructor(model: Group, options: AircraftModelOptions) {
    this.model = model;
    this.parts = prepareAircraftModel(model, options);
    try { this.renderer = new WebGLRenderer({ alpha: true, antialias: true }); }
    catch (error) { for (const part of this.parts) part.geometry.dispose(); throw error; }
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'map-aircraft-layer'; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.testid = 'map-aircraft-canvas';
    this.canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.renderer.setClearColor(0, 0);
    this.scene.add(new HemisphereLight(0xffffff, 0x617d87, 2));
    const sun = new DirectionalLight(0xfff2d4, 2.2); sun.position.set(-1, 2, 3); this.scene.add(sun);
    this.globe.renderOrder = -1; this.scene.add(this.globe);
  }

  resize(width: number, height: number, resolution: number, globe: GlobeCamera) {
    this.renderer.setPixelRatio(resolution); this.renderer.setSize(width, height);
    this.camera.left = -globe.cx; this.camera.right = width - globe.cx;
    this.camera.top = globe.cy; this.camera.bottom = globe.cy - height;
    this.camera.near = .1; this.camera.far = 40000; this.camera.position.set(0, 0, 20000);
    this.camera.updateProjectionMatrix();
  }

  render(game: GameState, time: number, camera: GlobeCamera, currentId: string | undefined, showOthers: boolean): AircraftMarker[] {
    if (this.destroyed) return [];
    if (game.fleet.length > this.capacity) {
      for (const mesh of this.batches) { this.scene.remove(mesh); mesh.dispose(); }
      this.capacity = Math.max(8, game.fleet.length * 2);
      this.batches = this.parts.map(part => {
        const mesh = new InstancedMesh(part.geometry, part.material, this.capacity);
        mesh.frustumCulled = false; this.scene.add(mesh); return mesh;
      });
    }
    const matrix = new Matrix4(), right = new Vector3(), up = new Vector3(), forward = new Vector3();
    const size = new Vector3(52, 52, 52), selectedColor = new Color(0xfff2d5), ordinaryColor = new Color(0xffffff);
    const markers: AircraftMarker[] = []; let count = 0;
    for (const plane of game.fleet) {
      const frame = projectAircraftFrame(aircraftFrame(plane, time), camera, !plane.flight);
      const visible = frame.visible && (plane.id === currentId || (showOthers && Boolean(plane.flight)));
      markers.push({ id: plane.id, x: camera.cx + frame.position.x, y: camera.cy - frame.position.y, visible });
      if (!visible) continue;
      right.set(frame.right.x, frame.right.y, frame.right.z);
      up.set(frame.up.x, frame.up.y, frame.up.z); forward.set(frame.forward.x, frame.forward.y, frame.forward.z);
      matrix.makeBasis(right, up, forward).scale(size);
      // A small visual clearance keeps the fuselage above the depth-only globe
      // at departure/arrival; the route anchor and hit target remain unchanged.
      const position = new Vector3(frame.position.x, frame.position.y, frame.position.z);
      position.addScaledVector(position.clone().normalize(), 5);
      matrix.setPosition(position);
      for (const mesh of this.batches) {
        mesh.setMatrixAt(count, matrix); mesh.setColorAt(count, plane.id === currentId ? selectedColor : ordinaryColor);
      }
      count++;
    }
    for (const mesh of this.batches) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.globe.scale.setScalar(camera.radius * camera.scale);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.instances = String(count);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    return markers;
  }

  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const mesh of this.batches) mesh.dispose();
    for (const part of this.parts) part.geometry.dispose();
    disposeAircraftModel(this.model); this.globe.geometry.dispose(); this.globe.material.dispose();
    this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove();
  }
}
