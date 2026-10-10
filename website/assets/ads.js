// Reklam ver: reklam veren yer, fiyat modeli (gösterim paketi / süre), görsel, metin, bağlantı ve hedef dili seçer,
// canlı önizlemeyi ve toplam fiyatı görür, "Öde" ile ödeme sayfasına (Paddle) gider (ads-checkout).
// Ödeme gelince reklam kendiliğinden yayına girer. "Reklamlarım": durum, gösterim / tıklama, kalan.
import { $, $$, ADS_PAGE, T, addDict, appConfig, boot, currentUser, esc, fmtDate, fmtMoney, openCheckout, region, sb, toast } from "./core.js";
import { AD_PLACES, adHtml, adImg } from "./adslot.js";
import { couponBox, couponPrice, getCoupon, strikeHtml } from "./coupon.js";

addDict({
  ad_title: ["Reklam ver", "Advertise"],
  ad_lead: [
    "SRTR Pitwall programında ve sitesinde sim racing topluluğuna ulaş. Yeri ve paketi seç, görselini yükle, öde — reklamın otomatik olarak yayına girsin.",
    "Reach the sim racing community in the SRTR Pitwall app and website. Pick a placement and package, upload your creative, pay — your ad goes live automatically.",
  ],
  ad_mine: ["Reklamlarım", "My ads"],
  ad_new: ["Yeni reklam", "New ad"],
  ad_editing: ["Düzenleniyor: {0}", "Editing: {0}"],
  ad_step_place: ["1. Reklam yeri", "1. Placement"],
  ad_step_price: ["2. Fiyat modeli", "2. Pricing model"],
  ad_step_image: ["3. Görsel", "3. Creative"],
  ad_step_text: ["4. Metin ve bağlantı", "4. Text and link"],
  ad_step_target: ["5. Hedef kitle", "5. Audience"],
  ad_pl_panel_banner: ["Uygulama · geniş banner", "App · wide banner"],
  ad_pl_panel_card: ["Uygulama · kare kart", "App · square card"],
  ad_pl_site_home: ["Site · ana sayfa banner", "Website · home banner"],
  ad_pl_site_account: ["Site · hesap sayfası kartı", "Website · account page card"],
  ad_pd_panel_banner: ["Programın kontrol panelinde sayfa altında geniş banner.", "Wide banner at the bottom of pages in the app's control panel."],
  ad_pd_panel_card: ["Programın Topluluk ana sayfasında kare kart.", "Square card on the app's Community home."],
  ad_pd_site_home: ["pitwall.simracetr.com ana sayfasında geniş banner.", "Wide banner on the pitwall.simracetr.com home page."],
  ad_pd_site_account: ["Sitede üyelerin hesap sayfasında kart.", "Card on members' account page on the website."],
  ad_size: ["{0}×{1} px", "{0}×{1} px"],
  ad_per_1000: ["1.000 gösterim: {0}", "1,000 views: {0}"],
  ad_per_day: ["Günlük: {0}", "Per day: {0}"],
  ad_off: ["Satışta değil", "Not available"],
  ad_model_imp: ["Gösterim paketi", "Impressions"],
  ad_model_days: ["Süre", "Duration"],
  ad_imp_n: ["{0} gösterim", "{0} views"],
  ad_days_n: ["{0} gün", "{0} days"],
  ad_model_imp_hint: [
    "Reklamın satın aldığın gösterim sayısına ulaşana kadar yayında kalır. Reklam en az yarısı 1 saniye göründüğünde sayılır; aynı kişi 30 dakikada bir kez sayılır.",
    "Your ad runs until it reaches the purchased number of views. A view counts when at least half of the ad is visible for 1 second; the same person counts once per 30 minutes.",
  ],
  ad_model_days_hint: [
    "Reklamın ödeme onaylandığı andan itibaren seçtiğin süre boyunca, gösterim sınırı olmadan yayında kalır (aynı yerdeki diğer reklamlarla dönüşümlü).",
    "Your ad runs for the chosen period from the moment payment is confirmed, with no view limit (rotating with other ads in the same placement).",
  ],
  ad_img_hint: [
    "Önerilen boyut {0}×{1} piksel (en boy oranı aynı olmalı), en fazla 2 MB. PNG, JPG, WEBP ya da GIF.",
    "Recommended size {0}×{1} px (same aspect ratio), max 2 MB. PNG, JPG, WEBP or GIF.",
  ],
  ad_img_type: ["Sadece PNG, JPG, WEBP ya da GIF yüklenebilir.", "Only PNG, JPG, WEBP or GIF can be uploaded."],
  ad_img_big: ["Görsel en fazla 2 MB olabilir.", "The image can be at most 2 MB."],
  ad_img_ratio: ["Görselin en boy oranı {0}×{1} ile aynı olmalı (seninki {2}×{3}).", "The image must have the same aspect ratio as {0}×{1} (yours is {2}×{3})."],
  ad_img_small: ["Görsel en az {0}×{1} piksel olmalı.", "The image must be at least {0}×{1} px."],
  ad_img_ok: ["Görsel uygun: {0}×{1}", "Image OK: {0}×{1}"],
  ad_img_need: ["Bir görsel seç.", "Choose an image."],
  ad_img_keep: ["Mevcut görsel kullanılıyor. Değiştirmek için yenisini seç.", "Using the current image. Choose a new one to replace it."],
  ad_f_title: ["Başlık", "Title"],
  ad_f_body: ["Kısa metin (isteğe bağlı)", "Short text (optional)"],
  ad_f_url: ["Hedef bağlantı", "Target link"],
  ad_title_need: ["Başlık yaz (en fazla 60 karakter).", "Enter a title (max 60 characters)."],
  ad_url_bad: ["Bağlantı https:// ile başlayan geçerli bir adres olmalı.", "The link must be a valid address starting with https://."],
  ad_t_tr: ["Türkçe kullananlar", "Turkish-speaking users"],
  ad_t_other: ["Diğer dillerdeki kullanıcılar", "Users of other languages"],
  ad_t_hint: [
    "İkisi de seçiliyse herkese gösterilir. Dil, programın ya da sitenin dil ayarından belirlenir.",
    "If both are selected the ad is shown to everyone. Language comes from the app or website language setting.",
  ],
  ad_t_need: ["En az bir hedef seç.", "Select at least one audience."],
  ad_preview: ["Önizleme", "Preview"],
  ad_preview_empty: ["Görsel seçince reklamın burada, yayında göründüğü gibi görünür.", "Once you choose an image, your ad appears here exactly as it will look live."],
  ad_sum_place: ["Yer", "Placement"],
  ad_sum_pkg: ["Paket", "Package"],
  ad_total: ["Toplam", "Total"],
  ad_pay: ["Öde", "Pay"],
  ad_paying: ["Ödeme sayfası açılıyor…", "Opening checkout…"],
  ad_side_note: [
    "Ödeme sonrası reklamın otomatik olarak yayına girer. PRO üyeler reklam görmez; oyun içi overlay'lerde reklam gösterilmez.",
    "After payment your ad goes live automatically. PRO members don't see ads; ads are never shown in in-game overlays.",
  ],
  ad_rules_title: ["Reklam kuralları", "Ad rules"],
  ad_rules: [
    "<ul><li>Yasa dışı, yetişkin, kumar, nefret söylemi, dolandırıcılık ya da yanıltıcı içerik kabul edilmez.</li><li>Bağlantı https ile başlamalı ve reklamdaki içerikle ilgili olmalı.</li><li>Kullanıcılar reklamı sağ tıklayıp raporlayabilir; rapor sayısı sınırı aşınca reklam otomatik gizlenir ve incelenir.</li><li>Kurallara aykırı reklamlar durdurulabilir ya da reddedilebilir; reddedilen reklamlar için destek talebiyle iade isteyebilirsin.</li></ul>",
    "<ul><li>Illegal, adult, gambling, hateful, fraudulent or misleading content is not accepted.</li><li>The link must start with https and be related to the ad.</li><li>Users can right-click an ad to report it; when reports reach the limit the ad is hidden automatically and reviewed.</li><li>Ads that break the rules may be paused or rejected; for rejected ads you can request a refund via a support ticket.</li></ul>",
  ],
  ad_login_lead: ["Reklam vermek için giriş yap ya da ücretsiz hesap aç.", "Sign in or create a free account to advertise."],
  ad_login_btn: ["Giriş yap / Kayıt ol", "Sign in / Sign up"],
  ad_closed: ["Reklam alımı şu an kapalı. Daha sonra tekrar dene.", "Ad sales are currently closed. Please try again later."],
  ad_paid_msg: [
    "Ödemen alındı, teşekkürler! Reklamın birkaç saniye içinde aşağıdaki listede yayında (ya da inceleniyor) olarak görünecek.",
    "Payment received, thank you! Within a few seconds your ad will show as live (or under review) in the list below.",
  ],
  ad_none: ["Henüz reklamın yok.", "You don't have any ads yet."],
  ad_col_ad: ["Reklam", "Ad"],
  ad_col_status: ["Durum", "Status"],
  ad_col_progress: ["İlerleme", "Progress"],
  ad_col_stats: ["Tıklama", "Clicks"],
  ad_col_price: ["Tutar", "Amount"],
  ad_st_unpaid: ["Ödeme bekliyor", "Awaiting payment"],
  ad_st_pending_review: ["İnceleniyor", "Under review"],
  ad_st_active: ["Yayında", "Live"],
  ad_st_paused: ["Durduruldu", "Paused"],
  ad_st_paused_reports: ["Durduruldu (raporlar)", "Paused (reports)"],
  ad_st_paused_owner: ["Senin tarafından durduruldu", "Paused by you"],
  ad_st_ended: ["Bitti", "Ended"],
  ad_st_rejected: ["Reddedildi", "Rejected"],
  ad_st_refunded: ["İade edildi", "Refunded"],
  ad_left_imp: ["{0} / {1} gösterim · {2} kaldı", "{0} / {1} views · {2} left"],
  ad_left_days: ["{0} gösterim · bitiş {1}", "{0} views · ends {1}"],
  ad_ctr: ["{0} · TO {1}", "{0} · CTR {1}"],
  ad_edit: ["Düzenle", "Edit"],
  ad_delete: ["Sil", "Delete"],
  ad_del_q: ["Bu reklam silinsin mi?", "Delete this ad?"],
  ad_note: ["Not: {0}", "Note: {0}"],
  ad_imp_left: ["{0} gösterim kaldı", "{0} views left"],
  ad_imp_used: ["{0} / {1} gösterim", "{0} / {1} views"],
  ad_time_left_d: ["{0} gün {1} saat kaldı", "{0}d {1}h left"],
  ad_time_left_h: ["{0} saat kaldı", "{0}h left"],
  ad_time_left_m: ["{0} dakika kaldı", "{0} min left"],
  ad_time_over: ["Süre doldu", "Time is up"],
  ad_time_wait: ["Süre yayına girince başlar", "Time starts when the ad goes live"],
  ad_ends_at: ["Bitiş: {0}", "Ends: {0}"],
  ad_views_n: ["{0} gösterim", "{0} views"],
  ad_pause: ["Durdur", "Pause"],
  ad_resume: ["Devam ettir", "Resume"],
  ad_paused_ok: ["Reklamın durduruldu; gösterim harcamıyor.", "Your ad is paused and no longer uses views."],
  ad_resumed_ok: ["Reklamın yeniden yayında.", "Your ad is live again."],
  ad_pause_note: [
    "Gösterim paketli reklamlarını istediğin zaman durdurup devam ettirebilirsin; durdurulan reklam gösterilmez ve kalan gösterimlerin harcanmaz. Süreli reklamlar durdurulamaz, süre işlemeye devam eder.",
    "You can pause and resume impression-package ads at any time; a paused ad is not shown and your remaining views are not used. Time-based ads can't be paused — their time keeps running.",
  ],
});

const PLACES = Object.keys(AD_PLACES);
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DEF_PRICING = {
  currency: "USD",
  impressions: [1000, 5000, 10000, 50000],
  days: [1, 3, 7, 14, 30],
  placements: {},
};

const app = () => $("#app");
let cfg = {};
let user = null;
let pr = DEF_PRICING;
const st = {
  editId: null,
  placement: "site_home",
  model: "impressions",
  qty: 5000,
  title: "",
  body: "",
  url: "https://",
  langs: ["tr", "other"],
  file: null,
  fileUrl: "",
  image: "", // düzenlenen reklamın mevcut görsel yolu
  imgErr: "",
  imgInfo: "",
};

// Türkiye'deki ziyaretçiye, o yer için TL fiyatı girilmişse TL fiyatları; diğerlerine genel (USD) fiyat.
// Sunucudaki public.ad_price ile aynı kural.
const rawPlace = (id) => pr.placements?.[id] ?? {};
const trPriced = (id) => region === "tr" && (Number(rawPlace(id).cpm_tr) > 0 || Number(rawPlace(id).day_tr) > 0);
const place = (id) => {
  const p = rawPlace(id);
  return trPriced(id)
    ? { on: p.on, cpm: Number(p.cpm_tr) || 0, day: Number(p.day_tr) || 0, cur: pr.currency_tr || "TRY" }
    : { on: p.on, cpm: Number(p.cpm) || 0, day: Number(p.day) || 0, cur: pr.currency || "USD" };
};
const onSale = (id) => place(id).on !== false && (Number(place(id).cpm) > 0 || Number(place(id).day) > 0);
const money = (n, id = st.placement) => fmtMoney(n, place(id).cur);
function priceOf(pl, model, qty) {
  const p = place(pl);
  const v = model === "impressions" ? (Number(p.cpm) || 0) * (qty / 1000) : (Number(p.day) || 0) * qty;
  return Math.round(v * 100) / 100;
}
const fmtN = (n) => Number(n || 0).toLocaleString(document.documentElement.lang || "en");
const pkgLabel = (model, qty) => T(model === "impressions" ? "ad_imp_n" : "ad_days_n", fmtN(qty));

// ---------------------------------------------------------------------------
// Görsel denetimi: tür, boyut, en boy oranı (%5 tolerans), en az önerilenin yarısı
// ---------------------------------------------------------------------------
function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("img"));
    i.src = src;
  });
}
async function checkImage() {
  st.imgErr = "";
  st.imgInfo = "";
  const src = st.fileUrl || (st.image ? adImg(st.image) : "");
  if (!src) return;
  if (st.file) {
    if (!TYPES.includes(st.file.type)) return (st.imgErr = T("ad_img_type"));
    if (st.file.size > 2 * 1024 * 1024) return (st.imgErr = T("ad_img_big"));
  }
  try {
    const img = await loadImg(src);
    const { w, h } = AD_PLACES[st.placement];
    const r = img.naturalWidth / img.naturalHeight;
    if (Math.abs(r - w / h) / (w / h) > 0.05) return (st.imgErr = T("ad_img_ratio", w, h, img.naturalWidth, img.naturalHeight));
    if (img.naturalWidth < w / 2 || img.naturalHeight < h / 2) return (st.imgErr = T("ad_img_small", w / 2, h / 2));
    st.imgInfo = T("ad_img_ok", img.naturalWidth, img.naturalHeight);
  } catch {
    st.imgErr = T("ad_img_type");
  }
}

function validate() {
  if (!onSale(st.placement)) return T("ad_off");
  if (!st.fileUrl && !st.image) return T("ad_img_need");
  if (st.imgErr) return st.imgErr;
  const title = st.title.trim();
  if (!title || title.length > 60) return T("ad_title_need");
  if (!/^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/\S*)?$/.test(st.url.trim()) || st.url.length > 500) return T("ad_url_bad");
  if (!st.langs.length) return T("ad_t_need");
  if (!(priceOf(st.placement, st.model, st.qty) > 0)) return T("ad_off");
  return "";
}

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------
function placeCard(id, selectable) {
  const p = place(id);
  const sale = onSale(id);
  const { w, h } = AD_PLACES[id];
  const prices = sale
    ? `${Number(p.cpm) > 0 ? `<span>${esc(T("ad_per_1000", money(p.cpm, id)))}</span>` : ""}${Number(p.day) > 0 ? `<span>${esc(T("ad_per_day", money(p.day, id)))}</span>` : ""}`
    : `<span>${esc(T("ad_off"))}</span>`;
  const inner = `<span class="adp-shape" style="aspect-ratio:${w}/${h}"></span>
    <b>${esc(T("ad_pl_" + id))}</b>
    <small class="muted">${esc(T("ad_pd_" + id))}</small>
    <small class="muted">${esc(T("ad_size", w, h))}</small>
    <span class="adp-prices">${prices}</span>`;
  return selectable
    ? `<button type="button" class="adp${st.placement === id ? " on" : ""}" data-pl="${id}" ${sale ? "" : "disabled"}>${inner}</button>`
    : `<div class="adp">${inner}</div>`;
}

function pkgButtons() {
  const list = st.model === "impressions" ? pr.impressions : pr.days;
  return list
    .map(
      (q) =>
        `<button type="button" class="adq${st.qty === q ? " on" : ""}" data-q="${q}"><b>${esc(pkgLabel(st.model, q))}</b><span>${esc(
          money(priceOf(st.placement, st.model, q)),
        )}</span></button>`,
    )
    .join("");
}

/** Uygulanan kupon bu reklam modelinde (impressions / days) geçerliyse kupon */
const adCoupon = (model = st.model) => {
  const c = getCoupon("ad");
  return c && (c.ad_models || []).includes(model) ? c : null;
};

/** Toplam: kupon geçerliyse eski fiyat üstü çizili + indirimli fiyat */
function totalHtml() {
  const price = priceOf(st.placement, st.model, st.qty);
  const c = adCoupon();
  if (c && price > 0) return `<span class="ad-total">${strikeHtml(money(price), money(couponPrice(price, c.percent)))}</span>`;
  const bad = getCoupon("ad") && !c ? `<br><span class="muted small">${esc(T("cp_not_here"))}</span>` : "";
  return `<b class="ad-total">${esc(money(price))}</b>${bad}`;
}

function drawSide() {
  const pv = $("#ad-pv");
  if (!pv) return;
  const src = st.fileUrl || (st.image ? adImg(st.image) : "");
  pv.innerHTML = src
    ? `<div class="ad-pv-frame ad-pv-${st.placement}">${adHtml(
        { title: st.title.trim() || T("ad_f_title"), body: st.body.trim(), url: st.url, image: st.image },
        st.placement,
        src,
      )}</div>`
    : `<div class="ad-pv-empty ad-pv-${st.placement}" style="aspect-ratio:${AD_PLACES[st.placement].w}/${AD_PLACES[st.placement].h}"><span>${esc(T("ad_preview_empty"))}</span></div>`;
  $("#ad-sum").innerHTML = `<dt>${esc(T("ad_sum_place"))}</dt><dd>${esc(T("ad_pl_" + st.placement))}</dd>
    <dt>${esc(T("ad_sum_pkg"))}</dt><dd>${esc(pkgLabel(st.model, st.qty))}</dd>
    <dt>${esc(T("ad_total"))}</dt><dd>${totalHtml()}</dd>`;
  const err = validate();
  $("#ad-err").innerHTML = err && (st.title || st.fileUrl || st.image) ? `<div class="msg bad">${esc(err)}</div>` : "";
  $("#ad-payb").disabled = !!err;
  $("#img-msg").innerHTML = st.imgErr
    ? `<div class="msg bad">${esc(st.imgErr)}</div>`
    : st.imgInfo
      ? `<div class="msg good">${esc(st.imgInfo)}${!st.file && st.image ? ` · ${esc(T("ad_img_keep"))}` : ""}</div>`
      : "";
  $("#c-title").textContent = `${st.title.length}/60`;
  $("#c-body").textContent = `${st.body.length}/120`;
}

function drawForm() {
  $("#ad-places").innerHTML = PLACES.map((id) => placeCard(id, true)).join("");
  $("#ad-model").innerHTML = `<button type="button" data-m="impressions" class="${st.model === "impressions" ? "on" : ""}">${esc(T("ad_model_imp"))}</button>
    <button type="button" data-m="days" class="${st.model === "days" ? "on" : ""}">${esc(T("ad_model_days"))}</button>`;
  $("#ad-pkgs").innerHTML = pkgButtons();
  $("#ad-model-hint").textContent = T(st.model === "impressions" ? "ad_model_imp_hint" : "ad_model_days_hint");
  $("#ad-img-hint").textContent = T("ad_img_hint", AD_PLACES[st.placement].w, AD_PLACES[st.placement].h);
  $$("[data-pl]").forEach((b) =>
    b.addEventListener("click", async () => {
      st.placement = b.dataset.pl;
      await checkImage();
      drawForm();
    }),
  );
  $$("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      if (st.model === b.dataset.m) return;
      st.model = b.dataset.m;
      const list = st.model === "impressions" ? pr.impressions : pr.days;
      st.qty = list[Math.min(1, list.length - 1)] ?? list[0];
      drawForm();
    }),
  );
  $$("[data-q]").forEach((b) =>
    b.addEventListener("click", () => {
      st.qty = +b.dataset.q;
      drawForm();
    }),
  );
  $("#ad-edit-note").innerHTML = st.editId
    ? `<div class="msg">${esc(T("ad_editing", st.title))} · <button class="linkbtn" id="ad-new">${esc(T("ad_new"))}</button></div>`
    : "";
  $("#ad-new")?.addEventListener("click", () => {
    resetForm();
    render();
  });
  drawSide();
}

function resetForm() {
  Object.assign(st, { editId: null, title: "", body: "", url: "https://", langs: ["tr", "other"], file: null, fileUrl: "", image: "", imgErr: "", imgInfo: "" });
}

async function render() {
  const paid = new URLSearchParams(location.search).get("paid");
  const head = `<div class="page-head"><div><h1>${esc(T("ad_title"))}</h1><p class="muted" style="margin:6px 0 0;max-width:760px">${esc(T("ad_lead"))}</p></div>
    ${user ? `<a class="btn" href="#mine">${esc(T("ad_mine"))}</a>` : ""}</div>`;
  const rules = `<div class="card"><h3>${esc(T("ad_rules_title"))}</h3><div class="muted small ad-rules">${T("ad_rules")}</div></div>`;

  // Reklam alımı kapalıyken giriş yapmamış ziyaretçiye fiyatlar da gösterilmez
  if (!user && !cfg.ads_enabled) {
    app().innerHTML = `<div class="page">${head}<div class="msg">${esc(T("ad_closed"))}</div></div>`;
    return;
  }
  if (!user) {
    app().innerHTML = `<div class="page">${head}
      <div class="grid g4 ad-places-ro">${PLACES.map((id) => placeCard(id, false)).join("")}</div>
      <div class="card" style="margin:18px 0;text-align:center">
        <p>${esc(T("ad_login_lead"))}</p>
        <a class="btn btn-accent" href="hesap.html?next=reklam">${esc(T("ad_login_btn"))}</a>
      </div>${rules}</div>`;
    return;
  }
  if (!cfg.ads_enabled) {
    app().innerHTML = `<div class="page">${head}<div class="msg">${esc(T("ad_closed"))}</div>
      <div class="card" id="mine"><h3>${esc(T("ad_mine"))}</h3><div id="mine-body"><p class="muted small">${esc(T("loading"))}</p></div></div></div>`;
    drawMine();
    return;
  }

  app().innerHTML = `<div class="page">${head}
    ${paid ? `<div class="msg good">${esc(T("ad_paid_msg"))}</div>` : ""}
    <div id="ad-edit-note"></div>
    <div class="ad-grid">
      <div class="stack">
        <div class="card"><h3>${esc(T("ad_step_place"))}</h3><div class="ad-places" id="ad-places"></div></div>
        <div class="card"><h3>${esc(T("ad_step_price"))}</h3>
          <div class="seg" id="ad-model"></div>
          <div class="ad-pkgs" id="ad-pkgs"></div>
          <p class="muted small" id="ad-model-hint" style="margin:10px 0 0"></p>
        </div>
        <div class="card"><h3>${esc(T("ad_step_image"))}</h3>
          <input type="file" id="ad-file" accept="${TYPES.join(",")}">
          <p class="muted small" id="ad-img-hint" style="margin:8px 0"></p>
          <div id="img-msg"></div>
        </div>
        <div class="card"><h3>${esc(T("ad_step_text"))}</h3>
          <div class="field"><label>${esc(T("ad_f_title"))} <span class="muted" id="c-title"></span></label><input id="ad-title" maxlength="60" value="${esc(st.title)}"></div>
          <div class="field"><label>${esc(T("ad_f_body"))} <span class="muted" id="c-body"></span></label><input id="ad-body" maxlength="120" value="${esc(st.body)}"></div>
          <div class="field"><label>${esc(T("ad_f_url"))}</label><input id="ad-url" type="url" maxlength="500" placeholder="https://" value="${esc(st.url)}"></div>
        </div>
        <div class="card"><h3>${esc(T("ad_step_target"))}</h3>
          <div class="stack" style="gap:8px">
            <label class="chk"><input type="checkbox" data-lang="tr" ${st.langs.includes("tr") ? "checked" : ""}><span>${esc(T("ad_t_tr"))}</span></label>
            <label class="chk"><input type="checkbox" data-lang="other" ${st.langs.includes("other") ? "checked" : ""}><span>${esc(T("ad_t_other"))}</span></label>
          </div>
          <p class="muted small" style="margin:10px 0 0">${esc(T("ad_t_hint"))}</p>
        </div>
      </div>
      <aside class="ad-side">
        <div class="card">
          <h3>${esc(T("ad_preview"))}</h3>
          <div id="ad-pv"></div>
          <dl class="kv" id="ad-sum" style="margin:16px 0"></dl>
          <div id="ad-cp"></div>
          <div id="ad-err"></div>
          <button class="btn btn-accent btn-lg" id="ad-payb" style="width:100%">${esc(T("ad_pay"))}</button>
          <p class="muted small" style="margin:12px 0 0">${esc(T("ad_side_note"))}</p>
        </div>
      </aside>
    </div>
    <div class="card" id="mine" style="margin-top:22px"><h3>${esc(T("ad_mine"))}</h3><div id="mine-body"><p class="muted small">${esc(T("loading"))}</p></div></div>
    <div style="margin-top:16px">${rules}</div>
  </div>`;

  $("#ad-file").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (st.fileUrl) URL.revokeObjectURL(st.fileUrl);
    st.file = f || null;
    st.fileUrl = f ? URL.createObjectURL(f) : "";
    await checkImage();
    drawSide();
  });
  const bind = (id, key) =>
    $(id).addEventListener("input", (e) => {
      st[key] = e.target.value;
      drawSide();
    });
  bind("#ad-title", "title");
  bind("#ad-body", "body");
  bind("#ad-url", "url");
  $$("[data-lang]").forEach((cb) =>
    cb.addEventListener("change", () => {
      st.langs = $$("[data-lang]")
        .filter((x) => x.checked)
        .map((x) => x.dataset.lang);
      drawSide();
    }),
  );
  $("#ad-payb").addEventListener("click", pay);
  couponBox($("#ad-cp"), { product: "ad", onChange: () => drawSide() });
  await checkImage();
  drawForm();
  drawMine();
  if (paid) pollPaid(paid);
}

// ---------------------------------------------------------------------------
// Kaydet + öde
// ---------------------------------------------------------------------------
async function checkout(id, coupon = null) {
  const body = { ad_id: id, embed: true };
  if (coupon) body.coupon = coupon;
  const { data, error } = await sb.functions.invoke("ads-checkout", { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json();
      msg = j?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (!data?.url) throw new Error(T("error"));
  const how = await openCheckout(data, () => {
    toast(T("pay_ok"));
    // Mevcut ?paid= dönüşü: bilgi mesajı + webhook işlenene kadar liste yenilenir
    setTimeout(() => (location.href = "reklam.html?paid=" + encodeURIComponent(id)), 2500);
  });
  if (how === "overlay") {
    // Ödeme katmanı sayfanın üstünde açık; vazgeçilirse sayfa kullanılabilir kalsın
    const btn = $("#ad-payb");
    if (btn) {
      btn.disabled = false;
      btn.textContent = T("ad_pay");
    }
    drawMine();
  }
}

async function pay() {
  const err = validate();
  if (err) return toast(err, true);
  const btn = $("#ad-payb");
  btn.disabled = true;
  btn.textContent = T("ad_paying");
  let uploaded = "";
  try {
    let path = st.image;
    if (st.file) {
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[st.file.type] || "png";
      path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("ads").upload(path, st.file, { contentType: st.file.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      uploaded = path;
    }
    const { data: id, error } = await sb.rpc("ad_save", {
      p_id: st.editId,
      p_placement: st.placement,
      p_model: st.model,
      p_quantity: st.qty,
      p_title: st.title.trim(),
      p_body: st.body.trim(),
      p_url: st.url.trim(),
      p_image: path,
      p_langs: st.langs,
      p_region: region === "tr" ? "tr" : "intl",
    });
    if (error) throw error;
    // Düzenlenen reklamın eski görseli artık kullanılmıyor
    if (uploaded && st.image && st.image !== uploaded) sb.storage.from("ads").remove([st.image]).then(() => {}, () => {});
    st.editId = id;
    st.image = path;
    st.file = null;
    uploaded = "";
    await checkout(id, adCoupon()?.code);
  } catch (e) {
    if (uploaded) sb.storage.from("ads").remove([uploaded]).then(() => {}, () => {});
    toast(e.message || String(e), true);
    btn.disabled = false;
    btn.textContent = T("ad_pay");
    drawMine();
  }
}

// ---------------------------------------------------------------------------
// Reklamlarım
// ---------------------------------------------------------------------------
let mine = [];

// Kalan gösterim ya da kalan süre: metin + ilerleme çubuğu (dolu kısım = harcanan)
function progress(a) {
  const bar = (frac, cls = "") =>
    `<div class="meter ad-meter ${cls}"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%"></i></div>`;
  const line = (main, sub = "") => `<div class="ad-prog"><b>${esc(main)}</b>${sub ? `<span class="muted">${esc(sub)}</span>` : ""}`;
  const notRun = ["unpaid", "pending_review", "rejected"].includes(a.status);
  const paused = ["paused", "paused_reports", "paused_owner"].includes(a.status);
  if (a.model === "impressions") {
    const left = Math.max(0, a.quantity - a.impressions);
    if (notRun) return line(pkgLabel(a.model, a.quantity)) + "</div>";
    return (
      line(a.status === "ended" ? T("ad_st_ended") : T("ad_imp_left", fmtN(left)), T("ad_imp_used", fmtN(a.impressions), fmtN(a.quantity))) +
      bar(a.quantity ? a.impressions / a.quantity : 1, paused ? "dim" : a.status === "ended" ? "done" : "") +
      "</div>"
    );
  }
  if (notRun || !a.ends_at) return line(pkgLabel(a.model, a.quantity), notRun ? T("ad_time_wait") : "") + "</div>";
  const end = new Date(a.ends_at).getTime();
  const start = a.starts_at ? new Date(a.starts_at).getTime() : end - a.quantity * 86400000;
  const ms = end - Date.now();
  const over = ms <= 0 || a.status === "ended" || a.status === "refunded";
  const h = Math.floor(ms / 3600000);
  const main = over
    ? a.status === "ended" ? T("ad_st_ended") : T("ad_time_over")
    : h >= 24 ? T("ad_time_left_d", fmtN(Math.floor(h / 24)), fmtN(h % 24))
      : h >= 1 ? T("ad_time_left_h", fmtN(h))
        : T("ad_time_left_m", fmtN(Math.max(1, Math.ceil(ms / 60000))));
  return (
    line(main, `${T("ad_ends_at", fmtDate(a.ends_at, true))} · ${T("ad_views_n", fmtN(a.impressions))}`) +
    bar(over ? 1 : (Date.now() - start) / Math.max(1, end - start), paused ? "dim" : over ? "done" : "") +
    "</div>"
  );
}

async function drawMine() {
  const el = $("#mine-body");
  if (!el) return;
  const { data, error } = await sb.from("ad_campaigns").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return (el.innerHTML = `<div class="msg bad">${esc(error.message)}</div>`);
  mine = data || [];
  if (!mine.length) return (el.innerHTML = `<p class="muted small">${esc(T("ad_none"))}</p>`);
  const tone = { active: "ok", pending_review: "warn", unpaid: "warn", paused: "bad", paused_reports: "bad", paused_owner: "warn", rejected: "bad" };
  el.innerHTML = `<div class="table-scroll"><table class="list ad-mine"><thead><tr>
      <th>${esc(T("ad_col_ad"))}</th><th>${esc(T("ad_col_status"))}</th><th>${esc(T("ad_col_progress"))}</th><th>${esc(T("ad_col_stats"))}</th><th class="num">${esc(T("ad_col_price"))}</th><th></th>
    </tr></thead><tbody>${mine
      .map((a) => {
        const ctr = a.impressions ? ((a.clicks / a.impressions) * 100).toFixed(2) + "%" : "—";
        const canPause = a.model === "impressions" && (a.status === "active" || a.status === "paused_owner");
        return `<tr>
          <td><div class="ad-mine-ad"><img src="${esc(adImg(a.image))}" alt="" loading="lazy"><div><b>${esc(a.title)}</b><br><span class="muted small">${esc(
            T("ad_pl_" + a.placement),
          )} · ${esc(pkgLabel(a.model, a.quantity))}</span>${a.review_note ? `<br><span class="muted small">${esc(T("ad_note", a.review_note))}</span>` : ""}</div></div></td>
          <td><span class="badge ${tone[a.status] || ""}">${esc(T("ad_st_" + a.status))}</span></td>
          <td class="small">${progress(a)}</td>
          <td class="small">${esc(T("ad_ctr", fmtN(a.clicks), ctr))}</td>
          <td class="num">${esc(fmtMoney(Number(a.paid_amount ?? a.price), a.currency))}</td>
          <td class="ad-mine-act">${
            a.status === "unpaid"
              ? `<button class="btn btn-sm btn-accent" data-pay="${a.id}">${esc(T("ad_pay"))}</button>
                 <button class="btn btn-sm" data-edit="${a.id}">${esc(T("ad_edit"))}</button>
                 <button class="btn btn-sm btn-ghost" data-del="${a.id}">${esc(T("ad_delete"))}</button>`
              : canPause
                ? a.status === "active"
                  ? `<button class="btn btn-sm" data-pause="${a.id}">${esc(T("ad_pause"))}</button>`
                  : `<button class="btn btn-sm btn-accent" data-resume="${a.id}">${esc(T("ad_resume"))}</button>`
                : ""
          }</td>
        </tr>`;
      })
      .join("")}</tbody></table></div>
    ${mine.some((a) => a.model === "impressions" && !["unpaid", "rejected", "refunded"].includes(a.status)) ? `<p class="muted small ad-mine-note">${esc(T("ad_pause_note"))}</p>` : ""}`;
  const toggle = async (b, pause) => {
    b.disabled = true;
    const { error } = await sb.rpc("ad_owner_pause", { p_ad: pause ? b.dataset.pause : b.dataset.resume, p_pause: pause });
    if (error) {
      b.disabled = false;
      return toast(error.message, true);
    }
    toast(T(pause ? "ad_paused_ok" : "ad_resumed_ok"));
    drawMine();
  };
  $$("[data-pause]", el).forEach((b) => b.addEventListener("click", () => toggle(b, true)));
  $$("[data-resume]", el).forEach((b) => b.addEventListener("click", () => toggle(b, false)));
  $$("[data-pay]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const a = mine.find((x) => x.id === b.dataset.pay);
        await checkout(b.dataset.pay, a ? adCoupon(a.model)?.code : null);
      } catch (e) {
        toast(e.message || String(e), true);
        b.disabled = false;
      }
    }),
  );
  $$("[data-edit]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      const a = mine.find((x) => x.id === b.dataset.edit);
      if (!a) return;
      resetForm();
      Object.assign(st, {
        editId: a.id,
        placement: a.placement,
        model: a.model,
        qty: a.quantity,
        title: a.title,
        body: a.body,
        url: a.url,
        langs: a.langs?.length ? a.langs : ["tr", "other"],
        image: a.image,
      });
      await render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }),
  );
  $$("[data-del]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm(T("ad_del_q"))) return;
      const { data: img, error } = await sb.rpc("ad_delete", { p_ad: b.dataset.del });
      if (error) return toast(error.message, true);
      if (img) sb.storage.from("ads").remove([img]).then(() => {}, () => {});
      if (st.editId === b.dataset.del) {
        resetForm();
        render();
      } else drawMine();
    }),
  );
}

// Ödemeden dönülünce webhook işlenene kadar listeyi birkaç kez yenile
function pollPaid(id) {
  let n = 0;
  const tick = async () => {
    await drawMine();
    const a = mine.find((x) => x.id === id);
    if (a && a.status !== "unpaid") return;
    if (++n < 10) setTimeout(tick, 3000);
  };
  setTimeout(tick, 2500);
}

async function main() {
  if (!ADS_PAGE) return location.replace("index.html");
  await boot("/reklam", "ads");
  [cfg, user] = await Promise.all([appConfig().catch(() => ({})), currentUser()]);
  pr = { ...DEF_PRICING, ...(cfg.ad_pricing || {}) };
  pr.impressions = (pr.impressions || []).map(Number).filter((x) => x > 0);
  pr.days = (pr.days || []).map(Number).filter((x) => x > 0);
  const firstSale = PLACES.find(onSale);
  if (firstSale && !onSale(st.placement)) st.placement = firstSale;
  if (!pr.impressions.includes(st.qty)) st.qty = pr.impressions[Math.min(1, pr.impressions.length - 1)] ?? 1000;
  await render();
  sb.auth.onAuthStateChange(async (_e, s) => {
    const u = s?.user ?? null;
    if ((u?.id ?? null) !== (user?.id ?? null)) {
      user = u;
      render();
    }
  });
  document.addEventListener("langchange", () => render());
}
main();
