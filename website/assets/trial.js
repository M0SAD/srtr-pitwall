// Deneme PRO (sitede / telefonda): girişten sonra hesap + tarayıcı başına bir kez sunucudan deneme PRO istenir.
// Karar sunucuda (supabase/c41_guncelleme.sql trial_claim); reddedilirse hiçbir şey gösterilmez (neden dönmez).
// Gizlilik: tarayıcıya rastgele bir kimlik (localStorage) ve hafif parmak izinin (UA, ekran, saat dilimi, dil)
// SHA-256 karması gönderilir; ham değerler gönderilmez.
import { T, addDict, esc, fmtDate, sb } from "./core.js";

addDict({
  trial_title: ["Hoş geldin! {0} günlük PRO denemen başladı", "Welcome! Your {0}-day PRO trial has started"],
  trial_lead: ["Deneme süresince tüm PRO özellikleri açık. Bitiş: {0}", "All PRO features are unlocked during the trial. Ends: {0}"],
  trial_f1: [
    "<b>Sesli spotter ve mühendis</b> — yandaki araçlar, bayraklar, yakıt, pozisyon ve kalan tur bilgisi.",
    "<b>Voice spotter and engineer</b> — cars alongside, flags, fuel, position and laps remaining.",
  ],
  trial_f2: ["<b>PRO overlay'ler ve ayarlar</b> — PRO'ya ayrılmış tüm overlay'ler ve gelişmiş seçenekler.", "<b>PRO overlays and settings</b> — every PRO overlay and advanced option."],
  trial_f3: [
    "<b>Telemetri ve sosyal özellikler</b> — tur karşılaştırma, takımlar, mesajlar ve daha fazlası.",
    "<b>Telemetry and social features</b> — lap comparison, teams, messages and more.",
  ],
  trial_f4: [
    "<b>Geliştirmeye destek</b> — beğenirsen PRO'ya geçerek yeni özelliklerin gelmesine katkı sağlarsın.",
    "<b>Support development</b> — if you like it, going PRO helps bring new features.",
  ],
  trial_note: ["Deneme bitince hesabın kendiliğinden ücretsiz sürüme döner; ödeme bilgisi istenmez.", "When the trial ends your account returns to the free plan automatically; no payment details needed."],
  trial_ok: ["Başlayalım", "Let's go"],
});

const FP_KEY = "pitwall.trial.fp";
const DONE_KEY = "pitwall.trial.done";

function webId() {
  try {
    let v = localStorage.getItem(FP_KEY);
    if (!v) {
      v = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(FP_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

async function browserFp() {
  try {
    const s = [
      navigator.userAgent,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
      String(navigator.hardwareConcurrency ?? ""),
    ].join("|");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)]
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function doneList() {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
  } catch {
    return [];
  }
}

// Sadece bu pencerenin stili (site.css'e dokunmadan)
const CSS = `
.trial-modal{border-color:rgba(255,138,42,.4);background:radial-gradient(120% 60% at 50% 0%,rgba(255,138,42,.14),transparent 70%),var(--card)}
.trial-hero{text-align:center;margin-bottom:10px}
.trial-hero h2{margin:8px 0 4px}
.trial-star{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;font-size:26px;color:#1a0f00;
  background:linear-gradient(135deg,var(--accent-2),var(--accent));box-shadow:0 0 24px rgba(255,138,42,.45)}
.trial-list{margin:0 0 10px;padding-left:20px;line-height:1.55}
.trial-list li{margin-bottom:6px}
`;

function showWelcome(r, onClose) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal trial-modal">
    <div class="trial-hero"><span class="trial-star">★</span>
      <h2>${esc(T("trial_title", r.days ?? 3))}</h2>
      <p class="muted">${esc(T("trial_lead", fmtDate(r.until, true)))}</p></div>
    <ul class="trial-list">${["trial_f1", "trial_f2", "trial_f3", "trial_f4"].map((k) => `<li>${T(k)}</li>`).join("")}</ul>
    <p class="muted small">${esc(T("trial_note"))}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-accent" data-ok>${esc(T("trial_ok"))}</button></div>
  </div>`;
  const close = () => {
    bg.remove();
    onClose?.();
  };
  bg.addEventListener("click", (e) => e.target === bg && close());
  bg.querySelector("[data-ok]").addEventListener("click", close);
  if (!document.getElementById("trial-css")) document.head.insertAdjacentHTML("beforeend", `<style id="trial-css">${CSS}</style>`);
  document.body.appendChild(bg);
}

let running = false;
/** Girişli kullanıcı için bir kez çağrılır. Kabul edilirse kutlama penceresi; kapanınca onGranted (ör. paneli yenile). */
export async function maybeClaimTrial(user, onGranted) {
  if (!user || running) return;
  const key = `${user.id}:web`;
  const done = doneList();
  if (done.includes(key)) return;
  running = true;
  try {
    const { data, error } = await sb.rpc("trial_claim", { p_device: null, p_web_fp: webId(), p_fp: await browserFp() });
    if (error) return; // eski sunucu / ağ hatası: sonra yeniden denenir
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...done, key].slice(-50)));
    } catch {
      /* depolama yok */
    }
    if (data?.granted) showWelcome(data, onGranted);
  } finally {
    running = false;
  }
}
