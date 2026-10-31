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
  private home: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private anim: {
    t0: number;
    dur: number;
    fromP: THREE.Vector3;
    toP: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
  } | null = null;
  private ray = new THREE.Raycaster();

  private onDblClick = (e: MouseEvent): void => {
    if (!this.content) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.content, true)[0];
    if (!hit) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.max(6, this.camera.position.distanceTo(this.controls.target) * 0.45);
    this.flyTo(hit.point.clone().addScaledVector(dir, dist), hit.point.clone());
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === '+' || e.key === '=') this.dolly(0.8);
    else if (e.key === '-' || e.key === '_') this.dolly(1.25);
    else if (e.key === '0') this.resetView();
  };

  private dolly(factor: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    this.camera.position.copy(this.controls.target).add(off);
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 450): void {
    this.anim = {
      t0: performance.now(),
      dur,
      fromP: this.camera.position.clone(),
      toP: pos,
      fromT: this.controls.target.clone(),
      toT: target,
    };
  }

  /** Left-drag pans instead of rotating (touch users and trackpads without a right button). */
  setPanMode(on: boolean): void {
    this.controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }

  resetView(): void {
    if (this.home) this.flyTo(this.home.pos.clone(), this.home.target.clone());
  }

  /** Zooms to the stone and its setting: the highest quarter of the content. */
  focusHead(): void {
    if (!this.content) return;
    const box = new THREE.Box3().setFromObject(this.content);
    const top = new THREE.Box3(
      new THREE.Vector3(box.min.x, box.max.y - (box.max.y - box.min.y) * 0.28, box.min.z),
      box.max.clone(),
    );
    const c = top.getCenter(new THREE.Vector3());
    const r = top.getSize(new THREE.Vector3()).length() / 2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.05;
    this.flyTo(c.clone().addScaledVector(dir, dist), c);
  }

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
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D preview of the ring. Drag to rotate, scroll to zoom.',
    );

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
    this.controls.minDistance = 3;
    this.controls.maxDistance = 160;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.panSpeed = 1.1;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.keyPanSpeed = 14;
    this.renderer.domElement.tabIndex = 0;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.renderer.domElement.addEventListener('dblclick', this.onDblClick);
    this.renderer.domElement.addEventListener('keydown', this.onKey);
    this.controls.autoRotate = !!opts.autoRotate;
    this.controls.autoRotateSpeed = 1.4;
    this.controls.update();

    (window as unknown as { __ringViewer?: RingViewer }).__ringViewer = this;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.anim) {
        const k = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur);
        const e = k * k * (3 - 2 * k);
        this.camera.position.lerpVectors(this.anim.fromP, this.anim.toP, e);
        this.controls.target.lerpVectors(this.anim.fromT, this.anim.toT, e);
        if (k >= 1) this.anim = null;
      }
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
    const dist = (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 0.9;
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.controls.update();
    this.home = { pos: this.camera.position.clone(), target: c.clone() };
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
    this.renderer.domElement.removeEventListener('dblclick', this.onDblClick);
    this.renderer.domElement.removeEventListener('keydown', this.onKey);
    this.controls.dispose();
    if (this.content) disposeGroup(this.content);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
