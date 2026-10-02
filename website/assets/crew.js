// Ekip (uzaktan pit ekibi) — telefon için panel. Sunucu: supabase/c53_guncelleme.sql.
// Giriş yapmış ekip üyesi: ekibinde olduğu sürücüyü seçer -> canlı yarış verisi (3 sn'de bir crew_driver)
// ve yetki verildiyse pit kontrolleri (crew_command; sonucu crew_command_get ile izlenir).
// Sürücünün programı komutu iRacing'e uygular ve sonucu yazar; program kapalıysa komut 30 sn'de düşer.
// Site hiçbir ayara doğrudan yazmaz: her şey sunucudaki yetki denetimli fonksiyonlardan geçer.
import { $, T, addDict, boot, currentUser, esc, sb, toast } from "./core.js";

addDict({
  cw_title: ["Ekip", "Crew"],
  cw_lead: [
    "Ekibinde olduğun sürücünün yarışını izle; izin verdiyse yakıt, lastik ve tamir ayarlarını uzaktan değiştir.",
    "Watch the race of a driver whose crew you are on; if allowed, change fuel, tyre and repair settings remotely.",
  ],
  cw_login: ["Ekip panelini kullanmak için giriş yapmalısın.", "Sign in to use the crew panel."],
  cw_login_btn: ["Giriş yap", "Sign in"],
  cw_none: [
    "Henüz kimsenin ekibinde değilsin. Arkadaşın SRTR Pitwall programında <b>Ayarlar › Paylaşım › Ekip</b> bölümünden seni eklediğinde burada görünür.",
    "You are not on anyone's crew yet. When a friend adds you in the SRTR Pitwall app under <b>Settings › Sharing › Crew</b>, they will appear here.",
  ],
  cw_error: ["Ekip listesi okunamadı. Daha sonra tekrar dene.", "Could not load the crew list. Try again later."],
  cw_pick: ["Sürücü seç", "Pick a driver"],
  cw_back: ["← Sürücüler", "← Drivers"],
  cw_live: ["Canlı", "Live"],
  cw_racing: ["Yarışta", "Racing"],
  cw_online: ["Çevrimiçi", "Online"],
  cw_offline: ["Çevrimdışı", "Offline"],
  cw_role_control: ["Pit kontrolü", "Pit control"],
  cw_role_view: ["Sadece izleme", "View only"],
  cw_no_data: [
    "Sürücü şu an veri göndermiyor. Yarışa girdiğinde burası kendiliğinden dolar.",
    "The driver is not sending data right now. This fills in automatically when they are on track.",
  ],
  cw_stale: ["Son alınan veri ({0} önce)", "Last received data ({0} ago)"],
  cw_sec: ["{0} sn", "{0} s"],
  cw_min: ["{0} dk", "{0} min"],
  cw_pos: ["Sıra", "Position"],
  cw_class: ["sınıf", "class"],
  cw_lap: ["Tur", "Lap"],
  cw_remain: ["Kalan", "Remaining"],
  cw_laps_n: ["{0} tur", "{0} laps"],
  cw_last: ["Son tur", "Last lap"],
  cw_best: ["En iyi tur", "Best lap"],
  cw_inc: ["Olay puanı", "Incidents"],
  cw_where: ["Konum", "Location"],
  cw_on_track: ["Pistte", "On track"],
  cw_pit_road: ["Pit yolunda", "On pit road"],
  cw_pit_stall: ["Pit kutusunda", "In pit stall"],
  cw_fuel: ["Yakıt", "Fuel"],
  cw_tank: ["Depo", "Tank"],
  cw_per_lap: ["Tur başı", "Per lap"],
  cw_fuel_laps: ["Depoyla tur", "Laps of fuel"],
  cw_race_left: ["Yarışın bitmesine", "Race remaining"],
  cw_to_finish: ["Bitiş için eklenecek", "To add to finish"],
  cw_enough: ["Yeterli", "Enough"],
  cw_service: ["Pit servisi (şu an ayarlı)", "Pit service (currently set)"],
  cw_service_na: ["Bu oyun pit servisi ayarlarını bildirmiyor.", "This game does not report pit service settings."],
  cw_sv_fuel_none: ["Eklenmeyecek", "No fuel"],
  cw_tyres: ["Lastik", "Tyres"],
  cw_tyres_4: ["4 lastik", "All 4"],
  cw_tyres_0: ["Değişmeyecek", "No change"],
  cw_lf: ["Sol ön", "Left front"],
  cw_rf: ["Sağ ön", "Right front"],
  cw_lr: ["Sol arka", "Left rear"],
  cw_rr: ["Sağ arka", "Right rear"],
  cw_fr: ["Hızlı tamir", "Fast repair"],
  cw_fr_left: ["{0} hak", "{0} left"],
  cw_tearoff: ["Vizör filmi", "Tear-off"],
  cw_on: ["Açık", "On"],
  cw_off: ["Kapalı", "Off"],
  cw_tyre_state: ["Lastikler (kalan diş · sıcaklık)", "Tyres (tread left · temperature)"],
  cw_control: ["Pit kontrolü", "Pit control"],
  cw_set_l: ["{0} L ayarla", "Set {0} L"],
  cw_fuel_end: ["Yarış sonuna kadar yakıt", "Fuel to the finish"],
  cw_fuel_end_l: ["Yarış sonuna kadar yakıt ({0} L)", "Fuel to the finish ({0} L)"],
  cw_fuel_none: ["Yakıt ekleme", "No fuel"],
  cw_all: ["4 lastik", "All 4"],
  cw_none_t: ["Hiçbiri", "None"],
  cw_clear: ["Tümünü temizle", "Clear all"],
  cw_clear_ask: ["Bütün pit servisi seçimleri kaldırılsın mı?", "Clear every pit service selection?"],
  cw_msg: ["Mesaj", "Message"],
  cw_msg_ph: ["Sürücüye kısa mesaj (ekranında görünür)", "Short message to the driver (shown on screen)"],
  cw_send: ["Gönder", "Send"],
  cw_b_view: ["Bu sürücü sana sadece izleme yetkisi verdi.", "This driver gave you view-only access."],
  cw_b_idle: ["Sürücü şu an yarışta değil ya da veri göndermiyor.", "The driver is not racing or not sending data right now."],
  cw_b_sim: ["Uzaktan pit komutları bu oyunda desteklenmiyor (sadece izleme).", "Remote pit commands are not supported in this game (view only)."],
  cw_b_off: ["Sürücü ekip kontrolünü kapattı.", "The driver turned crew control off."],
  cw_st_pending: ["Bekliyor…", "Pending…"],
  cw_st_applied: ["Uygulandı", "Applied"],
  cw_st_rejected: ["Reddedildi", "Rejected"],
  cw_st_expired: ["Süresi doldu", "Expired"],
  cw_c_fuel: ["yakıt {0} L", "fuel {0} L"],
  cw_c_fuel_clear: ["yakıt eklenmeyecek", "no fuel"],
  cw_c_tyres_all: ["4 lastik değişecek", "change all 4 tyres"],
  cw_c_tyres: ["lastik: {0}", "tyres: {0}"],
  cw_c_tyres_clear: ["lastik değişmeyecek", "no tyre change"],
  cw_c_fr_on: ["hızlı tamir açık", "fast repair on"],
  cw_c_fr_off: ["hızlı tamir kapalı", "fast repair off"],
  cw_c_to_on: ["vizör filmi açık", "tear-off on"],
  cw_c_to_off: ["vizör filmi kapalı", "tear-off off"],
  cw_c_clear: ["pit servisi temizlendi", "pit service cleared"],
  cw_flag_check: ["Damalı bayrak", "Chequered flag"],
  cw_flag_red: ["Kırmızı bayrak", "Red flag"],
  cw_flag_sc: ["Güvenlik aracı", "Safety car"],
  cw_flag_yellow: ["Sarı bayrak", "Yellow flag"],
  cw_flag_white: ["Son tur", "Final lap"],
  // Sunucunun / programın Türkçe döndürdüğü sonuç ve hata metinleri
  cw_r_stopped: ["Sürücü ekip kontrolünü durdurdu", "The driver stopped crew control"],
  cw_r_not_accept: ["Sürücü şu an ekip kontrolünü kabul etmiyor", "The driver is not accepting crew control right now"],
  cw_r_not_in_game: ["Sürücü oyunda değil", "The driver is not in the game"],
  cw_r_unsupported: ["Bu oyunda desteklenmiyor", "Not supported in this game"],
  cw_r_expired: ["Süresi doldu (sürücünün uygulaması yanıt vermedi)", "Expired (the driver's app did not respond)"],
  cw_r_no_perm: ["Bu sürücünün pit ayarlarını değiştirme yetkin yok", "You are not allowed to change this driver's pit settings"],
  cw_r_not_crew: ["Bu sürücünün ekibinde değilsin", "You are not on this driver's crew"],
  cw_r_rate: ["Çok hızlı: dakikada en fazla 30 komut gönderebilirsin", "Too fast: at most 30 commands per minute"],
  cw_r_fuel_range: ["Yakıt miktarı 1 ile 1000 litre arasında olmalı", "Fuel must be between 1 and 1000 litres"],
  cw_r_windows: ["iRacing komutları sadece Windows'ta çalışır", "iRacing commands only work on Windows"],
});

/** Sunucudan / programdan gelen Türkçe metin -> çeviri anahtarı */
const RESULT_KEYS = {
  "Sürücü ekip kontrolünü durdurdu": "cw_r_stopped",
  "Sürücü şu an ekip kontrolünü kabul etmiyor": "cw_r_not_accept",
  "Sürücü oyunda değil": "cw_r_not_in_game",
  "Bu oyunda desteklenmiyor": "cw_r_unsupported",
  "Süresi doldu (sürücünün uygulaması yanıt vermedi)": "cw_r_expired",
  "Bu sürücünün pit ayarlarını değiştirme yetkin yok": "cw_r_no_perm",
  "Bu sürücünün ekibinde değilsin": "cw_r_not_crew",
  "Çok hızlı: dakikada en fazla 30 komut gönderebilirsin": "cw_r_rate",
  "Yakıt miktarı 1 ile 1000 litre arasında olmalı": "cw_r_fuel_range",
  "iRacing komutları sadece Windows'ta çalışır": "cw_r_windows",
};
const tr = (s) => (RESULT_KEYS[s] ? T(RESULT_KEYS[s]) : s || "");

const PIT = { lf: 1, rf: 2, lr: 4, rr: 8, fuel: 0x10, tearoff: 0x20, fr: 0x40, tyres: 0x0f };
const CORNERS = [
  ["lf", PIT.lf],
  ["rf", PIT.rf],
  ["lr", PIT.lr],
  ["rr", PIT.rr],
];
const SIMS = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "AMS2" };
const simOk = (s) => !s || s === "iracing";

const app = $("#app");
let user = null;
let drivers = null; // null: okunamadı
let sel = new URLSearchParams(location.search).get("d") || "";
let drv = null;
let liters = 40;
let litersTouched = false;
let sent = []; // son komutlar (yeni başta)

/** Sürücüden gelen veri güvenilmez: sayı olmayan her şey 0 sayılır (HTML'e sayı olarak yazılır) */
const n0 = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const num = (v, d = 1) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—");
function lapTime(s) {
  if (!(s > 0)) return "—";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m > 0 ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
}
function remain(sec, laps) {
  if (typeof laps === "number" && laps >= 0 && laps < 32000) return T("cw_laps_n", laps);
  sec = typeof sec === "number" ? sec : -1;
  if (sec == null || sec < 0 || sec > 600000) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function flagText(f) {
  if (!f) return "";
  if (f & 0x1) return T("cw_flag_check");
  if (f & 0x10) return T("cw_flag_red");
  if (f & (0x4000 | 0x8000)) return T("cw_flag_sc");
  if (f & (0x8 | 0x100)) return T("cw_flag_yellow");
  if (f & 0x2) return T("cw_flag_white");
  return "";
}
const ago = (s) => (s < 90 ? T("cw_sec", s) : T("cw_min", Math.round(s / 60)));
const statusText = (d) => T(d.live ? "cw_live" : d.racing ? "cw_racing" : d.online ? "cw_online" : "cw_offline");

function cmdText(kind, a = {}) {
  switch (kind) {
    case "fuel_set":
      return T("cw_c_fuel", Math.ceil(Number(a.liters) || 0));
    case "fuel_clear":
      return T("cw_c_fuel_clear");
    case "tyres_all":
      return T("cw_c_tyres_all");
    case "tyres": {
      const l = CORNERS.filter(([k]) => a[k]).map(([k]) => T("cw_" + k));
      return l.length ? T("cw_c_tyres", l.join(", ")) : T("cw_c_tyres_clear");
    }
    case "tyres_clear":
      return T("cw_c_tyres_clear");
    case "fast_repair":
      return T(a.on === false ? "cw_c_fr_off" : "cw_c_fr_on");
    case "tearoff":
      return T(a.on === false ? "cw_c_to_off" : "cw_c_to_on");
    case "clear_all":
      return T("cw_c_clear");
    case "message":
      return String(a.text ?? "");
    default:
      return kind;
  }
}

// ---- Sunucu ----
async function loadDrivers() {
  const { data, error } = await sb.rpc("crew_drivers");
  drivers = error ? null : (data ?? []);
}
async function loadDriver() {
  if (!sel) return;
  const id = sel;
  const { data, error } = await sb.rpc("crew_driver", { p_owner: id });
  if (id !== sel) return;
  if (error) {
    // Ekipten çıkarılmış olabilir: listeye dön
    toast(tr(error.message), true);
    pick("");
    return;
  }
  drv = data;
  // İlk açılışta litre kutusu: şu an ayarlı pit yakıtı ya da bitiş için gereken
  if (!litersTouched) {
    const c = drv?.data?.crew;
    const want = c?.pit?.flags >= 0 && c.pit.flags & PIT.fuel && c.pit.fuel > 0 ? c.pit.fuel : (c?.toFinish ?? 0);
    if (n0(want) > 0) liters = Math.min(1000, Math.ceil(n0(want)));
  }
  drawDash();
}

async function send(kind, args = {}) {
  if (!sel) return;
  const owner = sel;
  const { data: id, error } = await sb.rpc("crew_command", { p_owner: owner, p_kind: kind, p_args: args });
  if (error) {
    toast(tr(error.message), true);
    return;
  }
  const row = { id, kind, args, status: "pending", result: "" };
  sent = [row, ...sent].slice(0, 6);
  drawSent();
  if (navigator.vibrate) navigator.vibrate(15);
  // Sonucu bekle (sunucu 30 sn'de 'expired' yapar)
  for (let i = 0; i < 40 && row.status === "pending"; i++) {
    await new Promise((r) => setTimeout(r, i < 10 ? 500 : 1000));
    const { data } = await sb.rpc("crew_command_get", { p_id: id });
    if (data && data.status !== "pending") {
      row.status = data.status;
      row.result = data.result || "";
    }
  }
  if (row.status === "pending") row.status = "expired";
  drawSent();
  if (owner === sel) void loadDriver();
}

// ---- Görünüm ----
function pick(id) {
  sel = id;
  drv = null;
  sent = [];
  litersTouched = false;
  history.replaceState(null, "", id ? `?d=${encodeURIComponent(id)}` : location.pathname);
  draw();
  if (id) void loadDriver();
  else void loadDrivers().then(draw);
}

function drawList() {
  if (drivers === null) return `<p class="muted">${T("cw_error")}</p>`;
  if (!drivers.length) return `<div class="card cw-empty"><p>${T("cw_none")}</p></div>`;
  return `<h2 class="cw-h">${T("cw_pick")}</h2><div class="cw-list">${drivers
    .map(
      (d) => `<button type="button" class="cw-drv${d.live ? " live" : ""}" data-pick="${esc(d.owner_id)}">
        <span class="cw-dot"></span>
        <span class="cw-drv-t"><b translate="no">${esc(d.display_name || "?")}</b>
        <small>${esc([statusText(d), d.track, d.car].filter(Boolean).join(" · "))}</small></span>
        <span class="cw-role${d.can_control ? " ctl" : ""}">${T(d.can_control ? "cw_role_control" : "cw_role_view")}</span>
      </button>`,
    )
    .join("")}</div>`;
}

const stat = (label, value, cls = "") => `<div class="cw-stat ${cls}"><small>${label}</small><b>${value}</b></div>`;

function blocked() {
  const d = drv;
  if (!d) return " ";
  if (!d.can_control) return T("cw_b_view");
  if (!d.live) return T("cw_b_idle");
  if (!simOk(d.data?.crew?.sim ?? d.sim)) return T("cw_b_sim");
  if (!d.control_on || d.data?.crew?.ctl === false) return T("cw_b_off");
  return "";
}

function dashHtml() {
  const d = drv;
  if (!d) return `<p class="muted" data-t="loading">${T("loading")}</p>`;
  const x = d.data;
  const c = x?.crew || null;
  const pf = c?.pit?.flags ?? -1;
  const has = (bit) => pf >= 0 && (pf & bit) !== 0;
  const flag = flagText(c?.flags);
  const toFinish = Math.max(0, n0(c?.toFinish ?? x?.refuel));
  const b = blocked();
  const dis = b ? "disabled" : "";
  let h = `<div class="cw-head">
      <div><h2 translate="no">${esc(d.display_name || "?")}</h2>
      <p class="muted small">${esc([SIMS[c?.sim || d.sim] || "", x?.track || d.track, x?.car || d.car, x?.session || d.session].filter(Boolean).join(" · ") || "—")}</p></div>
      <span class="cw-badge${d.live ? " live" : ""}">${statusText(d)}</span>
    </div>`;
  if (flag) h += `<div class="cw-flag">${esc(flag)}</div>`;
  if (!x) h += `<div class="card cw-empty"><p>${T("cw_no_data")}</p></div>`;
  else {
    if (!d.live && d.age != null) h += `<p class="muted small">${esc(T("cw_stale", ago(d.age)))}</p>`;
    h += `<div class="cw-grid">
      ${stat(T("cw_pos"), (n0(x.position) ? `P${n0(x.position)}` : "—") + (n0(c?.classPos) ? ` <i>${T("cw_class")} P${n0(c.classPos)}</i>` : ""))}
      ${stat(T("cw_lap"), n0(x.lap) || "—")}
      ${stat(T("cw_remain"), esc(remain(c?.timeRemain, c?.lapsRemain)))}
      ${stat(T("cw_last"), lapTime(x.last))}
      ${stat(T("cw_best"), lapTime(x.best))}
      ${stat(T("cw_inc"), c ? `${n0(c.inc)}x` : "—")}
      ${stat(T("cw_where"), T(c?.stall ? "cw_pit_stall" : x.onPit ? "cw_pit_road" : "cw_on_track"), x.onPit ? "warn" : "")}
    </div>
    <h3 class="cw-h">${T("cw_fuel")}</h3>
    <div class="cw-grid">
      ${stat(T("cw_tank"), `${num(x.level)} L`)}
      ${stat(T("cw_per_lap"), x.usage > 0 ? `${num(x.usage, 2)} L` : "—")}
      ${stat(T("cw_fuel_laps"), x.lapsLeft > 0 ? num(x.lapsLeft) : "—")}
      ${stat(T("cw_race_left"), c?.raceLaps ? esc(T("cw_laps_n", num(c.raceLaps))) : "—")}
      ${stat(T("cw_to_finish"), toFinish > 0 ? `${num(toFinish)} L` : T("cw_enough"), toFinish > 0 ? "warn" : "ok")}
    </div>
    <h3 class="cw-h">${T("cw_service")}</h3>`;
    if (pf < 0) h += `<p class="muted small">${T("cw_service_na")}</p>`;
    else {
      const ty = pf & PIT.tyres;
      const tyText = ty === PIT.tyres ? T("cw_tyres_4") : ty === 0 ? T("cw_tyres_0") : CORNERS.filter(([, bit]) => pf & bit).map(([k]) => T("cw_" + k)).join(", ");
      h += `<div class="cw-grid">
        ${stat(T("cw_fuel"), has(PIT.fuel) ? `+${num(c.pit.fuel, 0)} L` : T("cw_sv_fuel_none"), has(PIT.fuel) ? "on" : "")}
        ${stat(T("cw_tyres"), esc(tyText), ty ? "on" : "")}
        ${stat(T("cw_fr"), T(has(PIT.fr) ? "cw_on" : "cw_off") + (typeof c.pit.fr === "number" && c.pit.fr >= 0 ? ` <i>${esc(T("cw_fr_left", n0(c.pit.fr)))}</i>` : ""), has(PIT.fr) ? "on" : "")}
        ${stat(T("cw_tearoff"), T(has(PIT.tearoff) ? "cw_on" : "cw_off"), has(PIT.tearoff) ? "on" : "")}
      </div>`;
    }
    if ((c?.wear || []).some((w) => w >= 0)) {
      h += `<h3 class="cw-h">${T("cw_tyre_state")}</h3><div class="cw-tyres">${CORNERS.map(
        ([k], i) => `<div><small>${T("cw_" + k)}</small><b>${c.wear[i] >= 0 ? `${n0(c.wear[i])}%` : "—"} · ${c.temp?.[i] > 0 ? `${n0(c.temp[i])}°C` : "—"}</b></div>`,
      ).join("")}</div>`;
    }
  }
  // Kontroller
  h += `<h3 class="cw-h">${T("cw_control")}</h3>`;
  if (b.trim()) h += `<p class="cw-blocked">${esc(b)}</p>`;
  if (d.can_control) {
    h += `<fieldset class="cw-ctl" ${dis}>
      <div class="cw-fuel">
        <button type="button" class="cw-btn" data-l="-5">−5</button>
        <button type="button" class="cw-btn" data-l="-1">−1</button>
        <input id="cw-liters" type="number" inputmode="numeric" min="1" max="1000" value="${liters}" aria-label="L" />
        <button type="button" class="cw-btn" data-l="1">+1</button>
        <button type="button" class="cw-btn" data-l="5">+5</button>
      </div>
      <button type="button" class="cw-btn accent wide" data-cmd="fuel_set" id="cw-set">${esc(T("cw_set_l", liters))}</button>
      <div class="cw-row2">
        <button type="button" class="cw-btn" data-cmd="fuel_end">${esc(toFinish > 0 ? T("cw_fuel_end_l", Math.ceil(toFinish)) : T("cw_fuel_end"))}</button>
        <button type="button" class="cw-btn" data-cmd="fuel_clear">${T("cw_fuel_none")}</button>
      </div>
      <h4 class="cw-h4">${T("cw_tyres")}</h4>
      <div class="cw-car">
        ${CORNERS.map(([k, bit]) => `<button type="button" class="cw-btn${has(bit) ? " on" : ""}" data-corner="${k}">${T("cw_" + k)}</button>`).join("")}
      </div>
      <div class="cw-row2">
        <button type="button" class="cw-btn" data-cmd="tyres_all">${T("cw_all")}</button>
        <button type="button" class="cw-btn" data-cmd="tyres_clear">${T("cw_none_t")}</button>
      </div>
      <div class="cw-row2">
        <button type="button" class="cw-btn${has(PIT.fr) ? " on" : ""}" data-cmd="fast_repair">${T("cw_fr")}</button>
        <button type="button" class="cw-btn${has(PIT.tearoff) ? " on" : ""}" data-cmd="tearoff">${T("cw_tearoff")}</button>
      </div>
      <button type="button" class="cw-btn danger wide" data-cmd="clear_all">${T("cw_clear")}</button>
    </fieldset>`;
  }
  h += `<fieldset class="cw-ctl" ${d.live ? "" : "disabled"}>
      <h4 class="cw-h4">${T("cw_msg")}</h4>
      <form class="cw-msg" id="cw-msg"><input id="cw-text" maxlength="120" autocomplete="off" placeholder="${esc(T("cw_msg_ph"))}" />
      <button type="submit" class="cw-btn accent">${T("cw_send")}</button></form>
    </fieldset>
    <div id="cw-sent"></div>`;
  return h;
}

function drawSent() {
  const el = $("#cw-sent");
  if (!el) return;
  el.innerHTML = sent
    .map(
      (c) => `<div class="cw-cmd ${c.status}"><span>${esc(cmdText(c.kind, c.args))}</span>
        <b>${T("cw_st_" + c.status)}${c.result ? ` · ${esc(tr(c.result))}` : ""}</b></div>`,
    )
    .join("");
}

/** Panel yeniden çizilir; yazılmakta olan mesaj ve odak korunur */
function drawDash() {
  const host = $("#cw-dash");
  if (!host) return;
  const text = $("#cw-text");
  const keep = text ? { v: text.value, f: document.activeElement === text, s: text.selectionStart } : null;
  const litF = document.activeElement?.id === "cw-liters";
  if (litF) return; // litre yazılırken çizme (bir sonraki yenilemede güncellenir)
  host.innerHTML = dashHtml();
  drawSent();
  if (keep) {
    const t2 = $("#cw-text");
    if (t2) {
      t2.value = keep.v;
      if (keep.f) {
        t2.focus();
        try {
          t2.setSelectionRange(keep.s, keep.s);
        } catch {}
      }
    }
  }
}

function draw() {
  if (!user) {
    app.innerHTML = `<section class="page cw"><h1>${T("cw_title")}</h1><p class="muted">${T("cw_login")}</p>
      <p><a class="btn btn-accent" href="hesap.html?next=crew.html">${T("cw_login_btn")}</a></p></section>`;
    return;
  }
  if (!sel) {
    app.innerHTML = `<section class="page cw"><h1>${T("cw_title")}</h1><p class="muted">${T("cw_lead")}</p>${drawList()}</section>`;
    return;
  }
  app.innerHTML = `<section class="page cw"><button type="button" class="cw-back" id="cw-back">${T("cw_back")}</button><div id="cw-dash"></div></section>`;
  drawDash();
}

// ---- Olaylar (tek dinleyici: içerik sık yeniden çizilir) ----
app.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || t.disabled) return;
  if (t.dataset.pick) return pick(t.dataset.pick);
  if (t.id === "cw-back") return pick("");
  if (t.dataset.l) {
    liters = Math.min(1000, Math.max(1, liters + Number(t.dataset.l)));
    litersTouched = true;
    const inp = $("#cw-liters");
    if (inp) inp.value = liters;
    const set = $("#cw-set");
    if (set) set.textContent = T("cw_set_l", liters);
    return;
  }
  const pf = drv?.data?.crew?.pit?.flags ?? -1;
  const has = (bit) => pf >= 0 && (pf & bit) !== 0;
  if (t.dataset.corner) {
    const a = {};
    for (const [k, bit] of CORNERS) a[k] = has(bit);
    a[t.dataset.corner] = !a[t.dataset.corner];
    return void send("tyres", a);
  }
  switch (t.dataset.cmd) {
    case "fuel_set":
      return void send("fuel_set", { liters });
    case "fuel_end": {
      const c = drv?.data?.crew;
      const need = Math.min(1000, Math.max(0, n0(c?.toFinish ?? drv?.data?.refuel)));
      return void (need > 0 ? send("fuel_set", { liters: Math.ceil(need) }) : send("fuel_clear"));
    }
    case "fuel_clear":
    case "tyres_all":
    case "tyres_clear":
      return void send(t.dataset.cmd);
    case "fast_repair":
      return void send("fast_repair", { on: !has(PIT.fr) });
    case "tearoff":
      return void send("tearoff", { on: !has(PIT.tearoff) });
    case "clear_all":
      if (confirm(T("cw_clear_ask"))) void send("clear_all");
      return;
  }
});
app.addEventListener("input", (e) => {
  if (e.target.id !== "cw-liters") return;
  const v = Math.round(Number(e.target.value));
  if (v >= 1 && v <= 1000) {
    liters = v;
    litersTouched = true;
    const set = $("#cw-set");
    if (set) set.textContent = T("cw_set_l", liters);
  }
});
app.addEventListener("submit", (e) => {
  if (e.target.id !== "cw-msg") return;
  e.preventDefault();
  const inp = $("#cw-text");
  const text = (inp?.value || "").trim();
  if (!text) return;
  inp.value = "";
  void send("message", { text });
});

function tick() {
  if (document.hidden || !user) return;
  if (sel) void loadDriver();
  else void loadDrivers().then(() => !sel && draw());
}

await boot("/crew", "crew");
user = await currentUser();
if (user) {
  await loadDrivers();
  // Bağlantıdaki sürücü artık listede değilse listeye dön; tek sürücü varsa doğrudan aç
  if (sel && !(drivers ?? []).some((d) => d.owner_id === sel)) sel = "";
  if (!sel && drivers?.length === 1) sel = drivers[0].owner_id;
}
draw();
if (user && sel) void loadDriver();
setInterval(tick, 3000);
document.addEventListener("visibilitychange", () => !document.hidden && tick());
document.addEventListener("langchange", draw);
sb.auth.onAuthStateChange((ev, s) => {
  const id = s?.user?.id ?? null;
  if ((user?.id ?? null) === id) return;
  user = s?.user ?? null;
  sel = "";
  drv = null;
  if (user) void loadDrivers().then(draw);
  else draw();
});
