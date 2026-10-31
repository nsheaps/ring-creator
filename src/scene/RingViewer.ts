import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeGroup } from '@/geometry/assemble';

export type CameraPreset = '3/4' | 'front' | 'top' | 'side';

const PRESETS: Record<CameraPreset, [number, number, number]> = {
  '3/4': [26, 24, 46],
  front: [0, 6, 62],
  top: [0, 66, 6],
  side: [62, 8, 0],
};

export interface ViewerOptions {
  transparent?: boolean;
  background?: string;
  autoRotate?: boolean;
}

export class RingViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
  readonly controls: OrbitControls;
  private content: THREE.Object3D | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private target = new THREE.Vector3(0, 7, 0);

  constructor(
    private readonly el: HTMLElement,
    opts: ViewerOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(opts.background ?? '#000000', opts.transparent === false ? 1 : 0);
    el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', '3D preview of the ring. Drag to rotate, scroll to zoom.');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(20, 40, 30);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.25));

    this.camera.position.set(...PRESETS['3/4']);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 140;
    this.controls.autoRotate = !!opts.autoRotate;
    this.controls.autoRotateSpeed = 1.4;
    this.controls.update();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize(): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setContent(obj: THREE.Object3D | null, fit = true): void {
    if (this.content) {
      this.scene.remove(this.content);
      disposeGroup(this.content);
    }
    this.content = obj;
    if (obj) {
      this.scene.add(obj);
      if (fit) this.frame(obj);
    }
  }

  /** Frames the camera on the object, keeping the current viewing direction. */
  frame(obj: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 0.95;
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.controls.update();
  }

  setPreset(p: CameraPreset): void {
    const dir = new THREE.Vector3(...PRESETS[p]).normalize();
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  snapshot(type = 'image/png', quality = 0.9): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL(type, quality);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    if (this.content) disposeGroup(this.content);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
