// Yönetim paneli (sadece yöneticiler): site ve satış istatistikleri, ödemeler, abonelikler,
// üyeler (PRO süresi verme / uzatma / alma), süre geçmişi, cihaz uyarıları, planlar ve fiyatlar,
// mesaj raporları ve tüm özel mesajlar. Moderatörler ("reports.view" izni) sadece Destek bölümünü görür (silemez).
// Yetkiyi sunucu denetler: admin_* fonksiyonları yönetici olmayana hata döner.
import { $, $$, PLANS, appConfig, boot, daysLeft, esc, fmtDate, fmtMoney, myProfile, sb, toast } from "./core.js";
import { reklamlar } from "./ads-admin.js";
import { kuponlar } from "./coupons-admin.js";
import { proOzellikleri, setProFeatureQuery } from "./profeatures-admin.js";
import { kayitlar } from "./modlog-admin.js";
import { sesPaketleri } from "./voicepacks-admin.js";
import { denemePro } from "./trial-admin.js";
import { siteGorselleri } from "./siteimages-admin.js";
import { attachEmoji } from "./emoji.js";

const app = () => $("#app");
let section = location.hash.slice(1) || "ozet";
let range = 30;

const SECTIONS = [
  ["ozet", "Özet"],
  ["satislar", "Satışlar"],
  ["abonelikler", "Abonelikler"],
  ["uyeler", "Üyeler"],
  ["destek", "Destek"],
  ["gecmis", "Süre geçmişi"],
  ["cihazlar", "Cihazlar"],
  ["planlar", "Planlar ve fiyatlar"],
  ["kampanya", "Ücretsiz PRO"],
  ["deneme-pro", "Deneme PRO"],
  ["reklamlar", "Reklamlar"],
  ["kuponlar", "Kuponlar"],
  ["pro-ozellikleri", "PRO özellikleri"],
  ["ses-paketleri", "Ses paketleri"],
  ["site-gorselleri", "Ana sayfa görselleri"],
  ["mesajlar", "Mesaj raporları"],
  ["tum-mesajlar", "Tüm mesajlar"],
  ["gorunurluk", "Görünürlük"],
  ["kayitlar", "Moderasyon kayıtları"],
];

// Programdaki overlay'ler (src/overlays/*/manifest.ts); yeni overlay eklenince buraya da eklenmeli.
// Listede olmayan ama gizlenmiş ya da PRO'ya ayrılmış kimlikler de ayrıca gösterilir.
const OVERLAYS = [
  ["battlebox", "Battle Box"],
  ["corners", "Viraj Analizi"],
  ["dashboard", "Direksiyon Ekranı"],
  ["dataframe", "Data Frame"],
  ["delta", "Delta Bar"],
  ["digiflags", "DigiFlags"],
  ["flatmap", "Düz Harita"],
  ["fuel", "Yakıt Hesaplayıcı"],
  ["incidentlog", "Olay Günlüğü"],
  ["incidents", "Olay Sayacı"],
  ["inputs", "Pedallar & Girdi"],
  ["laptimes", "Tur Süreleri"],
  ["minimap", "Mini Harita"],
  ["overtake", "Hızlı Sınıf Uyarısı"],
  ["pitspeed", "Pit Hızı"],
  ["radar", "Radar"],
  ["spotterbar", "Çubuk Spotter"],
  ["rejoin", "Piste Dönüş"],
  ["relative", "Yakındakiler (Relative)"],
  ["scene", "Yayın Sahnesi"],
  ["session", "Oturum & Bayraklar"],
  ["standings", "Sıralama Tablosu"],
  ["telemetry", "Telemetri Paneli"],
  ["tires", "Lastikler"],
  ["trackmap", "Pist Haritası"],
  ["twitch", "Twitch Sohbeti"],
  ["weather", "Canlı Hava"],
  ["webview", "Webview"],
];
// Programın sol menüsünde gizlenebilen bölümler (Yönetim, Ayarlar ve Hesap gizlenemez)
const APP_SECTIONS = [
  ["overlays", "Overlay'ler"],
  ["layouts", "Düzenler"],
  ["streaming", "Yayın"],
  ["drivers", "Sürücüler"],
  ["community", "Topluluk"],
  ["shots", "Ekran Görüntüleri"],
  ["tools", "Araçlar"],
  ["voice", "Sesli Mühendis"],
  ["support", "Destek"],
  ["pro", "PRO"],
];
const SUPPORT_CATS = { bug: "Hata bildirimi", overlay: "Overlay / görünüm", payment: "Ödeme / abonelik", account: "Hesap", feature: "Öneri / istek", other: "Diğer" };
const SUPPORT_ST = { open: ["warn", "Açık"], answered: ["ok", "Yanıtlandı"], closed: ["", "Kapalı"] };

const SRC = { lemon: "Lemon Squeezy", patreon: "Patreon", kofi: "Ko-fi", admin: "Yönetici" };
// Oturumdaki kişi yönetici mi (değilse moderatör: sadece Destek)
let isAdm = false;
let sections = SECTIONS;

async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function money(obj) {
  const e = Object.entries(obj || {});
  if (!e.length) return fmtMoney(0);
  return e.map(([c, v]) => fmtMoney(v, c)).join(" + ");
}

function proBadge(until, admin = false) {
  if (admin) return `<span class="badge pro">YÖNETİCİ</span>`;
  const d = daysLeft(until);
  if (d === null || d <= 0) return `<span class="badge">—</span>`;
  if (d > 3000) return `<span class="badge pro">PRO ∞</span>`;
  return `<span class="badge ${d <= 10 ? "warn" : "pro"}">PRO · ${d} gün</span>`;
}

// ---------------------------------------------------------------------------
// Basit çubuk grafik (canvas)
// ---------------------------------------------------------------------------
function barChart(canvas, labels, series) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const padL = 34, padB = 22, padT = 10;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const gw = (W - padL - 6) / Math.max(1, n);
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = "#8a93a4";
  ctx.strokeStyle = "#262b36";
  for (let i = 0; i <= 4; i++) {
    const y = padT + ((H - padT - padB) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    const v = max - (max * i) / 4;
    ctx.fillText(v >= 10 ? Math.round(v) : v.toFixed(1), 2, y + 4);
  }
  const bw = Math.max(2, (gw - 4) / series.length);
  series.forEach((s, si) => {
    ctx.fillStyle = s.color;
    s.values.forEach((v, i) => {
      const h = ((H - padT - padB) * v) / max;
      ctx.fillRect(padL + i * gw + 2 + si * bw, H - padB - h, bw - 1, h);
    });
  });
  ctx.fillStyle = "#8a93a4";
  const step = Math.ceil(n / 10);
  labels.forEach((l, i) => {
    if (i % step === 0) ctx.fillText(l.slice(5), padL + i * gw, H - 6);
  });
}

function barList(rows, key, label = (r) => r[key]) {
  if (!rows?.length) return `<p class="muted small">Veri yok.</p>`;
  const max = Math.max(...rows.map((r) => r.n));
  return `<div class="bar-list">${rows
    .map((r) => `<div><i style="width:${(r.n / max) * 100}%"></i><span>${esc(label(r) || "—")}</span><b>${r.n}</b></div>`)
    .join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Bölümler
// ---------------------------------------------------------------------------
async function ozet(el) {
  const [s, a, rv] = await Promise.all([
    rpc("admin_site_stats", { p_days: range }),
    rpc("admin_stats").catch(() => ({})),
    rpc("admin_revenue").catch(() => null),
  ]);
  const stat = (t, v, sub = "") => `<div class="stat"><small>${t}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
  const src = Object.entries(s.pro_by_source || {}).map(([k, v]) => ({ k: SRC[k] || k, n: v }));
  el.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <h2 style="margin:0">Özet</h2>
      <div class="seg" id="range">${[7, 30, 90, 365].map((d) => `<button data-d="${d}" class="${d === range ? "on" : ""}">${d} gün</button>`).join("")}</div>
    </div>
    <div class="stats">
      ${stat("Gelir", money(s.revenue), `toplam ${money(s.revenue_all)}`)}
      ${stat("Ödeme", s.payments)}
      ${stat("Aktif abonelik", s.active_subs)}
      ${stat("PRO üye", s.pro, `${s.expiring_15d} tanesi 15 günde bitiyor`)}
      ${stat("Yeni üye", s.signups, `toplam ${s.users}`)}
      ${stat("Ziyaretçi", s.visitors, `${s.visits} sayfa görüntüleme`)}
      ${stat("İndirme tıklaması", s.downloads)}
      ${stat("Program açık", a.online ?? "—", `${a.racing ?? 0} yarışta · 24 saatte ${a.active_24h ?? "—"}`)}
      ${stat("Kurulum", a.installs ?? "—", `30 günde aktif ${a.active_30d ?? "—"}`)}
      ${rv ? stat("Bu ay kazanç", money(rv.month), `son 30 gün ${money(rv.d30)}`) : ""}
      ${rv ? stat("Parayla PRO", rv.paid_pro, `${rv.paying_users} kişi ödeme yaptı`) : ""}
      ${rv ? stat("Ücretsiz PRO", rv.free_pro, rv.promo_until && new Date(rv.promo_until) > new Date() ? `kampanya ${fmtDate(rv.promo_until)} tarihine kadar` : "yönetici / diğer") : ""}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="row between"><h3>Ziyaretçi ve yeni üye</h3><span class="small"><span style="color:#ff8a2a">■</span> ziyaretçi <span style="color:#3ecf8e">■</span> üye</span></div><canvas class="chart" id="c1"></canvas></div>
      <div class="card"><div class="row between"><h3>Günlük gelir</h3><span class="small muted">tüm para birimleri toplamı</span></div><canvas class="chart" id="c2"></canvas></div>
    </div>
    <div class="grid g4" style="margin-top:16px">
      <div class="card"><h3>Sayfalar</h3>${barList(s.pages, "path")}</div>
      <div class="card"><h3>Nereden geldiler</h3>${barList(s.refs, "ref")}</div>
      <div class="card"><h3>Tarayıcı dili</h3>${barList(s.langs, "lang")}</div>
      <div class="card"><h3>PRO kaynağı</h3>${barList(src, "k")}</div>
    </div>`;
  $$("#range button", el).forEach((b) =>
    b.addEventListener("click", () => {
      range = +b.dataset.d;
      show();
    }),
  );
  const days = s.daily || [];
  const draw = () => {
    if (!$("#c1")) return;
    barChart($("#c1"), days.map((d) => d.day), [
      { color: "#ff8a2a", values: days.map((d) => d.visitors) },
      { color: "#3ecf8e", values: days.map((d) => d.signups) },
    ]);
    barChart($("#c2"), days.map((d) => d.day), [{ color: "#a64cff", values: days.map((d) => Number(d.revenue)) }]);
  };
  draw();
  window.onresize = draw;
}

async function satislar(el) {
  const rows = (await rpc("admin_payments", { p_days: 3650 })) || [];
  let src = "";
  const draw = () => {
    const list = rows.filter((r) => !src || r.source === src);
    const tot = {};
    list.forEach((r) => (tot[r.currency] = (tot[r.currency] || 0) + (r.kind === "refund" ? -r.amount : Number(r.amount))));
    $("#pay-body").innerHTML =
      list
        .map(
          (r) => `<tr>
        <td>${fmtDate(r.created_at, true)}</td>
        <td>${esc(r.display_name || "—")}<br><span class="muted small">${esc(r.email)}</span></td>
        <td>${esc(SRC[r.source] || r.source)}</td>
        <td>${esc(r.plan || "—")}</td>
        <td class="num">${r.kind === "refund" ? `<span class="badge bad">İade</span> ` : ""}${fmtMoney(r.kind === "refund" ? -r.amount : r.amount, r.currency)}</td>
      </tr>`,
        )
        .join("") || `<tr><td colspan="5" class="muted">Henüz ödeme yok. Ödemeler Lemon Squeezy / Patreon / Ko-fi bildirimleriyle buraya düşer.</td></tr>`;
    $("#pay-total").textContent = `${list.length} kayıt · ${money(tot)}`;
  };
  el.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <h2 style="margin:0">Satışlar</h2>
      <div class="row"><span class="muted small" id="pay-total"></span>
        <div class="seg" id="srcs">${[["", "Hepsi"], ["lemon", "Lemon"], ["patreon", "Patreon"], ["kofi", "Ko-fi"]]
          .map(([k, l]) => `<button data-s="${k}" class="${k === src ? "on" : ""}">${l}</button>`)
          .join("")}</div>
        <button class="btn btn-sm" id="csv">CSV indir</button></div>
    </div>
    <div class="card table-scroll"><table class="list"><thead><tr><th>Tarih</th><th>Üye</th><th>Kaynak</th><th>Plan</th><th class="num">Tutar</th></tr></thead><tbody id="pay-body"></tbody></table></div>
    <div class="row between" style="margin:22px 0 10px">
      <h3 style="margin:0">PRO üyeler: parayla / ücretsiz</h3>
      <div class="seg" id="pk">${[["paid", "Parayla PRO"], ["free", "Ücretsiz PRO"]].map(([k, l]) => `<button data-k="${k}" class="${k === "paid" ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>
    <div class="card table-scroll" id="pro-members"><p class="muted">Yükleniyor…</p></div>`;
  $$("#srcs button", el).forEach((b) =>
    b.addEventListener("click", () => {
      src = b.dataset.s;
      $$("#srcs button", el).forEach((x) => x.classList.toggle("on", x === b));
      draw();
    }),
  );
  const members = async (kind) => {
    const box = $("#pro-members");
    try {
      const list = (await rpc("admin_pro_members", { p_kind: kind })) || [];
      box.innerHTML = `<p class="muted small">${
        kind === "paid"
          ? "Aktif PRO olup ödeme kaynağından (Lemon Squeezy, Patreon, Ko-fi) gelen ya da ödeme kaydı olan üyeler."
          : "Aktif PRO olup hiç ödemesi olmayan üyeler (yönetici tarafından verilen süreler vb.)."
      } ${list.length} kişi.</p>
      <table class="list"><thead><tr><th>Üye</th><th>PRO</th><th>Kaynak</th><th class="num">Ödediği</th><th>Son ödeme</th></tr></thead><tbody>
      ${
        list
          .map(
            (r) => `<tr><td>${esc(r.display_name || "—")}<br><span class="muted small">${esc(r.email)}</span></td>
            <td>${proBadge(r.pro_until)}${r.renewing ? `<br><span class="muted tiny">yenileniyor</span>` : ""}</td>
            <td>${esc(SRC[r.pro_source] || r.pro_source || "—")}</td>
            <td class="num">${r.payments ? money(r.paid) : "—"}${r.payments ? `<br><span class="muted tiny">${r.payments} ödeme</span>` : ""}</td>
            <td>${r.last_payment ? fmtDate(r.last_payment) : "—"}</td></tr>`,
          )
          .join("") || `<tr><td colspan="5" class="muted">Kimse yok.</td></tr>`
      }</tbody></table>`;
    } catch (e) {
      box.innerHTML = `<div class="msg bad">${esc(e.message)}</div>`;
    }
  };
  $$("#pk button", el).forEach((b) =>
    b.addEventListener("click", () => {
      $$("#pk button", el).forEach((x) => x.classList.toggle("on", x === b));
      members(b.dataset.k);
    }),
  );
  members("paid");
  $("#csv").addEventListener("click", () => {
    const head = "tarih,kaynak,uye,eposta,plan,tur,tutar,para\n";
    const body = rows
      .map((r) => [r.created_at, r.source, r.display_name || "", r.email, r.plan, r.kind, r.amount, r.currency].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + head + body], { type: "text/csv" }));
    a.download = `pitwall-odemeler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });
  draw();
}

async function abonelikler(el) {
  const rows = (await rpc("admin_subscriptions")) || [];
  const st = (s) =>
    ({ active: ["ok", "Aktif"], on_trial: ["ok", "Deneme"], past_due: ["warn", "Ödeme gecikti"], cancelled: ["warn", "İptal edildi"], expired: ["bad", "Bitti"], paused: ["", "Duraklatıldı"], unpaid: ["bad", "Ödenmedi"] })[s] || ["", s];
  el.innerHTML = `<h2>Abonelikler</h2>
    <div class="card table-scroll"><table class="list"><thead><tr><th>Üye</th><th>Plan</th><th>Durum</th><th>Yenileme / bitiş</th><th>PRO bitişi</th><th>Başlangıç</th></tr></thead><tbody>
    ${
      rows
        .map((r) => {
          const [c, l] = st(r.status);
          return `<tr><td>${esc(r.display_name || "—")}<br><span class="muted small">${esc(r.email)}</span></td><td>${esc(r.plan)}</td><td><span class="badge ${c}">${esc(l)}</span></td>
            <td>${fmtDate(r.renews_at || r.ends_at)}</td><td>${proBadge(r.pro_until)}</td><td>${fmtDate(r.created_at)}</td></tr>`;
        })
        .join("") || `<tr><td colspan="6" class="muted">Henüz abonelik yok.</td></tr>`
    }</tbody></table></div>`;
}

let userQ = "";
let userFilter = "all";
async function uyeler(el) {
  el.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <h2 style="margin:0">Üyeler</h2>
      <div class="row">
        <input id="uq" placeholder="Ad, e-posta ya da iRacing adı" value="${esc(userQ)}" style="width:260px">
        <div class="seg" id="uf">${[["all", "Hepsi"], ["pro", "PRO"], ["online", "Çevrimiçi"], ["admin", "Yönetici"]]
          .map(([k, l]) => `<button data-f="${k}" class="${k === userFilter ? "on" : ""}">${l}</button>`)
          .join("")}</div>
      </div>
    </div>
    <div class="card table-scroll"><table class="list"><thead><tr><th>Üye</th><th>PRO</th><th>Kayıt</th><th>Son görülme</th><th>Sürüm</th><th></th></tr></thead><tbody id="ub"><tr><td class="muted">Yükleniyor…</td></tr></tbody></table></div>`;
  const load = async () => {
    const rows = (await rpc("admin_users", { p_q: userQ, p_filter: userFilter, p_offset: 0 })) || [];
    $("#ub").innerHTML =
      rows
        .map(
          (r) => `<tr>
          <td><b>${esc(r.display_name)}</b><br><span class="muted small">${esc(r.email)}${r.iracing_name ? ` · ${esc(r.iracing_name)}` : ""}</span></td>
          <td>${proBadge(r.pro_until, r.is_admin)}${r.pro_source && !r.is_admin && daysLeft(r.pro_until) > 0 ? `<br><span class="muted tiny">${esc(SRC[r.pro_source] || r.pro_source)}</span>` : ""}</td>
          <td>${fmtDate(r.created_at)}</td>
          <td>${r.last_seen ? fmtDate(r.last_seen, true) : "—"}</td>
          <td>${esc(r.version || "—")}</td>
          <td><button class="btn btn-sm" data-u='${esc(JSON.stringify({ id: r.id, name: r.display_name, email: r.email, until: r.pro_until }))}'>PRO süresi</button></td>
        </tr>`,
        )
        .join("") || `<tr><td colspan="6" class="muted">Kimse bulunamadı.</td></tr>`;
    $$("[data-u]", el).forEach((b) => b.addEventListener("click", () => proModal(JSON.parse(b.dataset.u), load)));
  };
  let t;
  $("#uq").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      userQ = e.target.value.trim();
      load();
    }, 300);
  });
  $$("#uf button", el).forEach((b) =>
    b.addEventListener("click", () => {
      userFilter = b.dataset.f;
      $$("#uf button", el).forEach((x) => x.classList.toggle("on", x === b));
      load();
    }),
  );
  await load();
}

/** Üyenin PRO süresini ver / uzat / kısalt / al; geçmişini göster */
async function proModal(u, done) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal">
    <div class="row between"><h3 style="margin:0">${esc(u.name)}</h3><button class="linkbtn" id="mx">✕</button></div>
    <p class="muted small">${esc(u.email)}</p>
    <p>Şu an: ${proBadge(u.until)} ${u.until ? `<span class="muted small">(${fmtDate(u.until, true)})</span>` : ""}</p>
    <div class="field"><label>Not (geçmişe yazılır; bildirim açıksa e-postada da görünür)</label><input id="mnote" maxlength="200" placeholder="ör. yayın desteği, hata telafisi"></div>
    <label class="chk boxed" style="margin-bottom:12px"><input type="checkbox" id="mnotify" ${localStorage.getItem("pitwall.admin.proNotify") === "1" ? "checked" : ""}>
      <span><b>Kullanıcıya bildir (e-posta + bildirim)</b><br><span class="muted small">Değişiklik kullanıcıya uygulamada bildirim ve kendi dilinde e-posta olarak gider.</span></span></label>
    <div class="row" style="margin-bottom:10px">
      ${[7, 30, 90, 180, 365].map((d) => `<button class="btn btn-sm" data-add="${d}">+${d} gün</button>`).join("")}
      ${[-7, -30].map((d) => `<button class="btn btn-sm btn-danger" data-add="${d}">−${-d} gün</button>`).join("")}
    </div>
    <div class="row" style="margin-bottom:10px">
      <input id="mdays" type="number" style="width:120px" placeholder="gün (eksi kısaltır)">
      <button class="btn btn-sm" id="madd">Ekle</button>
      <span class="muted small">ya da</span>
      <input id="mdate" type="date" style="width:170px">
      <button class="btn btn-sm" id="mset">Bu tarihe ayarla</button>
    </div>
    <div class="row" style="margin-bottom:16px">
      <button class="btn btn-sm" id="mforever">Süresiz PRO</button>
      <button class="btn btn-sm btn-danger" id="mremove">PRO'yu al</button>
    </div>
    <h3 style="font-size:16px">Geçmiş</h3>
    <div id="mlog" class="small muted">Yükleniyor…</div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => e.target === bg && close());
  $("#mx", bg).addEventListener("click", close);
  const note = () => $("#mnote", bg).value.trim();
  const notify = () => $("#mnotify", bg).checked;
  $("#mnotify", bg).addEventListener("change", () => {
    try {
      localStorage.setItem("pitwall.admin.proNotify", notify() ? "1" : "0");
    } catch {}
  });
  const change = async (mode, args, label) => {
    try {
      const nu = await rpc("admin_change_pro", { p_user: u.id, p_mode: mode, p_days: args.days ?? null, p_until: args.until ?? null, p_note: note(), p_notify: notify() });
      after((label || (nu ? `Yeni bitiş: ${fmtDate(nu, true)}` : "PRO alındı")) + (notify() ? " · kullanıcıya bildirildi" : ""));
    } catch (e) {
      toast(e.message, true);
    }
  };
  const after = async (msg) => {
    toast(msg);
    close();
    await done?.();
  };
  const add = (days) => days && change("add", { days });
  const setUntil = (date, label) => (date ? change("set", { until: date.toISOString() }, label) : change("remove", {}, label));
  $$("[data-add]", bg).forEach((b) => b.addEventListener("click", () => add(+b.dataset.add)));
  $("#madd", bg).addEventListener("click", () => add(parseInt($("#mdays", bg).value, 10)));
  $("#mset", bg).addEventListener("click", () => {
    const v = $("#mdate", bg).value;
    if (v) setUntil(new Date(v + "T23:59:00"), "Tarih ayarlandı");
  });
  $("#mforever", bg).addEventListener("click", () => change("unlimited", {}, "Süresiz PRO verildi"));
  $("#mremove", bg).addEventListener("click", () => {
    if (confirm(`${u.name} kullanıcısının PRO'su alınsın mı?`)) setUntil(null, "PRO alındı");
  });
  try {
    const log = (await rpc("admin_pro_log", { p_user: u.id })) || [];
    $("#mlog", bg).innerHTML = log.length ? logTable(log, false) : "Kayıt yok.";
  } catch (e) {
    $("#mlog", bg).textContent = e.message;
  }
}

function logTable(rows, withUser = true) {
  return `<div class="table-scroll"><table class="list"><thead><tr><th>Tarih</th>${withUser ? "<th>Üye</th>" : ""}<th>Eski</th><th>Yeni</th><th>Kaynak</th><th>Yapan / not</th></tr></thead><tbody>
    ${rows
      .map(
        (r) => `<tr><td>${fmtDate(r.created_at, true)}</td>${withUser ? `<td>${esc(r.display_name || "—")}</td>` : ""}
        <td>${r.old_until ? fmtDate(r.old_until) : "—"}</td><td>${r.new_until ? fmtDate(r.new_until) : "<span class='badge bad'>alındı</span>"}</td>
        <td>${esc(SRC[r.source] || r.source || "—")}</td><td>${esc(r.by_name || "sistem")}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ""}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}

async function gecmis(el) {
  const rows = (await rpc("admin_pro_log", { p_user: null })) || [];
  el.innerHTML = `<h2>PRO süre geçmişi</h2><p class="muted small">Ödeme, abonelik ve yönetici işlemleriyle PRO bitiş tarihindeki her değişiklik (son 200).</p>
    <div class="card">${rows.length ? logTable(rows) : `<p class="muted">Henüz kayıt yok.</p>`}</div>`;
}

let devFilter = "flagged";
async function cihazlar(el) {
  const rows = (await rpc("admin_devices", { p_filter: devFilter })) || [];
  el.innerHTML = `<div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Cihazlar</h2>
    <div class="seg" id="df">${[["flagged", "Uyarılar"], ["multi", "Birden çok cihaz"], ["all", "Hepsi"]]
      .map(([k, l]) => `<button data-f="${k}" class="${k === devFilter ? "on" : ""}">${l}</button>`)
      .join("")}</div></div>
    <div class="stack">${
      rows
        .map(
          (r) => `<div class="card">
        <div class="row between"><div><b>${esc(r.display_name)}</b> <span class="muted small">${esc(r.email)}</span> ${proBadge(r.pro_until)}</div>
          <div class="row"><span class="badge ${r.device_count > 2 ? "bad" : ""}">${r.device_count} cihaz (30 gün)</span>
          ${r.flag_id ? `<button class="btn btn-sm" data-res="${r.flag_id}">Uyarıyı kapat</button>` : ""}</div></div>
        <table class="list" style="margin-top:8px"><thead><tr><th>Bilgisayar</th><th>Sürüm</th><th>İlk</th><th>Son</th><th></th></tr></thead><tbody>
        ${r.devices
          .map(
            (d) => `<tr><td>${esc(d.label || "?")} <span class="muted tiny">${esc(d.hash.slice(0, 8))}</span></td><td>${esc(d.version || "—")}</td>
            <td>${fmtDate(d.first_seen)}</td><td>${fmtDate(d.last_seen, true)}</td>
            <td><button class="btn btn-sm btn-danger" data-rm='${esc(JSON.stringify([r.user_id, d.hash]))}'>Kaldır</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`,
        )
        .join("") || `<div class="card muted">Kayıt yok.</div>`
    }</div>`;
  $$("#df button", el).forEach((b) =>
    b.addEventListener("click", () => {
      devFilter = b.dataset.f;
      show();
    }),
  );
  $$("[data-res]", el).forEach((b) => b.addEventListener("click", async () => (await rpc("admin_resolve_flag", { p_flag: b.dataset.res }), show())));
  $$("[data-rm]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const [u, h] = JSON.parse(b.dataset.rm);
      if (!confirm("Bu cihaz kaydı silinsin mi?")) return;
      await rpc("admin_remove_device", { p_user: u, p_hash: h });
      show();
    }),
  );
}

// Arkadaş mesajı raporları (programda Yönetim → Moderasyon'da da var)
const MSG_REASONS = { harassment: "Hakaret / taciz", spam: "Spam", inappropriate: "Uygunsuz içerik", scam: "Dolandırıcılık", other: "Diğer" };
const MSG_ST = { open: ["warn", "Açık"], dismissed: ["", "Yoksayıldı"], resolved: ["ok", "Çözüldü"], removed: ["bad", "Mesaj silindi"] };
let msgFilter = "open";
async function mesajlar(el) {
  const rows = (await rpc("admin_message_reports", { p_status: msgFilter === "all" ? "" : msgFilter })) || [];
  el.innerHTML = `<div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Mesaj raporları</h2>
    <div class="seg" id="mf">${[["open", "Açık"], ["all", "Hepsi"]]
      .map(([k, l]) => `<button data-f="${k}" class="${k === msgFilter ? "on" : ""}">${l}</button>`)
      .join("")}</div></div>
    <p class="muted small">Üyelerin arkadaş mesajlarından raporladıkları. Metin rapor anındaki kopyadır; "Mesajı sil" mesajı iki taraftan da kaldırır.</p>
    <div class="stack">${
      rows
        .map((r) => {
          const [cls, st] = MSG_ST[r.status] || ["", r.status];
          return `<div class="card">
        <div class="row between"><div><b>${esc(MSG_REASONS[r.reason] || r.reason)}</b> <span class="badge ${cls}">${esc(st)}</span>
          ${r.reported_total > 1 ? `<span class="badge warn">Bu üye hakkında ${r.reported_total} rapor</span>` : ""}</div>
          <span class="muted small">${fmtDate(r.created_at, true)}</span></div>
        <div style="margin:10px 0;padding:10px 12px;border-left:3px solid #e5322d;background:rgba(255,255,255,.03);border-radius:6px;white-space:pre-line;overflow-wrap:anywhere">${esc(r.body)}</div>
        <div class="muted small">Gönderen: <b>${esc(r.reported_name)}</b> · Raporlayan: ${esc(r.reporter_name)}${r.message_at ? ` · Mesaj: ${fmtDate(r.message_at, true)}` : ""}${r.message_exists ? "" : " · mesaj silinmiş"}${r.status !== "open" && r.handled_name ? ` · İşlem: ${esc(r.handled_name)}` : ""}</div>
        ${r.note ? `<div class="muted small" style="margin-top:6px">Not: “${esc(r.note)}”</div>` : ""}
        <div class="row" style="margin-top:10px;gap:6px">
          ${r.status === "open" ? `<button class="btn btn-sm" data-a="dismiss" data-id="${r.id}">Yoksay</button><button class="btn btn-sm" data-a="resolve" data-id="${r.id}">Çözüldü</button>` : `<button class="btn btn-sm" data-a="reopen" data-id="${r.id}">Yeniden aç</button>`}
          ${r.message_exists ? `<button class="btn btn-sm btn-danger" data-a="delete_message" data-id="${r.id}">Mesajı sil</button>` : ""}
        </div></div>`;
        })
        .join("") || `<div class="card muted">${msgFilter === "open" ? "Açık mesaj raporu yok." : "Mesaj raporu yok."}</div>`
    }</div>`;
  $$("#mf button", el).forEach((b) =>
    b.addEventListener("click", () => {
      msgFilter = b.dataset.f;
      show();
    }),
  );
  $$("[data-a]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.a === "delete_message" && !confirm("Mesaj iki taraftan da silinsin mi?")) return;
      try {
        await rpc("admin_message_report_set", { p_id: b.dataset.id, p_action: b.dataset.a });
        show();
      } catch (e) {
        toast(e.message || String(e), true);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Tüm özel mesajlar (üyeler arası). Her ilk sayfa moderasyon kaydına yazılır (sunucu).
// ---------------------------------------------------------------------------
const AM_PAGE = 100;
const am = { user: "", other: "", text: "", from: "", to: "", offset: 0, view: "conv", pair: null, searched: false };
const amDay = (v, next = false) => {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (next) d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const amWho = (n, ir) => (ir && ir !== n ? `${esc(n)} <span class="muted">(${esc(ir)})</span>` : esc(n));

async function tumMesajlar(el) {
  el.innerHTML = `<h2>Tüm mesajlar</h2>
    <p class="muted small">Üyeler arasındaki tüm özel mesajlar. Bir üyenin adını ya da iRacing adını yaz: o üyenin dahil olduğu tüm sohbetler gelir.
      İkinci bir ad yazarsan sadece ikisi arasındaki mesajlar gösterilir. Üyelerin "benden sil" ile kaldırdığı mesajlar da burada görünür. Her arama moderasyon kayıtlarına yazılır.</p>
    <form id="amf" class="am-filters card">
      ${
        am.pair
          ? `<div class="field"><label>Sohbet</label><div class="row" style="gap:8px"><b>${esc(am.pair.a.name)} ↔ ${esc(am.pair.b.name)}</b><button type="button" class="btn btn-sm" id="am-unpair">Kaldır</button></div></div>`
          : `<div class="field"><label>Üye adı ya da iRacing adı</label><input name="user" value="${esc(am.user)}" placeholder="ör. Erkin"></div>
             <div class="field"><label>İkinci üye (isteğe bağlı)</label><input name="other" value="${esc(am.other)}"></div>`
      }
      <div class="field"><label>Metinde ara</label><input name="text" value="${esc(am.text)}"></div>
      <div class="field date"><label>Başlangıç</label><input type="date" name="from" value="${esc(am.from)}"></div>
      <div class="field date"><label>Bitiş</label><input type="date" name="to" value="${esc(am.to)}"></div>
      <button class="btn btn-accent">Ara</button>
    </form>
    <div id="am-res">${am.searched ? `<p class="muted">Yükleniyor…</p>` : `<p class="muted small">Aramak için süzgeç gir ve Ara'ya bas (boş bırakırsan en yeni mesajlar gelir).</p>`}</div>`;
  $("#amf", el).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!am.pair) {
      am.user = String(f.get("user") || "").trim();
      am.other = String(f.get("other") || "").trim();
    }
    am.text = String(f.get("text") || "").trim();
    am.from = String(f.get("from") || "");
    am.to = String(f.get("to") || "");
    am.offset = 0;
    am.searched = true;
    amLoad(el);
  });
  $("#am-unpair", el)?.addEventListener("click", () => {
    am.pair = null;
    am.offset = 0;
    tumMesajlar(el);
  });
  if (am.searched) amLoad(el);
}

async function amLoad(el, cached = null) {
  const res = $("#am-res", el);
  if (!res) return;
  let rows = cached;
  if (!rows) {
    res.innerHTML = `<p class="muted">Yükleniyor…</p>`;
    try {
      rows =
        (await rpc("admin_messages", {
          p_user_query: am.pair ? am.pair.a.id : am.user || null,
          p_other_query: am.pair ? am.pair.b.id : am.other || null,
          p_text: am.text || null,
          p_from: amDay(am.from),
          p_to: amDay(am.to, true),
          p_limit: AM_PAGE,
          p_offset: am.offset,
        })) || [];
    } catch (e) {
      res.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
      return;
    }
  }
  const total = rows[0]?.total || 0;
  const msg = (m, compact = false) => `<div class="am-msg ${m.reported ? "rep" : ""}">
      <div class="head"><b>${amWho(m.sender_name, m.sender_iracing)}</b><span class="muted">→</span><b>${amWho(m.recipient_name, m.recipient_iracing)}</b><span class="muted small">${fmtDate(m.created_at, true)}</span></div>
      <p>${esc(m.body)}</p>
      <div class="row small" style="gap:6px">
        <span class="badge ${m.read_at ? "" : "warn"}">${m.read_at ? `Okundu ${fmtDate(m.read_at, true)}` : "Okunmadı"}</span>
        ${m.hidden_by_sender ? `<span class="badge">Gönderen kendinden sildi</span>` : ""}
        ${m.hidden_by_recipient ? `<span class="badge">Alıcı kendinden sildi</span>` : ""}
        ${m.reported ? `<span class="badge bad">Raporlandı</span>` : ""}
        ${!compact && !am.pair ? `<button type="button" class="linkbtn" data-pair="${esc(m.id)}">Bu sohbeti aç</button>` : ""}
      </div>
    </div>`;
  const convs = [];
  const byKey = {};
  for (const m of rows) {
    const k = [m.sender, m.recipient].sort().join(":");
    if (!byKey[k]) convs.push((byKey[k] = { first: m, list: [] }));
    byKey[k].list.push(m);
  }
  res.innerHTML = rows.length
    ? `<div class="row between" style="margin-bottom:10px">
        <div class="seg" id="amv">${[["conv", "Sohbetler"], ["flat", "Liste"]].map(([k, l]) => `<button data-v="${k}" class="${k === am.view ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="row small" style="gap:6px"><span class="muted">${am.offset + 1}–${am.offset + rows.length} / ${total} mesaj</span>
          <button class="btn btn-sm" id="am-prev" ${am.offset === 0 ? "disabled" : ""}>Önceki</button>
          <button class="btn btn-sm" id="am-next" ${am.offset + AM_PAGE >= total ? "disabled" : ""}>Sonraki</button></div>
      </div>
      <div class="stack">${
        am.view === "flat"
          ? rows.map((m) => msg(m)).join("")
          : convs
              .map(
                (c) => `<details class="card am-conv" ${convs.length <= 3 ? "open" : ""}>
              <summary><b>${esc(c.first.sender_name)} ↔ ${esc(c.first.recipient_name)}</b><span class="muted small">${c.list.length} mesaj · ${fmtDate(c.first.created_at, true)}</span>
                ${am.pair ? "" : `<button type="button" class="btn btn-sm" data-pair="${esc(c.first.id)}" style="margin-left:auto">Tüm sohbet</button>`}</summary>
              <div class="stack">${[...c.list].reverse().map((m) => msg(m, true)).join("")}</div>
            </details>`,
              )
              .join("")
      }</div>`
    : `<div class="card muted">Mesaj bulunamadı.</div>`;
  $$("#amv button", res).forEach((b) =>
    b.addEventListener("click", () => {
      am.view = b.dataset.v;
      amLoad(el, rows);
    }),
  );
  $("#am-prev", res)?.addEventListener("click", () => {
    am.offset = Math.max(0, am.offset - AM_PAGE);
    amLoad(el);
  });
  $("#am-next", res)?.addEventListener("click", () => {
    am.offset += AM_PAGE;
    amLoad(el);
  });
  $$("[data-pair]", res).forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const m = rows.find((r) => r.id === b.dataset.pair);
      if (!m) return;
      am.pair = { a: { id: m.sender, name: m.sender_name }, b: { id: m.recipient, name: m.recipient_name } };
      am.view = "flat";
      am.offset = 0;
      tumMesajlar(el);
    }),
  );
}

async function planlar(el) {
  const c = await appConfig();
  const pp = c.pro_pricing || {};
  const plans = pp.plans || {};
  const f = (k, label, ph = "", type = "text") =>
    `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(c[k] ?? "")}" placeholder="${esc(ph)}"></div>`;
  const num = (k, label, v, ph = "") =>
    `<div class="field"><label>${label}</label><input name="${k}" type="text" inputmode="decimal" value="${v > 0 ? esc(v) : ""}" placeholder="${esc(ph)}"></div>`;
  el.innerHTML = `<h2>Planlar ve fiyatlar</h2>
    <p class="muted small">Buradaki fiyatlar hem sitede hem programda görünür ve ödeme tutarı olarak kullanılır. Lemon Squeezy'de tek bir abonelik ürünü
      (“SRTR Pitwall PRO”) ve 4 varyantı (her 1 / 3 / 6 / 12 ayda bir yenilenen, fiyatı önemsiz) açılır; varyant numaraları Supabase'de
      <code>LEMON_PRO_1M_VARIANT_ID</code> … <code>LEMON_PRO_12M_VARIANT_ID</code> olarak girilir. Tutarlar buradan alınır ve <code>pro-checkout</code>
      fonksiyonu ödeme sayfasını bu tutarla açar; yenilemeler de aynı tutarla olur (fiyat değişikliği yalnızca yeni aboneliklere uygulanır).
      Türkiye'den girenler (saat dilimi Türkiye olanlar) Türkiye fiyatını (TL) görür ve öder, diğer herkes genel fiyatı (USD). Türkiye fiyatı boşsa Türkiye'de de genel fiyat kullanılır.
      Sitede <code>?region=tr</code> ya da <code>?region=intl</code> ekleyerek iki görünümü de deneyebilirsin.</p>
    <form id="pf" class="stack">
      <div class="card grid g2">
        <div class="field" style="margin:0"><label>Genel para birimi</label><input name="pp_currency" maxlength="3" value="${esc(pp.currency || "USD")}"></div>
        <div class="field" style="margin:0"><label>Türkiye para birimi</label><input name="pp_currency_tr" maxlength="3" value="${esc(pp.currency_tr || "TRY")}"></div>
      </div>
      <div class="grid g2">
        ${PLANS.map(
          (p) => `<div class="card"><h3>${p.tr}</h3>
            <div class="grid g2">
              ${num(`pp_price_${p.id}`, "Fiyat (yurt dışı, USD)", plans[p.id]?.price, "ör. 4.99")}
              ${num(`pp_tr_${p.id}`, "Türkiye fiyatı (TL)", plans[p.id]?.price_tr, "ör. 149")}
            </div>
            <details style="margin-top:6px"><summary class="small muted">Elle bağlantı (isteğe bağlı, otomatik fiyat girilmemişse kullanılır)</summary>
              <p class="small muted" style="margin:6px 0 8px"><b>Diğer ülkeler</b></p>
              ${f(p.price, "Fiyat metni", "ör. $4.99 ya da €4,99")}${f(p.checkout, "Lemon Squeezy ödeme bağlantısı", "https://….lemonsqueezy.com/buy/…")}
              <p class="small muted" style="margin:6px 0 8px"><b>Türkiye</b> — boş bırakılırsa Türkiye'de de yukarıdaki kullanılır</p>
              ${f(p.trPrice, "Fiyat metni (TL)", "ör. 149₺")}${f(p.trCheckout, "Lemon Squeezy ödeme bağlantısı (TL varyantı)", "https://….lemonsqueezy.com/buy/…")}
            </details>
          </div>`,
        ).join("")}
      </div>
      <div class="card grid g2">
        ${f("patreon_url", "Patreon bağlantısı", "https://www.patreon.com/…")}
        ${f("kofi_url", "Ko-fi bağlantısı", "https://ko-fi.com/…")}
        ${f("device_limit", "Cihaz sınırı (aşılınca uyarı)", "2", "number")}
        <div class="field"><label>PRO notu (sitede ve programda fiyatların altında)</label><textarea name="pro_note" rows="2">${esc(c.pro_note ?? "")}</textarea></div>
      </div>
      <div><button class="btn btn-accent">Kaydet</button></div>
    </form>`;
  $("#pf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patch = { updated_at: new Date().toISOString() };
    const money = (v) => {
      const n = Math.round(parseFloat(String(v ?? "").replace(",", ".")) * 100) / 100;
      return n > 0 ? n : 0;
    };
    const cur = (v, d) => (String(v || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || d);
    const plansOut = {};
    for (const p of PLANS) plansOut[p.id] = { price: money(fd.get(`pp_price_${p.id}`)), price_tr: money(fd.get(`pp_tr_${p.id}`)) };
    patch.pro_pricing = { ...pp, currency: cur(fd.get("pp_currency"), "USD"), currency_tr: cur(fd.get("pp_currency_tr"), "TRY"), plans: plansOut };
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("pp_")) continue;
      patch[k] = k === "device_limit" ? Math.max(1, parseInt(String(v), 10) || 2) : String(v).trim();
    }
    const { data, error } = await sb.from("app_config").update(patch).eq("id", 1).select();
    if (error || !data?.length) return toast(error?.message || "Kaydedilemedi", true);
    toast("Kaydedildi");
  });
}

// ---------------------------------------------------------------------------
// Destek talepleri
// ---------------------------------------------------------------------------
let spStatusF = "";
let spCatF = "";
let spOpen = "";
async function destek(el) {
  const rows = (await rpc("admin_support_tickets", { p_status: spStatusF || null, p_category: spCatF || null })) || [];
  const unread = rows.filter((r) => r.unread).length;
  el.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <h2 style="margin:0">Destek ${unread ? `<span class="badge warn">${unread} okunmamış</span>` : ""}</h2>
      <div class="row">
        <div class="seg" id="sps">${[["", "Hepsi"], ["unread", "Okunmamış"], ["open", "Açık"], ["answered", "Yanıtlandı"], ["closed", "Kapalı"]]
          .map(([k, l]) => `<button data-s="${k}" class="${k === spStatusF ? "on" : ""}">${l}</button>`)
          .join("")}</div>
        <select id="spc" style="width:190px"><option value="">Tüm kategoriler</option>${Object.entries(SUPPORT_CATS)
          .map(([k, l]) => `<option value="${k}" ${k === spCatF ? "selected" : ""}>${l}</option>`)
          .join("")}</select>
      </div>
    </div>
    <div class="grid g2" style="align-items:start;grid-template-columns:minmax(260px,1fr) 2fr">
      <div class="card"><div class="sp-list">${
        rows
          .map(
            (r) => `<button class="sp-item" data-t="${esc(r.id)}" style="${r.id === spOpen ? "border-color:var(--accent)" : ""}">
            ${r.unread ? `<i class="sp-dot"></i>` : ""}
            <span class="grow"><b>${esc(r.subject)}</b><span class="muted small">${esc(r.display_name || r.email || "?")} · ${esc(SUPPORT_CATS[r.category] || r.category)} · ${fmtDate(r.updated_at, true)}</span></span>
            <span class="badge ${SUPPORT_ST[r.status]?.[0] || ""}">${esc(SUPPORT_ST[r.status]?.[1] || r.status)}</span>
          </button>`,
          )
          .join("") || `<p class="muted">Talep yok.</p>`
      }</div></div>
      <div class="card" id="sp-thread"><p class="muted">Soldan bir talep seç.</p></div>
    </div>`;
  $$("#sps button", el).forEach((b) => b.addEventListener("click", () => ((spStatusF = b.dataset.s), show())));
  $("#spc", el).addEventListener("change", (e) => ((spCatF = e.target.value), show()));
  $$("[data-t]", el).forEach((b) =>
    b.addEventListener("click", () => {
      spOpen = b.dataset.t;
      $$("[data-t]", el).forEach((x) => (x.style.borderColor = x === b ? "var(--accent)" : ""));
      thread(rows.find((r) => r.id === spOpen));
    }),
  );
  const cur = rows.find((r) => r.id === spOpen);
  if (cur) thread(cur);
}

async function thread(t) {
  const box = $("#sp-thread");
  if (!t || !box) return;
  box.innerHTML = `<p class="muted">Yükleniyor…</p>`;
  try {
    const msgs = (await rpc("support_thread", { p_ticket: t.id })) || [];
    sb.rpc("support_seen", { p_ticket: t.id }).then(() => {}, () => {});
    const paths = [...new Set(msgs.flatMap((m) => m.images || []))];
    const urls = {};
    if (paths.length) {
      const { data } = await sb.storage.from("support").createSignedUrls(paths, 3600);
      (data || []).forEach((x) => x.signedUrl && (urls[x.path] = x.signedUrl));
    }
    box.innerHTML = `
      <div class="row between"><div><b>${esc(t.subject)}</b><br><span class="muted small">${esc(t.display_name || "—")}${t.email ? ` · ${esc(t.email)}` : ""} · ${esc(SUPPORT_CATS[t.category] || t.category)} · ${proBadge(t.pro_until)}</span></div>
        <div class="row" style="gap:6px"><button class="btn btn-sm" id="sp-st">${t.status === "closed" ? "Yeniden aç" : "Talebi kapat"}</button>${
          isAdm ? `<button class="btn btn-sm btn-danger" id="sp-del" title="Talep, tüm mesajları ve görselleriyle kalıcı silinir">Sil</button>` : ""
        }</div></div>
      <div id="sp-delask"></div>
      <div class="sp-msgs">${msgs
        .map(
          (m) => `<div class="sp-msg ${m.is_staff ? "staff mine" : ""}">
            <div class="head"><b>${esc(m.author_name)}${m.is_staff ? " · ekip" : ""}</b><span>${fmtDate(m.created_at, true)}</span></div>
            <p>${esc(m.body)}</p>
            ${(m.images || []).length ? `<div class="sp-imgs">${m.images.map((p) => (urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt=""></a>` : "")).join("")}</div>` : ""}
          </div>`,
        )
        .join("")}</div>
      <form id="sp-r">
        <div class="field"><textarea name="body" rows="4" maxlength="4000" placeholder="Yanıtın (kullanıcıya bildirim ve kendi dilinde e-posta gider)"></textarea></div>
        <div class="row between"><div class="sp-tools" id="sp-emo"><input type="file" id="sp-files" accept="image/*" multiple style="width:auto"></div><button class="btn btn-accent">Yanıtla</button></div>
      </form>`;
    const mb = $(".sp-msgs", box);
    mb.scrollTop = mb.scrollHeight;
    attachEmoji($("#sp-r textarea", box), { host: $("#sp-emo", box), title: "İfade ekle" });
    $("#sp-del", box)?.addEventListener("click", () => {
      const ask = $("#sp-delask", box);
      ask.innerHTML = `<div class="del-ask"><span>Talep tüm mesajları ve görselleriyle kalıcı olarak silinsin mi? Bu geri alınamaz.</span>
        <button type="button" class="btn btn-sm btn-danger" data-yes>Evet, kalıcı sil</button><button type="button" class="btn btn-sm" data-no>Vazgeç</button></div>`;
      $("[data-no]", ask).addEventListener("click", () => (ask.innerHTML = ""));
      $("[data-yes]", ask).addEventListener("click", async (e) => {
        e.target.disabled = true;
        try {
          const paths = (await rpc("admin_support_delete", { p_ticket: t.id })) || [];
          if (paths.length) await sb.storage.from("support").remove(paths).catch(() => {});
          spOpen = "";
          toast("Talep silindi");
          show();
        } catch (err) {
          toast(err.message || String(err), true);
          e.target.disabled = false;
        }
      });
    });
    $("#sp-st", box).addEventListener("click", async () => {
      try {
        await rpc("support_set_status", { p_ticket: t.id, p_status: t.status === "closed" ? "open" : "closed" });
        show();
      } catch (e) {
        toast(e.message, true);
      }
    });
    $("#sp-r", box).addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = String(new FormData(e.target).get("body")).trim();
      if (!text) return;
      const btn = e.target.querySelector("button.btn-accent");
      btn.disabled = true;
      try {
        const me = (await sb.auth.getUser()).data.user;
        const files = [...($("#sp-files", box).files || [])].filter((f) => f.type.startsWith("image/")).slice(0, 4);
        const stamp = Date.now().toString(36);
        const images = [];
        for (let i = 0; i < files.length; i++) {
          if (files[i].size > 5 * 1024 * 1024) throw new Error("Görsel çok büyük (en fazla 5 MB)");
          const path = `${me.id}/${stamp}/${i + 1}.${(files[i].type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
          const { error } = await sb.storage.from("support").upload(path, files[i], { contentType: files[i].type });
          if (error) throw new Error(error.message);
          images.push(path);
        }
        await rpc("support_reply", { p_ticket: t.id, p_body: text, p_images: images });
        toast("Yanıt gönderildi");
        show();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  } catch (e) {
    box.innerHTML = `<div class="msg bad">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Ücretsiz PRO kampanyası
// ---------------------------------------------------------------------------
async function kampanya(el) {
  const c = await appConfig();
  const until = c.promo_pro_until && new Date(c.promo_pro_until) > new Date() ? new Date(c.promo_pro_until) : null;
  el.innerHTML = `<h2>Ücretsiz PRO kampanyası</h2>
    <p class="muted small">Kampanya süresince <b>giriş yapmış tüm üyeler</b> tüm PRO özelliklerini kullanır (programda ve sunucudaki PRO denetimlerinde).
      Giriş yapmayanlar yararlanamaz. Sitede bir şerit kampanyayı ve bitişini duyurur. Süre bitince her şey kendiliğinden eski haline döner.</p>
    <div class="card stack">
      <div class="row between"><div><b style="font-size:20px">${until ? `${daysLeft(until)} gün kaldı` : "Kampanya kapalı"}</b>
        ${until ? `<br><span class="muted small">Bitiş: ${fmtDate(until, true)}</span>` : ""}</div>${until ? `<span class="badge ok">AÇIK</span>` : ""}</div>
      <div class="field"><label>Kampanya notu (şeritte ve programda görünür, isteğe bağlı)</label><input id="pnote" maxlength="160" value="${esc(c.promo_note || "")}" placeholder="ör. Bayrama özel herkese PRO!"></div>
      <div class="row">
        ${[7, 14, 30].map((d) => `<button class="btn btn-sm" data-pd="${d}">${until ? `+${d} gün uzat` : `${d} gün başlat`}</button>`).join("")}
        <input type="date" id="pdate" style="width:180px"><button class="btn btn-sm" id="pset">Bu tarihe kadar</button>
        ${until ? `<button class="btn btn-sm" id="psave">Notu kaydet</button><button class="btn btn-sm btn-danger" id="pend">Bitir</button>` : ""}
      </div>
    </div>`;
  const save = async (d, msg) => {
    const { data, error } = await sb
      .from("app_config")
      .update({ promo_pro_until: d ? d.toISOString() : null, promo_note: $("#pnote").value.trim(), updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select();
    if (error || !data?.length) return toast(error?.message || "Kaydedilemedi", true);
    toast(msg);
    show();
  };
  $$("[data-pd]", el).forEach((b) =>
    b.addEventListener("click", () => save(new Date((until?.getTime() ?? Date.now()) + +b.dataset.pd * 86400000), `Kampanya ${b.dataset.pd} gün`)),
  );
  $("#pset").addEventListener("click", () => {
    const v = $("#pdate").value;
    if (v) save(new Date(v + "T23:59:00"), "Kampanya bitişi ayarlandı");
  });
  $("#psave")?.addEventListener("click", () => save(until, "Kaydedildi"));
  $("#pend")?.addEventListener("click", () => confirm("Kampanya şimdi bitirilsin mi?") && save(null, "Kampanya bitirildi"));
}

// ---------------------------------------------------------------------------
// Görünürlük: programdaki bölümleri ve overlay'leri gizle
// ---------------------------------------------------------------------------
async function gorunurluk(el) {
  const c = await appConfig();
  const hs = new Set(c.hidden_sections || []);
  const ho = new Set(c.hidden_overlays || []);
  const known = new Set(OVERLAYS.map((o) => o[0]));
  const extra = [...new Set([...(c.hidden_overlays || []), ...(c.pro_overlays || [])])].filter((id) => id !== "voice" && !known.has(id)).map((id) => [id, id]);
  const box = (key, id, label, hidden) =>
    `<label class="chk"><input type="checkbox" data-key="${key}" data-id="${esc(id)}" ${hidden ? "" : "checked"}><span>${esc(label)}${hidden ? ` <span class="badge bad">gizli</span>` : ""}</span></label>`;
  el.innerHTML = `<h2>Görünürlük</h2>
    <p class="muted small">İşareti kaldırılan bölümler ve overlay'ler programda yönetici olmayan kullanıcılara görünmez (menüden, overlay listesinden ve ekle menüsünden kalkar,
      açık olanlar ekrana çizilmez). Yöneticiler hepsini "gizli" rozetiyle görmeye devam eder. Yönetim, Ayarlar ve Hesap gizlenemez.</p>
    <div class="card"><h3>Sol menü bölümleri</h3><div class="vis-grid">${APP_SECTIONS.map(([id, l]) => box("hidden_sections", id, l, hs.has(id))).join("")}</div></div>
    <div class="card" style="margin-top:16px"><h3>Overlay'ler</h3><div class="vis-grid">${[...OVERLAYS, ...extra].map(([id, l]) => box("hidden_overlays", id, l, ho.has(id))).join("")}</div></div>`;
  $$("[data-key]", el).forEach((cb) =>
    cb.addEventListener("change", async () => {
      const key = cb.dataset.key;
      const set = key === "hidden_sections" ? hs : ho;
      cb.checked ? set.delete(cb.dataset.id) : set.add(cb.dataset.id);
      const { data, error } = await sb.from("app_config").update({ [key]: [...set], updated_at: new Date().toISOString() }).eq("id", 1).select();
      if (error || !data?.length) return toast(error?.message || "Kaydedilemedi", true);
      toast(cb.checked ? "Gösteriliyor" : "Gizlendi");
      show();
    }),
  );
}

const RENDER = {
  ozet,
  satislar,
  abonelikler,
  uyeler,
  destek,
  gecmis,
  cihazlar,
  planlar,
  kampanya,
  "deneme-pro": (el) => denemePro(el, show),
  reklamlar: (el) => reklamlar(el, show),
  kuponlar: (el) => kuponlar(el, show),
  "pro-ozellikleri": (el) => proOzellikleri(el, show),
  "ses-paketleri": (el) => sesPaketleri(el, show),
  "site-gorselleri": siteGorselleri,
  mesajlar,
  "tum-mesajlar": tumMesajlar,
  gorunurluk,
  kayitlar: (el) => kayitlar(el, logNav),
};

/** Moderasyon kaydından ilgili bölüme git: arama kutusu olanlar dolu açılır, diğerlerinde öğe vurgulanır */
async function logNav(sec, q) {
  if (sec === "uyeler") userQ = q || "";
  if (sec === "pro-ozellikleri") setProFeatureQuery(q);
  if (!sections.some(([k]) => k === sec)) return;
  section = sec;
  await show();
  if (!q || sec === "uyeler" || sec === "pro-ozellikleri") return;
  const needle = String(q).toLocaleLowerCase("tr");
  const hit = [...$$("#content tr, #content .card")].reverse().find((e) => e.textContent.toLocaleLowerCase("tr").includes(needle));
  if (hit) {
    hit.scrollIntoView({ block: "center", behavior: "smooth" });
    hit.style.outline = "2px solid var(--accent)";
    setTimeout(() => (hit.style.outline = ""), 2600);
  }
}

async function show() {
  if (!sections.some(([k]) => k === section)) section = sections[0][0];
  history.replaceState(null, "", "#" + section);
  $$(".side button").forEach((b) => b.classList.toggle("on", b.dataset.s === section));
  const el = $("#content");
  window.onresize = null;
  el.innerHTML = `<p class="muted">Yükleniyor…</p>`;
  try {
    await (RENDER[section] || ozet)(el);
  } catch (e) {
    el.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
  }
}

async function main() {
  await boot("/yonetim", "admin");
  const p = await myProfile(true);
  if (!p) {
    app().innerHTML = `<div class="page"><div class="card auth-box"><h2>Yönetim</h2><p class="muted">Yönetim paneli için giriş yap.</p><a class="btn btn-accent" href="hesap.html">Giriş yap</a></div></div>`;
    return;
  }
  isAdm = !!p.is_admin;
  // Moderasyon kayıtlarını sadece site sahibi okur
  if (!p.is_owner) sections = sections.filter(([k]) => k !== "kayitlar");
  if (!isAdm) {
    // Moderatör: sadece destek talepleri (silme yok; yetkiyi sunucu denetler)
    const perms = await rpc("my_perms").catch(() => []);
    if (!(perms || []).includes("reports.view")) {
      app().innerHTML = `<div class="page"><div class="msg bad">Bu sayfa sadece yöneticiler içindir.</div></div>`;
      return;
    }
    sections = SECTIONS.filter(([k]) => k === "destek");
  }
  app().innerHTML = `<div class="page admin-layout">
    <aside class="side">${sections.map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("")}</aside>
    <div id="content"></div>
  </div>`;
  $$(".side button").forEach((b) =>
    b.addEventListener("click", () => {
      section = b.dataset.s;
      show();
    }),
  );
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h && h !== section && RENDER[h] && sections.some(([k]) => k === h)) {
      section = h;
      show();
    }
  });
  show();
}
main();
