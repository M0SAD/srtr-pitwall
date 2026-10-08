// Yarışçılar sayfası (yarisci.html): SRTR Pitwall ile tur kaydetmiş üyeler (sim başına), üye telemetri profili
// (kişisel en iyiler, son oturumlar), oturum ayrıntısı ve pist + araç sıralaması.
// Adresler: yarisci.html?sim=acc&q=ad · ?u=<üye id> · ?u=me (kendi telemetrim) · ?s=<oturum id>
//           · ?b=<sim>|<pist id>|<düzen>|<araç id>
// Veriler: c29 RPC'leri (telemetry_drivers, telemetry_overview, telemetry_session, telemetry_leaderboard).
import { $, $$, T, addDict, boot, currentUser, esc, fmtDate, locale, sb, toast } from "./core.js";
import { avatarHtml, loadAvatars, profileDetails, profileHero, publicProfile } from "./profile.js";

addDict({
  dr_title: ["Yarışçılar", "Drivers"],
  dr_login_need: ["Yarışçıları ve telemetriyi görmek için giriş yapmalısın.", "Sign in to see drivers and telemetry."],
  dr_lead: [
    "SRTR Pitwall ile en az bir tur kaydetmiş yarışçılar. Program, simde sürdüğün her turu (süre, geçerlilik, olaylar, sektörler, hız/gaz/fren izi) kaydeder ve hesabına yükler.",
    "Drivers who have recorded at least one lap with SRTR Pitwall. The app records every lap you drive in a sim (time, validity, incidents, sectors, speed/throttle/brake trace) and uploads it to your account.",
  ],
  dr_sim_drivers: ["{0} yarışçıları", "{0} drivers"],
  dr_search: ["Sim adı ya da kullanıcı adı ara", "Search sim name or username"],
  dr_sim_name: ["Sim adı", "Sim name"],
  dr_user: ["Kullanıcı", "User"],
  dr_laps: ["Tur", "Laps"],
  dr_tracks: ["Pist", "Tracks"],
  dr_cars: ["Araç", "Cars"],
  dr_last: ["Son etkinlik", "Last active"],
  dr_hidden: ["Gizli", "Hidden"],
  dr_none: ["Yarışçı bulunamadı.", "No drivers found."],
  dr_view: ["Profil", "Profile"],
  dr_add_friend: ["Arkadaş ekle", "Add friend"],
  dr_accept: ["İsteği kabul et", "Accept request"],
  dr_friend: ["Arkadaş", "Friend"],
  dr_sent: ["İstek gönderildi", "Request sent"],
  dr_login_friend: ["Arkadaş eklemek için giriş yap", "Sign in to add friends"],
  dr_back: ["← Yarışçılar", "← Drivers"],
  dr_my_tele: ["Telemetrim", "My telemetry"],
  dr_private: [
    "Bu yarışçı telemetri verilerini paylaşmıyor. Aynı takımdaysanız giriş yapınca görebilirsin.",
    "This driver doesn't share their telemetry. If you're on the same team, sign in to see it.",
  ],
  dr_no_laps: ["Henüz kayıtlı tur yok.", "No recorded laps yet."],
  dr_no_laps_me: [
    "Henüz kayıtlı tur yok. Programla bir simde birkaç tur at; turların kendiliğinden buraya gelir.",
    "No recorded laps yet. Drive a few laps in a sim with the app running; they'll show up here automatically.",
  ],
  dr_sessions: ["Oturum", "Sessions"],
  dr_valid: ["{0} geçerli", "{0} valid"],
  dr_distance: ["Mesafe (km)", "Distance (km)"],
  dr_drive_time: ["Sürüş süresi", "Driving time"],
  dr_incidents: ["Olay", "Incidents"],
  dr_bests: ["Kişisel en iyiler", "Personal bests"],
  dr_recent: ["Son oturumlar", "Recent sessions"],
  dr_track: ["Pist", "Track"],
  dr_car: ["Araç", "Car"],
  dr_best: ["En iyi tur", "Best lap"],
  dr_date: ["Tarih", "Date"],
  dr_session: ["Oturum", "Session"],
  dr_board: ["Sıralama", "Leaderboard"],
  dr_board_all: ["Tüm araçlar", "All cars"],
  dr_board_none: ["Bu pistte görünür tur yok.", "No visible laps on this track."],
  dr_driver: ["Yarışçı", "Driver"],
  dr_lap: ["Tur", "Lap"],
  dr_time: ["Süre", "Time"],
  dr_status: ["Durum", "Status"],
  dr_fuel: ["Yakıt", "Fuel"],
  dr_pos: ["Sıra", "Pos"],
  dr_valid_lap: ["Geçerli", "Valid"],
  dr_invalid_lap: ["Geçersiz", "Invalid"],
  dr_pit: ["Pit", "Pit"],
  dr_session_note: [
    "Yeşil: oturumun en iyi turu, mor: en iyi sektör. Tur izlerini karşılaştırmak için programdaki Telemetri bölümünü kullan.",
    "Green: best lap of the session, purple: best sector. Use the Telemetry section in the app to compare lap traces.",
  ],
  dr_public: ["Telemetri verilerimi başkaları görebilsin", "Let others see my telemetry"],
  dr_public_lead: [
    "Açıkken turların, kişisel en iyilerin ve tur izlerin diğer üyelere açık olur ve sıralamalarda görünürsün. Kapalıyken sadece sen ve takım arkadaşların görebilir.",
    "When on, your laps, personal bests and lap traces are visible to other members and you appear on leaderboards. When off, only you and your teammates can see them.",
  ],
  dr_login_me: ["Telemetrini görmek için giriş yap.", "Sign in to see your telemetry."],
  dr_air_track: ["Hava / pist", "Air / track"],
  st_practice: ["Antrenman", "Practice"],
  st_qualify: ["Sıralama", "Qualifying"],
  st_race: ["Yarış", "Race"],
  st_warmup: ["Isınma", "Warmup"],
  st_hotlap: ["Hızlı tur", "Hotlap"],
  st_other: ["Oturum", "Session"],
});

const SIMS = [
  { id: "iracing", label: "iRacing", ids: ["iracing"] },
  { id: "acc", label: "ACC", ids: ["acc"] },
  { id: "ac", label: "Assetto Corsa", ids: ["ac"] },
  { id: "lmu", label: "LMU / rF2", ids: ["lmu", "rf2"] },
  { id: "ams2", label: "AMS2", ids: ["ams2"] },
];
const SIM_LABEL = { iracing: "iRacing", acc: "ACC", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "Automobilista 2" };

const app = () => $("#app");

/** 83.456 -> "1:23.456" */
function lapTime(t) {
  if (!(t > 0)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
const trackLabel = (x) => (x.track_config ? `${x.track_name} – ${x.track_config}` : x.track_name || x.track_id);
const stLabel = (s) => T("st_" + (["practice", "qualify", "race", "warmup", "hotlap"].includes(s) ? s : "other"));
const hours = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function params() {
  return new URLSearchParams(location.search);
}
function nav(q) {
  const u = new URL(location.href);
  u.search = new URLSearchParams(q).toString();
  history.pushState(null, "", u);
  route();
}

function friendBtn(id, status, me) {
  if (!me) return `<a class="btn btn-sm" href="hesap.html">${esc(T("dr_add_friend"))}</a>`;
  if (status === "accepted") return `<span class="badge ok">${esc(T("dr_friend"))}</span>`;
  if (status === "pending_out") return `<span class="badge">${esc(T("dr_sent"))}</span>`;
  return `<button class="btn btn-sm" data-friend="${esc(id)}">${esc(T(status === "pending_in" ? "dr_accept" : "dr_add_friend"))}</button>`;
}

function bindFriends(root) {
  $$("[data-friend]", root).forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try {
        const r = await rpc("friend_request", { p_user: b.dataset.friend });
        b.outerHTML = `<span class="badge${r === "accepted" ? " ok" : ""}">${esc(T(r === "accepted" ? "dr_friend" : "dr_sent"))}</span>`;
      } catch (err) {
        b.disabled = false;
        toast(err.message || T("error"), true);
      }
    }),
  );
}

function bindLinks(root) {
  $$("[data-go]", root).forEach((el) =>
    el.addEventListener("click", (e) => {
      if (e.target.closest("button:not([data-go]), a:not([data-go])")) return;
      e.preventDefault();
      nav(JSON.parse(el.dataset.go));
    }),
  );
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
let searchTimer = 0;
async function listView() {
  const p = params();
  const sim = SIMS.find((s) => s.id === p.get("sim")) || SIMS[0];
  const q = p.get("q") || "";
  const me = await currentUser();
  app().innerHTML = `<div class="page">
    <div class="page-head">
      <div><h1>${esc(T("dr_title"))}</h1><p class="muted" style="margin:4px 0 0;max-width:720px">${esc(T("dr_lead"))}</p></div>
      ${me ? `<a class="btn" href="?u=me">${esc(T("dr_my_tele"))}</a>` : ""}
    </div>
    <div class="row between" style="flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="seg">${SIMS.map((s) => `<button data-sim="${s.id}" class="${s.id === sim.id ? "on" : ""}">${esc(s.label)}</button>`).join("")}</div>
      <input id="dr-q" type="search" style="max-width:320px" placeholder="${esc(T("dr_search"))}" value="${esc(q)}">
    </div>
    <div class="card"><h3>${esc(T("dr_sim_drivers", sim.label))}</h3><div id="dr-list"><p class="muted small">${esc(T("loading"))}</p></div></div>
  </div>`;
  $$("[data-sim]").forEach((b) => b.addEventListener("click", () => nav({ sim: b.dataset.sim, ...(q ? { q } : {}) })));
  $("#dr-q").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const v = e.target.value.trim();
      history.replaceState(null, "", `?${new URLSearchParams({ sim: sim.id, ...(v ? { q: v } : {}) })}`);
      fillList(sim, v, me);
    }, 300);
  });
  fillList(sim, q, me);
}

async function fillList(sim, q, me) {
  const el = $("#dr-list");
  try {
    const parts = await Promise.all(sim.ids.map((s) => rpc("telemetry_drivers", { p_sim: s, p_q: q, p_limit: 100, p_offset: 0 })));
    const rows = parts.flat().sort((a, b) => String(b.last_active || "").localeCompare(String(a.last_active || "")));
    if (!rows.length) {
      el.innerHTML = `<p class="muted">${esc(T("dr_none"))}</p>`;
      return;
    }
    const av = await loadAvatars(rows.map((r) => r.user_id));
    el.innerHTML = `<div style="overflow-x:auto"><table class="list">
      <thead><tr><th>${esc(T("dr_sim_name"))}</th><th>${esc(T("dr_user"))}</th><th class="num">${esc(T("dr_laps"))}</th>
      <th class="num">${esc(T("dr_tracks"))}</th><th>${esc(T("dr_last"))}</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr data-go='${esc(JSON.stringify({ u: r.user_id }))}' style="cursor:pointer">
          <td><b>${esc(r.sim_name)}</b>${r.sim !== sim.id ? ` <span class="muted small">· ${esc(SIM_LABEL[r.sim] || r.sim)}</span>` : ""}</td>
          <td><span style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(r.user_id, r.display_name, av[r.user_id], 24)}${esc(r.display_name)}</span></td>
          <td class="num">${r.visible ? r.laps ?? 0 : "—"}</td>
          <td class="num">${r.visible ? r.tracks ?? 0 : "—"}</td>
          <td>${r.visible ? fmtDate(r.last_active) : `<span class="muted">${esc(T("dr_hidden"))}</span>`}</td>
          <td class="num" style="white-space:nowrap">${r.is_me ? "" : friendBtn(r.user_id, r.friend, me)}</td>
        </tr>`,
        )
        .join("")}</tbody></table></div>`;
    bindLinks(el);
    bindFriends(el);
  } catch (e) {
    el.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Üye profili
// ---------------------------------------------------------------------------
async function profileView(uid) {
  const me = await currentUser();
  if (uid === "me" && !me) {
    app().innerHTML = `<div class="page"><div class="msg">${esc(T("dr_login_me"))} <a href="hesap.html">${esc(T("nav_login"))}</a></div></div>`;
    return;
  }
  app().innerHTML = `<p class="muted page">${esc(T("loading"))}</p>`;
  const d = await rpc("telemetry_overview", { p_user: uid === "me" ? null : uid });
  const p = d.profile;
  // Herkese açık profil (c31): fotoğraf, tanıtım, bağlantılar, takımlar; sunucu güncellenmemişse eski başlık
  const pub = await publicProfile(p.id).catch(() => null);
  const isMe = !!p.is_me;
  const ids = (d.identities || [])
    .map((x) => `<span class="pill"><b>${esc(SIM_LABEL[x.sim] || x.sim)}</b> ${esc(x.sim_name)}</span>`)
    .join(" ");
  const t = d.totals;
  let body = "";
  if (!d.visible) {
    body = `<div class="msg">${esc(T("dr_private"))}</div>`;
  } else if (!t || !t.laps) {
    body = `<p class="muted">${esc(T(isMe ? "dr_no_laps_me" : "dr_no_laps"))}</p>`;
  } else {
    body = `
    <div class="stats" style="margin-bottom:18px">
      <div class="stat"><small>${esc(T("dr_laps"))}</small><b>${t.laps}</b><i>${esc(T("dr_valid", t.valid_laps))}</i></div>
      <div class="stat"><small>${esc(T("dr_sessions"))}</small><b>${t.sessions}</b></div>
      <div class="stat"><small>${esc(T("dr_distance"))}</small><b>${Math.round(t.distance_km).toLocaleString(locale())}</b></div>
      <div class="stat"><small>${esc(T("dr_drive_time"))}</small><b>${hours(t.drive_time)}</b></div>
      <div class="stat"><small>${esc(T("dr_tracks"))}</small><b>${t.tracks}</b></div>
      <div class="stat"><small>${esc(T("dr_cars"))}</small><b>${t.cars}</b></div>
      <div class="stat"><small>${esc(T("dr_incidents"))}</small><b>${t.incidents}x</b></div>
    </div>
    <div class="card" style="margin-bottom:18px"><h3>${esc(T("dr_bests"))}</h3><div style="overflow-x:auto"><table class="list">
      <thead><tr><th>Sim</th><th>${esc(T("dr_track"))}</th><th>${esc(T("dr_car"))}</th><th class="num">${esc(T("dr_best"))}</th>
      <th class="num">${esc(T("dr_laps"))}</th><th>${esc(T("dr_date"))}</th><th></th></tr></thead>
      <tbody>${(d.bests || [])
        .map(
          (b) => `<tr>
          <td>${esc(SIM_LABEL[b.sim] || b.sim)}</td><td>${esc(trackLabel(b))}</td>
          <td>${esc(b.car_name)}${b.car_class ? ` <span class="muted small">· ${esc(b.car_class)}</span>` : ""}</td>
          <td class="num" style="color:#3ecf8e;font-weight:700">${lapTime(b.lap_time)}</td><td class="num">${b.laps}</td>
          <td>${fmtDate(b.driven_at)}</td>
          <td class="num"><a class="btn btn-sm btn-ghost" href="#" data-go='${esc(
            JSON.stringify({ b: [b.sim, b.track_id, b.track_config, b.car_id].join("|") }),
          )}'>${esc(T("dr_board"))}</a></td></tr>`,
        )
        .join("")}</tbody></table></div></div>
    <div class="card"><h3>${esc(T("dr_recent"))}</h3><div style="overflow-x:auto"><table class="list">
      <thead><tr><th>${esc(T("dr_date"))}</th><th>Sim</th><th>${esc(T("dr_track"))}</th><th>${esc(T("dr_car"))}</th>
      <th>${esc(T("dr_session"))}</th><th class="num">${esc(T("dr_laps"))}</th><th class="num">${esc(T("dr_best"))}</th>
      <th class="num">${esc(T("dr_incidents"))}</th></tr></thead>
      <tbody>${(d.recent || [])
        .map(
          (s) => `<tr data-go='${esc(JSON.stringify({ s: s.id }))}' style="cursor:pointer">
          <td style="white-space:nowrap">${fmtDate(s.started_at, true)}</td><td>${esc(SIM_LABEL[s.sim] || s.sim)}</td>
          <td>${esc(trackLabel(s))}</td><td>${esc(s.car_name)}</td><td>${esc(stLabel(s.session_type))}</td>
          <td class="num">${s.laps}${s.invalid_laps ? ` <span class="muted small">(${s.invalid_laps}✕)</span>` : ""}</td>
          <td class="num">${lapTime(s.best_lap)}</td><td class="num">${s.incidents ? s.incidents + "x" : "—"}</td></tr>`,
        )
        .join("")}</tbody></table></div></div>`;
  }
  app().innerHTML = `<div class="page">
    <p><a href="yarisci.html" data-go='{}'>${esc(T("dr_back"))}</a></p>
    ${
      pub
        ? profileHero(pub, isMe ? `<a class="btn btn-sm" href="hesap.html#profil">${esc(T("pf_edit"))}</a>` : friendBtn(p.id, p.friend, me)) +
          profileDetails(pub) +
          (isMe ? `<h2 style="margin:0 0 12px">${esc(T("dr_my_tele"))}</h2>` : "")
        : `<div class="page-head">
      <div><h1>${esc(isMe ? T("dr_my_tele") : p.display_name || "—")}</h1><div style="margin-top:6px">${ids}</div></div>
      <div class="row">${isMe ? "" : friendBtn(p.id, p.friend, me)}</div>
    </div>`
    }
    ${
      ""
    }
    ${body}
  </div>`;
  bindLinks(app());
  bindFriends(app());
  $("#dr-public")?.addEventListener("change", async (e) => {
    try {
      await rpc("telemetry_set_public", { p_on: e.target.checked });
      toast(T("saved"));
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message || T("error"), true);
    }
  });
}

// ---------------------------------------------------------------------------
// Oturum ayrıntısı
// ---------------------------------------------------------------------------
async function sessionView(id) {
  app().innerHTML = `<p class="muted page">${esc(T("loading"))}</p>`;
  const d = await rpc("telemetry_session", { p_session: id });
  const s = d.session;
  const ok = (d.laps || []).filter((l) => l.valid && !l.pit);
  const best = ok.reduce((a, l) => (!a || l.lap_time < a.lap_time ? l : a), null);
  const bsec = [0, 1, 2].map((i) => Math.min(...ok.map((l) => (l.sectors?.[i] > 0 ? l.sectors[i] : Infinity))));
  const sec = (l, i) => {
    const v = l.sectors?.[i];
    if (!(v > 0)) return "—";
    const purple = l.valid && !l.pit && v === bsec[i];
    return `<span style="${purple ? "color:#c58bff;font-weight:700" : ""}">${v.toFixed(3)}</span>`;
  };
  app().innerHTML = `<div class="page">
    <p><a href="#" data-go='${esc(JSON.stringify({ u: d.owner.id }))}'>← ${esc(d.owner.display_name || "—")}</a></p>
    <div class="page-head"><div><h1>${esc(trackLabel(s))}</h1>
      <p class="muted" style="margin:4px 0 0">${esc(SIM_LABEL[s.sim] || s.sim)} · ${esc(s.car_name)}${s.car_class ? ` (${esc(s.car_class)})` : ""} · ${esc(
        stLabel(s.session_type),
      )} · ${fmtDate(s.started_at, true)}</p></div></div>
    <div class="stats" style="margin-bottom:18px">
      <div class="stat"><small>${esc(T("dr_best"))}</small><b>${lapTime(s.best_lap)}</b></div>
      <div class="stat"><small>${esc(T("dr_laps"))}</small><b>${s.laps}</b><i>${esc(T("dr_valid", s.valid_laps))}</i></div>
      <div class="stat"><small>${esc(T("dr_incidents"))}</small><b>${s.incidents}x</b></div>
      ${s.air_temp != null ? `<div class="stat"><small>${esc(T("dr_air_track"))}</small><b>${Math.round(s.air_temp)}° / ${Math.round(s.track_temp ?? 0)}°</b></div>` : ""}
    </div>
    <div class="card"><div style="overflow-x:auto"><table class="list">
      <thead><tr><th class="num">${esc(T("dr_lap"))}</th><th class="num">${esc(T("dr_time"))}</th><th class="num">S1</th><th class="num">S2</th>
      <th class="num">S3</th><th>${esc(T("dr_status"))}</th><th class="num">${esc(T("dr_incidents"))}</th><th class="num">${esc(T("dr_fuel"))}</th>
      <th class="num">${esc(T("dr_pos"))}</th></tr></thead>
      <tbody>${(d.laps || [])
        .map(
          (l) => `<tr style="${l.valid ? "" : "color:var(--muted)"}">
          <td class="num">${l.lap}</td>
          <td class="num" style="${best && l.id === best.id ? "color:#3ecf8e;font-weight:700" : ""}">${lapTime(l.lap_time)}</td>
          <td class="num">${sec(l, 0)}</td><td class="num">${sec(l, 1)}</td><td class="num">${sec(l, 2)}</td>
          <td><span class="badge ${l.valid ? "ok" : "bad"}">${esc(T(l.valid ? "dr_valid_lap" : "dr_invalid_lap"))}</span>${
            l.pit ? ` <span class="badge">${esc(T("dr_pit"))}</span>` : ""
          }</td>
          <td class="num">${l.incidents ? l.incidents + "x" : "—"}</td>
          <td class="num">${l.fuel_used ? l.fuel_used.toFixed(2) + " L" : "—"}</td>
          <td class="num">${l.position ? "P" + l.position : "—"}</td></tr>`,
        )
        .join("")}</tbody></table></div>
      <p class="muted small">${esc(T("dr_session_note"))}</p></div>
  </div>`;
  bindLinks(app());
}

// ---------------------------------------------------------------------------
// Sıralama
// ---------------------------------------------------------------------------
async function boardView(key) {
  const [sim, track, config = "", car = ""] = key.split("|");
  const all = params().get("all") === "1";
  app().innerHTML = `<p class="muted page">${esc(T("loading"))}</p>`;
  const rows = await rpc("telemetry_leaderboard", { p_sim: sim, p_track_id: track, p_track_config: config, p_car_id: all ? null : car, p_limit: 100 });
  const title = rows[0] ? `${rows[0].car_name && !all ? rows[0].car_name : ""}` : "";
  app().innerHTML = `<div class="page">
    <p><a href="javascript:history.back()">←</a></p>
    <div class="page-head"><div><h1>${esc(T("dr_board"))}</h1><p class="muted" style="margin:4px 0 0">${esc(SIM_LABEL[sim] || sim)} · ${esc(
      track,
    )}${config ? " – " + esc(config) : ""}${title ? " · " + esc(title) : ""}</p></div>
      <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" id="dr-all" style="width:auto" ${all ? "checked" : ""}> ${esc(
        T("dr_board_all"),
      )}</label></div>
    <div class="card">${
      rows.length
        ? `<div style="overflow-x:auto"><table class="list"><thead><tr><th class="num">#</th><th>${esc(T("dr_driver"))}</th><th>${esc(
            T("dr_car"),
          )}</th><th class="num">${esc(T("dr_best"))}</th><th class="num">S1</th><th class="num">S2</th><th class="num">S3</th><th>${esc(T("dr_date"))}</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr data-go='${esc(JSON.stringify({ u: r.user_id }))}' style="cursor:pointer${r.is_me ? ";background:rgba(255,138,42,.07)" : ""}">
            <td class="num">${r.rank}</td><td><b>${esc(r.sim_name || r.display_name)}</b>${
              r.sim_name && r.display_name && r.sim_name !== r.display_name ? ` <span class="muted small">· ${esc(r.display_name)}</span>` : ""
            }</td><td>${esc(r.car_name)}</td>
            <td class="num" style="${r.rank === 1 ? "color:#3ecf8e;font-weight:700" : ""}">${lapTime(r.lap_time)}</td>
            ${[0, 1, 2].map((i) => `<td class="num">${r.sectors?.[i] > 0 ? r.sectors[i].toFixed(3) : "—"}</td>`).join("")}
            <td>${fmtDate(r.driven_at)}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
        : `<p class="muted">${esc(T("dr_board_none"))}</p>`
    }</div></div>`;
  bindLinks(app());
  $("#dr-all").addEventListener("change", (e) => nav({ b: key, ...(e.target.checked ? { all: "1" } : {}) }));
}

async function route() {
  const p = params();
  // Telemetri yalnızca giriş yapmış üyelere görünür (c86)
  if (!(await currentUser())) {
    app().innerHTML = `<div class="page"><h1>${esc(T("dr_title"))}</h1><div class="msg">${esc(T("dr_login_need"))} <a href="hesap.html">${esc(T("nav_login"))}</a></div></div>`;
    return;
  }
  try {
    if (p.get("u")) await profileView(p.get("u"));
    else if (p.get("s")) await sessionView(p.get("s"));
    else if (p.get("b")) await boardView(p.get("b"));
    else await listView();
  } catch (e) {
    app().innerHTML = `<div class="page"><p><a href="yarisci.html">${esc(T("dr_back"))}</a></p><div class="msg bad">${esc(e.message || e)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

await boot("/yarisci", "drivers");
addEventListener("popstate", route);
document.addEventListener("langchange", route);
route();
