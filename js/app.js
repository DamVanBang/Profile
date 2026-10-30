/* ============================================================
   ĐÀM VĂN BẰNG — Scrollytelling Engine v2 "Total Immersion"
   8 hệ thống: morph hạt GPU · camera điện ảnh · intro điện ảnh ·
   mouse trail · liquid field · instanced shards · click shockwave ·
   menu fullscreen + kinetic strips
   Một ticker duy nhất: Lenis + GSAP + Three.js
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ---------------- Cấu hình ---------------- */
const CFG = {
  isMobile: matchMedia('(max-width: 900px)').matches || matchMedia('(hover: none)').matches,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  get count() { return this.reduced ? 5000 : this.isMobile ? 9000 : 20000; },
  get trailCount() { return this.reduced ? 0 : this.isMobile ? 400 : 900; },
  get shardCount() { return this.reduced ? 0 : this.isMobile ? 90 : 220; },
};

const PALETTES = [
  { a: '#ffd54f', b: '#fff3d6', c: '#d84315' }, // CH0 chữ BẰNG
  { a: '#fbc02d', b: '#ff8a65', c: '#ffffff' }, // CH1 thiên hà
  { a: '#ff7043', b: '#ffd54f', c: '#ffffff' }, // CH2 knot mạch
  { a: '#26c6da', b: '#fbc02d', c: '#ffffff' }, // CH3 xoắn kép
  { a: '#fbc02d', b: '#d84315', c: '#fff8e1' }, // CH4 sao Việt
  { a: '#b0bec5', b: '#fbc02d', c: '#ffffff' }, // CH5 hành tinh
].map((p) => ({ a: new THREE.Color(p.a), b: new THREE.Color(p.b), c: new THREE.Color(p.c) }));

const SPIN_AMP = [0.03, 0.30, 0.26, 0.16, 0.03, 0.14];
const SHARD_VIS = [0.0, 0.55, 1.0, 0.5, 0.0, 0.35]; // độ nổi của mảnh khối theo chương

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ============================================================
   SHADERS — hệ hạt chính (morph + shockwave)
   ============================================================ */
const VERT = /* glsl */`
uniform float uTime;
uniform float uMorph;
uniform float uSize;
uniform float uScale;
uniform float uVel;
uniform float uNoiseAmp;
uniform float uRepel;
uniform vec3  uMouse;
uniform vec3  uClick;
uniform float uClickTime;
uniform vec3  uPalA;
uniform vec3  uPalB;
uniform vec3  uPalC;

attribute vec3 aT0;
attribute vec3 aT1;
attribute vec3 aT2;
attribute vec3 aT3;
attribute vec3 aT4;
attribute vec3 aT5;
attribute vec3 aRand;
attribute float aSize;

varying vec3 vColor;
varying float vFade;

${/* Simplex 3D — Ashima Arts */''}
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  float f   = fract(uMorph);
  float seg = floor(uMorph);
  vec3 p0, p1;
  if      (seg < 0.5) { p0 = aT0; p1 = aT1; }
  else if (seg < 1.5) { p0 = aT1; p1 = aT2; }
  else if (seg < 2.5) { p0 = aT2; p1 = aT3; }
  else if (seg < 3.5) { p0 = aT3; p1 = aT4; }
  else                { p0 = aT4; p1 = aT5; }

  float m = smoothstep(0.0, 1.0, f);
  vec3 pos = mix(p0, p1, m);

  float turb = sin(m * 3.14159265) * uNoiseAmp * (0.45 + aRand.x * 0.9);
  vec3 n = vec3(
    snoise(pos * 0.32 + vec3(0.0, uTime * 0.10, 0.0)),
    snoise(pos * 0.32 + vec3(21.7, uTime * 0.11, 4.2)),
    snoise(pos * 0.32 + vec3(9.1, 3.3, uTime * 0.09))
  );
  pos += n * turb;

  float breathe = 0.05 * (0.4 + aRand.y);
  pos += breathe * vec3(
    snoise(pos * 0.8 + uTime * 0.12),
    snoise(pos * 0.8 + 40.0 + uTime * 0.12),
    snoise(pos * 0.8 + 80.0 + uTime * 0.12)
  );

  // Đẩy hạt quanh con trỏ
  vec3 toM = pos - uMouse;
  float d = length(toM);
  float rep = smoothstep(uRepel, 0.0, d);
  pos += normalize(toM + 1e-4) * rep * (1.5 + aRand.z * 1.5);

  // Sóng xung kích khi click — vòng tròn lan toả
  float dc = distance(pos, uClick);
  float ring = exp(-pow(dc - uClickTime * 15.0, 2.0) / 1.8) * exp(-uClickTime * 1.6);
  pos += normalize(pos - uClick + 1e-4) * ring * (2.2 + aRand.x * 1.6);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float twinkle = 0.72 + 0.28 * sin(uTime * (1.2 + aRand.x * 2.2) + aRand.y * 40.0);
  float size = aSize * uSize * (1.0 + turb * 0.35 + abs(uVel) * 0.9 + ring * 0.8) * twinkle;
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 1.0, 64.0);

  vec3 base = mix(uPalA, uPalB, smoothstep(0.35, 0.75, aRand.z));
  base = mix(base, uPalC, rep * 1.15 + ring * 1.2);
  base += abs(uVel) * vec3(0.22, 0.16, 0.04);
  vColor = base;
  vFade = twinkle * (1.0 + ring * 1.5);
}
`;

const FRAG = /* glsl */`
uniform float uOpacity;
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float alpha = pow(core, 1.7) * uOpacity * vFade;
  gl_FragColor = vec4(vColor * (0.5 + core * 0.95), alpha);
}
`;

/* Pass hậu kỳ cuối */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVel: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVel;
    uniform float uTime;
    uniform float uGrain;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ca = 0.0011 + min(abs(uVel) * 0.012, 0.010);
      vec2 off = c * (ca * (0.7 + r2 * 3.2)) * 2.0;
      float r = texture2D(tDiffuse, uv + off).r;
      vec4 base = texture2D(tDiffuse, uv);
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, base.g, b);
      float vig = 1.0 - smoothstep(0.35, 0.95, length(c)) * 0.55;
      col *= vig;
      float g = fract(sin(dot(uv + fract(uTime * 0.31), vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

/* ============================================================
   SHADERS — mouse trail (đặc sản Active Theory)
   ============================================================ */
const TRAIL_VERT = /* glsl */`
uniform float uScale;
attribute float aLife;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp((2.0 + aLife * 9.0) * uScale / max(-mv.z, 0.1) * 0.02, 1.0, 26.0);
  gl_Position = projectionMatrix * mv;
}
`;
const TRAIL_FRAG = /* glsl */`
varying float vLife;
uniform float uOpacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vLife <= 0.0) discard;
  float core = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vec3(0.85, 0.26, 0.08), vec3(1.0, 0.84, 0.18), vLife);
  gl_FragColor = vec4(col * core, pow(core, 1.6) * vLife * uOpacity);
}
`;

/* ============================================================
   SHADERS — liquid field (nền aurora chất lỏng, chất Lusion)
   ============================================================ */
const LIQ_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const LIQ_FRAG = /* glsl */`
uniform float uTime;
uniform float uVel;
uniform vec2  uMouse;
uniform float uLiqOpacity;
uniform vec3  uColA;
uniform vec3  uColB;
varying vec2 vUv;

vec2 hash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453123); }
float noise(vec2 p){
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
  vec3 n = h*h*h*h*vec3(dot(a, hash(i)), dot(b, hash(i+o)), dot(c, hash(i+1.0)));
  return dot(n, vec3(70.0));
}
float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) { v += amp * noise(p); p = p * 2.02; amp *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.05;
  vec2 flow = vec2(fbm(uv * 1.6 + t), fbm(uv * 1.6 - t + 3.7));
  float f = fbm(uv * 2.2 + flow * (0.8 + abs(uVel) * 2.5) + uMouse * 0.35);
  float f2 = fbm(uv * 4.5 - flow * 1.4 - t * 2.0);
  float aurora = smoothstep(-0.15, 0.85, f);
  vec3 col = mix(uColA * 0.05, uColB, aurora);
  col += uColA * smoothstep(0.55, 1.0, f2) * 0.35;
  float alpha = (0.10 + aurora * 0.16 + abs(uVel) * 0.10) * uLiqOpacity;
  gl_FragColor = vec4(col, alpha);
}
`;

/* ============================================================
   SINH HÌNH THÁI HẠT
   ============================================================ */
function sampleCanvas(draw, count, worldW) {
  const W = 1024, H = 640;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  draw(ctx, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const cand = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 120) cand.push(x, y);
    }
  }
  const n = cand.length / 2;
  const out = new Float32Array(count * 3);
  const s = worldW / W;
  for (let i = 0; i < count; i++) {
    if (n > 0) {
      const k = (Math.random() * n) | 0;
      const px = cand[k * 2] + (Math.random() - 0.5) * 2;
      const py = cand[k * 2 + 1] + (Math.random() - 0.5) * 2;
      out[i * 3]     = (px - W / 2) * s;
      out[i * 3 + 1] = -(py - H / 2) * s;
    } else {
      out[i * 3] = (Math.random() - 0.5) * worldW;
      out[i * 3 + 1] = (Math.random() - 0.5) * worldW * 0.5;
    }
    out[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
  }
  return out;
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function buildTargets(count) {
  const text = sampleCanvas((ctx, W, H) => {
    ctx.font = '900 300px "Be Vietnam Pro", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BẰNG', W / 2, H / 2 + 10);
  }, count, 17);

  const galaxy = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const arm = i % 3;
    const t = Math.pow(Math.random(), 0.55);
    const r = 0.4 + t * 9.2;
    const ang = t * 4.6 + arm * (Math.PI * 2 / 3) + gauss() * (0.16 + t * 0.22);
    galaxy[i * 3]     = Math.cos(ang) * r + gauss() * 0.35;
    galaxy[i * 3 + 1] = gauss() * (1.15 - t * 0.75);
    galaxy[i * 3 + 2] = Math.sin(ang) * r + gauss() * 0.35;
  }

  const knot = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random() * Math.PI * 2;
    const R = 2.35, rr = 0.85;
    const x = (R + rr * Math.cos(3 * t)) * Math.cos(2 * t);
    const y = (R + rr * Math.cos(3 * t)) * Math.sin(2 * t);
    const z = rr * Math.sin(3 * t);
    knot[i * 3]     = x + gauss() * 0.28;
    knot[i * 3 + 1] = z * 1.25 + gauss() * 0.28;
    knot[i * 3 + 2] = y + gauss() * 0.28;
  }

  const helix = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    if (Math.random() < 0.14) {
      const level = Math.floor(t * 11) / 11;
      const ang = level * Math.PI * 6;
      const k = Math.random() * 2 - 1;
      helix[i * 3]     = Math.cos(ang) * 3.4 * k;
      helix[i * 3 + 1] = (level - 0.5) * 15;
      helix[i * 3 + 2] = Math.sin(ang) * 3.4 * k;
    } else {
      const strand = Math.random() < 0.5 ? 0 : Math.PI;
      const ang = t * Math.PI * 6 + strand;
      helix[i * 3]     = Math.cos(ang) * 3.4 + gauss() * 0.12;
      helix[i * 3 + 1] = (t - 0.5) * 15 + gauss() * 0.08;
      helix[i * 3 + 2] = Math.sin(ang) * 3.4 + gauss() * 0.12;
    }
  }

  const star = sampleCanvas((ctx, W, H) => {
    const cx = W / 2, cy = H / 2, R = 300, r = R * 0.4;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 === 0 ? R : r;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }, count, 15);

  const sphere = new Float32Array(count * 3);
  const GA = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / count);
    const theta = GA * k;
    const r = 7.1 * (0.985 + Math.random() * 0.03);
    sphere[i * 3]     = r * Math.cos(theta) * Math.sin(phi);
    sphere[i * 3 + 1] = r * Math.cos(phi);
    sphere[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
  }

  return [text, galaxy, knot, helix, star, sphere];
}

/* ============================================================
   KHỞI TẠO SCENE
   ============================================================ */
let renderer, scene, camera, composer, bloom, finalPass;
let points, group, trail, trailGeo, liquid, shardMesh, shardGroup;
let webglOK = true;

function initGL() {
  const canvas = document.getElementById('gl');
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
  } catch (e) {
    webglOK = false;
    document.body.classList.add('no-webgl');
    return;
  }
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const msg = 'VS: ' + gl.getShaderInfoLog(vs) +
      ' | FS: ' + gl.getShaderInfoLog(fs) +
      ' | PROG: ' + gl.getProgramInfoLog(program);
    (window.__dvbShaderErrors = window.__dvbShaderErrors || []).push(String(msg).slice(0, 1200));
  };

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060a');

  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 0.6, 120); // intro sẽ lao từ đây vào

  group = new THREE.Group();
  scene.add(group);

  /* --- Hệ hạt chính --- */
  const N = CFG.count;
  const targets = buildTargets(N);
  const rand = new Float32Array(N * 3);
  const size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    rand[i * 3] = Math.random();
    rand[i * 3 + 1] = Math.random();
    rand[i * 3 + 2] = Math.random();
    size[i] = 0.05 + Math.pow(Math.random(), 3) * 0.14;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aT0', new THREE.BufferAttribute(targets[0], 3));
  geo.setAttribute('aT1', new THREE.BufferAttribute(targets[1], 3));
  geo.setAttribute('aT2', new THREE.BufferAttribute(targets[2], 3));
  geo.setAttribute('aT3', new THREE.BufferAttribute(targets[3], 3));
  geo.setAttribute('aT4', new THREE.BufferAttribute(targets[4], 3));
  geo.setAttribute('aT5', new THREE.BufferAttribute(targets[5], 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uSize: { value: CFG.isMobile ? 1.35 : 1.0 },
      uScale: { value: 1 },
      uVel: { value: 0 },
      uNoiseAmp: { value: CFG.reduced ? 0.6 : 2.4 },
      uRepel: { value: 2.6 },
      uMouse: { value: new THREE.Vector3(999, 999, 999) },
      uClick: { value: new THREE.Vector3(999, 999, 999) },
      uClickTime: { value: 999 },
      uPalA: { value: PALETTES[0].a.clone() },
      uPalB: { value: PALETTES[0].b.clone() },
      uPalC: { value: PALETTES[0].c.clone() },
      uOpacity: { value: 0 },
    },
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 1;
  group.add(points);

  /* --- Liquid field: nền aurora fbm --- */
  const liqMat = new THREE.ShaderMaterial({
    vertexShader: LIQ_VERT,
    fragmentShader: LIQ_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uVel: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uColA: { value: new THREE.Color('#d84315') },
      uColB: { value: new THREE.Color('#fbc02d') },
      uLiqOpacity: { value: 0 },
    },
  });
  liquid = new THREE.Mesh(new THREE.PlaneGeometry(260, 170), liqMat);
  liquid.position.set(0, 0, -15);
  liquid.renderOrder = -1;
  liquid.frustumCulled = false;
  scene.add(liquid);

  /* --- Mouse trail --- */
  if (CFG.trailCount > 0) {
    const TN = CFG.trailCount;
    const tPos = new Float32Array(TN * 3);
    const tLife = new Float32Array(TN);
    for (let i = 0; i < TN; i++) { tPos[i * 3 + 2] = 50; tLife[i] = Math.random() * -2; }
    trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    trailGeo.setAttribute('aLife', new THREE.BufferAttribute(tLife, 1));
    trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const trailMat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uOpacity: { value: 0 },
      },
    });
    trail = new THREE.Points(trailGeo, trailMat);
    trail.frustumCulled = false;
    trail.renderOrder = 2;
    scene.add(trail);
  }

  /* --- Instanced shards (chất Igloo) --- */
  if (CFG.shardCount > 0) {
    const SN = CFG.shardCount;
    const shardGeo = new THREE.OctahedronGeometry(0.5, 0);
    const shardMat = new THREE.MeshBasicMaterial({
      color: '#fbc02d',
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, SN);
    shardMesh.frustumCulled = false;
    shardGroup = new THREE.Group();
    shardGroup.add(shardMesh);
    scene.add(shardGroup);

    // Dữ liệu bay của từng mảnh
    shardMesh.userData.parts = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < SN; i++) {
      const r = 11 + Math.random() * 26;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      shardMesh.userData.parts.push({
        x: r * Math.sin(ph) * Math.cos(th),
        y: r * Math.cos(ph) * 0.6,
        z: r * Math.sin(ph) * Math.sin(th),
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        sr: 0.2 + Math.random() * 0.7,
        wr: 0.1 + Math.random() * 0.5,
        scale: 0.25 + Math.pow(Math.random(), 2) * 1.1,
      });
      dummy.position.set(0, 0, 0);
      dummy.updateMatrix();
      shardMesh.setMatrixAt(i, dummy.matrix);
    }
    shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /* --- Post-processing --- */
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    CFG.isMobile ? 0.4 : 0.7, 0.55, 0.18
  );
  composer.addPass(bloom);
  finalPass = new ShaderPass(FinalShader);
  finalPass.renderToScreen = true;
  composer.addPass(finalPass);

  applySize();
  addEventListener('resize', applySize, { passive: true });

  window.__dvb = {
    info: () => renderer.info.render,
    renderer: () => renderer,
    shaderErrors: () => window.__dvbShaderErrors || null,
    uniforms: () => points.material.uniforms,
  };
}

let currentDpr = Math.min(devicePixelRatio || 1, 2);

function applySize() {
  if (!webglOK) return;
  currentDpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(currentDpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(currentDpr);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const hPhys = renderer.domElement.height;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const s = (hPhys * 0.5) / Math.tan(fovRad / 2);
  points.material.uniforms.uScale.value = s;
  if (trail) trail.material.uniforms.uScale.value = s;
}

/* ============================================================
   CAMERA RIG
   ============================================================ */
const camPts = [
  new THREE.Vector3(0, 0.6, 30),
  new THREE.Vector3(-14, 5, 24),
  new THREE.Vector3(13, -3.5, 20),
  new THREE.Vector3(2, 1.2, 15.5),
  new THREE.Vector3(0, 0, 13.5),
  new THREE.Vector3(0, 4.5, 21),
];
const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'catmullrom', 0.5);
const tgtCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0.4, 0),
], false, 'catmullrom', 0.5);

function initScroll() {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.ticker.lagSmoothing(0);

  const lenis = new Lenis({
    autoRaf: false,
    lerp: CFG.reduced ? 1 : 0.1,
    smoothWheel: !CFG.reduced,
  });
  lenis.on('scroll', ScrollTrigger.update);
  lenis.stop(); // khoá cuộn trong lúc intro
  window.__lenis = lenis; // debug hook

  const proxy = { morph: 0 };
  gsap.to(proxy, {
    morph: 5,
    ease: 'none',
    scrollTrigger: {
      trigger: '#content',
      start: 'top top',
      end: 'bottom bottom',
      scrub: CFG.reduced ? true : 1.2,
    },
    onUpdate: () => { engine.morphTarget = proxy.morph; },
  });

  return lenis;
}

/* ============================================================
   ENGINE — một vòng lặp duy nhất
   ============================================================ */
const engine = {
  morphTarget: 0,
  morph: 0,
  velSmooth: 0,
  spinAngle: 0,
  clickAge: 999,
  fpsAcc: 0, fpsN: 0,
  slowFrames: 0,
};

function startEngine(lenis) {
  const mat = points.material.uniforms;
  const liq = liquid.material.uniforms;
  const railSteps = [...document.querySelectorAll('.rail-step')];
  const hudChapterEl = document.getElementById('hudChapter');
  const navLinks = [...document.querySelectorAll('.topnav a[data-ch]')];
  const mouseNdc = new THREE.Vector2(10, 10);
  const mouseUv = new THREE.Vector2(0.5, 0.5);
  const mouseWorld = new THREE.Vector3(999, 999, 999);
  const mouseLocal = new THREE.Vector3(999, 999, 999);
  const clickLocal = new THREE.Vector3(999, 999, 999);
  const colA = new THREE.Color(), colB = new THREE.Color(), colC = new THREE.Color();
  const rayVec = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  let lastT = 0;
  let dt = 0.016;

  const trailData = trail ? {
    pos: trailGeo.attributes.position.array,
    life: trailGeo.attributes.aLife.array,
    n: CFG.trailCount,
  } : null;

  addEventListener('pointermove', (e) => {
    mouseNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    mouseUv.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
  }, { passive: true });

  // Click shockwave
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('a, button')) return;
    rayVec.set(mouseNdc.x, mouseNdc.y, 0.5).unproject(camera);
    rayVec.sub(camera.position).normalize();
    const tHit = rayVec.z !== 0 ? -camera.position.z / rayVec.z : 1;
    mouseWorld.copy(camera.position).addScaledVector(rayVec, clamp(tHit, 5, 60));
    clickLocal.copy(mouseWorld);
    group.worldToLocal(clickLocal);
    mat.uClick.value.copy(clickLocal);
    engine.clickAge = 0;
  }, { passive: true });

  gsap.ticker.add((time, deltaMS) => {
    if (document.hidden) { lastT = time; return; }
    lenis.raf(time * 1000);
    dt = clamp(time - lastT, 0.001, 0.05);
    lastT = time;

    engine.morph = lerp(engine.morph, engine.morphTarget, 0.12);
    const rawVel = clamp((lenis.velocity || 0) / 70, -1, 1);
    engine.velSmooth = lerp(engine.velSmooth, rawVel, 0.08);

    const u = mat;
    u.uTime.value = time;
    u.uMorph.value = engine.morph;
    u.uVel.value = CFG.reduced ? 0 : engine.velSmooth;
    finalPass.uniforms.uVel.value = CFG.reduced ? 0 : engine.velSmooth;
    finalPass.uniforms.uTime.value = time;
    engine.clickAge = Math.min(engine.clickAge + dt, 999);
    u.uClickTime.value = engine.clickAge;

    /* --- camera trên đường cong --- */
    const p = clamp(engine.morph / 5, 0, 1);
    const pos = camCurve.getPointAt(p);
    const tgt = tgtCurve.getPointAt(p);
    const targetFov = 55 + Math.abs(engine.velSmooth) * 14;
    camera.fov = lerp(camera.fov, targetFov, 0.06);
    camera.updateProjectionMatrix();
    camera.position.lerp(pos, 0.14);
    camera.lookAt(tgt);

    /* --- xoay group theo chương --- */
    const segF = clamp(engine.morph, 0, 5);
    const i0 = Math.min(Math.floor(segF), 4);
    const amp = lerp(SPIN_AMP[i0], SPIN_AMP[Math.min(i0 + 1, 5)], segF - i0);
    engine.spinAngle += (amp * 0.35 + Math.abs(engine.velSmooth) * 0.05) * dt * 60 * 0.016;
    group.rotation.y = engine.spinAngle + Math.sin(time * 0.13) * 0.04;

    /* --- chuột world + local --- */
    rayVec.set(mouseNdc.x, mouseNdc.y, 0.5).unproject(camera);
    rayVec.sub(camera.position).normalize();
    const tHit = rayVec.z !== 0 ? -camera.position.z / rayVec.z : 1;
    mouseWorld.copy(camera.position).addScaledVector(rayVec, clamp(tHit, 5, 60));
    mouseLocal.copy(mouseWorld);
    group.worldToLocal(mouseLocal);
    u.uMouse.value.lerp(mouseLocal, 0.1);
    liq.uMouse.value.lerp(mouseUv, 0.06);

    /* --- liquid field --- */
    liq.uTime.value = time;
    liq.uVel.value = CFG.reduced ? 0 : engine.velSmooth;
    liq.uColA.value.copy(u.uPalC.value);
    liq.uColB.value.copy(u.uPalA.value);

    /* --- mouse trail (CPU, N nhỏ) --- */
    if (trailData) {
      const { pos: tp, life: tl, n } = trailData;
      const spawnBoost = Math.min(1, Math.abs(engine.velSmooth) + 0.15);
      for (let i = 0; i < n; i++) {
        tl[i] -= dt * 1.5;
        if (tl[i] <= 0) {
          // tái sinh tại vị trí chuột (world) với vệt lan nhẹ
          tp[i * 3]     = mouseWorld.x + gauss() * 0.25;
          tp[i * 3 + 1] = mouseWorld.y + gauss() * 0.25;
          tp[i * 3 + 2] = clamp(mouseWorld.z + gauss() * 0.6, -6, 8);
          tl[i] = 0.35 + Math.random() * 0.5 * spawnBoost;
        } else {
          tp[i * 3 + 1] += dt * 0.5;
          tp[i * 3]     += Math.sin(time * 3 + i) * dt * 0.15;
        }
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.aLife.needsUpdate = true;
    }

    /* --- instanced shards bay chậm --- */
    if (shardMesh) {
      const parts = shardMesh.userData.parts;
      const visAmp = lerp(SHARD_VIS[i0], SHARD_VIS[Math.min(i0 + 1, 5)], segF - i0);
      shardMesh.material.opacity = 0.16 * visAmp * u.uOpacity.value;
      const px = (mouseNdc.x * 2.2) * (1 - visAmp * 0.5); // parallax theo chuột
      const py = (mouseNdc.y * 1.4) * (1 - visAmp * 0.5);
      shardGroup.position.lerp(new THREE.Vector3(px, py, 0), 0.03);
      shardGroup.rotation.y = time * 0.02 + engine.velSmooth * 0.1;
      for (let i = 0; i < parts.length; i++) {
        const s = parts[i];
        s.rx += s.wr * dt * 0.7;
        s.ry += s.wr * dt * 0.5;
        dummy.position.set(s.x, s.y + Math.sin(time * s.sr + i) * 0.6, s.z);
        dummy.rotation.set(s.rx, s.ry, s.rx * 0.5);
        const sc = s.scale * (1 + Math.abs(engine.velSmooth) * 0.4);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        shardMesh.setMatrixAt(i, dummy.matrix);
      }
      shardMesh.instanceMatrix.needsUpdate = true;
    }

    /* --- palette theo chương --- */
    const j0 = Math.min(Math.floor(segF), 4);
    const j1 = Math.min(j0 + 1, 5);
    const jf = clamp(segF - j0, 0, 1);
    colA.copy(PALETTES[j0].a).lerp(PALETTES[j1].a, jf);
    colB.copy(PALETTES[j0].b).lerp(PALETTES[j1].b, jf);
    colC.copy(PALETTES[j0].c).lerp(PALETTES[j1].c, jf);
    u.uPalA.value.copy(colA);
    u.uPalB.value.copy(colB);
    u.uPalC.value.copy(colC);

    composer.render();

    /* --- HUD + adaptive DPR --- */
    engine.fpsAcc += deltaMS / 1000; engine.fpsN++;
    if (engine.fpsAcc >= 0.5) {
      const fps = Math.round(engine.fpsN / engine.fpsAcc);
      engine.fpsAcc = 0; engine.fpsN = 0;
      hudFpsEl.textContent = fps + ' FPS';
      // nhãn chương đọc engine.morph mỗi 0.5s — luôn khớp giá trị đã lerp
      const ch = clamp(Math.round(engine.morph), 0, 5);
      railSteps.forEach((s, k) => s.classList.toggle('is-active', k === ch));
      hudChapterEl.textContent = 'CH.0' + ch;
      navLinks.forEach((l) => l.classList.toggle('is-active', +l.dataset.ch === ch));
      if (fps < 48 && currentDpr > 1) {
        engine.slowFrames++;
        if (engine.slowFrames >= 4) {
          currentDpr = Math.max(1, currentDpr - 0.5);
          applySize();
          if (bloom) bloom.strength = Math.max(0.25, bloom.strength - 0.15);
          engine.slowFrames = 0;
        }
      } else {
        engine.slowFrames = 0;
      }
    }
    // Tự phục hồi kích thước: pane/webview đôi khi mở với viewport 0
    engine.sizeCheck = (engine.sizeCheck || 0) + 1;
    if (engine.sizeCheck >= 30) {
      engine.sizeCheck = 0;
      const expectW = Math.floor(innerWidth * currentDpr);
      const expectH = Math.floor(innerHeight * currentDpr);
      if (renderer.domElement.width !== expectW || renderer.domElement.height !== expectH) {
        applySize();
      }
    }
  });
}

/* ============================================================
   UI — preloader, intro, menu, strips, reveals, cursor
   ============================================================ */
let hudFpsEl;

function initUI(lenisRef) {
  hudFpsEl = document.getElementById('hudFps');
  document.getElementById('year').textContent = new Date().getFullYear();

  /* menu fullscreen */
  const toggle = document.querySelector('.topnav-toggle');
  const overlay = document.getElementById('menuOverlay');
  const menuItems = overlay.querySelectorAll('.menu-item');
  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    overlay.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      gsap.fromTo(menuItems,
        { yPercent: 120, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power4.out', stagger: 0.06, delay: 0.15 });
    }
  }
  toggle.addEventListener('click', () => setMenu(!menuOpen));
  overlay.querySelector('.menu-close').addEventListener('click', () => setMenu(false));
  overlay.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    setMenu(false);
    const target = document.querySelector(a.getAttribute('href'));
    if (target && lenisRef.lenis) {
      e.preventDefault();
      lenisRef.lenis.scrollTo(target, { duration: 1.6 });
    }
  });

  /* con trỏ tuỳ biến */
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (matchMedia('(hover: hover)').matches) {
    const pos = { x: -100, y: -100 }, ringPos = { x: -100, y: -100 };
    addEventListener('pointermove', (e) => { pos.x = e.clientX; pos.y = e.clientY; }, { passive: true });
    gsap.ticker.add(() => {
      ringPos.x = lerp(ringPos.x, pos.x, 0.16);
      ringPos.y = lerp(ringPos.y, pos.y, 0.16);
      dot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%,-50%)`;
      dot.style.opacity = ring.style.opacity = 1;
    });
    document.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('pointerenter', () => ring.classList.add('is-hover'));
      el.addEventListener('pointerleave', () => ring.classList.remove('is-hover'));
    });
  }

  /* nút magnetic */
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2;
      const dy = e.clientY - r.top - r.height / 2;
      gsap.to(el, { x: dx * 0.18, y: dy * 0.18, duration: 0.4, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,0.4)' });
    });
  });

  /* hover glow vị trí trên thẻ hệ sinh thái */
  document.querySelectorAll('.eco-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    });
  });

  /* kinetic strips — chạy theo vận tốc cuộn */
  const strips = [...document.querySelectorAll('.kstrip-track')].map((el) => ({
    el, x: 0, dir: parseFloat(el.dataset.dir || 1), w: 0,
  }));
  const measure = () => strips.forEach((s) => { s.w = s.el.scrollWidth / 2; });
  addEventListener('resize', measure, { passive: true });
  measure();
  gsap.ticker.add((t, dms) => {
    const dt = clamp(dms / 1000, 0.001, 0.05);
    const spd = (engine.velSmooth || 0);
    strips.forEach((s) => {
      if (!s.w) return;
      s.x -= (70 + Math.abs(spd) * 420) * s.dir * dt * (spd < -0.02 ? -1 : 1);
      if (s.x <= -s.w) s.x += s.w;
      if (s.x > 0) s.x -= s.w;
      s.el.style.transform = `translate3d(${s.x}px,0,0) skewX(${clamp(spd * -6, -8, 8)}deg)`;
    });
  });
}

function initReveals() {
  gsap.set('#ch-hero .reveal-line', { autoAlpha: 0, y: 26 });

  /* Chuẩn hoá mọi dòng chữ về yPercent — ẩn/hiện luôn khớp % */
  if (!CFG.reduced) gsap.utils.toArray('.line').forEach((l) => gsap.set(l, { yPercent: 110, y: 0 }));

  gsap.utils.toArray('.chapter')
    .filter((s) => s.id !== 'ch-hero')
    .forEach((section) => {
      const lines = section.querySelectorAll('.line');
      const fades = section.querySelectorAll('.reveal-line');
      const skills = section.querySelectorAll('.skill-bar span');
      const cards = section.querySelectorAll('.eco-card, .orbit, .fact');

      gsap.set(fades, { autoAlpha: 0, y: 26 });
      gsap.set(cards, { autoAlpha: 0, y: 34 });

      ScrollTrigger.create({
        trigger: section,
        start: 'top 62%',
        onEnter: () => {
          gsap.to(lines, { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.09, overwrite: true });
          gsap.to(fades, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12, delay: 0.25, overwrite: true });
          gsap.to(cards, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, delay: 0.35, overwrite: true });
          skills.forEach((bar, k) => {
            gsap.to(bar, {
              scaleX: parseFloat(bar.dataset.level || 0.8),
              duration: 1.2, delay: 0.5 + k * 0.08, ease: 'power3.out', overwrite: true,
            });
          });
        },
        onLeaveBack: () => {
          gsap.to(lines, { yPercent: 110, duration: 0.5, ease: 'power3.in', overwrite: true });
          gsap.to([...fades, ...cards], { autoAlpha: 0, y: 26, duration: 0.4, overwrite: true });
          gsap.to(skills, { scaleX: 0, duration: 0.4, overwrite: true });
        },
      });
    });

  if (!CFG.reduced) {
    const titles = gsap.utils.toArray('.chapter-title, .hero-title, .pride-title');
    const skewSetters = titles.map((t) => gsap.quickTo(t, 'skewY', { duration: 0.5, ease: 'power3.out' }));
    gsap.ticker.add(() => {
      const sk = clamp(engine.velSmooth * -5, -6, 6);
      skewSetters.forEach((set) => set(sk));
    });
  }

  const railFill = document.getElementById('railFill');
  ScrollTrigger.create({
    trigger: '#content',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      railFill.style.height = (self.progress * 100).toFixed(2) + '%';
    },
  });
}

/* ============================================================
   BOOT — preloader → intro điện ảnh → trải nghiệm
   ============================================================ */
async function boot() {
  const lenisRef = {};
  initUI(lenisRef);

  const preCount = document.getElementById('preCount');
  const preFill = document.getElementById('preBarFill');
  const pre = document.getElementById('preloader');
  const pct = { v: 0 };
  const paint = () => {
    preCount.textContent = String(Math.round(pct.v)).padStart(2, '0');
    preFill.style.width = pct.v + '%';
  };
  const fake = gsap.to(pct, { v: 88, duration: 1.6, ease: 'power1.inOut', onUpdate: paint });

  // Không bao giờ để việc tải font chặn boot — tối đa chờ 1.5s rồi dùng fallback
  await Promise.race([
    document.fonts.load('900 300px "Be Vietnam Pro"').catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  initGL();

  if (!webglOK) {
    fake.kill();
    pct.v = 100; paint();
    setTimeout(() => { pre.classList.add('is-done'); document.body.classList.add('no-webgl'); }, 400);
    return;
  }

  // Warm-up shader TRONG preloader để tránh khựng shader giữa chừng
  renderer.compile(scene, camera);
  composer.render();

  await new Promise((r) => setTimeout(r, 250));
  fake.kill();
  gsap.to(pct, {
    v: 100, duration: 0.45, ease: 'power2.out',
    onUpdate: paint,
    onComplete: () => {
      pre.classList.add('is-done');

      const lenis = initScroll();
      lenisRef.lenis = lenis;
      startEngine(lenis);
      initReveals();

      /* ============ INTRO ĐIỆN ẢNH ============ */
      const u = points.material.uniforms;
      const liq = liquid.material.uniforms;
      const intro = document.getElementById('intro');
      const introWord = intro.querySelector('.intro-word');
      const introSub = intro.querySelector('.intro-sub');
      const introLine = intro.querySelector('.intro-line');

      if (CFG.reduced) {
        intro.classList.add('is-done');
        u.uOpacity.value = 1;
        liq.uLiqOpacity.value = 1;
        if (trail) trail.material.uniforms.uOpacity.value = 1;
        camera.position.set(0, 0.6, 30);
        lenis.start();
        gsap.to('#ch-hero .line', { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.12, delay: 0.3 });
        gsap.to('#ch-hero .reveal-line', { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.14, delay: 0.7 });
        return;
      }

      camera.position.set(0, 0.6, 120);
      u.uNoiseAmp.value = 6.5; // hỗn loạn lúc lao vào

      const tl = gsap.timeline({
        onComplete: () => {
          intro.classList.add('is-done');
          lenis.start();
        },
      });

      tl.set(intro, { autoAlpha: 1 })
        .fromTo(introLine, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' }, 0.1)
        .fromTo(introWord, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'power4.out' }, 0.35)
        .fromTo(introSub, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.85)
        // camera lao xuyên vũ trụ hạt vào hero
        .addLabel('dive', 1.5)
        .to(introWord, { yPercent: -110, duration: 0.8, ease: 'power3.in' }, 'dive')
        .to(introSub, { autoAlpha: 0, duration: 0.4 }, 'dive')
        .to(camera.position, {
          z: 30, duration: 2.3, ease: 'power3.inOut',
          onUpdate: () => { camera.lookAt(0, 0, 0); },
        }, 'dive')
        .to(u.uNoiseAmp, { value: 2.4, duration: 2.6, ease: 'power2.out' }, 'dive')
        .to(u.uOpacity, { value: 1, duration: 1.4, ease: 'power2.out' }, 'dive+=0.4')
        .to(liq.uLiqOpacity, { value: 1, duration: 1.6, ease: 'power1.out' }, 'dive+=0.6')
        .to(intro, { autoAlpha: 0, duration: 0.6, ease: 'power1.inOut' }, 'dive+=1.7');

      if (trail) gsap.to(trail.material.uniforms.uOpacity, { value: 1, duration: 1.5, delay: 2.6 });

      /* chữ hero bung ra sau intro */
      gsap.to('#ch-hero .line', { yPercent: 0, duration: 1.3, ease: 'power4.out', stagger: 0.12, delay: 3.4 });
      gsap.to('#ch-hero .reveal-line', { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.14, delay: 3.9 });

      /* dọn dẹp bộ nhớ khi rời trang */
      addEventListener('pagehide', () => {
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const m = o.material;
            Object.values(m.uniforms || {}).forEach((uni) => {
              if (uni.value && uni.value.dispose) uni.value.dispose();
            });
            m.dispose();
          }
        });
        composer.dispose?.();
        renderer.dispose();
      }, { once: true });
    },
  });
}

boot();
