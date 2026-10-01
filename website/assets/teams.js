// Takımlar (herkese açık, salt okunur): takım listesi ve arama, takım profili (logo, açıklama, üyeler ve rolleri).
// Takım kurmak, katılmak, duyurular ve takım sohbeti programda (Sürücüler → Takımlar).
// Sunucu: teams_search / team_profile (supabase/c30_guncelleme.sql), giriş yapmadan da okunur.
// c36: takımın oyunu (rozet + liste süzgeci) ve takım sayfasında "Son aktiviteler" (team_activity).
import { $, T, addDict, boot, esc, fmtDate, SUPABASE_URL, sb } from "./core.js";
import { avatarHtml, avatarUrl, loadAvatars } from "./profile.js";

addDict({
  tm_title: ["Takımlar", "Teams"],
  tm_lead: [
    "SRTR Pitwall'daki sim racing takımları. Takım kurmak, katılmak, duyurular ve takım sohbeti için programda <b>Sürücüler → Takımlar</b> bölümünü kullan.",
    "Sim racing teams on SRTR Pitwall. To create or join a team, read announcements and use the team chat, open <b>Drivers → Teams</b> in the app.",
  ],
  tm_search: ["Takım adı ya da etiketi ara", "Search team name or tag"],
  tm_none: ["Henüz takım yok.", "No teams yet."],
  tm_no_match: ["Eşleşen takım yok.", "No matching teams."],
  tm_members_n: ["{0} üye", "{0} members"],
  tm_members: ["Üyeler", "Members"],
  tm_back: ["← Tüm takımlar", "← All teams"],
  tm_not_found: ["Takım bulunamadı (silinmiş olabilir).", "Team not found (it may have been deleted)."],
  tm_founded: ["Kuruluş: {0}", "Founded: {0}"],
  tm_owner_by: ["Kuran: {0}", "Founder: {0}"],
  tm_role_owner: ["Sahip", "Owner"],
  tm_role_admin: ["Yönetici", "Admin"],
  tm_role_member: ["Üye", "Member"],
  tm_join_open: ["Herkes katılabilir", "Open to everyone"],
  tm_join_request: ["Katılma isteğiyle", "Join by request"],
  tm_join_invite: ["Sadece davetle", "Invite only"],
  tm_join_app: [
    "Bu takıma katılmak için SRTR Pitwall programında <b>Sürücüler → Takımlar</b> bölümünden takımı aç.",
    "To join this team, open it in the SRTR Pitwall app under <b>Drivers → Teams</b>.",
  ],
  tm_your_role: ["Bu takımdaki rolün: {0}", "Your role in this team: {0}"],
  tm_since: ["{0} tarihinden beri", "since {0}"],
  tm_all_sims: ["Tüm oyunlar", "All games"],
  tm_sim_multi: ["Birden fazla oyun", "Multiple games"],
  tm_sim_multi_short: ["Çoklu", "Multi"],
  tm_activity: ["Son aktiviteler", "Recent activity"],
  tm_act_none: ["Üyelerin henüz görünen bir telemetri oturumu yok.", "No visible telemetry sessions from members yet."],
  tm_act_line: ["{0}, {1} pistinde {2} ile {3} tur attı", "{0} drove {3} laps at {1} in the {2}"],
  tm_act_best: ["en iyi {0}", "best {0}"],
  tm_act_pb: ["Bu pist ve araçta kişisel en iyisi", "Personal best for this track and car"],
  tm_act_more: ["Tümünü göster ({0})", "Show all ({0})"],
  tm_ago_now: ["az önce", "just now"],
  tm_ago_min: ["{0} dk önce", "{0} min ago"],
  tm_ago_hour: ["{0} saat önce", "{0} h ago"],
  tm_ago_day: ["{0} gün önce", "{0} d ago"],
  tm_st_practice: ["Antrenman", "Practice"],
  tm_st_qualify: ["Sıralama", "Qualifying"],
  tm_st_race: ["Yarış", "Race"],
  tm_st_warmup: ["Isınma", "Warmup"],
  tm_st_hotlap: ["Hızlı tur", "Hot lap"],
  tm_st_other: ["Oturum", "Session"],
});

const TEAM_SIMS = [
  { id: "iracing", label: "iRacing", short: "iRacing" },
  { id: "acc", label: "Assetto Corsa Competizione", short: "ACC" },
  { id: "ac", label: "Assetto Corsa", short: "AC" },
  { id: "lmu", label: "Le Mans Ultimate", short: "LMU" },
  { id: "rf2", label: "rFactor 2", short: "rF2" },
  { id: "ams2", label: "Automobilista 2", short: "AMS2" },
  { id: "multi" },
];
const SIM_LABEL = Object.fromEntries(TEAM_SIMS.filter((x) => x.label).map((x) => [x.id, x.label]));
const simName = (id) => (id === "multi" ? T("tm_sim_multi") : SIM_LABEL[id] || id);
/** Takımın oyunu rozeti (c36 öncesi sunucuda sim yok → iRacing) */
function teamSimBadge(sim) {
  const m = TEAM_SIMS.find((x) => x.id === sim) || TEAM_SIMS[0];
  const txt = m.id === "multi" ? T("tm_sim_multi_short") : m.short;
  return `<span class="sim-badge tm-sim s-${m.id}" ${m.id === "multi" ? "" : 'translate="no"'} title="${esc(simName(m.id))}">${esc(txt)}</span>`;
}
/** 83.456 -> "1:23.456" */
function lapTime(t) {
  if (!(t > 0)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return T("tm_ago_now");
  if (s < 3600) return T("tm_ago_min", Math.floor(s / 60));
  if (s < 86400) return T("tm_ago_hour", Math.floor(s / 3600));
  if (s < 86400 * 7) return T("tm_ago_day", Math.floor(s / 86400));
  return fmtDate(iso);
}
const trackLabel = (x) => (x.track_config ? `${x.track_name} – ${x.track_config}` : x.track_name || "?");
const stLabel = (s) => T("tm_st_" + (["practice", "qualify", "race", "warmup", "hotlap"].includes(s) ? s : "other"));

const logoUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/teams/${path.split("/").map(encodeURIComponent).join("/")}` : "");
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#4ea1ff");

function logoHtml(t, size = 52) {
  const c = safeColor(t.color);
  const inner = t.logo_path ? `<img src="${esc(logoUrl(t.logo_path))}" alt="" loading="lazy" />` : `<span>${esc(t.tag)}</span>`;
  return `<span class="tm-logo" style="--sz:${size}px;--tc:${c}">${inner}</span>`;
}

const roleName = (r) => T("tm_role_" + r);
const joinName = (m) => T("tm_join_" + m);

/** Kimlikten sabit renk (programdaki avatar rengiyle aynı) */
function hashColor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `hsl(${h % 360} 58% 50%)`;
}

let query = "";
let simFilter = "";
let timer = null;

async function renderList() {
  const app = $("#app");
  app.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div><h1>${T("tm_title")}</h1><p class="muted" style="margin:4px 0 0">${T("tm_lead")}</p></div>
      </div>
      <div class="tm-filters">
        <input id="tm-q" type="search" placeholder="${esc(T("tm_search"))}" value="${esc(query)}" />
        <select id="tm-sim">
          <option value="">${esc(T("tm_all_sims"))}</option>
          ${TEAM_SIMS.map((x) => `<option value="${x.id}" ${x.id === simFilter ? "selected" : ""}>${esc(simName(x.id))}</option>`).join("")}
        </select>
      </div>
      <div id="tm-list" class="tm-grid"><p class="muted small">${T("loading")}</p></div>
    </section>`;
  const q = $("#tm-q");
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = q.value.trim();
      loadList();
    }, 300);
  });
  $("#tm-sim").addEventListener("change", (e) => {
    simFilter = e.currentTarget.value;
    loadList();
  });
  await loadList();
}

async function loadList() {
  const box = $("#tm-list");
  if (!box) return;
  const { data, error } = await sb.rpc("teams_search", { p_q: query, p_limit: 120, ...(simFilter ? { p_sim: simFilter } : {}) });
  if (error) {
    box.innerHTML = `<p class="msg bad">${esc(error.message)}</p>`;
    return;
  }
  const list = data || [];
  if (!list.length) {
    box.innerHTML = `<p class="muted">${T(query || simFilter ? "tm_no_match" : "tm_none")}</p>`;
    return;
  }
  box.innerHTML = list
    .map(
      (t) => `
    <a class="tm-card" href="takimlar.html?id=${encodeURIComponent(t.id)}" style="--tc:${safeColor(t.color)}">
      ${logoHtml(t, 54)}
      <div class="tm-card-main">
        <div class="tm-card-top"><b translate="no">${esc(t.name)}</b><span class="tm-tag" translate="no">${esc(t.tag)}</span>${teamSimBadge(t.sim)}</div>
        ${t.description ? `<p class="tm-desc" translate="no">${esc(t.description)}</p>` : ""}
        <small class="muted">${esc(T("tm_members_n", t.member_count))} · ${esc(joinName(t.join_mode))}</small>
      </div>
      ${t.my_role ? `<span class="tm-role r-${esc(t.my_role)}">${esc(roleName(t.my_role))}</span>` : ""}
    </a>`,
    )
    .join("");
}

async function renderTeam(id) {
  const app = $("#app");
  const { data: t, error } = await sb.rpc("team_profile", { p_team: id });
  if (error || !t) {
    app.innerHTML = `<section class="page"><p><a href="takimlar.html">${T("tm_back")}</a></p><p class="msg bad">${esc(error?.message || T("tm_not_found"))}</p></section>`;
    return;
  }
  document.title = `${t.name} [${t.tag}] — SRTR Pitwall`;
  // Üyelerin profil fotoğrafları (c31); yoksa baş harf
  const av = await loadAvatars((t.members || []).map((m) => m.user_id));
  const members = (t.members || [])
    .map(
      (m) => `
      <a class="tm-mem" href="yarisci.html?u=${esc(m.user_id)}" style="color:inherit;text-decoration:none">
        <span class="tm-av" style="--fc:${hashColor(m.user_id)}">${
          av[m.user_id] ? `<img src="${esc(avatarUrl(av[m.user_id]))}" alt="" loading="lazy">` : esc([...(m.display_name || "?").trim()][0] || "?")
        }</span>
        <div class="tm-mem-main">
          <b translate="no">${esc(m.display_name)}</b>
          <small class="muted" ${m.iracing_name ? 'translate="no"' : ""}>${m.iracing_name ? `iRacing: ${esc(m.iracing_name)}` : esc(T("tm_since", fmtDate(m.joined_at)))}</small>
        </div>
        ${m.role !== "member" ? `<span class="tm-role r-${esc(m.role)}">${esc(roleName(m.role))}</span>` : ""}
      </a>`,
    )
    .join("");
  app.innerHTML = `
    <section class="page">
      <p><a href="takimlar.html">${T("tm_back")}</a></p>
      <div class="tm-hero card" style="--tc:${safeColor(t.color)}">
        ${logoHtml(t, 104)}
        <div class="tm-hero-main">
          <div class="tm-hero-title"><h1 translate="no">${esc(t.name)}</h1><span class="tm-tag big" translate="no">${esc(t.tag)}</span>${teamSimBadge(t.sim)}</div>
          ${t.description ? `<p class="tm-hero-desc" translate="no">${esc(t.description)}</p>` : ""}
          <p class="muted small">${esc(T("tm_members_n", (t.members || []).length))} · ${esc(joinName(t.join_mode))} · ${esc(T("tm_owner_by", t.owner_name))} · ${esc(T("tm_founded", fmtDate(t.created_at)))}</p>
          ${t.my_role ? `<p class="msg good">${esc(T("tm_your_role", roleName(t.my_role)))}</p>` : `<p class="msg">${T("tm_join_app")}</p>`}
        </div>
      </div>
      <div class="tm-cols">
        <div class="card tm-act" id="tm-act">
          <h2>${esc(T("tm_activity"))}</h2>
          <p class="muted small">${T("loading")}</p>
        </div>
        <div class="card tm-members">
          <h2>${T("tm_members")} <small class="muted">(${(t.members || []).length})</small></h2>
          ${members}
        </div>
      </div>
    </section>`;
  loadActivity(t);
}

/** Son aktiviteler: üyelerin son telemetri oturumları (sadece telemetrisi ziyaretçiye görünen üyeler) */
async function loadActivity(team) {
  const box = $("#tm-act");
  if (!box) return;
  const { data, error } = await sb.rpc("team_activity", { p_team: team.id, p_limit: 30 });
  if (!$("#tm-act")) return;
  const list = error ? [] : data || [];
  const multi = (team.sim || "iracing") === "multi";
  const row = (a) => `
    <a class="tm-act-row" href="yarisci.html?s=${encodeURIComponent(a.session_id)}">
      ${avatarHtml(a.user_id, a.display_name, a.avatar_path, 36)}
      <div class="tm-act-main">
        <div class="tm-act-line">${esc(T("tm_act_line", a.display_name, trackLabel(a), a.car_name || "?", a.laps))}</div>
        <small class="muted">${multi ? `<span translate="no">${esc(simName(a.sim))}</span> · ` : ""}${esc(stLabel(a.session_type))}${
          a.best_lap ? ` · ${esc(T("tm_act_best", lapTime(a.best_lap)))}` : ""
        } · ${esc(ago(a.last_lap_at))}</small>
      </div>
      ${a.is_pb ? `<span class="tm-pb" title="${esc(T("tm_act_pb"))}">PB</span>` : ""}
    </a>`;
  const head = `<h2>${esc(T("tm_activity"))}</h2>`;
  if (!list.length) {
    box.innerHTML = `${head}<p class="muted small">${esc(error ? error.message : T("tm_act_none"))}</p>`;
    return;
  }
  box.innerHTML = `${head}<div class="tm-act-list">${list.slice(0, 8).map(row).join("")}</div>${
    list.length > 8 ? `<button class="btn btn-sm" id="tm-act-more">${esc(T("tm_act_more", list.length))}</button>` : ""
  }`;
  $("#tm-act-more")?.addEventListener("click", (e) => {
    $(".tm-act-list", box).innerHTML = list.map(row).join("");
    e.currentTarget.remove();
  });
}

async function route() {
  const id = new URLSearchParams(location.search).get("id");
  if (id && /^[0-9a-f-]{36}$/i.test(id)) await renderTeam(id);
  else await renderList();
}

await boot("/takimlar", "teams");
await route();
document.addEventListener("langchange", route);
