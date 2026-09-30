// Yönetim paneli (sadece yöneticiler): site ve satış istatistikleri, ödemeler, abonelikler,
// üyeler (PRO süresi verme / uzatma / alma), süre geçmişi, cihaz uyarıları, planlar ve fiyatlar.
// Yetkiyi sunucu denetler: admin_* fonksiyonları yönetici olmayana hata döner.
import { $, $$, PLANS, appConfig, boot, daysLeft, esc, fmtDate, fmtMoney, myProfile, sb, toast } from "./core.js";

const app = () => $("#app");
let section = location.hash.slice(1) || "ozet";
let range = 30;

const SECTIONS = [
  ["ozet", "Özet"],
  ["satislar", "Satışlar"],
  ["abonelikler", "Abonelikler"],
  ["uyeler", "Üyeler"],
  ["gecmis", "Süre geçmişi"],
  ["cihazlar", "Cihazlar"],
  ["planlar", "Planlar ve fiyatlar"],
];

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
  return `<span class="badge ${d <= 15 ? "warn" : "pro"}">PRO · ${d} gün</span>`;
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
  const [s, a] = await Promise.all([rpc("admin_site_stats", { p_days: range }), rpc("admin_stats").catch(() => ({}))]);
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
    <div class="card table-scroll"><table class="list"><thead><tr><th>Tarih</th><th>Üye</th><th>Kaynak</th><th>Plan</th><th class="num">Tutar</th></tr></thead><tbody id="pay-body"></tbody></table></div>`;
  $$("#srcs button", el).forEach((b) =>
    b.addEventListener("click", () => {
      src = b.dataset.s;
      $$("#srcs button", el).forEach((x) => x.classList.toggle("on", x === b));
      draw();
    }),
  );
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
    <div class="field"><label>Not (gün eklerken geçmişe yazılır)</label><input id="mnote" maxlength="200" placeholder="ör. yayın desteği, hata telafisi"></div>
    <div class="row" style="margin-bottom:10px">
      ${[7, 30, 90, 180, 365].map((d) => `<button class="btn btn-sm" data-add="${d}">+${d} gün</button>`).join("")}
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
  const after = async (msg) => {
    toast(msg);
    close();
    await done?.();
  };
  const add = async (days) => {
    if (!days) return;
    try {
      const nu = await rpc("admin_extend_pro", { p_user: u.id, p_days: days, p_note: note() });
      after(`Yeni bitiş: ${fmtDate(nu, true)}`);
    } catch (e) {
      toast(e.message, true);
    }
  };
  const setUntil = async (date, label) => {
    try {
      await rpc("admin_set_pro", { p_user: u.id, p_until: date ? date.toISOString() : null });
      after(label);
    } catch (e) {
      toast(e.message, true);
    }
  };
  $$("[data-add]", bg).forEach((b) => b.addEventListener("click", () => add(+b.dataset.add)));
  $("#madd", bg).addEventListener("click", () => add(parseInt($("#mdays", bg).value, 10)));
  $("#mset", bg).addEventListener("click", () => {
    const v = $("#mdate", bg).value;
    if (v) setUntil(new Date(v + "T23:59:00"), "Tarih ayarlandı");
  });
  $("#mforever", bg).addEventListener("click", () => setUntil(new Date("2099-12-31T00:00:00Z"), "Süresiz PRO verildi"));
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

const RENDER = { ozet, satislar, abonelikler, uyeler, gecmis, cihazlar, planlar };

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
