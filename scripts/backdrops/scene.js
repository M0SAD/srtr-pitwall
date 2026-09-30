import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MODE = new URLSearchParams(location.search).get("mode") || "day";
const NIGHT = MODE === "night";
const COCKPIT = MODE === "cockpit";
const W = 1920, H = 1080;

// ---------- deterministik rastgele ----------
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + rnd() * (b - a);

// ---------- dokular ----------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
function noise(g, w, h, base, amp, speck = 0, speckAmp = 0) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    let r = base[0] + n, gg = base[1] + n, b = base[2] + n;
    if (speck && rnd() < speck) { const s = (rnd() - 0.4) * speckAmp; r += s; gg += s; b += s; }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, n, color, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rr(rmin, rmax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace("A", alpha));
    gr.addColorStop(1, color.replace("A", 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const asphaltTex = canvasTex(1024, 1024, (g, w, h) => {
  noise(g, w, h, NIGHT ? [62, 63, 66] : [108, 108, 110], 30, 0.08, 70);
  blotches(g, w, h, 40, "rgba(20,20,22,A)", 40, 180, 0.08);
  blotches(g, w, h, 30, "rgba(120,120,125,A)", 30, 120, 0.08);
  // ince çatlak/yama izleri
  g.strokeStyle = "rgba(25,25,27,0.0)"; g.lineWidth = 0;
  for (let i = 0; i < 14; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rr(-40, 40); y += rr(-60, 60); g.lineTo(x, y); } g.stroke(); }
});
const rubberTex = canvasTex(256, 1024, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, "rgba(10,10,10,0)"); gr.addColorStop(0.3, "rgba(10,10,10,0.55)"); gr.addColorStop(0.7, "rgba(10,10,10,0.55)"); gr.addColorStop(1, "rgba(10,10,10,0)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rr(0.05, 0.2)})`; g.fillRect(rr(w * 0.2, w * 0.8), rnd() * h, rr(1, 3), rr(20, 120)); }
});
rubberTex.colorSpace = THREE.NoColorSpace;
const grassTex = canvasTex(1024, 1024, (g, w, h) => {
  noise(g, w, h, NIGHT ? [30, 52, 26] : [70, 118, 48], 30, 0.2, 30);
  // biçilmiş çim şeritleri
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "rgba(255,255,200,0.03)" : "rgba(0,30,0,0.03)"; g.fillRect(0, (i * h) / 8, w, h / 8); }
  blotches(g, w, h, 50, "rgba(90,110,40,A)", 30, 120, 0.12);
  blotches(g, w, h, 30, "rgba(20,50,15,A)", 30, 140, 0.15);
});
const gravelTex = canvasTex(512, 512, (g, w, h) => noise(g, w, h, [168, 150, 118], 60, 0.3, 80));
const kerbTex = canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = "#d62b25"; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = "#f4f4f0"; g.fillRect(0, h / 2, w, h / 2);
  const img = g.getImageData(0, 0, w, h); for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 18; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } g.putImageData(img, 0, 0);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
});
const lineTex = canvasTex(32, 256, (g, w, h) => { noise(g, w, h, [232, 232, 226], 20); g.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 30; i++) g.fillRect(rnd() * w, rnd() * h, 2, rr(4, 20)); });
const BRANDS = [
  ["#0b3d91", "#ffffff", "APEX RACING"], ["#111111", "#ff8a2a", "PITWALL"], ["#c8102e", "#ffffff", "TURBO OIL"], ["#ffcc00", "#111111", "GRIPMAX TYRES"],
  ["#1b7f3b", "#ffffff", "VELOCITA"], ["#ffffff", "#0b3d91", "NORDIC FUEL"], ["#222222", "#33ceff", "KAIROS TIMING"], ["#e8e8e8", "#c8102e", "RED LINE"],
];
const adsTex = canvasTex(4096, 128, (g, w, h) => {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const [bg, fg, txt] = BRANDS[i % BRANDS.length];
    g.fillStyle = bg; g.fillRect((i * w) / n, 0, w / n, h);
    g.fillStyle = fg; g.font = "900 62px Arial Black, Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, (i * w) / n + w / n / 2, h / 2 + 3, w / n - 30);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect((i * w) / n, 0, 3, h);
  }
});
const fenceTex = canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = "rgba(200,205,210,0.9)"; g.lineWidth = 2;
  for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
});
const seatsTex = canvasTex(512, 512, (g, w, h) => {
  const cols = ["#1f4fa8", "#2560c9", "#c8102e", "#e9e9e9", "#f2c300", "#1a1a1a", "#2e8b57", "#ff7a1a", "#d0d0d0"];
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 6) { g.fillStyle = rnd() < 0.35 ? cols[(rnd() * cols.length) | 0] : "#3a4a6a"; g.fillRect(x, y, 5, 6); }
});
const carbonTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#121315"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? "#1c1d20" : "#0e0f11"; g.fillRect(x, y, 8, 8); }
});

// ---------- sahne ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setSize(W, H);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = NIGHT ? 0.9 : 0.62;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(COCKPIT ? 68 : 52, W / H, 0.05, 6000);

// ---------- pist eğrisi ----------
const pts = [
  [0, -260], [0, -120], [0, 0], [2, 90], [14, 170], [48, 232], [100, 262], [160, 270], [215, 262],
  [262, 238], [292, 200], [300, 150], [312, 100], [345, 62], [400, 50], [470, 60],
].map(([x, z]) => new THREE.Vector3(x, 0, z));
const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
const LEN = curve.getLength();
const TRACK_W = 13;
const N = 1400;
const samples = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const nrm = new THREE.Vector3(tan.z, 0, -tan.x).normalize(); // sağ taraf
  // eğrilik işareti (sağa dönüş +)
  const t2 = Math.min(1, t + 0.004);
  const tan2 = curve.getTangentAt(t2);
  const turn = tan.x * tan2.z - tan.z * tan2.x;
  samples.push({ p, tan, nrm, d: t * LEN, turn });
}

// Ribbon: pistin yanına göre [a,b] ofset aralığında şerit (sağ +)
function ribbon({ a, b, y = 0, from = 0, to = N, vScale = 10, uScale = 1, heightA = 0, heightB = 0, vertical = false, h = 1 }) {
  const pos = [], uv = [], idx = [];
  for (let i = from; i <= to; i++) {
    const s = samples[i];
    const A = s.p.clone().addScaledVector(s.nrm, a);
    const B = s.p.clone().addScaledVector(s.nrm, b);
    if (vertical) {
      pos.push(A.x, y, A.z, A.x, y + h, A.z);
    } else {
      pos.push(A.x, y + heightA, A.z, B.x, y + heightB, B.z);
    }
    const v = s.d / vScale;
    uv.push(0, v, uScale, v);
    if (i < to) { const k = (i - from) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const idxAt = (d) => Math.max(0, Math.min(N, Math.round((d / LEN) * N)));

const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: NIGHT ? 0.55 : 0.92, metalness: 0.0 });
asphaltTex.repeat.set(1, 1);
const track = new THREE.Mesh(ribbon({ a: -TRACK_W / 2, b: TRACK_W / 2, y: 0.02, vScale: 12, uScale: 1.2 }), asphalt);
track.receiveShadow = true;
scene.add(track);

// Kaplama kenarı (asfalt taşkını)
const shoulderMat = new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xc8c8c8, roughness: 0.95, side: THREE.DoubleSide });
scene.add(new THREE.Mesh(ribbon({ a: TRACK_W / 2, b: TRACK_W / 2 + 1.6, y: 0.015, vScale: 12, uScale: 0.2 }), shoulderMat)).receiveShadow = true;
scene.add(new THREE.Mesh(ribbon({ a: -TRACK_W / 2 - 1.6, b: -TRACK_W / 2, y: 0.015, vScale: 12, uScale: 0.2 }), shoulderMat)).receiveShadow = true;

// Beyaz kenar çizgileri
const lineMat = new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.7, side: THREE.DoubleSide });
for (const s of [-1, 1]) {
  const m = new THREE.Mesh(ribbon({ a: s * (TRACK_W / 2 - 0.45), b: s * (TRACK_W / 2 - 0.2), y: 0.03, vScale: 3 }), lineMat);
  m.receiveShadow = true; scene.add(m);
}

// Yarış çizgisi (lastik izi): virajın içine yaklaşan ofset
const rubberMat = new THREE.MeshBasicMaterial({ map: rubberTex, transparent: true, opacity: NIGHT ? 0.35 : 0.45, depthWrite: false, color: 0x000000, side: THREE.DoubleSide });
{
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = samples[i];
    // İç tarafa doğru kayan çizgi
    let off = 0;
    for (let k = -60; k <= 60; k += 6) { const j = Math.max(0, Math.min(N, i + k)); off += samples[j].turn; }
    off = THREE.MathUtils.clamp(off * 900, -4.2, 4.2);
    const c = s.p.clone().addScaledVector(s.nrm, off);
    const A = c.clone().addScaledVector(s.nrm, -1.4), B = c.clone().addScaledVector(s.nrm, 1.4);
    pos.push(A.x, 0.035, A.z, B.x, 0.035, B.z);
    uv.push(0, s.d / 10, 1, s.d / 10);
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  scene.add(new THREE.Mesh(g, rubberMat));
}

// Kerbler: dönüş olan bölgelerde iç ve dış tarafa
const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6, side: THREE.DoubleSide });
{
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const on = Math.abs(samples[i].turn) > 0.0009;
    if (on && start < 0) start = i;
    if ((!on || i === N) && start >= 0) {
      if (i - start > 12) {
        const side = Math.sign(samples[(start + i) >> 1].turn); // + sağ viraj => iç taraf sağ
        for (const s of [side, -side]) {
          const inner = s * (TRACK_W / 2);
          const m = new THREE.Mesh(
            ribbon({ a: inner - s * 0.1, b: inner + s * 1.5, y: 0.04, from: Math.max(0, start - 8), to: Math.min(N, i + 8), vScale: 2.4, heightA: 0, heightB: 0.07 }),
            kerbMat,
          );
          m.receiveShadow = true; m.castShadow = false; scene.add(m);
        }
      }
      start = -1;
    }
  }
}

// Zemin: çim
grassTex.repeat.set(220, 220);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Çakıl havuzu: ilk büyük sağ virajın dışı
gravelTex.repeat.set(1, 1);
const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1, side: THREE.DoubleSide });
scene.add(Object.assign(new THREE.Mesh(ribbon({ a: -TRACK_W / 2 - 1.6, b: -TRACK_W / 2 - 26, y: 0.01, from: idxAt(150), to: idxAt(470), vScale: 6, uScale: 5 }), gravelMat), { receiveShadow: true }));

// Bariyer: armco + reklam panoları + tel çit
const armcoMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide });
const adsMat = new THREE.MeshStandardMaterial({ map: adsTex, roughness: 0.6, side: THREE.DoubleSide });
adsTex.wrapT = THREE.ClampToEdgeWrapping;
const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
fenceTex.colorSpace = THREE.SRGBColorSpace;
function barrier(offset, from, to) {
  const s = Math.sign(offset);
  const arm = new THREE.Mesh(ribbon({ a: offset, b: offset, y: 0.35, vertical: true, h: 0.45, from, to, vScale: 4 }), armcoMat);
  arm.castShadow = true; arm.receiveShadow = true; scene.add(arm);
  const ad = new THREE.Mesh(ribbon({ a: offset + s * 0.6, b: offset + s * 0.6, y: 0.1, vertical: true, h: 1.1, from, to, vScale: 60 }), adsMat);
  // reklam dokusu yataydır: uv'yi çevir
  const uv = ad.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
  ad.castShadow = true; ad.receiveShadow = true; scene.add(ad);
  const fence = new THREE.Mesh(ribbon({ a: offset + s * 1.2, b: offset + s * 1.2, y: 0, vertical: true, h: 4.2, from, to, vScale: 3 }), fenceMat);
  const fuv = fence.geometry.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setX(i, fuv.getX(i) * 1.4);
  scene.add(fence);
  // direkler
  const postG = new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6);
  const posts = [];
  for (let i = from; i <= to; i += 8) { const sm = samples[i]; const p = sm.p.clone().addScaledVector(sm.nrm, offset + s * 1.25); const g = postG.clone(); g.translate(p.x, 2.2, p.z); posts.push(g); }
  if (posts.length) { const m = new THREE.Mesh(mergeGeometries(posts), armcoMat); m.castShadow = true; scene.add(m); }
}
barrier(TRACK_W / 2 + 9, 0, N);
barrier(-(TRACK_W / 2 + 10), 0, idxAt(150));
barrier(-(TRACK_W / 2 + 28), idxAt(150), idxAt(470));
barrier(-(TRACK_W / 2 + 10), idxAt(470), N);

// Lastik duvarı (çakıl havuzu sonunda)
{
  const tireG = new THREE.TorusGeometry(0.33, 0.14, 8, 14);
  tireG.rotateX(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 });
  const geos = [], geosW = [];
  for (let i = idxAt(170); i < idxAt(460); i += 2) {
    const s = samples[i];
    for (let row = 0; row < 2; row++) for (let st = 0; st < 3; st++) {
      const p = s.p.clone().addScaledVector(s.nrm, -(TRACK_W / 2 + 27.3 - row * 0.6));
      const g = tireG.clone(); g.translate(p.x, 0.15 + st * 0.28, p.z);
      ((i / 2 + st) % 4 === 0 ? geosW : geos).push(g);
    }
  }
  const m1 = new THREE.Mesh(mergeGeometries(geos), tireMat); m1.castShadow = true; scene.add(m1);
  const m2 = new THREE.Mesh(mergeGeometries(geosW), white); m2.castShadow = true; scene.add(m2);
}

// Fren mesafe tabelaları (100/200/300) virajdan önce
{
  const brakeD = [300, 200, 100];
  const cornerD = 150;
  for (const bd of brakeD) {
    const i = idxAt(cornerD - bd * 0.9 + 60);
    const s = samples[i];
    const p = s.p.clone().addScaledVector(s.nrm, TRACK_W / 2 + 5);
    const tex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = "#fff"; g.font = "900 58px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(bd), w / 2, h / 2 + 3); }, false);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    board.position.set(p.x, 1.6, p.z);
    board.lookAt(p.clone().addScaledVector(s.tan, -10).setY(1.6));
    board.castShadow = true;
    scene.add(board);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), armcoMat);
    pole.position.set(p.x, 0.5, p.z); scene.add(pole);
  }
}

// Tribün: düzlüğün sağında
{
  const g = new THREE.Group();
  const standMat = new THREE.MeshStandardMaterial({ map: seatsTex, roughness: 0.8 });
  seatsTex.repeat.set(6, 1);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.9 });
  for (let r = 0; r < 14; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(120, 0.55, 1.1), r % 2 ? standMat : standMat);
    step.position.set(0, 0.8 + r * 0.55, r * 1.05);
    step.castShadow = true; step.receiveShadow = true;
    g.add(step);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(120, 1, 16), concrete); base.position.set(0, 0.5, 7); g.add(base);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(124, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.4, roughness: 0.5 }));
  roof.position.set(0, 14, 8); roof.rotation.x = -0.06; roof.castShadow = true; g.add(roof);
  for (let x = -58; x <= 58; x += 14) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 0.5), concrete); c.position.set(x, 7, 16); c.castShadow = true; g.add(c); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(120, 14, 0.5), concrete); back.position.set(0, 7, 16.2); g.add(back);
  // düzlüğe paralel, sağda
  g.position.set(TRACK_W / 2 + 22, 0, -30);
  g.rotation.y = -Math.PI / 2;
  scene.add(g);
}

// Ağaçlar: yaprak dokulu çapraz düzlemler (oyunlardaki gibi)
{
  const leafTex = (hue) => canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.46;
    for (let i = 0; i < 5200; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * r * w * 0.46, y = cy + Math.sin(a) * r * h * 0.44 * (0.85 + 0.15 * Math.cos(a));
      const shade = 1 - r * 0.35 + (y - cy) / h * -0.6;
      const L = (hue[2] * shade + rr(-8, 8)) | 0;
      g.fillStyle = `hsla(${hue[0] + rr(-8, 8)},${hue[1]}%,${Math.max(8, L)}%,0.95)`;
      g.beginPath(); g.ellipse(x, y, rr(3, 7), rr(2, 4), rnd() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = "rgba(60,40,25,0.9)"; g.lineWidth = 10; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, h * 0.62); g.stroke();
  }, false);
  const texes = NIGHT
    ? [leafTex([100, 30, 10]), leafTex([110, 25, 12])]
    : [leafTex([100, 42, 30]), leafTex([90, 38, 34]), leafTex([115, 35, 26])];
  const mats = texes.map((t) => new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));
  const buckets = mats.map(() => []);
  const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, 0.5, 0);
  const pos = new THREE.Vector3();
  let placed = 0;
  for (let k = 0; k < 4000 && placed < 1400; k++) {
    const s = samples[(rnd() * N) | 0];
    const side = rnd() < 0.5 ? -1 : 1;
    const off = side * rr(34, 260);
    pos.copy(s.p).addScaledVector(s.nrm, off);
    let near = false;
    for (let j = 0; j < N; j += 20) if (samples[j].p.distanceToSquared(pos) < 32 * 32) { near = true; break; }
    if (near) continue;
    const hgt = rr(9, 18), wid = hgt * rr(0.7, 0.95);
    const bi = (rnd() * mats.length) | 0;
    for (let q = 0; q < 3; q++) {
      const g = plane.clone(); g.scale(wid, hgt, 1); g.rotateY((q * Math.PI) / 3 + rnd()); g.translate(pos.x, 0, pos.z);
      buckets[bi].push(g);
    }
    placed++;
  }
  buckets.forEach((arr, i) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr), mats[i]); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texes[i], alphaTest: 0.5 }); scene.add(m); });
  // uzak orman kuşağı
  const beltTex = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const x = rnd() * w, top = h * (0.25 + 0.25 * Math.sin(x * 0.01) * Math.sin(x * 0.037) + rr(-0.05, 0.05)); const y = rr(top, h); g.fillStyle = `hsla(${rr(90, 120)},${NIGHT ? 20 : 30}%,${NIGHT ? rr(5, 9) : rr(18, 30)}%,0.95)`; g.beginPath(); g.arc(x, y, rr(2, 6), 0, 7); g.fill(); } });
  beltTex.wrapT = THREE.ClampToEdgeWrapping;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(700, 700, 60, 64, 1, true), new THREE.MeshStandardMaterial({ map: beltTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  beltTex.repeat.set(6, 1);
  belt.position.set(150, 28, 100);
  scene.add(belt);
}

// Uzak tepeler
{
  const g = new THREE.PlaneGeometry(9000, 9000, 180, 180);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x - 150, z - 100);
    const fall = THREE.MathUtils.smoothstep(r, 900, 2200);
    const h = (Math.sin(x * 0.0021) * Math.cos(z * 0.0017) * 0.5 + 0.5) * 260 + Math.sin(x * 0.006 + z * 0.004) * 60;
    p.setY(i, fall * h - 1);
  }
  g.computeVertexNormals();
  const hills = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: NIGHT ? 0x0d140c : 0x4d6b3c, roughness: 1, flatShading: false }));
  hills.receiveShadow = true;
  scene.add(hills);
}

// ---------- ışık / gökyüzü ----------
const sunDir = new THREE.Vector3();
let composerBloom = null;
if (!NIGHT) {
  const phi = THREE.MathUtils.degToRad(90 - 55), theta = THREE.MathUtils.degToRad(160);
  sunDir.setFromSphericalCoords(1, phi, theta);
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { sun: { value: sunDir.clone() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 sun; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 top = vec3(0.16,0.36,0.70); vec3 mid = vec3(0.42,0.62,0.86); vec3 hor = vec3(0.80,0.87,0.94); vec3 c = mix(hor, mid, smoothstep(0.0,0.12,h)); c = mix(c, top, smoothstep(0.12,0.6,h)); float s = max(dot(vP, normalize(sun)),0.0); c += vec3(1.0,0.95,0.85)*pow(s,300.0)*2.0 + vec3(1.0,0.9,0.7)*pow(s,8.0)*0.12; gl_FragColor = vec4(c,1.0); }",
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyM));
  // bulutlar
  const cloudTex = canvasTex(512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 40; i++) { const x = rr(80, w - 80), y = rr(90, h - 70), r = rr(30, 80); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } }, false);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rr(0.35, 0.6), depthWrite: false, fog: false }));
    const a = rr(-0.9, 2.4) + Math.PI * 0.5, dist = rr(1400, 2800);
    m.position.set(Math.cos(a) * dist + 150, rr(380, 900), Math.sin(a) * dist + 100);
    m.scale.set(rr(500, 900), rr(150, 260), 1);
    scene.add(m);
  }
  scene.fog = new THREE.Fog(0xaec4de, 700, 4200);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a33, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(8192, 8192);
  const sc = sun.shadow.camera; sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 1; sc.far = 1500;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  sun.target.position.set(60, 0, 140);
  scene.add(sun, sun.target);
} else {
  // gece gökyüzü: gradyan küre + yıldızlar
  const skyG = new THREE.SphereGeometry(5000, 32, 16);
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 top = vec3(0.004,0.008,0.025); vec3 hor = vec3(0.045,0.06,0.11); vec3 c = mix(hor, top, pow(h,0.45)); c += vec3(0.08,0.05,0.03)*exp(-h*14.0); gl_FragColor = vec4(c,1.0); }",
  });
  scene.add(new THREE.Mesh(skyG, skyM));
  const starG = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3(rr(-1, 1), rr(0.08, 1), rr(-1, 1)).normalize().multiplyScalar(4800); sp.push(v.x, v.y, v.z); }
  starG.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starG, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  scene.fog = new THREE.Fog(0x070a12, 200, 2200);
  scene.add(new THREE.HemisphereLight(0x2a3550, 0x0a0d08, 0.25));
  const moon = new THREE.DirectionalLight(0x8fa6d8, 0.25); moon.position.set(-300, 400, 200); scene.add(moon);
  // projektör direkleri
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 9 });
  for (let d = -200; d < LEN - 20; d += 55) {
    const i = idxAt(Math.max(0, d + 260));
    const s = samples[i];
    for (const side of [1, -1]) {
      if (side === -1 && (d / 55) % 2 !== 0) continue;
      const p = s.p.clone().addScaledVector(s.nrm, side * (TRACK_W / 2 + 14));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 22, 8), poleMat); pole.position.set(p.x, 11, p.z); scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.2), lampMat);
      const hp = s.p.clone().addScaledVector(s.nrm, side * (TRACK_W / 2 + 11));
      head.position.set(hp.x, 22, hp.z); head.lookAt(s.p.x, 0, s.p.z); scene.add(head);
      const L = new THREE.SpotLight(0xfff0d8, 9000, 120, 0.85, 0.6, 2);
      L.position.copy(head.position);
      L.target.position.copy(s.p.clone().addScaledVector(s.nrm, -side * 2));
      L.castShadow = false;
      scene.add(L, L.target);
    }
  }
}

// ---------- kamera ve kokpit ----------
function place(d, lateral, height, lookAhead) {
  const i = idxAt(d), s = samples[i];
  const pos = s.p.clone().addScaledVector(s.nrm, lateral); pos.y = height;
  const j = idxAt(d + lookAhead), t = samples[j];
  const look = t.p.clone().addScaledVector(t.nrm, lateral * 0.4); look.y = height * 0.72;
  return { pos, look, s };
}

let cockpitGroup = null;
if (!COCKPIT) {
  const { pos, look } = place(NIGHT ? 300 : 285, -1.2, 1.7, 110);
  camera.position.copy(pos);
  camera.lookAt(look);
} else {
  const { pos, look } = place(300, -1.0, 1.02, 80);
  camera.position.copy(pos);
  camera.lookAt(look);
  camera.rotateZ(0.004);
  scene.add(camera);
  cockpitGroup = new THREE.Group();
  camera.add(cockpitGroup);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.85 });
  const carbon = new THREE.MeshStandardMaterial({ map: carbonTex, roughness: 0.35, metalness: 0.3 });
  carbonTex.repeat.set(6, 3);
  const suede = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 1 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x1a4fa0, roughness: 0.3, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.35, metalness: 0.8 });

  // Ön panel (dashboard) üst yüzeyi
  const dashShape = new THREE.Shape();
  dashShape.moveTo(-1.6, 0); dashShape.lineTo(1.6, 0); dashShape.lineTo(1.6, 0.34); dashShape.quadraticCurveTo(0, 0.52, -1.6, 0.34); dashShape.lineTo(-1.6, 0);
  const dashG = new THREE.ExtrudeGeometry(dashShape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 24 });
  const dash = new THREE.Mesh(dashG, carbon);
  dash.position.set(0, -0.86, -1.25);
  dash.rotation.x = -0.1;
  cockpitGroup.add(dash);
  // gösterge kutusu
  const lcdTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#050607"; g.fillRect(0, 0, w, h);
    const leds = ["#18d94b", "#18d94b", "#18d94b", "#18d94b", "#ffd200", "#ffd200", "#ffd200", "#ff2b2b", "#ff2b2b", "#3b7bff"];
    leds.forEach((c, i) => { g.fillStyle = i < 6 ? c : "#222"; g.beginPath(); g.arc(46 + i * 46, 26, 13, 0, 7); g.fill(); });
    g.fillStyle = "#f2f2f2"; g.font = "700 120px Arial"; g.textAlign = "center"; g.fillText("4", w / 2, 170);
    g.font = "700 38px Arial"; g.fillText("187", 90, 150); g.font = "500 18px Arial"; g.fillStyle = "#9aa"; g.fillText("KM/H", 90, 175);
    g.fillStyle = "#f2f2f2"; g.font = "700 30px Arial"; g.fillText("1:47.3", w - 95, 140); g.fillStyle = "#18d94b"; g.font = "700 26px Arial"; g.fillText("-0.24", w - 95, 180);
    g.fillStyle = "#ff8a2a"; g.fillRect(40, 220, 300, 10); g.fillStyle = "#333"; g.fillRect(340, 220, 132, 10);
  }, false);
  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.08), dark);
  cluster.position.set(0, -0.36, -1.05); cluster.rotation.x = -0.25;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
  screen.position.set(0, 0, 0.041);
  cluster.add(screen);
  cockpitGroup.add(cluster);

  // Direksiyon (GT3 tipi)
  const wheel = new THREE.Group();
  const rr2 = (sh, x, y, w, h, r) => { sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); };
  const outer = new THREE.Shape(); rr2(outer, -0.19, -0.12, 0.38, 0.23, 0.07);
  const hole = new THREE.Path(); rr2(hole, -0.145, -0.085, 0.29, 0.165, 0.05); outer.holes.push(hole);
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.035, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 4, curveSegments: 16 }), suede);
  rim.position.z = -0.018;
  wheel.add(rim);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.165, 0.03), carbon);
  plate.position.set(0, -0.015, 0.01); wheel.add(plate);
  const wlcd = canvasTex(256, 128, (g, w, h) => { g.fillStyle = "#040506"; g.fillRect(0, 0, w, h); g.fillStyle = "#ff8a2a"; g.font = "700 64px Arial"; g.textAlign = "center"; g.fillText("4", w / 2, 80); g.fillStyle = "#8fd"; g.font = "600 20px Arial"; g.fillText("TC 3   ABS 4   BB 54.2", w / 2, 116); }, false);
  const wscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: wlcd, toneMapped: false }));
  wscreen.position.set(0, 0.012, 0.027); wheel.add(wscreen);
  const btnCols = [0xe53935, 0xffc107, 0x43a047, 0x1e88e5, 0xffffff, 0x8e24aa];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12), new THREE.MeshStandardMaterial({ color: btnCols[i % btnCols.length], roughness: 0.4, emissive: btnCols[i % btnCols.length], emissiveIntensity: 0.15 }));
    b.rotation.x = Math.PI / 2;
    b.position.set((i % 2 ? 1 : -1) * (0.085 + ((i >> 1) % 2) * 0.028), 0.04 - ((i >> 2) * 0.05), 0.03);
    wheel.add(b);
  }
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.1, 6, 12), suede);
    grip.position.set(s * 0.17, -0.005, 0.005); wheel.add(grip);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.006), carbon);
    paddle.position.set(s * 0.12, 0.06, -0.05); wheel.add(paddle);
  }
  wheel.position.set(0.0, -0.24, -0.62);
  wheel.rotation.x = -0.22;
  wheel.rotation.z = -0.12; // hafif sağa dönüş
  wheel.scale.setScalar(1.3);
  cockpitGroup.add(wheel);
  // direksiyon mili
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 12), dark);
  col.rotation.x = Math.PI / 2 - 0.32; col.position.set(0, -0.42, -0.85); cockpitGroup.add(col);

  // A direkleri ve tavan
  const pillar = (s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.9, 0.1), dark);
    m.position.set(s * 1.12, 0.05, -1.1);
    m.rotation.z = s * 0.52; m.rotation.x = 0.25;
    cockpitGroup.add(m);
  };
  pillar(-1); pillar(1);
  const header = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.5), dark);
  header.position.set(0, 0.72, -0.9); header.rotation.x = -0.35; cockpitGroup.add(header);
  // dikiz aynası
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.03), dark);
  mirror.position.set(0.05, 0.56, -0.8); mirror.rotation.x = -0.15; cockpitGroup.add(mirror);
  const mirGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.06), new THREE.MeshStandardMaterial({ color: 0x5b6a7c, metalness: 0.9, roughness: 0.15 }));
  mirGlass.position.set(0, 0, 0.016); mirror.add(mirGlass);
  // kafes boruları
  const tube = (a, b, r = 0.03) => {
    const v = new THREE.Vector3().subVectors(b, a); const len = v.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), steel);
    m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    cockpitGroup.add(m);
  };
  tube(new THREE.Vector3(-1.05, -0.55, -0.4), new THREE.Vector3(-1.2, 0.5, -0.9));
  tube(new THREE.Vector3(-1.05, -0.35, -0.2), new THREE.Vector3(-1.1, -0.5, -1.4));
  tube(new THREE.Vector3(1.1, -0.35, -0.2), new THREE.Vector3(1.15, -0.5, -1.4));
  // yan kapı/pencere kenarları
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.6), dark);
    door.position.set(s * 1.25, -0.6, -0.6); door.rotation.z = s * 0.1; cockpitGroup.add(door);
  }
  // kaput üstü (camdan görünen)
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.5, 48, 1, false, -0.35, 0.7), paint);
  hood.rotation.z = Math.PI / 2; hood.rotation.y = 0;
  hood.position.set(0, -4.72, -2.4);
  cockpitGroup.add(hood);
  // iç ışık (kokpit karanlık kalmasın)
  const fill = new THREE.PointLight(0xffffff, 4, 3, 2); fill.position.set(0, 0.3, -0.2); cockpitGroup.add(fill);
}

// ---------- son işlem ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(window.devicePixelRatio || 1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), NIGHT ? 0.6 : 0.12, NIGHT ? 0.5 : 0.4, NIGHT ? 0.82 : 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const vignette = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, amount: { value: NIGHT ? 0.55 : 0.35 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
  fragmentShader: "uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv-0.5; float v = smoothstep(0.85, 0.2, length(d*vec2(1.0,1.25))); c.rgb *= mix(1.0-amount, 1.0, v); gl_FragColor = c; }",
});
composer.addPass(vignette);

composer.render();
requestAnimationFrame(() => { composer.render(); window.__done = true; });
