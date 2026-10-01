// Yönetim paneli (sadece yöneticiler): site ve satış istatistikleri, ödemeler, abonelikler,
// üyeler (PRO süresi verme / uzatma / alma), süre geçmişi, cihaz uyarıları, planlar ve fiyatlar.
// Yetkiyi sunucu denetler: admin_* fonksiyonları yönetici olmayana hata döner.
import { $, $$, PLANS, appConfig, boot, daysLeft, esc, fmtDate, fmtMoney, myProfile, sb, toast } from "./core.js";
import { reklamlar } from "./ads-admin.js";

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
  ["reklamlar", "Reklamlar"],
  ["gorunurluk", "Görünürlük"],
];

// Programdaki overlay'ler (src/overlays/*/manifest.ts); yeni overlay eklenince buraya da eklenmeli.
// Listede olmayan ama gizlenmiş ya da PRO'ya ayrılmış kimlikler de ayrıca gösterilir.
const OVERLAYS = [
  ["battlebox", "Battle Box"],
  ["corners", "Viraj Analizi"],
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
  ["radar", "Görsel Spotter"],
  ["rejoin", "Piste Dönüş"],
  ["relative", "Relative"],
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

async function planlar(el) {
  const c = await appConfig();
  const f = (k, label, ph = "", type = "text") =>
    `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(c[k] ?? "")}" placeholder="${esc(ph)}"></div>`;
  el.innerHTML = `<h2>Planlar ve fiyatlar</h2>
    <p class="muted small">Buradaki fiyatlar ve ödeme bağlantıları hem sitede hem programda görünür. Ödeme bağlantısı: Lemon Squeezy → ürün → varyant → Share.
      Türkiye'den girenler (saat dilimi Türkiye olanlar) TL fiyatını ve TL bağlantısını görür, diğer herkes genel fiyatı. Sitede <code>?region=tr</code> ya da <code>?region=intl</code> ekleyerek iki görünümü de deneyebilirsin.</p>
    <form id="pf" class="stack">
      <div class="grid g2">
        ${PLANS.map(
          (p) => `<div class="card"><h3>${p.tr}</h3>
            <p class="small muted" style="margin:0 0 8px"><b>Diğer ülkeler</b> (USD / EUR)</p>
            ${f(p.price, "Fiyat metni", "ör. $4.99 ya da €4,99")}${f(p.checkout, "Lemon Squeezy ödeme bağlantısı", "https://….lemonsqueezy.com/buy/…")}
            <p class="small muted" style="margin:6px 0 8px"><b>Türkiye</b> (TL) — boş bırakılırsa Türkiye'de de yukarıdaki kullanılır</p>
            ${f(p.trPrice, "Fiyat metni (TL)", "ör. 149₺")}${f(p.trCheckout, "Lemon Squeezy ödeme bağlantısı (TL varyantı)", "https://….lemonsqueezy.com/buy/…")}
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
    for (const [k, v] of fd.entries()) patch[k] = k === "device_limit" ? Math.max(1, parseInt(String(v), 10) || 2) : String(v).trim();
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
      <div class="row between"><div><b>${esc(t.subject)}</b><br><span class="muted small">${esc(t.display_name || "—")} · ${esc(t.email || "")} · ${esc(SUPPORT_CATS[t.category] || t.category)} · ${proBadge(t.pro_until)}</span></div>
        <button class="btn btn-sm" id="sp-st">${t.status === "closed" ? "Yeniden aç" : "Talebi kapat"}</button></div>
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
        <div class="row between"><input type="file" id="sp-files" accept="image/*" multiple style="width:auto"><button class="btn btn-accent">Yanıtla</button></div>
      </form>`;
    const mb = $(".sp-msgs", box);
    mb.scrollTop = mb.scrollHeight;
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

const RENDER = { ozet, satislar, abonelikler, uyeler, destek, gecmis, cihazlar, planlar, kampanya, reklamlar: (el) => reklamlar(el, show), gorunurluk };

async function show() {
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
  if (!p.is_admin) {
    app().innerHTML = `<div class="page"><div class="msg bad">Bu sayfa sadece yöneticiler içindir.</div></div>`;
    return;
  }
  app().innerHTML = `<div class="page admin-layout">
    <aside class="side">${SECTIONS.map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("")}</aside>
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
    if (h && h !== section && RENDER[h]) {
      section = h;
      show();
    }
  });
  show();
}
main();
