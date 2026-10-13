// Paylaşılan telemetri (telemetri.html?s=<kimlik>): uygulamadaki Telemetri › Tur analizinin web karşılığı.
// Giriş gerekmez: c113 telemetry_share_get paylaşımı döner; iz dosyaları (gzip JSON, mesafeye göre eşit aralıklı
// noktalar) paylaşılan turlar için herkese okunur. 5 tura kadar kıyaslama: tur kartları, sektör tablosu, pist haritası
// (paylaşıma eklenen pist şekli), fark / hız / gaz / fren / vites / direksiyon grafikleri ortak imleçle.
import { $, T, addDict, boot, esc, fmtDate, sb } from "./core.js";
import { analyzeCorners, coachNotes, theoreticalBest } from "./teleanalysis.js";

addDict({
  ts_title: ["Telemetri", "Telemetry"],
  ts_missing: ["Paylaşım bulunamadı ya da kaldırıldı.", "Share not found or removed."],
  ts_nolink: ["Bağlantıda paylaşım kimliği yok.", "The link has no share id."],
  ts_shared_by: ["{0} paylaştı", "Shared by {0}"],
  ts_views: ["{0} görüntülenme", "{0} views"],
  ts_laps: ["Turlar", "Laps"],
  ts_lap_n: ["Tur {0}", "Lap {0}"],
  ts_lap: ["Tur", "Lap"],
  ts_setup: ["Setup", "Setup"],
  ts_same_setup: ["Aynı setup", "Same setup"],
  ts_diff_setup: ["Farklı setup", "Different setup"],
  ts_map: ["Pist haritası", "Track map"],
  ts_map_none: ["Bu paylaşımda pist haritası yok.", "This share has no track map."],
  ts_map_delta: ["Renkler: {0}, A'ya göre (yeşil kazanç, kırmızı kayıp)", "Colours: {0} vs A (green gain, red loss)"],
  ts_map_speed: ["Renkler: A'nın hızı (mavi yavaş, turuncu hızlı)", "Colours: A's speed (blue slow, orange fast)"],
  ts_vs: ["Kıyasla", "Compare"],
  ts_traces: ["İzler", "Traces"],
  ts_hover: ["Değerleri görmek için grafiğin ya da haritanın üzerine gel", "Hover over the charts or the map to see values"],
  ts_pos: ["Konum: {0}", "Position: {0}"],
  ts_delta: ["Fark (A'ya göre, sn; + daha yavaş)", "Delta (vs A, s; + slower)"],
  ts_speed: ["Hız (km/h)", "Speed (km/h)"],
  ts_throttle: ["Gaz (%)", "Throttle (%)"],
  ts_brake: ["Fren (%)", "Brake (%)"],
  ts_gear: ["Vites", "Gear"],
  ts_steer: ["Direksiyon (°)", "Steering (°)"],
  ts_notrace: ["Bu turların izi yok (yalnızca oturumların en iyi turlarının izi saklanır).", "These laps have no trace (only each session's best lap is stored)."],
  ts_session: ["Oturum", "Session"],
  ts_best: ["En iyi tur", "Best lap"],
  ts_laps_count: ["Tur sayısı", "Laps"],
  ts_invalid: ["geçersiz", "invalid"],
  ts_pit: ["pit", "pit"],
  ts_traced: ["izli", "trace"],
  ts_made_with: ["SRTR Pitwall ile kaydedildi", "Recorded with SRTR Pitwall"],
  ts_get_app: ["Uygulamayı indir", "Get the app"],
  ts_show: ["Göster", "Show"],
  ts_loading_traces: ["İzler yükleniyor…", "Loading traces…"],
  ts_rpm: ["Devir (rpm)", "Engine speed (rpm)"],
  ts_latg: ["Yanal G (+ sağa)", "Lateral G (+ right)"],
  ts_longg: ["Boyuna G (+ hızlanma, − fren)", "Longitudinal G (+ accel, − braking)"],
  ts_abs: ["ABS devrede", "ABS active"],
  ts_zoom_hint: ["Sürükle: yakınlaştır · Tekerlek: yakınlaş / uzaklaş · Çift tık: sıfırla", "Drag: zoom in · Wheel: zoom in / out · Double-click: reset"],
  ts_zoom_reset: ["Tüm tur", "Whole lap"],
  ts_ca: ["Viraj analizi", "Corner analysis"],
  ts_ca_hint: ["A turu, seçilen referansa göre. Satıra tıklayınca grafiklerde ve haritada o viraja gidilir.", "Lap A vs the selected reference. Click a row to jump to that corner on the charts and map."],
  ts_ref: ["Referans", "Reference"],
  ts_theo: ["Teorik en iyi tur", "Theoretical best lap"],
  ts_theo_parts: ["{0} mikro sektörün en hızlıları", "Fastest of {0} micro sectors"],
  ts_potential: ["{0} potansiyeli", "{0} potential"],
  ts_owned: ["{0} mikro sektör en hızlı", "Fastest in {0} micro sectors"],
  ts_corner_n: ["Viraj {0}", "Corner {0}"],
  ts_loss: ["{0} sn kayıp", "{0} s lost"],
  ts_noloss: ["A bu referansa göre hiçbir virajda belirgin süre kaybetmiyor.", "Lap A loses no significant time to this reference in any corner."],
  ts_noreason: ["Belirgin tek bir neden yok: virajın tamamında biraz yavaşsın.", "No single cause: slightly slower through the whole corner."],
  ts_best_corner: ["En güçlü virajın: Viraj {0} ({1} sn kazanç)", "Strongest corner: Corner {0} ({1} s gained)"],
  ts_r_brakeEarly: ["Referanstan {0} m önce frene basıyorsun", "You brake {0} m earlier than the reference"],
  ts_r_brakeLate: ["{0} m geç frenleyip viraja fazla hızlı giriyorsun; viraj içinde {1} km/h yavaş kalıyorsun", "You brake {0} m later and overshoot the entry; {1} km/h slower mid-corner"],
  ts_r_minSpeed: ["Viraj içinde (en düşük hız) {0} km/h yavaşsın", "{0} km/h slower at minimum speed"],
  ts_r_throttleLate: ["Tam gaza {0} m geç geçiyorsun", "You get to full throttle {0} m later"],
  ts_r_exitSpeed: ["Çıkışta {0} km/h yavaşsın", "{0} km/h slower on exit"],
  ts_r_gear: ["Virajda {0}. viteste kalıyorsun, referans {1}. viteste", "You use gear {0} in the corner, the reference uses {1}"],
  ts_c_corner: ["Viraj", "Corner"],
  ts_c_pos: ["Konum", "Position"],
  ts_c_brake: ["Fren (m)", "Brake (m)"],
  ts_c_entry: ["Giriş", "Entry"],
  ts_c_min: ["En düşük", "Minimum"],
  ts_c_exit: ["Çıkış", "Exit"],
  ts_c_thr: ["Tam gaz (m)", "Full throttle (m)"],
  ts_c_gear: ["Vites", "Gear"],
  ts_c_delta: ["Fark", "Delta"],
  ts_rline: ["Sürüş çizgisi", "Racing line"],
  ts_rline_hint: ["iRacing telemetri dosyasından (.ibt) içe aktarılan turların GPS konumu. Üzerine gelince turların o mesafedeki yeri gösterilir; A'ya uzaklık metre.", "GPS position of laps imported from iRacing telemetry files (.ibt). Hover to see where each lap was at that distance; distance from A in metres."],
  ts_rline_gap: ["{0}: A'ya {1} m", "{0}: {1} m from A"],
  ts_csv: ["CSV indir", "Download CSV"],
  ts_ca_legend: ["Değerler: A / referans. Hızlar km/h; fren ve tam gaz noktaları tur başından metre. Fark: A'nın o virajdaki süresi eksi referansınki (+ yavaş).", "Values: A / reference. Speeds in km/h; brake and full-throttle points in metres from the line. Delta: A's corner time minus the reference's (+ slower)."],
});

function reasonText(r) {
  const k = "ts_r_" + r.kind;
  if (r.kind === "brakeEarly" || r.kind === "throttleLate") return T(k, Math.round(r.m));
  if (r.kind === "brakeLate") return T(k, Math.round(r.m), r.slower.toFixed(0));
  if (r.kind === "minSpeed" || r.kind === "exitSpeed") return T(k, r.kmh.toFixed(0));
  if (r.kind === "gear") return T(k, r.mine, r.ref);
  return "";
}

const SIM_LABEL = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "Automobilista 2", r3e: "RaceRoom", f1: "F1", forza: "Forza", dirt: "DiRT Rally / GRID", beamng: "BeamNG.drive" };
const COLORS = ["#e0701a", "#3a84e0", "#2ecc71", "#c061e0", "#e8c53a"];
const LETTERS = "ABCDE";
const W = 1000;

const app = () => $("#app");
const trackLabel = (x) => (x.track_config ? `${x.track_name} – ${x.track_config}` : x.track_name || x.track_id);
function lapTime(t) {
  if (!(t > 0)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
const signed = (v, d = 3) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

async function decodeTrace(buf) {
  const bytes = new Uint8Array(buf);
  let text;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(bytes);
  const j = JSON.parse(text);
  return Array.isArray(j?.t) && Array.isArray(j?.speed) ? j : null;
}

async function loadTraces(laps) {
  const paths = laps.map((l) => l.trace_path).filter(Boolean);
  if (!paths.length) return laps.map(() => null);
  const { data, error } = await sb.storage.from("telemetry").createSignedUrls(paths, 600);
  if (error) throw new Error(error.message);
  const urls = Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  return Promise.all(
    laps.map(async (l) => {
      const u = l.trace_path && urls[l.trace_path];
      if (!u) return null;
      try {
        const r = await fetch(u);
        return r.ok ? await decodeTrace(await r.arrayBuffer()) : null;
      } catch {
        return null;
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Durum ve çizim
// ---------------------------------------------------------------------------

const st = {
  share: null,
  laps: [], // [{ info, trace, color, letter, on }]
  cursor: null, // tur oranı 0..1
  vs: 1, // haritada A ile kıyaslanan tur (indeks)
  loading: false,
  zoom: { a: 0, b: 1 },
};

/** Diziyi `n` noktaya getirir (eski izler 360, yenileri 1000 nokta) */
function resampleTo(arr, n) {
  const m = arr.length;
  if (m === n || !m) return arr;
  return Array.from({ length: n }, (_, i) => {
    const x = (i * (m - 1)) / Math.max(1, n - 1);
    const a = Math.floor(x);
    const b = Math.min(m - 1, a + 1);
    return arr[a] + (arr[b] - arr[a]) * (x - a);
  });
}

function shown() {
  return st.laps.filter((x) => x.on && x.trace);
}

function linePath(values, min, max, h, step = false) {
  const n = values.length;
  if (n < 2) return "";
  const span = max - min || 1;
  const pad = 4;
  const y = (v) => (h - pad - ((v - min) / span) * (h - 2 * pad)).toFixed(1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * W).toFixed(1);
    if (i === 0) d += `M${x},${y(values[0])}`;
    else if (step && values[i] !== values[i - 1]) d += `H${x}V${y(values[i])}`;
    else d += `L${x},${y(values[i])}`;
  }
  return d;
}

function charts() {
  const L = shown();
  if (!L.length) return [];
  const A = L[0];
  const mk = (pick, scale = 1) => L.map((x) => ({ label: x.letter, color: x.color, values: pick(x.trace).map((v) => v * scale) }));
  const out = [];
  if (L.length >= 2) {
    const n = A.trace.t.length;
    out.push({
      title: T("ts_delta"),
      height: 90,
      zero: true,
      fmt: (v) => signed(v, 2),
      series: L.slice(1).map((x) => {
        const o = resampleTo(x.trace.t, n);
        return { label: `${x.letter}−${A.letter}`, color: x.color, values: Array.from({ length: n }, (_, i) => (o[i] - A.trace.t[i]) / 1000) };
      }),
    });
  }
  out.push({ title: T("ts_speed"), height: 150, fmt: (v) => v.toFixed(0), series: mk((t) => t.speed, 0.1) });
  out.push({ title: T("ts_throttle"), height: 70, min: 0, max: 100, fmt: (v) => v.toFixed(0), series: mk((t) => t.throttle) });
  out.push({ title: T("ts_brake"), height: 70, min: 0, max: 100, fmt: (v) => v.toFixed(0), series: mk((t) => t.brake) });
  out.push({ title: T("ts_gear"), height: 70, step: true, fmt: (v) => (v < 0 ? "R" : v === 0 ? "N" : v.toFixed(0)), series: mk((t) => t.gear) });
  out.push({ title: T("ts_steer"), height: 80, zero: true, fmt: (v) => v.toFixed(0), series: mk((t) => t.steer) });
  // Ek kanallar (yeni kayıtlarda): verisi olan turlarla
  const extra = (pick, scale = 1) =>
    L.filter((x) => (pick(x.trace)?.length ?? 0) > 1).map((x) => ({ label: x.letter, color: x.color, values: pick(x.trace).map((v) => v * scale) }));
  const rpm = extra((t) => t.rpm);
  if (rpm.length) out.push({ title: T("ts_rpm"), height: 90, fmt: (v) => v.toFixed(0), series: rpm });
  const lat = extra((t) => t.lat_g, 0.01);
  if (lat.length) out.push({ title: T("ts_latg"), height: 80, zero: true, fmt: (v) => v.toFixed(2), series: lat });
  const lon = extra((t) => t.long_g, 0.01);
  if (lon.length) out.push({ title: T("ts_longg"), height: 80, zero: true, fmt: (v) => v.toFixed(2), series: lon });
  const abs = extra((t) => t.abs);
  if (abs.length) out.push({ title: T("ts_abs"), height: 50, min: 0, max: 100, step: true, fmt: (v) => (v > 50 ? "ABS" : "—"), series: abs });
  return out;
}

function chartHtml(c0, idx) {
  // Yakınlaştırma: görünür aralığın değerleri
  const { a, b } = st.zoom;
  const c = {
    ...c0,
    series: c0.series.map((s) => {
      const n = s.values.length;
      return { ...s, values: s.values.slice(Math.max(0, Math.floor(a * (n - 1))), Math.min(n - 1, Math.ceil(b * (n - 1))) + 1) };
    }),
  };
  const all = c.series.flatMap((s) => s.values);
  let lo = c.min ?? Math.min(...all);
  let hi = c.max ?? Math.max(...all);
  if (c.zero) {
    const m = Math.max(Math.abs(lo), Math.abs(hi), 0.05);
    lo = -m;
    hi = m;
  }
  if (hi === lo) hi = lo + 1;
  c.lo = lo;
  c.hi = hi;
  const zy = c.height - 4 - ((0 - lo) / (hi - lo)) * (c.height - 8);
  return `<div class="tchart" data-c="${idx}">
    <div class="tchart-head"><b>${esc(c.title)}</b><span class="tchart-read">${c.series
      .map((s, k) => `<span><i style="background:${s.color}"></i>${esc(s.label)} <b class="mono" data-r="${idx}-${k}">—</b></span>`)
      .join("")}</span></div>
    <div class="tchart-plot" style="height:${c.height}px">
      <svg viewBox="0 0 ${W} ${c.height}" preserveAspectRatio="none" width="100%" height="${c.height}">
        <line x1="0" x2="${W}" y1="${c.height / 2}" y2="${c.height / 2}" class="grid" vector-effect="non-scaling-stroke"/>
        ${c.zero ? `<line x1="0" x2="${W}" y1="${zy}" y2="${zy}" class="zero" vector-effect="non-scaling-stroke"/>` : ""}
        ${c.series.map((s) => `<path d="${linePath(s.values, lo, hi, c.height, c.step)}" stroke="${s.color}" class="ln" vector-effect="non-scaling-stroke"/>`).join("")}
      </svg>
      <span class="tchart-axis top">${esc(c.fmt(hi))}</span>
      <span class="tchart-axis bottom">${esc(c.fmt(lo))}</span>
      <i class="tchart-sel" hidden></i>
      <i class="tchart-cursor" hidden></i>
    </div>
  </div>`;
}

// ---- Harita ----

function fit(pts, w, h, pad) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, -y);
    maxY = Math.max(maxY, -y);
  }
  const k = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * k;
  const oy = h / 2 - ((minY + maxY) / 2) * k;
  return ([x, y]) => [ox + x * k, oy - y * k];
}

const lerp = (a, b, k) => Math.round(a + (b - a) * k);
const mix = (c1, c2, k) => `rgb(${lerp(c1[0], c2[0], k)},${lerp(c1[1], c2[1], k)},${lerp(c1[2], c2[2], k)})`;
const NEUTRAL = [122, 130, 146];
const GREEN = [46, 204, 113];
const RED = [255, 77, 79];
const BLUE = [58, 132, 255];
const ORANGE = [255, 138, 42];

let mapXf = null;
const MW = 900;
const MH = 520;

function mapHtml() {
  const pts = st.share?.shape?.pts;
  if (!Array.isArray(pts) || pts.length < 20) return `<p class="muted">${esc(T("ts_map_none"))}</p>`;
  const xf = fit(pts, MW, MH, 40);
  mapXf = { xf, pts };
  const L = shown();
  const A = L[0];
  const N = 300;
  const m = pts.length;
  const at = (k) => xf(pts[Math.min(m - 1, Math.floor(k * m)) % m]);
  let colors = new Array(N).fill(mix(NEUTRAL, NEUTRAL, 0));
  const other = L.find((x, i) => i > 0 && st.laps.indexOf(x) === st.vs) || L[1];
  if (A && other) {
    // Kazanç / kayıp hızı (tur oranı başına sn)
    const n = Math.min(A.trace.t.length, other.trace.t.length);
    const d = Array.from({ length: n }, (_, i) => (other.trace.t[i] - A.trace.t[i]) / 1000);
    const idx = (k) => Math.min(n - 1, Math.max(0, Math.round(k * (n - 1))));
    const w = 0.012;
    const vals = Array.from({ length: N }, (_, i) => {
      const k = (i + 0.5) / N;
      return d[idx(Math.min(1, k + w))] - d[idx(Math.max(0, k - w))];
    });
    const sorted = vals.map(Math.abs).sort((a, b) => a - b);
    const scale = Math.max(sorted[Math.floor(N * 0.92)] || 0, 0.01);
    // + = diğer tur yavaş = A kazanıyor; harita A'nın bakışıyla değil, kıyaslanan turun bakışıyla: yeşil o turun kazancı
    colors = vals.map((v) => {
      const k = Math.min(1, Math.abs(v) / scale) ** 0.7;
      return mix(NEUTRAL, v < 0 ? GREEN : RED, k);
    });
  } else if (A) {
    const sp = A.trace.speed;
    const lo = Math.min(...sp);
    const hi = Math.max(...sp);
    colors = Array.from({ length: N }, (_, i) => {
      const v = sp[Math.min(sp.length - 1, Math.round(((i + 0.5) / N) * (sp.length - 1)))];
      return mix(BLUE, ORANGE, (v - lo) / Math.max(1, hi - lo));
    });
  }
  const segs = Array.from({ length: N }, (_, i) => {
    const a = at(i / N);
    const b = at((i + 1) / N);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${colors[i]}" class="tmap-seg"/>`;
  }).join("");
  const s0 = at(0);
  const legend = A && other ? T("ts_map_delta", other.letter) : T("ts_map_speed");
  const sel =
    L.length > 2
      ? `<label class="ts-vs">${esc(T("ts_vs"))} <select id="ts-vs">${L.slice(1)
          .map((x) => `<option value="${st.laps.indexOf(x)}" ${x === other ? "selected" : ""}>${esc(x.letter)} · ${esc(x.info.driver_name || x.info.display_name || "")}</option>`)
          .join("")}</select></label>`
      : "";
  return `<div class="ts-map-tools"><small class="muted">${esc(legend)}</small>${sel}</div>
    <svg viewBox="0 0 ${MW} ${MH}" class="tmap-svg" id="ts-map">
      ${segs}
      <circle class="tmap-start" cx="${s0[0].toFixed(1)}" cy="${s0[1].toFixed(1)}" r="7"/>
      <circle class="tmap-cursor-halo" r="16" hidden/>
      <circle class="tmap-cursor" r="8" hidden/>
    </svg>`;
}

// ---- Sayfa ----

function lapCards() {
  const A = st.laps[0]?.info;
  return `<div class="lap-cards">${st.laps
    .map((x, i) => {
      const l = x.info;
      const diff = i > 0 && A ? l.lap_time - A.lap_time : null;
      return `<label class="lap-card ${x.on ? "" : "off"}" style="--c:${x.color}">
        <i class="sw"></i>
        <div><b>${esc(x.letter)} · ${esc(l.driver_name || l.display_name || "—")}</b>
          <small>${esc(l.car_name || "")} · ${esc(T("ts_lap_n", l.lap))} · ${fmtDate(l.driven_at)}</small>
          ${l.setup_name ? `<small class="tt-setup">🔧 ${esc(l.setup_name)}</small>` : ""}
          ${!x.trace && !st.loading ? `<small class="muted">${esc(T("ts_notrace"))}</small>` : ""}
        </div>
        <span class="mono lap-time">${lapTime(l.lap_time)}${
          diff != null ? `<small class="lap-diff ${diff > 0.0005 ? "bad" : diff < -0.0005 ? "good" : ""}">${signed(diff)}</small>` : ""
        }</span>
        ${st.laps.length > 1 && i > 0 ? `<input type="checkbox" data-on="${i}" ${x.on ? "checked" : ""} title="${esc(T("ts_show"))}"/>` : ""}
      </label>`;
    })
    .join("")}</div>`;
}

function sectorTable() {
  const L = st.laps.map((x) => x.info);
  if (L.length < 2) return "";
  const A = L[0];
  const best = (i) => Math.min(...L.map((l) => (l.sectors?.[i] > 0 ? l.sectors[i] : Infinity)));
  const setups = L.some((l) => l.setup_name);
  const cell = (x, y) => (x > 0 && y > 0 ? signed(y - x) : "—");
  const tone = (x, y) => (!(x > 0) || !(y > 0) ? "" : y - x > 0.0005 ? "bad" : y - x < -0.0005 ? "good" : "");
  const rows = L.map((l, k) => {
    const main = `<tr><td><i class="sc-dot" style="background:${COLORS[k]}"></i> ${LETTERS[k]}</td>${[0, 1, 2]
      .map((i) => {
        const v = l.sectors?.[i];
        return `<td class="num mono ${v > 0 && Math.abs(v - best(i)) < 1e-4 ? "purple" : ""}">${v > 0 ? v.toFixed(3) : "—"}</td>`;
      })
      .join("")}<td class="num mono">${lapTime(l.lap_time)}</td>${setups ? `<td class="setup">${esc(l.setup_name || "—")}</td>` : ""}</tr>`;
    if (k === 0) return main;
    return (
      main +
      `<tr class="diff"><td>${LETTERS[k]} − A</td>${[0, 1, 2]
        .map((i) => `<td class="num mono ${tone(A.sectors?.[i], l.sectors?.[i])}">${cell(A.sectors?.[i], l.sectors?.[i])}</td>`)
        .join("")}<td class="num mono ${tone(A.lap_time, l.lap_time)}">${cell(A.lap_time, l.lap_time)}</td>${
        setups ? `<td class="muted">${!l.setup_name || !A.setup_name ? "" : esc(T(l.setup_name === A.setup_name ? "ts_same_setup" : "ts_diff_setup"))}</td>` : ""
      }</tr>`
    );
  }).join("");
  return `<table class="tele-table compact sector-cmp"><thead><tr><th></th><th class="num">S1</th><th class="num">S2</th><th class="num">S3</th><th class="num">${esc(
    T("ts_lap"),
  )}</th>${setups ? `<th>${esc(T("ts_setup"))}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}

function sessionBlock() {
  const d = st.share?.session;
  if (!d?.session) return "";
  const s = d.session;
  const laps = d.laps || [];
  const ok = laps.filter((l) => l.valid && !l.pit);
  const best = ok.reduce((a, l) => (!a || l.lap_time < a.lap_time ? l : a), null);
  const bsec = [0, 1, 2].map((i) => Math.min(...ok.map((l) => (l.sectors?.[i] > 0 ? l.sectors[i] : Infinity))));
  const hasSetup = laps.some((l) => l.setup_name);
  return `<section class="panel">
    <div class="tele-head"><h3>${esc(T("ts_session"))}</h3></div>
    <div class="ts-stats">
      <div><small>${esc(T("ts_best"))}</small><b class="mono">${best ? lapTime(best.lap_time) : "—"}</b></div>
      <div><small>${esc(T("ts_laps_count"))}</small><b>${laps.length}</b></div>
    </div>
    <div class="tele-scroll"><table class="tele-table compact">
      <thead><tr><th>${esc(T("ts_lap"))}</th><th class="num">${esc(T("ts_lap"))}</th><th class="num">S1</th><th class="num">S2</th><th class="num">S3</th>${
        hasSetup ? `<th>${esc(T("ts_setup"))}</th>` : ""
      }<th></th></tr></thead>
      <tbody>${laps
        .map(
          (l) => `<tr class="${best && l.id === best.id ? "best" : ""}"><td>${l.lap}</td><td class="num mono">${lapTime(l.lap_time)}</td>${[0, 1, 2]
            .map((i) => {
              const v = l.sectors?.[i];
              const p = l.valid && !l.pit && v > 0 && v === bsec[i];
              return `<td class="num mono ${p ? "purple" : ""}">${v > 0 ? v.toFixed(3) : "—"}</td>`;
            })
            .join("")}${hasSetup ? `<td class="setup">${esc(l.setup_name || "—")}</td>` : ""}<td class="muted small">${[
            !l.valid && T("ts_invalid"),
            l.pit && T("ts_pit"),
            l.has_trace && T("ts_traced"),
          ]
            .filter(Boolean)
            .map(esc)
            .join(" · ")}</td></tr>`,
        )
        .join("")}</tbody></table></div>
  </section>`;
}

let chartDefs = [];

function cornerHtml() {
  const L = shown();
  if (!L.length) return "";
  const len = L[0].info.track_length_km || 0;
  const stats = analyzeCorners(L.map((x) => x.trace), len);
  if (!stats.length) return "";
  const refIdx = L.length > 1 ? Math.max(1, L.findIndex((x) => st.laps.indexOf(x) === st.vs)) : -1;
  const notes = refIdx > 0 ? coachNotes(stats, 0, refIdx) : null;
  const theo = L.length > 1 ? theoreticalBest(L.map((x) => x.trace), L.map((x) => x.info.lap_time)) : null;
  const m = (v) => (v == null ? "—" : String(Math.round(v)));
  const v0 = (v) => v.toFixed(0);
  const two = (x, y) => (y == null ? x : `${x} / ${y}`);
  const theoHtml = theo
    ? `<div class="ca-theo"><div><small>${esc(T("ts_theo"))}</small><b class="mono">${lapTime(theo.time)}</b><small class="muted">${esc(T("ts_theo_parts", theo.parts))}</small></div>${L.map(
        (x, i) => `<div><small><i class="sc-dot" style="background:${x.color}"></i> ${esc(T("ts_potential", x.letter))}</small><b class="mono ${theo.gap[i] < 0.01 ? "good" : ""}">${
          theo.gap[i] < 0.01 ? "—" : `−${theo.gap[i].toFixed(3)}`
        }</b><small class="muted">${esc(T("ts_owned", theo.owner.filter((o) => o === i).length))}</small></div>`,
      ).join("")}</div>`
    : "";
  const notesHtml = notes
    ? `<div class="ca-notes">${
        notes.losses.length
          ? notes.losses
              .map(
                (n, i) => `<button class="ca-note" data-k="${n.apexPct}"><span class="ca-rank">${i + 1}</span><div><b>${esc(T("ts_corner_n", n.corner))} · <span class="bad">${esc(
                  T("ts_loss", n.delta.toFixed(2)),
                )}</span></b>${
                  n.reasons.length ? `<ul>${n.reasons.map((r) => `<li>${esc(reasonText(r))}</li>`).join("")}</ul>` : `<small class="muted">${esc(T("ts_noreason"))}</small>`
                }</div></button>`,
              )
              .join("")
          : `<p class="muted small">${esc(T("ts_noloss"))}</p>`
      }${notes.best ? `<p class="ca-best">✓ ${esc(T("ts_best_corner", notes.best.corner, Math.abs(notes.best.delta).toFixed(2)))}</p>` : ""}</div>`
    : "";
  const rows = stats
    .map((c) => {
      const a = c.laps[0];
      const r = refIdx > 0 ? c.laps[refIdx] : null;
      const d = r ? a.time - r.time : 0;
      const cls = (bad, good) => (bad ? "bad" : good ? "good" : "");
      return `<tr class="click" data-k="${c.apexPct}"><td><b>V${c.n}</b></td><td class="num mono">${Math.round(c.apexM)} m</td><td class="num mono">${two(
        m(a.brakeAt),
        r ? m(r.brakeAt) : null,
      )}</td><td class="num mono">${two(v0(a.entrySpeed), r ? v0(r.entrySpeed) : null)}</td><td class="num mono ${r ? cls(a.minSpeed < r.minSpeed - 2, a.minSpeed > r.minSpeed + 2) : ""}">${two(
        v0(a.minSpeed),
        r ? v0(r.minSpeed) : null,
      )}</td><td class="num mono ${r ? cls(a.exitSpeed < r.exitSpeed - 3, a.exitSpeed > r.exitSpeed + 3) : ""}">${two(v0(a.exitSpeed), r ? v0(r.exitSpeed) : null)}</td><td class="num mono">${two(
        m(a.throttleAt),
        r ? m(r.throttleAt) : null,
      )}</td><td class="num mono">${two(a.minGear == null ? "—" : String(a.minGear), r ? (r.minGear == null ? "—" : String(r.minGear)) : null)}</td>${
        r ? `<td class="num mono ${d > 0.02 ? "bad" : d < -0.02 ? "good" : ""}">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}</td>` : ""
      }</tr>`;
    })
    .join("");
  return `<section class="panel ca"><div class="tele-head"><div><h3>${esc(T("ts_ca"))}</h3>${
    L.length > 1 ? `<p class="muted small">${esc(T("ts_ca_hint"))}</p>` : ""
  }</div></div>${theoHtml}${notesHtml}
    <div class="tele-scroll"><table class="tele-table compact ca-table"><thead><tr><th>${esc(T("ts_c_corner"))}</th><th class="num">${esc(T("ts_c_pos"))}</th><th class="num">${esc(
      T("ts_c_brake"),
    )}</th><th class="num">${esc(T("ts_c_entry"))}</th><th class="num">${esc(T("ts_c_min"))}</th><th class="num">${esc(T("ts_c_exit"))}</th><th class="num">${esc(T("ts_c_thr"))}</th><th class="num">${esc(
      T("ts_c_gear"),
    )}</th>${refIdx > 0 ? `<th class="num">${esc(T("ts_c_delta"))}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
    ${refIdx > 0 ? `<p class="muted small">${esc(T("ts_ca_legend"))}</p>` : ""}</section>`;
}

// ---------------------------------------------------------------------------
// Sürüş çizgisi (lat/lon µderece; yalnızca .ibt'den içe aktarılan turlarda)
// ---------------------------------------------------------------------------
let rlXf = null; // { lines: [{ i, xy:[[x,y]] }], vb }
function rlineHtml() {
  rlXf = null;
  const L = shown().filter((x) => (x.trace.lat?.length ?? 0) > 10 && x.trace.lat.length === x.trace.lon?.length);
  if (!L.length) return "";
  const lat0 = L[0].trace.lat[0] / 1e6;
  const lon0 = L[0].trace.lon[0] / 1e6;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const lines = L.map((x) => ({
    i: st.laps.indexOf(x),
    xy: x.trace.lat.map((la, j) => [(x.trace.lon[j] / 1e6 - lon0) * kx, -(la / 1e6 - lat0) * 110540]),
  }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l.xy) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.04 + 5;
  const vb = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  const sw = Math.max(vb[2], vb[3]) / 450;
  rlXf = { lines, sw };
  const path = (xy) => xy.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return `<section class="panel rline"><div class="tele-head"><div><h3>${esc(T("ts_rline"))}</h3><p class="muted small">${esc(T("ts_rline_hint"))}</p></div><span class="muted small" id="ts-rgap"></span></div>
    <svg id="ts-rline" class="rline-svg" viewBox="${vb.map((v) => v.toFixed(1)).join(" ")}" preserveAspectRatio="xMidYMid meet">
      ${[...lines].reverse().map((l) => `<path d="${path(l.xy)}" fill="none" stroke="${COLORS[l.i]}" stroke-width="${(sw * (l.i === 0 ? 1.6 : 1.2)).toFixed(2)}" stroke-linejoin="round" opacity="${l.i === 0 ? 1 : 0.85}"/>`).join("")}
      ${lines.map((l) => `<circle class="rl-dot" data-l="${l.i}" r="${(sw * 3.2).toFixed(2)}" fill="${COLORS[l.i]}" stroke="#0b0d12" stroke-width="${sw.toFixed(2)}" hidden/>`).join("")}
    </svg></section>`;
}
function rlAt(xy, k) {
  return xy[Math.min(xy.length - 1, Math.max(0, Math.round(k * (xy.length - 1))))];
}
function rlCursor(k) {
  const svg = $("#ts-rline");
  if (!svg || !rlXf) return;
  const gap = $("#ts-rgap");
  const a = rlXf.lines.find((l) => l.i === 0);
  const parts = [];
  for (const l of rlXf.lines) {
    const c = svg.querySelector(`.rl-dot[data-l="${l.i}"]`);
    if (k == null) { c.setAttribute("hidden", ""); continue; }
    const [x, y] = rlAt(l.xy, k);
    c.removeAttribute("hidden");
    c.setAttribute("cx", x.toFixed(1));
    c.setAttribute("cy", y.toFixed(1));
    if (a && l.i !== 0) {
      // A'nın o noktasına en yakın çizgi noktası (aynı mesafe civarında arar)
      const p = rlAt(a.xy, k);
      const j0 = Math.round(k * (l.xy.length - 1));
      let d = Infinity;
      for (let j = Math.max(0, j0 - 15); j <= Math.min(l.xy.length - 1, j0 + 15); j++) d = Math.min(d, Math.hypot(l.xy[j][0] - p[0], l.xy[j][1] - p[1]));
      parts.push(T("ts_rline_gap", LETTERS[l.i], d.toFixed(1)));
    }
  }
  if (gap) gap.textContent = k == null ? "" : parts.join(" · ");
}
function bindRline() {
  const svg = $("#ts-rline");
  if (!svg || !rlXf) return;
  const a = rlXf.lines[0];
  svg.addEventListener("pointermove", (e) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best = 0, bd = Infinity;
    a.xy.forEach(([x, y], i) => {
      const d = (x - pt.x) ** 2 + (y - pt.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    setCursor(bd > (rlXf.sw * 30) ** 2 ? null : best / (a.xy.length - 1));
  });
  svg.addEventListener("pointerleave", () => setCursor(null));
}

/** Turların tüm kanallarını CSV olarak indir */
function downloadCsv() {
  const L = st.laps.filter((x) => x.trace);
  if (!L.length) return;
  const n = L[0].trace.t.length;
  const lenM = (st.laps[0].info.track_length_km || 0) * 1000;
  const cols = [
    ["time_s", "t", 0.001], ["speed_kmh", "speed", 0.1], ["throttle_pct", "throttle", 1], ["brake_pct", "brake", 1], ["gear", "gear", 1],
    ["steer_deg", "steer", 1], ["rpm", "rpm", 1], ["lat_g", "lat_g", 0.01], ["long_g", "long_g", 0.01], ["abs", "abs", 1], ["lat", "lat", 1e-6], ["lon", "lon", 1e-6],
  ].filter(([, f]) => L.some((x) => (x.trace[f]?.length ?? 0) > 1));
  const head = ["distance_m", "lap_pct", ...L.flatMap((x) => cols.map(([k]) => `${x.letter}_${k}`))];
  const series = L.map((x) => cols.map(([, f, m]) => resampleTo(x.trace[f] || [], n).map((v) => v * m)));
  const rows = [head.join(",")];
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const r = [lenM > 0 ? (k * lenM).toFixed(1) : "", k.toFixed(4)];
    series.forEach((s) => s.forEach((c) => r.push(c.length ? String(Math.round(c[i] * 1e6) / 1e6) : "")));
    rows.push(r.join(","));
  }
  const meta = L.map((x) => `# ${x.letter}: ${x.info.driver_name || x.info.display_name || ""} · ${trackLabel(x.info)} · ${x.info.car_name || ""} · ${T("ts_lap_n", x.info.lap)} · ${lapTime(x.info.lap_time)}`);
  const blob = new Blob([[...meta, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${trackLabel(st.laps[0].info)}-${st.laps[0].info.car_name || ""}`.replace(/[^\w\-]+/g, "_").slice(0, 80) + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function render() {
  const sh = st.share;
  const first = st.laps[0]?.info || sh?.session?.session;
  const head = first
    ? `<div class="page-head"><div>
        <h1>${esc(trackLabel(first))}</h1>
        <p class="muted" style="margin:4px 0 0">${esc(SIM_LABEL[first.sim] || first.sim || "")} · ${esc(first.car_name || "")} · ${esc(
          T("ts_shared_by", sh.owner?.display_name || "—"),
        )} · ${fmtDate(sh.created_at)} · ${esc(T("ts_views", sh.views || 1))}</p>
      </div></div>`
    : "";
  const traced = shown().length > 0;
  chartDefs = charts();
  app().innerHTML = `<div class="page ts-page">
    ${head}
    ${sessionBlock()}
    ${
      st.laps.length
        ? `<section class="panel"><div class="tele-head"><h3>${esc(T("ts_laps"))}</h3>${
            traced ? `<button type="button" class="btn btn-ghost btn-sm" id="ts-csv">${esc(T("ts_csv"))}</button>` : ""
          }</div>${lapCards()}${sectorTable()}</section>`
        : ""
    }
    ${
      traced
        ? `<section class="panel tmap"><div class="tele-head"><h3>${esc(T("ts_map"))}</h3></div>${mapHtml()}</section>
           ${cornerHtml()}
           ${rlineHtml()}
           <section class="panel tcharts"><div class="tele-head"><h3>${esc(T("ts_traces"))}</h3><span class="muted small" id="ts-pos">${esc(
             T("ts_hover"),
           )}</span></div><div class="ts-zoom muted small">${esc(T("ts_zoom_hint"))} <button type="button" class="ts-zoom-reset" hidden>${esc(
             T("ts_zoom_reset"),
           )}</button></div><div id="ts-charts">${chartDefs.map(chartHtml).join("")}</div></section>`
        : st.loading
          ? `<p class="muted">${esc(T("ts_loading_traces"))}</p>`
          : st.laps.length
            ? `<p class="muted">${esc(T("ts_notrace"))}</p>`
            : ""
    }
    <p class="ts-foot muted">${esc(T("ts_made_with"))} · <a href="index.html">${esc(T("ts_get_app"))}</a></p>
  </div>`;
  bind();
}

function setCursor(k) {
  st.cursor = k;
  const L = shown();
  const n = L[0]?.trace?.n || L[0]?.trace?.t?.length || 0;
  const pos = $("#ts-pos");
  document.querySelectorAll(".tchart").forEach((el) => {
    const c = chartDefs[Number(el.dataset.c)];
    const cur = el.querySelector(".tchart-cursor");
    if (k == null || !c) {
      cur.hidden = true;
      c?.series.forEach((s, j) => {
        const r = el.querySelector(`[data-r="${el.dataset.c}-${j}"]`);
        if (r) r.textContent = "—";
      });
      return;
    }
    const x = (k - st.zoom.a) / Math.max(1e-6, st.zoom.b - st.zoom.a);
    cur.hidden = x < 0 || x > 1;
    cur.style.left = `${x * 100}%`;
    c.series.forEach((s, j) => {
      const i = Math.min(s.values.length - 1, Math.max(0, Math.round(k * (s.values.length - 1))));
      const r = el.querySelector(`[data-r="${el.dataset.c}-${j}"]`);
      if (r) r.textContent = c.fmt(s.values[i] ?? 0);
    });
  });
  if (pos) {
    const len = st.laps[0]?.info?.track_length_km || 0;
    pos.textContent = k == null ? T("ts_hover") : T("ts_pos", len > 0 ? `${Math.round(k * len * 1000)} m` : `%${Math.round(k * 100)}`);
  }
  // Haritadaki nokta
  const svg = $("#ts-map");
  if (svg && mapXf) {
    const dot = svg.querySelector(".tmap-cursor");
    const halo = svg.querySelector(".tmap-cursor-halo");
    if (k == null) {
      dot.setAttribute("hidden", "");
      halo.setAttribute("hidden", "");
    } else {
      const m = mapXf.pts.length;
      const [x, y] = mapXf.xf(mapXf.pts[Math.min(m - 1, Math.floor(Math.min(k, 0.9999) * m))]);
      for (const c of [dot, halo]) {
        c.removeAttribute("hidden");
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
      }
    }
  }
  rlCursor(k);
  void n;
}

/** Grafikleri yeniden çiz (yakınlaştırma değişti) */
function redrawCharts() {
  const box = $("#ts-charts");
  if (!box) return;
  box.innerHTML = chartDefs.map(chartHtml).join("");
  const rb = document.querySelector(".ts-zoom-reset");
  if (rb) rb.hidden = !(st.zoom.a > 0.0005 || st.zoom.b < 0.9995);
  bindCharts();
  setCursor(st.cursor);
}

function bindCharts() {
  const span = () => Math.max(1e-6, st.zoom.b - st.zoom.a);
  document.querySelectorAll(".tchart-plot").forEach((p) => {
    const xOf = (e) => {
      const r = p.getBoundingClientRect();
      return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    };
    const sel = p.querySelector(".tchart-sel");
    let drag = null;
    p.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      p.setPointerCapture(e.pointerId);
      drag = { x0: xOf(e), x1: xOf(e) };
    });
    p.addEventListener("pointermove", (e) => {
      const x = xOf(e);
      setCursor(st.zoom.a + x * span());
      if (drag) {
        drag.x1 = x;
        sel.hidden = Math.abs(drag.x1 - drag.x0) < 0.005;
        sel.style.left = `${Math.min(drag.x0, drag.x1) * 100}%`;
        sel.style.width = `${Math.abs(drag.x1 - drag.x0) * 100}%`;
      }
    });
    p.addEventListener("pointerup", () => {
      const d = drag;
      drag = null;
      sel.hidden = true;
      if (!d || Math.abs(d.x1 - d.x0) < 0.02) return;
      const a = st.zoom.a + Math.min(d.x0, d.x1) * span();
      const b = st.zoom.a + Math.max(d.x0, d.x1) * span();
      if (b - a > 0.004) {
        st.zoom = { a, b };
        redrawCharts();
      }
    });
    p.addEventListener("pointerleave", () => !drag && setCursor(null));
    p.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const k = st.zoom.a + xOf(e) * span();
        const w = Math.min(1, Math.max(0.01, span() * (e.deltaY > 0 ? 1.25 : 0.8)));
        let a = k - (k - st.zoom.a) * (w / span());
        a = Math.min(Math.max(0, a), 1 - w);
        st.zoom = { a, b: a + w };
        redrawCharts();
      },
      { passive: false },
    );
    p.addEventListener("dblclick", () => {
      st.zoom = { a: 0, b: 1 };
      redrawCharts();
    });
  });
}

function bind() {
  bindCharts();
  bindRline();
  $("#ts-csv")?.addEventListener("click", downloadCsv);
  document.querySelector(".ts-zoom-reset")?.addEventListener("click", () => {
    st.zoom = { a: 0, b: 1 };
    redrawCharts();
  });
  const svg = $("#ts-map");
  if (svg && mapXf) {
    svg.addEventListener("pointermove", (e) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const m = mapXf.pts.length;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < m; i++) {
        const [x, y] = mapXf.xf(mapXf.pts[i]);
        const d = (x - pt.x) ** 2 + (y - pt.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      setCursor(bd > 40 * 40 ? null : best / m);
    });
    svg.addEventListener("pointerleave", () => setCursor(null));
  }
  document.querySelectorAll("[data-k]").forEach((el) =>
    el.addEventListener("click", () => {
      setCursor(Number(el.dataset.k));
      document.querySelector(".tcharts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  const vs = $("#ts-vs");
  if (vs)
    vs.addEventListener("change", () => {
      st.vs = Number(vs.value);
      render();
    });
  document.querySelectorAll("[data-on]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const i = Number(cb.dataset.on);
      st.laps[i].on = cb.checked;
      render();
    }),
  );
}

async function main() {
  await boot("/telemetri", "drivers");
  const id = new URLSearchParams(location.search).get("s");
  if (!id) {
    app().innerHTML = `<div class="page"><div class="msg">${esc(T("ts_nolink"))}</div></div>`;
    return;
  }
  try {
    const { data, error } = await sb.rpc("telemetry_share_get", { p_id: id });
    if (error || !data) throw new Error(error?.message || "x");
    st.share = data;
  } catch {
    app().innerHTML = `<div class="page"><div class="msg">${esc(T("ts_missing"))}</div></div>`;
    return;
  }
  const infos = st.share.laps || [];
  st.laps = infos.map((info, i) => ({ info, trace: null, color: COLORS[i], letter: LETTERS[i], on: true }));
  const first = infos[0] || st.share.session?.session;
  if (first) document.title = `${trackLabel(first)} — ${T("ts_title")} — SRTR Pitwall`;
  st.loading = infos.some((l) => l.trace_path);
  render();
  if (st.loading) {
    const traces = await loadTraces(infos).catch(() => infos.map(() => null));
    traces.forEach((t, i) => (st.laps[i].trace = t));
    st.loading = false;
    render();
  }
}

main();
