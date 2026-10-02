// Ekip (uzaktan pit ekibi) — telefon için panel. Sunucu: supabase/c53_guncelleme.sql.
// Giriş yapmış ekip üyesi: ekibinde olduğu sürücüyü seçer -> canlı yarış verisi ve yetki verildiyse pit kontrolleri.
// Panelin kendisi crewpanel.js'tedir (Arkadaşlar paneli de aynısını kullanır); burada sadece sayfa: giriş, sürücü listesi.
import { $, T, boot, currentUser, esc, sb } from "./core.js";
import { mountCrewPanel, statusText } from "./crewpanel.js";

const app = $("#app");
let user = null;
let drivers = null; // null: okunamadı
let sel = new URLSearchParams(location.search).get("d") || "";
let panel = null;

// ---- Sunucu ----
async function loadDrivers() {
  const { data, error } = await sb.rpc("crew_drivers");
  drivers = error ? null : (data ?? []);
}

// ---- Görünüm ----
function pick(id) {
  sel = id;
  history.replaceState(null, "", id ? `?d=${encodeURIComponent(id)}` : location.pathname);
  draw();
  if (!id) void loadDrivers().then(() => !sel && draw());
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

function draw() {
  panel?.destroy();
  panel = null;
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
  panel = mountCrewPanel($("#cw-dash"), sel, { onGone: () => pick("") });
}

app.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || t.disabled) return;
  if (t.dataset.pick) return pick(t.dataset.pick);
  if (t.id === "cw-back") return pick("");
});

function tick() {
  if (document.hidden || !user || sel) return;
  void loadDrivers().then(() => !sel && draw());
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
setInterval(tick, 3000);
document.addEventListener("visibilitychange", () => !document.hidden && tick());
// Dil değişince: açık panel kendi durumunu koruyarak yeniden çizilir
document.addEventListener("langchange", () => (panel ? panel.redraw() : draw()));
sb.auth.onAuthStateChange((ev, s) => {
  const id = s?.user?.id ?? null;
  if ((user?.id ?? null) === id) return;
  user = s?.user ?? null;
  sel = "";
  if (user) void loadDrivers().then(draw);
  else draw();
});
