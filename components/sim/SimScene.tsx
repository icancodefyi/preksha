"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { SimData, SimEvent } from "@/lib/graph/simulation";

export interface SimController {
  t: number;
  playing: boolean;
  speed: number;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLabel(
  text: string,
  color: string,
  opts: { pill?: boolean; size?: number; dim?: boolean } = {},
): THREE.Sprite {
  const { pill = false, size = 42, dim = false } = opts;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + (pill ? size * 1.1 : 16);
  canvas.width = w;
  canvas.height = size * 1.9;
  const c2 = canvas.getContext("2d")!;
  c2.font = `600 ${size}px Inter, system-ui, sans-serif`;
  c2.textBaseline = "middle";
  c2.textAlign = "center";
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  if (pill) {
    c2.fillStyle = "rgba(8,10,18,0.82)";
    const r = canvas.height / 2;
    c2.beginPath();
    c2.roundRect(size * 0.25, 2, canvas.width - size * 0.5, canvas.height - 4, r);
    c2.fill();
    c2.strokeStyle = "rgba(255,255,255,0.14)";
    c2.lineWidth = 1;
    c2.stroke();
  }
  c2.fillStyle = dim ? "rgba(255,255,255,0.5)" : color;
  c2.fillText(text, cx, cy + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const hw = canvas.width / canvas.height;
  sprite.scale.set(1.15 * hw, 1.15, 1);
  return sprite;
}

// building facade + emissive "lit windows" mask
function facadeTextures(seed: number, wCells = 5, hCells = 6): { map: THREE.CanvasTexture; emis: THREE.CanvasTexture } {
  const rnd = mulberry32(seed);
  const W = 256;
  const H = 512;
  const cw = W / wCells;
  const ch = H / hCells;

  const wall = document.createElement("canvas");
  wall.width = W;
  wall.height = H;
  const wc = wall.getContext("2d")!;
  wc.fillStyle = "#0e1424";
  wc.fillRect(0, 0, W, H);
  // facade panels
  wc.fillStyle = "#1a2438";
  wc.fillRect(6, 6, W - 12, H - 12);
  // windows
  for (let i = 0; i < wCells; i++) {
    for (let j = 0; j < hCells; j++) {
      const x = 14 + i * cw;
      const y = 16 + j * ch;
      wc.fillStyle = "#0a101f";
      wc.fillRect(x, y, cw - 18, ch - 22);
    }
  }
  // door
  wc.fillStyle = "#05080f";
  wc.fillRect(W / 2 - 12, H - 40, 24, 34);

  const emis = document.createElement("canvas");
  emis.width = W;
  emis.height = H;
  const ec = emis.getContext("2d")!;
  ec.fillStyle = "#000000";
  ec.fillRect(0, 0, W, H);
  for (let i = 0; i < wCells; i++) {
    for (let j = 0; j < hCells; j++) {
      if (rnd() < 0.42) {
        const x = 14 + i * cw;
        const y = 16 + j * ch;
        const warm = rnd() < 0.5 ? "255,190,120" : "170,205,255";
        ec.fillStyle = `rgba(${warm},0.9)`;
        ec.fillRect(x + 2, y + 2, cw - 22, ch - 26);
      }
    }
  }

  const map = new THREE.CanvasTexture(wall);
  const em = new THREE.CanvasTexture(emis);
  map.anisotropy = 4;
  em.anisotropy = 4;
  return { map, emis: em };
}

function storeTextures(): { map: THREE.CanvasTexture; emis: THREE.CanvasTexture } {
  const W = 512;
  const H = 384;
  const wall = document.createElement("canvas");
  wall.width = W;
  wall.height = H;
  const wc = wall.getContext("2d")!;
  wc.fillStyle = "#101624";
  wc.fillRect(0, 0, W, H);
  // storefront band
  wc.fillStyle = "#182136";
  wc.fillRect(0, 0, W, H);
  // big glass windows
  wc.fillStyle = "#0c1a24";
  wc.fillRect(30, 150, 200, 190);
  wc.fillRect(282, 150, 200, 190);
  // door
  wc.fillStyle = "#05080f";
  wc.fillRect(230, 150, 52, 190);
  // awning
  wc.fillStyle = "#7a1626";
  wc.fillRect(10, 120, W - 20, 46);

  const emis = document.createElement("canvas");
  emis.width = W;
  emis.height = H;
  const ec = emis.getContext("2d")!;
  ec.fillStyle = "#000000";
  ec.fillRect(0, 0, W, H);
  // warm glass glow
  ec.fillStyle = "rgba(255,196,120,0.95)";
  ec.fillRect(34, 154, 192, 182);
  ec.fillRect(286, 154, 192, 182);
  // sign
  ec.fillStyle = "rgba(255,214,140,1)";
  ec.fillRect(120, 40, 272, 60);
  ec.fillStyle = "#000000";
  ec.fillRect(126, 46, 260, 48);

  const map = new THREE.CanvasTexture(wall);
  const em = new THREE.CanvasTexture(emis);
  map.anisotropy = 4;
  em.anisotropy = 4;
  return { map, emis: em };
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#080b12";
  g.fillRect(0, 0, 1024, 1024);
  // subtle asphalt noise
  const rnd = mulberry32(7);
  for (let i = 0; i < 6000; i++) {
    const v = 12 + rnd() * 14;
    g.fillStyle = `rgba(${v},${v + 6},${v + 16},0.35)`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 2, 2);
  }
  // city blocks (slightly raised footprints)
  const N = 8;
  const cell = 1024 / N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      g.fillStyle = "rgba(24,32,52,0.55)";
      g.fillRect(i * cell + 18, j * cell + 18, cell - 36, cell - 36);
      g.strokeStyle = "rgba(120,140,190,0.12)";
      g.lineWidth = 3;
      g.strokeRect(i * cell + 18, j * cell + 18, cell - 36, cell - 36);
    }
  }
  // roads
  g.fillStyle = "#0c0f18";
  g.fillRect(0, 0, 1024, 40);
  g.fillRect(0, 984, 1024, 40);
  g.fillRect(0, 0, 40, 1024);
  g.fillRect(984, 0, 40, 1024);
  // center lane dashes
  g.fillStyle = "rgba(200,180,120,0.35)";
  for (let k = 0; k < 16; k++) {
    g.fillRect(20, 60 + k * 60, 18, 30);
    g.fillRect(986, 60 + k * 60, 18, 30);
    g.fillRect(60 + k * 60, 20, 30, 18);
    g.fillRect(60 + k * 60, 986, 30, 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  return tex;
}

interface Figure {
  group: THREE.Group;
  torso: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  phone: THREE.Mesh;
  label: THREE.Sprite;
  glow: THREE.Mesh;
  walkPhase: number;
}

interface Persona {
  shirt: string;
  pants: string;
  skin: string;
  hat?: string;
}

const PERSONA: Record<string, Persona> = {
  rajesh: { shirt: "#241a2e", pants: "#14101c", skin: "#c9967a", hat: "#0c0c12" },
  rajesh2: { shirt: "#5d1f2c", pants: "#14101c", skin: "#c9967a" },
  mohammed: { shirt: "#c07f1d", pants: "#23242e", skin: "#a9744c" },
  ravi: { shirt: "#16669e", pants: "#23242e", skin: "#c99a6c" },
  santosh: { shirt: "#5c4fc4", pants: "#23242e", skin: "#c9967a" },
};

function makePerson(id: string, color: string, name: string): Figure {
  const p = PERSONA[id] ?? { shirt: "#5a5f72", pants: "#23242e", skin: "#c9967a" };
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: p.shirt, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: p.pants, roughness: 0.85 });

  const torso = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 12), shirtMat);
  body.position.y = 1.0;
  torso.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), skinMat);
  head.position.y = 1.62;
  torso.add(head);
  if (p.hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), shirtMat);
    brim.position.y = 1.74;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 16), shirtMat);
    crown.position.y = 1.82;
    torso.add(brim, crown);
  }
  group.add(torso);

  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.62, 10), pantsMat);
    mesh.position.y = -0.31;
    g.add(mesh);
    g.position.set(x, 0.62, 0);
    group.add(g);
    return mesh;
  };
  const leftLeg = mkLeg(-0.12);
  const rightLeg = mkLeg(0.12);

  const mkArm = (x: number) => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.52, 10), shirtMat);
    mesh.position.y = -0.26;
    g.add(mesh);
    g.position.set(x, 1.26, 0);
    group.add(g);
    return mesh;
  };
  const leftArm = mkArm(-0.32);
  const rightArm = mkArm(0.32);

  // glowing phone (held in right hand)
  const phone = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x9fd0ff }),
  );
  phone.position.set(0, -0.5, 0);
  rightArm.add(phone);
  phone.visible = false;

  // presence glow on the ground
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);

  const label = makeLabel(name, color, { pill: true, size: 30 });
  label.position.set(0, 2.25, 0);
  group.add(label);

  return { group, torso, leftLeg, rightLeg, leftArm, rightArm, phone, label, glow, walkPhase: 0 };
}

function makeBike(color: string): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.6, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
  const wheelGeo = new THREE.TorusGeometry(0.28, 0.07, 10, 20);
  const w1 = new THREE.Mesh(wheelGeo, dark);
  w1.position.set(0, 0.28, 0.55);
  const w2 = new THREE.Mesh(wheelGeo, dark);
  w2.position.set(0, 0.28, -0.55);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.9), accent);
  body.position.set(0, 0.62, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.4), dark);
  seat.position.set(0, 0.82, -0.15);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), accent);
  tank.position.set(0, 0.8, 0.35);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), dark);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 1.0, 0.5);
  g.add(w1, w2, body, seat, tank, handle);
  return g;
}

export default function SimScene({
  data,
  controller,
  onTime,
  onFire,
}: {
  data: SimData;
  controller: React.MutableRefObject<SimController>;
  onTime: (t: number) => void;
  onFire: (e: SimEvent) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTimeRef = useRef(onTime);
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onTimeRef.current = onTime;
    onFireRef.current = onFire;
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const el = mount;

    let raf = 0;
    let last = performance.now();
    let lastFired = -1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05070d");
    scene.fog = new THREE.Fog(0x05070d, 30, 88);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    camera.position.set(-6, 14, 30);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-1.5, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 9;
    controls.maxDistance = 64;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.6, 0.55);
    composer.addPass(bloom);

    // --- lighting
    scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x0a0c12, 0.55));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.7);
    key.position.set(20, 28, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -42;
    key.shadow.camera.right = 42;
    key.shadow.camera.top = 42;
    key.shadow.camera.bottom = -42;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4a6cff, 0.6);
    rim.position.set(-12, 8, -14);
    scene.add(rim);

    const towerById = new Map(data.towers.map((t) => [t.id, t]));
    const actorById = new Map(data.actors.map((a) => [a.id, a]));

    // --- ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.92, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-2, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // --- buildings for every cell tower
    const buildingTip: Record<string, THREE.Mesh> = {};
    let seedBase = 900;
    for (const t of data.towers) {
      const isScene = t.scene;
      const h = isScene ? 3.4 : 2.4 + mulberry32(seedBase)() * 3.0;
      const f = facadeTextures(seedBase);
      seedBase += 37;
      const mat = new THREE.MeshStandardMaterial({
        map: f.map,
        emissive: 0xffc28a,
        emissiveMap: f.emis,
        emissiveIntensity: 0.85,
        roughness: 0.8,
      });
      const geo = new THREE.BoxGeometry(1.7, h, 1.7);
      const b = new THREE.Mesh(geo, mat);
      b.position.set(t.x, h / 2, t.z);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);

      // antenna light on top
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: isScene ? 0xffb020 : 0xff3b5c }),
      );
      tip.position.set(t.x, h + 0.35, t.z);
      scene.add(tip);
      buildingTip[t.id] = tip;

      const lbl = makeLabel(t.id, "#9aa4c0", { size: 26, dim: true });
      lbl.position.set(t.x, h + 1.1, t.z);
      scene.add(lbl);
    }

    // --- the store (crime scene)
    const store = (() => {
      const g = new THREE.Group();
      const f = storeTextures();
      const mat = new THREE.MeshStandardMaterial({
        map: f.map,
        emissive: 0xffcf96,
        emissiveMap: f.emis,
        emissiveIntensity: 1.15,
        roughness: 0.7,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 2.4), mat);
      body.position.y = 1.6;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      // sign
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.5, 0.2),
        new THREE.MeshStandardMaterial({
          color: 0xffd68c,
          emissive: 0xffd68c,
          emissiveIntensity: 1.4,
          roughness: 0.4,
        }),
      );
      sign.position.set(0, 3.35, 1.25);
      g.add(sign);
      const signLabel = makeLabel("MANEKCHAND JEWELLERS", "#1a0d00", { size: 40 });
      signLabel.position.set(0, 3.35, 1.4);
      g.add(signLabel);
      // canopy
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.18, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x7a1626, roughness: 0.9 }),
      );
      canopy.position.set(0, 2.1, 1.55);
      canopy.castShadow = true;
      g.add(canopy);
      g.position.set(data.scene.x, 0, data.scene.z);
      return g;
    })();
    scene.add(store);

    // escape motorcycles parked near the store
    const bike1 = makeBike("#14141c");
    bike1.position.set(data.scene.x - 2.6, 0, data.scene.z + 1.2);
    bike1.rotation.y = 0.4;
    bike1.scale.setScalar(0.9);
    const bike2 = makeBike("#1a1420");
    bike2.position.set(data.scene.x + 2.4, 0, data.scene.z + 1.5);
    bike2.rotation.y = -0.5;
    bike2.scale.setScalar(0.9);
    scene.add(bike1, bike2);

    // --- people (members + remote kingpin)
    const figures: Record<string, Figure> = {};
    const prevPos: Record<string, { x: number; z: number }> = {};
    for (const a of data.actors) {
      if (a.kind === "entity") continue;
      const fig = makePerson(a.id, a.color, a.name);
      fig.group.visible = false;
      scene.add(fig.group);
      figures[a.id] = fig;
    }

    // --- shell / financier plaques (finance strip) + kingpin HQ
    for (const a of data.actors) {
      if (a.kind === "remote") {
        const f = facadeTextures(505, 3, 3);
        const mat = new THREE.MeshStandardMaterial({
          map: f.map,
          emissive: 0xff6a7a,
          emissiveMap: f.emis,
          emissiveIntensity: 0.9,
          roughness: 0.8,
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), mat);
        b.position.set(a.pos!.x, 1.3, a.pos!.z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const lbl = makeLabel("RAJESH KUMAR · PUNE HQ", "#ff7a8a", { pill: true, size: 30 });
        lbl.position.set(a.pos!.x, 3.1, a.pos!.z);
        scene.add(lbl);
      } else if (a.kind === "entity") {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 1.4, 1.2),
          new THREE.MeshStandardMaterial({
            color: 0x12322a,
            emissive: 0x2f9e7a,
            emissiveIntensity: 0.5,
            roughness: 0.7,
          }),
        );
        b.position.set(a.pos!.x, 0.7, a.pos!.z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const lbl = makeLabel(a.name, "#5fe0b0", { pill: true, size: 28 });
        lbl.position.set(a.pos!.x, 1.9, a.pos!.z);
        scene.add(lbl);
      }
    }

    // --- ping ring pool
    const ringGeo = new THREE.RingGeometry(0.75, 0.92, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6f8bff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(ringGeo, ringMat.clone());
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      scene.add(r);
      rings.push(r);
    }
    let ringIdx = 0;

    const offenseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 64),
      new THREE.MeshBasicMaterial({
        color: 0xff2d55,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    offenseRing.rotation.x = -Math.PI / 2;
    offenseRing.visible = false;
    scene.add(offenseRing);

    // --- call arcs
    const callEvents = data.events.filter((e) => e.kind === "call");
    const arcs: { line: THREE.Line; pulse: THREE.Mesh }[] = callEvents.map(() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: 0x9fb4ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.visible = false;
      scene.add(line);
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
      );
      pulse.visible = false;
      scene.add(pulse);
      return { line, pulse };
    });

    // --- money packets
    const moneyEvents = data.events.filter((e) => e.kind === "money");
    const packets: THREE.Mesh[] = moneyEvents.map(() => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      return m;
    });

    const towerPos = (id: string | null | undefined) => {
      if (!id) return { x: data.scene.x, z: data.scene.z };
      const t = towerById.get(id);
      return t ? { x: t.x, z: t.z } : { x: data.scene.x, z: data.scene.z };
    };

    const actorPos = (id: string, t: number): { x: number; z: number; y: number; visible: boolean } => {
      const a = actorById.get(id);
      if (!a) return { x: 0, z: 0, y: 0, visible: false };
      if (a.kind !== "member") {
        return { x: a.pos!.x, z: a.pos!.z, y: 0, visible: true };
      }
      const kfs = data.keyframes[id];
      if (!kfs || !kfs.length) return { x: 0, z: 0, y: 0, visible: false };
      if (t < kfs[0].t) {
        if (kfs[0].enter) return { x: 0, z: 0, y: 0, visible: false };
        const p = towerPos(kfs[0].towerId);
        return { x: p.x, z: p.z, y: 0, visible: true };
      }
      for (let i = 0; i < kfs.length - 1; i++) {
        if (t >= kfs[i].t && t <= kfs[i + 1].t) {
          const u = (t - kfs[i].t) / (kfs[i + 1].t - kfs[i].t);
          const e = ease(u);
          const A = towerPos(kfs[i].towerId);
          const B = towerPos(kfs[i + 1].towerId);
          return {
            x: A.x + (B.x - A.x) * e,
            z: A.z + (B.z - A.z) * e,
            y: Math.sin(u * Math.PI) * 0.6,
            visible: true,
          };
        }
      }
      const p = towerPos(kfs[kfs.length - 1].towerId);
      return { x: p.x, z: p.z, y: 0, visible: true };
    };

    const bezier = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3, u: number) => {
      const v = 1 - u;
      out.set(
        v * v * a.x + 2 * v * u * c.x + u * u * b.x,
        v * v * a.y + 2 * v * u * c.y + u * u * b.y,
        v * v * a.z + 2 * v * u * c.z + u * u * b.z,
      );
    };

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpC = new THREE.Vector3();
    const tmpP = new THREE.Vector3();

    function resize() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer.setSize(w, h);
    }
    resize();
    window.addEventListener("resize", resize);

    const onCall = new Set<string>();

    function update(t: number) {
      onCall.clear();
      for (const e of data.events) {
        if (e.kind === "call" && t >= e.t && t <= e.t + e.dur) {
          onCall.add(e.a!);
          onCall.add(e.b!);
        }
      }

      // people
      for (const a of data.actors) {
        if (a.kind === "entity") continue;
        const fig = figures[a.id];
        const p = actorPos(a.id, t);
        fig.group.visible = p.visible;
        if (!p.visible) continue;
        const prev = prevPos[a.id] ?? { x: p.x, z: p.z };
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const moving = Math.hypot(dx, dz) > 0.004;
        prevPos[a.id] = { x: p.x, z: p.z };
        if (moving) fig.walkPhase += 0.16;
        fig.group.position.set(p.x, p.y, p.z);
        if (moving) fig.group.rotation.y = Math.atan2(dx, dz);

        const bob = moving ? Math.sin(fig.walkPhase * 2) * 0.05 : 0;
        fig.torso.position.y = bob;
        const swing = moving ? Math.sin(fig.walkPhase) * 0.55 : 0;
        fig.leftLeg.rotation.x = swing;
        fig.rightLeg.rotation.x = -swing;

        const calling = onCall.has(a.id);
        fig.phone.visible = calling;
        if (calling) {
          fig.rightArm.rotation.x = -1.45;
          fig.leftArm.rotation.x = -swing * 0.6;
        } else {
          fig.rightArm.rotation.x = -swing * 0.7;
          fig.leftArm.rotation.x = swing * 0.7;
        }
      }

      // events
      for (let i = 0; i < data.events.length; i++) {
        const e = data.events[i];
        if (t < e.t || t > e.t + e.dur) continue;
        const u = (t - e.t) / e.dur;

        if (e.kind === "call") {
          const arc = arcs[callEvents.indexOf(e)];
          if (!arc) continue;
          const A = actorPos(e.a!, t);
          const B = actorPos(e.b!, t);
          if (!A.visible || !B.visible) {
            arc.line.visible = false;
            arc.pulse.visible = false;
            continue;
          }
          tmpA.set(A.x, 1.7, A.z);
          tmpB.set(B.x, 1.7, B.z);
          tmpC.set((A.x + B.x) / 2, 6, (A.z + B.z) / 2);
          const arr = arc.line.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let s = 0; s <= 39; s++) {
            bezier(tmpA, tmpC, tmpB, tmpP, s / 39);
            arr.setXYZ(s, tmpP.x, tmpP.y, tmpP.z);
          }
          arr.needsUpdate = true;
          const fade = Math.sin(u * Math.PI);
          (arc.line.material as THREE.LineBasicMaterial).opacity = fade * 0.55;
          arc.line.visible = true;
          bezier(tmpA, tmpC, tmpB, tmpP, u);
          arc.pulse.position.copy(tmpP);
          (arc.pulse.material as THREE.MeshBasicMaterial).opacity = fade;
          arc.pulse.visible = true;
        } else if (e.kind === "ping") {
          if (!e.ambient) {
            const ring = rings[ringIdx % rings.length];
            ringIdx++;
            const tp = towerPos(e.towerId);
            ring.position.set(tp.x, 0.06, tp.z);
            ring.visible = true;
            ring.scale.setScalar(0.4 + u * 7);
            (ring.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.85;
          }
          const tip = buildingTip[e.towerId!];
          if (tip) {
            tip.scale.setScalar(1 + Math.sin(u * Math.PI) * (e.ambient ? 0.6 : 1.6));
          }
        } else if (e.kind === "offense") {
          offenseRing.position.set(data.scene.x, 0.08, data.scene.z);
          offenseRing.visible = true;
          offenseRing.scale.setScalar(0.3 + u * 16);
          (offenseRing.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.95;
        } else if (e.kind === "money") {
          const pkt = packets[moneyEvents.indexOf(e)];
          if (!pkt) continue;
          const A = actorPos(e.a!, t);
          const B = actorPos(e.b!, t);
          tmpA.set(A.x, A.y + 1.5, A.z);
          tmpB.set(B.x, B.y + 1.5, B.z);
          tmpC.set((A.x + B.x) / 2, Math.max(A.y, B.y) + 5, (A.z + B.z) / 2);
          bezier(tmpA, tmpC, tmpB, tmpP, u);
          pkt.position.copy(tmpP);
          (pkt.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI);
          pkt.visible = true;
        }
      }
    }

    function resetTransients() {
      for (const r of rings) r.visible = false;
      offenseRing.visible = false;
      for (const arc of arcs) {
        arc.line.visible = false;
        arc.pulse.visible = false;
      }
      for (const p of packets) p.visible = false;
    }

    function loop(now: number) {
      if (!el.isConnected) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = controller.current;
      const prev = c.t;
      if (c.playing) c.t = Math.min(data.duration, c.t + dt * c.speed);

      if (c.t < prev - 0.5) lastFired = -1;
      for (const e of data.events) {
        if (e.ambient) continue;
        if (e.t > lastFired && e.t <= c.t) {
          lastFired = e.t;
          onFireRef.current(e);
        }
      }

      resetTransients();
      update(c.t);
      onTimeRef.current(c.t);

      controls.update();
      composer.render();
    }

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
