"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SimData, SimEvent } from "@/lib/graph/simulation";

export interface SimController {
  t: number;
  playing: boolean;
  speed: number;
  autoCam: boolean;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

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
  wc.fillStyle = "#1a2438";
  wc.fillRect(6, 6, W - 12, H - 12);
  for (let i = 0; i < wCells; i++) {
    for (let j = 0; j < hCells; j++) {
      wc.fillStyle = "#0a101f";
      wc.fillRect(14 + i * cw, 16 + j * ch, cw - 18, ch - 22);
    }
  }
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
        const warm = rnd() < 0.5 ? "255,190,120" : "170,205,255";
        ec.fillStyle = `rgba(${warm},0.9)`;
        ec.fillRect(16 + i * cw, 18 + j * ch, cw - 22, ch - 26);
      }
    }
  }

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
  const rnd = mulberry32(7);
  for (let i = 0; i < 6000; i++) {
    const v = 12 + rnd() * 14;
    g.fillStyle = `rgba(${v},${v + 6},${v + 16},0.35)`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 2, 2);
  }
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
  g.fillStyle = "#0c0f18";
  g.fillRect(0, 0, 1024, 40);
  g.fillRect(0, 984, 1024, 40);
  g.fillRect(0, 0, 40, 1024);
  g.fillRect(984, 0, 40, 1024);
  g.fillStyle = "rgba(200,180,120,0.35)";
  for (let k = 0; k < 16; k++) {
    g.fillRect(20, 60 + k * 60, 18, 30);
    g.fillRect(986, 60 + k * 60, 18, 30);
    g.fillRect(60 + k * 60, 20, 30, 18);
    g.fillRect(60 + k * 60, 986, 30, 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeGun(): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.35, metalness: 0.7 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.34), dark);
  slide.position.set(0, 0.04, 0.1);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
  grip.position.set(0, -0.06, -0.03);
  grip.rotation.x = 0.3;
  g.add(slide, grip);
  return g;
}

interface Figure {
  group: THREE.Group;
  torso: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  phone: THREE.Mesh;
  gun: THREE.Group;
  label: THREE.Sprite;
  glow: THREE.Mesh;
  walkPhase: number;
  proceduralBody: THREE.Group;
  glbRef: { current: THREE.Group | null };
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
  worker: { shirt: "#3a4a68", pants: "#2a3040", skin: "#d0a272" },
  worker2: { shirt: "#4a3a5c", pants: "#2a3040", skin: "#c9967a" },
};

function makePerson(id: string, color: string, name: string): Figure {
  const p = PERSONA[id] ?? { shirt: "#5a5f72", pants: "#23242e", skin: "#c9967a" };
  const group = new THREE.Group();
  const proceduralBody = new THREE.Group();
  group.add(proceduralBody);

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
  proceduralBody.add(torso);

  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.62, 10), pantsMat);
    mesh.position.y = -0.31;
    g.add(mesh);
    g.position.set(x, 0.62, 0);
    proceduralBody.add(g);
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
    proceduralBody.add(g);
    return mesh;
  };
  const leftArm = mkArm(-0.32);
  const rightArm = mkArm(0.32);

  const phone = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x9fd0ff }),
  );
  phone.position.set(0, -0.5, 0);
  rightArm.add(phone);
  phone.visible = false;

  const gun = makeGun();
  gun.position.set(0.34, 1.2, 0.2);
  gun.visible = false;
  group.add(gun);

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

  // procedural animated body (no GLB swap — keeps walk/aim/gun animation)
  const glbRef: { current: THREE.Group | null } = { current: null };

  return {
    group,
    torso,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    phone,
    gun,
    label,
    glow,
    walkPhase: 0,
    proceduralBody,
    glbRef,
  };
}

function setBob(fig: Figure, y: number) {
  fig.torso.position.y = y;
  if (fig.glbRef.current) fig.glbRef.current.position.y = y;
}

function makePlate(text: string, caption: string | null): { group: THREE.Group; frame: THREE.Mesh; label: THREE.Sprite } {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xdfe3ec, roughness: 0.35, metalness: 0.3 }),
  );
  group.add(box);
  const num = makeLabel(text, "#0a0d14", { size: 30 });
  num.scale.set(0.34, 0.13, 1);
  num.position.set(0, 0, 0.028);
  group.add(num);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.05),
    new THREE.MeshBasicMaterial({
      color: 0xffd54a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  frame.position.set(0, 0, -0.02);
  frame.visible = false;
  group.add(frame);

  const label = caption
    ? makeLabel(caption, "#ffd54a", { pill: true, size: 34 })
    : (new THREE.Sprite(new THREE.SpriteMaterial({ visible: false })));
  label.position.set(0, 0.85, 0);
  label.visible = false;
  group.add(label);

  return { group, frame, label };
}

function makeRider(shirtColor: string): THREE.Group {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0x131721, roughness: 0.3, metalness: 0.5 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.5, 10), shirt);
  torso.position.y = 0.75;
  torso.rotation.x = -0.5;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), helmet);
  head.position.set(0, 1.1, 0.14);
  g.add(head);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.44, 8);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.2, 0.86, 0.32);
  armL.rotation.x = 0.9;
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.2, 0.86, 0.32);
  armR.rotation.x = 0.9;
  g.add(armL, armR);
  return g;
}

// load a GLB model, normalize to a target height and sit it on the ground
function loadModel(url: string, height: number, onLoad: (g: THREE.Group) => void): void {
  new GLTFLoader().load(
    url,
    (gltf) => {
      const wrap = new THREE.Group();
      wrap.add(gltf.scene);
      wrap.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(wrap);
      const size = box.getSize(new THREE.Vector3());
      const s = height / (size.y || 1);
      wrap.scale.setScalar(s);
      wrap.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(wrap);
      const c2 = b2.getCenter(new THREE.Vector3());
      wrap.position.set(-c2.x, -b2.min.y, -c2.z);
      onLoad(wrap);
    },
    undefined,
    () => {},
  );
}

function makeBike(
  color: string,
  plateText: string,
  caption: string | null,
): { group: THREE.Group; plate: { group: THREE.Group; frame: THREE.Mesh; label: THREE.Sprite } } {
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
  const plate = makePlate(plateText, caption);
  plate.group.position.set(0, 0.55, -0.64);
  g.add(w1, w2, body, seat, tank, handle, plate.group);
  return { group: g, plate };
}

// fully-enclosed interior room (no exterior bleed) with a doorway + backdrop
function makeRoom(sx: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const hw = 5.6;
  const hd = 4.6;
  const H = 5.4;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3654, roughness: 0.85 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c2538, roughness: 0.7 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0e1320, roughness: 0.9 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.2, hd * 2), floorMat);
  floor.position.y = 0;
  floor.receiveShadow = true;
  g.add(floor);

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.2, hd * 2), ceilMat);
  ceil.position.y = H;
  g.add(ceil);

  const back = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, H, 0.3), wallMat);
  back.position.set(0, H / 2, -hd);
  back.receiveShadow = true;
  g.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, hd * 2), wallMat);
  left.position.set(-hw, H / 2, 0);
  left.receiveShadow = true;
  g.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, hd * 2), wallMat);
  right.position.set(hw, H / 2, 0);
  right.receiveShadow = true;
  g.add(right);

  // front wall with a doorway
  const doorW = 2.4;
  const doorH = 2.6;
  const segW = hw - doorW / 2;
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(segW, H, 0.3), wallMat);
  frontL.position.set(-(doorW / 2 + segW / 2), H / 2, hd);
  g.add(frontL);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(segW, H, 0.3), wallMat);
  frontR.position.set(doorW / 2 + segW / 2, H / 2, hd);
  g.add(frontR);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, H - doorH, 0.3), wallMat);
  lintel.position.set(0, (H + doorH) / 2, hd);
  g.add(lintel);

  // dark backdrop outside the door so only the interior reads
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 14),
    new THREE.MeshBasicMaterial({ color: 0x04050a, side: THREE.DoubleSide }),
  );
  backdrop.position.set(0, H / 2, hd + 1.1);
  g.add(backdrop);

  // ceiling lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.5), lightMat);
    panel.position.set(-2.4 + i * 2.4, H - 0.12, -1);
    g.add(panel);
  }

  // back-wall sign
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.7, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xffd68c, emissive: 0xffd68c, emissiveIntensity: 1.2 }),
  );
  sign.position.set(0, 3.6, -hd + 0.18);
  g.add(sign);
  const signLabel = makeLabel("MANEKCHAND", "#1a0d00", { size: 44 });
  signLabel.position.set(0, 3.6, -hd + 0.3);
  g.add(signLabel);

  // display counters with jewellery
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.5, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fc6ff,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.35,
  });
  const gemColors = [0xffd54a, 0x7fd0ff, 0xff8aa0, 0x8affd0];
  for (const cx of [-1.9, 1.9]) {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 1.0), counterMat);
    counter.position.set(cx, 0.5, -1.5);
    counter.castShadow = true;
    counter.receiveShadow = true;
    g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.14, 1.05), glassMat);
    top.position.set(cx, 1.05, -1.5);
    g.add(top);
    for (let k = 0; k < 4; k++) {
      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 12),
        new THREE.MeshStandardMaterial({
          color: gemColors[k],
          emissive: gemColors[k],
          emissiveIntensity: 1.6,
          roughness: 0.2,
        }),
      );
      gem.position.set(cx - 0.9 + k * 0.6, 1.14, -1.5);
      g.add(gem);
    }
  }

  // wall safe
  const safe = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.5, metalness: 0.6 }),
  );
  safe.position.set(0, 0.55, -hd + 0.3);
  safe.castShadow = true;
  g.add(safe);
  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8c28a, metalness: 0.8, roughness: 0.3 }),
  );
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 0.7, -hd + 0.56);
  g.add(dial);

  g.position.set(sx, 0, sz);
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05070d");
    scene.fog = new THREE.Fog(0x05070d, 30, 88);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    camera.position.set(-6, 14, 30);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-1.5, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.addEventListener("start", () => {
      controller.current.autoCam = false;
    });

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
    // interior lights (inside the room, so they only reach the room once it's sealed)
    const roomLight = new THREE.PointLight(0xffd9a0, 90, 40, 2);
    roomLight.position.set(data.scene.x, 4.0, data.scene.z);
    scene.add(roomLight);
    const roomFill = new THREE.PointLight(0xbfd4ff, 50, 40, 2);
    roomFill.position.set(data.scene.x, 3.0, data.scene.z - 3);
    scene.add(roomFill);

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

    // --- buildings for every cell tower (GLB city + tower antenna markers)
    const cityGroup = new THREE.Group();
    scene.add(cityGroup);
    const buildingTip: Record<string, THREE.Mesh> = {};
    const buildingModels = ["apartment", "house", "skyscraper", "smallbuilding"];
    let seedBase = 900;
    data.towers.forEach((t, i) => {
      const isScene = t.scene;
      const h = isScene ? 3.4 : 2.6 + mulberry32(seedBase)() * 2.0;
      seedBase += 37;
      const towerGrp = new THREE.Group();
      towerGrp.position.set(t.x, 0, t.z);
      cityGroup.add(towerGrp);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: isScene ? 0xffb020 : 0xff3b5c }),
      );
      tip.position.set(0, h + 0.35, 0);
      towerGrp.add(tip);
      buildingTip[t.id] = tip;

      const lbl = makeLabel(t.id, "#9aa4c0", { size: 26, dim: true });
      lbl.position.set(0, h + 1.1, 0);
      towerGrp.add(lbl);

      const url = `/models/${buildingModels[i % buildingModels.length]}.glb`;
      loadModel(url, h, (model) => towerGrp.add(model));
    });

    // --- the store (exterior shell, hidden during the interior cut)
    const store = (() => {
      const g = new THREE.Group();
      const f = facadeTextures(211, 3, 4);
      const mat = new THREE.MeshStandardMaterial({
        map: f.map,
        emissive: 0xffcf96,
        emissiveMap: f.emis,
        emissiveIntensity: 1.15,
        roughness: 0.7,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 2.6), mat);
      body.position.y = 1.7;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.5, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xffd68c, emissive: 0xffd68c, emissiveIntensity: 1.4 }),
      );
      sign.position.set(0, 3.55, 1.35);
      g.add(sign);
      g.position.set(data.scene.x, 0, data.scene.z);
      return g;
    })();
    scene.add(store);

    // --- interior set (hidden until the robbery)
    const room = makeRoom(data.scene.x, data.scene.z);
    room.visible = false;
    scene.add(room);

    const worker1 = makePerson("worker", "#8fb0d8", "Store clerk");
    worker1.group.visible = false;
    room.add(worker1.group);
    const worker2 = makePerson("worker2", "#8fb0d8", "Cashier");
    worker2.group.visible = false;
    room.add(worker2.group);

    const interiorRobbers: Record<string, Figure> = {};
    for (const id of ["mohammed", "ravi", "santosh"]) {
      const a = actorById.get(id)!;
      const f = makePerson(id, a.color, a.name);
      f.group.visible = false;
      room.add(f.group);
      interiorRobbers[id] = f;
    }

    // escape motorcycles — GLB Suzuki (black Pulsar) for the exterior, procedural second bike
    const bikeA = {
      group: new THREE.Group(),
      plate: makePlate("MH 01 AB 1234", "MH 01 AB 1234 · BLACK PULSAR · FIR 1201/2023"),
    };
    bikeA.group.position.set(data.scene.x - 2.6, 0, data.scene.z + 1.2);
    bikeA.group.rotation.y = 0.4;
    bikeA.plate.group.position.set(0, 0.42, -0.86);
    bikeA.group.add(bikeA.plate.group);
    loadModel("/models/suzuki.glb", 1.0, (m) => bikeA.group.add(m));
    const bikeB = makeBike("#1a1420", "MH 01 CD 5678", null);
    bikeB.group.position.set(data.scene.x + 2.4, 0, data.scene.z + 1.5);
    bikeB.group.rotation.y = -0.5;
    bikeB.group.scale.setScalar(0.9);
    scene.add(bikeA.group, bikeB.group);

    const riderA = makeRider("#c07f1d"); // Mohammed
    riderA.position.set(0, 0.42, 0.1);
    riderA.visible = false;
    bikeA.group.add(riderA);
    const pillion = makeRider("#16669e"); // Ravi
    pillion.position.set(0, 0.45, -0.3);
    pillion.visible = false;
    bikeA.group.add(pillion);
    const riderB = makeRider("#5c4fc4"); // Santosh
    riderB.position.set(0, 0.55, -0.05);
    riderB.visible = false;
    bikeB.group.add(riderB);

    // --- exterior people
    const figures: Record<string, Figure> = {};
    const prevPos: Record<string, { x: number; z: number }> = {};
    for (const a of data.actors) {
      if (a.kind === "entity") continue;
      const fig = makePerson(a.id, a.color, a.name);
      fig.group.visible = false;
      scene.add(fig.group);
      figures[a.id] = fig;
    }

    // --- shell / financier plaques + kingpin HQ
    const financeGroup = new THREE.Group();
    scene.add(financeGroup);
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
        financeGroup.add(b);
        const lbl = makeLabel("RAJESH KUMAR · PUNE HQ", "#ff7a8a", { pill: true, size: 30 });
        lbl.position.set(a.pos!.x, 3.1, a.pos!.z);
        financeGroup.add(lbl);
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
        financeGroup.add(b);
        const lbl = makeLabel(a.name, "#5fe0b0", { pill: true, size: 28 });
        lbl.position.set(a.pos!.x, 1.9, a.pos!.z);
        financeGroup.add(lbl);
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
    for (let i = 0; i < 12; i++) {
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

    // --- camera rigs
    const sx = data.scene.x;
    const sz = data.scene.z;
    const EXTERIOR = { pos: new THREE.Vector3(-6, 14, 30), tgt: new THREE.Vector3(-1.5, 1.2, 0) };
    const ESCAPE = { pos: new THREE.Vector3(sx - 2, 6, sz + 15), tgt: new THREE.Vector3(sx, 1.2, sz + 2) };
    const CHASE = { pos: new THREE.Vector3(sx - 2.6, 2.4, sz + 2.5), tgt: new THREE.Vector3(sx - 2.6, 0.7, sz + 9) };
    const PLATE = { pos: new THREE.Vector3(sx - 2.6, 0.6, sz + 6.2), tgt: new THREE.Vector3(sx - 2.6, 0.5, sz + 8.6) };
    const MONEY = { pos: new THREE.Vector3(-9, 17, 26), tgt: new THREE.Vector3(-2, 1.5, 0) };
    const camTgt = EXTERIOR.tgt.clone();

    function interiorRig(t: number): { pos: THREE.Vector3; tgt: THREE.Vector3 } {
      // multiple camera angles inside the sealed room
      if (t < 56) return { pos: new THREE.Vector3(sx, 2.3, sz - 3.6), tgt: new THREE.Vector3(sx, 1.2, sz + 2.6) }; // wide, door
      if (t < 58) return { pos: new THREE.Vector3(sx, 1.8, sz - 2.5), tgt: new THREE.Vector3(sx, 1.5, sz + 0.4) }; // staff POV
      if (t < 60) return { pos: new THREE.Vector3(sx + 4.0, 2.0, sz - 0.4), tgt: new THREE.Vector3(sx, 1.4, sz - 1.2) }; // side, gunpoint
      if (t < 62) return { pos: new THREE.Vector3(sx + 1.6, 1.8, sz + 0.6), tgt: new THREE.Vector3(sx, 1.5, sz + 0.1) }; // close on robbers
      return { pos: new THREE.Vector3(sx, 2.3, sz - 3.6), tgt: new THREE.Vector3(sx, 1.2, sz + 2.6) }; // wide, flee
    }

    function rigFor(t: number) {
      if (t < 53.5) return EXTERIOR;
      if (t < 64) return interiorRig(t);
      if (t < 73) return ESCAPE;
      if (t < 80) return CHASE;
      if (t < 84) return PLATE;
      if (t < 116) return MONEY;
      return EXTERIOR;
    }

    function isInterior(t: number) {
      return t >= 53.5 && t < 64;
    }

    // interior robber choreography (local coords relative to room center)
    const entryX: Record<string, number> = { mohammed: -0.8, ravi: 0, santosh: 0.8 };
    const finalX: Record<string, number> = { mohammed: -2.1, ravi: 0, santosh: 2.1 };

    function robberInteriorPos(id: string, t: number): { x: number; z: number; rotY: number; vis: boolean } {
      if (t < 54) return { x: entryX[id], z: 4.3, rotY: Math.PI, vis: false };
      if (t < 56) {
        const u = ease((t - 54) / 2);
        return { x: lerp(entryX[id], finalX[id], u), z: lerp(4.3, 0.4, u), rotY: Math.PI, vis: true };
      }
      if (t < 58) return { x: finalX[id], z: 0.4, rotY: Math.PI, vis: true };
      if (t < 60) {
        const u = (t - 58) / 2;
        return { x: finalX[id], z: lerp(0.4, -0.5, u), rotY: Math.PI, vis: true };
      }
      if (t < 64) {
        const u = (t - 60) / 4;
        return { x: lerp(finalX[id], entryX[id], u), z: lerp(-0.5, 4.3, u), rotY: 0, vis: true };
      }
      return { x: entryX[id], z: 4.3, rotY: 0, vis: false };
    }

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

    // per-shot isolation — only render what belongs to the current camera shot
    function applyShot(t: number) {
      const interior = t >= 53.5 && t < 64;
      const escape = t >= 64 && t < 84;
      const plate = t >= 80 && t < 84;
      const money = t >= 84 && t < 116;
      const wide = t < 53.5 || t >= 116;

      cityGroup.visible = wide || money;
      financeGroup.visible = wide || money;
      ground.visible = !interior && !plate;
      store.visible = wide || (escape && t < 73);
      room.visible = interior;
      bikeA.group.visible = wide || escape;
      bikeB.group.visible = wide || (escape && !plate);
    }

    function update(t: number) {
      const interior = isInterior(t);
      const escaping = t >= 64 && t < 84;
      applyShot(t);

      onCall.clear();
      for (const e of data.events) {
        if (e.kind === "call" && t >= e.t && t <= e.t + e.dur) {
          onCall.add(e.a!);
          onCall.add(e.b!);
        }
      }

      // --- exterior people
      for (const a of data.actors) {
        if (a.kind === "entity") continue;
        const fig = figures[a.id];
        const p = actorPos(a.id, t);
        const isRobber = a.id === "mohammed" || a.id === "ravi" || a.id === "santosh";
        const hiddenByInterior = interior && (isRobber || a.id === "rajesh2");
        const hiddenByEscape = escaping && isRobber;
        fig.group.visible = p.visible && !hiddenByInterior && !hiddenByEscape;
        if (!fig.group.visible) continue;
        const prev = prevPos[a.id] ?? { x: p.x, z: p.z };
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const moving = Math.hypot(dx, dz) > 0.004;
        prevPos[a.id] = { x: p.x, z: p.z };
        if (moving) fig.walkPhase += 0.16;
        fig.group.position.set(p.x, p.y, p.z);
        if (moving) fig.group.rotation.y = Math.atan2(dx, dz);

        const bob = moving ? Math.sin(fig.walkPhase * 2) * 0.05 : 0;
        setBob(fig, bob);
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

      // --- interior staff + robbers
      if (interior) {
        const threat = t >= 56 && t < 60;
        worker1.group.visible = true;
        worker2.group.visible = true;
        worker1.group.position.set(-2.7, 0, -2.4);
        worker2.group.position.set(2.7, 0, -2.4);
        worker1.group.rotation.y = 0;
        worker2.group.rotation.y = 0;
        const crouch = threat ? -0.25 : 0;
        setBob(worker1, crouch);
        setBob(worker2, crouch);
        if (threat) {
          worker1.leftArm.rotation.x = -1.7;
          worker1.rightArm.rotation.x = -1.7;
          worker2.leftArm.rotation.x = -1.7;
          worker2.rightArm.rotation.x = -1.7;
        } else {
          worker1.leftArm.rotation.x = 0;
          worker1.rightArm.rotation.x = 0;
          worker2.leftArm.rotation.x = 0;
          worker2.rightArm.rotation.x = 0;
        }

        for (const id of ["mohammed", "ravi", "santosh"]) {
          const f = interiorRobbers[id];
          const p = robberInteriorPos(id, t);
          f.group.visible = p.vis;
          if (!p.vis) continue;
          f.group.position.set(p.x, 0, p.z);
          f.group.rotation.y = p.rotY;
          const moving = t < 56 || t >= 60;
          if (moving) f.walkPhase += 0.2;
          setBob(f, moving ? Math.sin(f.walkPhase * 2) * 0.05 : Math.sin(t * 6) * 0.02);
          const swing = moving ? Math.sin(f.walkPhase) * 0.6 : 0;
          f.leftLeg.rotation.x = swing;
          f.rightLeg.rotation.x = -swing;
          const holdingGun = t >= 54 && t < 60;
          f.gun.visible = holdingGun;
          f.rightArm.rotation.x = holdingGun ? -0.95 : -swing * 0.7;
          f.leftArm.rotation.x = swing * 0.7;
          f.phone.visible = t >= 54 && t < 60;
        }
      } else {
        worker1.group.visible = false;
        worker2.group.visible = false;
        for (const id of ["mohammed", "ravi", "santosh"]) interiorRobbers[id].group.visible = false;
      }

      // --- escape: sprint to bikes → ride off → numberplate freeze-frame
      if (escaping) {
        const b1x = sx - 2.6;
        const b1z0 = sz + 1.2;
        const b2x = sx + 2.4;
        const b2z0 = sz + 1.5;
        bikeA.group.visible = true;
        bikeB.group.visible = true;
        bikeA.plate.frame.visible = false;
        bikeA.plate.label.visible = false;

        if (t < 70) {
          // run from the store door to the bikes
          const u = ease((t - 64) / 6);
          const run = (id: string, tx: number, tz: number) => {
            const fig = figures[id];
            fig.group.visible = true;
            fig.group.position.set(lerp(sx, tx, u), 0, lerp(sz + 1.4, tz, u));
            fig.group.rotation.y = Math.atan2(tx - sx, tz - (sz + 1.4));
            fig.walkPhase += 0.22;
            const sw = Math.sin(fig.walkPhase) * 0.6;
            setBob(fig, Math.sin(fig.walkPhase * 2) * 0.05);
            fig.leftLeg.rotation.x = sw;
            fig.rightLeg.rotation.x = -sw;
            fig.leftArm.rotation.x = sw * 0.7;
            fig.rightArm.rotation.x = -sw * 0.7;
          };
          run("mohammed", b1x, b1z0);
          run("ravi", b1x, b1z0);
          run("santosh", b2x, b2z0);
          bikeA.group.rotation.y = 0.2 + Math.sin(t * 40) * 0.01;
          bikeB.group.rotation.y = -0.2 + Math.sin(t * 40) * 0.01;
          riderA.visible = false;
          pillion.visible = false;
          riderB.visible = false;
        } else if (t < 73) {
          // mount up
          figures["mohammed"].group.visible = false;
          figures["ravi"].group.visible = false;
          figures["santosh"].group.visible = false;
          bikeA.group.rotation.y = 0;
          bikeB.group.rotation.y = 0;
          riderA.visible = true;
          pillion.visible = true;
          riderB.visible = true;
          const rev = Math.sin(t * 50) * 0.02;
          bikeA.group.position.y = rev;
          bikeB.group.position.y = rev;
        } else if (t < 80) {
          // ride away down the road
          const u = ease((t - 73) / 7);
          bikeA.group.position.set(b1x, Math.sin(t * 45) * 0.015, lerp(b1z0, sz + 9, u));
          bikeA.group.rotation.y = 0;
          bikeB.group.position.set(b2x, Math.sin(t * 45) * 0.015, lerp(b2z0, sz + 7.5, u));
          bikeB.group.rotation.y = 0;
          riderA.visible = true;
          pillion.visible = true;
          riderB.visible = true;
        } else {
          // numberplate freeze-frame highlight
          bikeA.group.position.set(b1x, 0, sz + 9);
          bikeA.group.rotation.y = 0;
          bikeB.group.visible = false;
          riderA.visible = true;
          pillion.visible = true;
          bikeA.plate.frame.visible = true;
          bikeA.plate.label.visible = true;
        }
      } else if (t >= 84) {
        bikeA.plate.frame.visible = false;
        bikeA.plate.label.visible = false;
      }

      // --- events
      for (let i = 0; i < data.events.length; i++) {
        const e = data.events[i];
        if (t < e.t || t > e.t + e.dur) continue;
        const u = (t - e.t) / e.dur;

        if (e.kind === "call") {
          const arc = arcs[callEvents.indexOf(e)];
          if (!arc) continue;
          const A = actorPos(e.a!, t);
          const B = actorPos(e.b!, t);
          if (!A.visible || !B.visible || interior) {
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
          if (interior) continue;
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
          if (tip) tip.scale.setScalar(1 + Math.sin(u * Math.PI) * (e.ambient ? 0.6 : 1.6));
        } else if (e.kind === "offense") {
          offenseRing.position.set(sx, 0.08, sz);
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

      // pinging rings over the robbers inside the store
      if (interior) {
        for (const id of ["mohammed", "ravi", "santosh"]) {
          const p = robberInteriorPos(id, t);
          if (!p.vis) continue;
          const ring = rings[ringIdx % rings.length];
          ringIdx++;
          ring.position.set(sx + p.x, 0.06, sz + p.z);
          ring.visible = true;
          ring.scale.setScalar(0.3 + ((t * 2) % 1) * 3.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.7;
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

      // cinematic camera (auto) vs manual orbit
      if (c.autoCam) {
        const rig = rigFor(c.t);
        const k = 1 - Math.exp(-dt * 3.4);
        camera.position.lerp(rig.pos, k);
        camTgt.lerp(rig.tgt, k);
        controls.target.copy(camTgt);
        const sway = 0.08 * Math.sin(now * 0.0005) + 0.04 * Math.sin(now * 0.0017);
        camera.position.x += sway;
        camera.lookAt(camTgt);
      }
      controls.update();

      resetTransients();
      update(c.t);
      onTimeRef.current(c.t);

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
