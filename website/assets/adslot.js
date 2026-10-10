// Sitedeki reklam alanları: <div data-ad="site_home"></div> gibi yer tutucuları doldurur.
// PRO üyelere ve reklamlar kapalıyken sunucu boş döner (alan gizli kalır). Yarısı en az 1 saniye
// göründüğünde gösterim sayılır; sağ tık menüsünden reklam raporlanır (giriş gerekir).
import { $, $$, ADS_PAGE, SUPABASE_URL, T, addDict, currentUser, esc, lang, sb, visitorId } from "./core.js";

addDict({
  ad_tag: ["Reklam", "Ad"],
  ad_report: ["Reklamı raporla", "Report this ad"],
  ad_report_login: ["Raporlamak için giriş yap", "Sign in to report"],
  ad_advertise: ["Reklam ver", "Advertise here"],
  ad_go_pro: ["Reklamsız kullan (PRO)", "Go ad-free (PRO)"],
  ad_report_q: ["Bu reklamda sorun ne?", "What's wrong with this ad?"],
  ad_r_inappropriate: ["Uygunsuz", "Inappropriate"],
  ad_r_misleading: ["Yanıltıcı / dolandırıcılık", "Misleading / scam"],
  ad_r_spam: ["Spam", "Spam"],
  ad_r_other: ["Diğer", "Other"],
  ad_report_note: ["Açıklama (isteğe bağlı)", "Details (optional)"],
  ad_send: ["Gönder", "Send"],
  ad_close: ["Kapat", "Close"],
  ad_report_pick: ["Bir sebep seç.", "Pick a reason."],
  ad_report_done: [
    "Teşekkürler. Raporun yöneticilere iletildi; bu reklamı artık görmeyeceksin.",
    "Thanks. Your report was sent to the admins; you won't see this ad again.",
  ],
  ad_report_dup: ["Bu reklamı zaten raporladın.", "You already reported this ad."],
  ad_rclick: ["Sağ tık: raporla", "Right-click to report"],
});

/** Yerleşim yerleri ve önerilen görsel boyutu (program ile aynı: src/cloud/ads.ts) */
export const AD_PLACES = {
  panel_banner: { w: 1200, h: 150 },
  panel_card: { w: 600, h: 600 },
  site_home: { w: 1200, h: 240 },
  site_account: { w: 600, h: 400 },
};
export const AD_REASONS = ["inappropriate", "misleading", "spam", "other"];

export const adImg = (path) => `${SUPABASE_URL}/storage/v1/object/public/ads/${String(path).split("/").map(encodeURIComponent).join("/")}`;

/** Reklamın görünümü (önizleme de aynı görünümü kullanır) */
export function adHtml(ad, placement, imgSrc) {
  const href = /^https:\/\//.test(ad.url || "") ? ad.url : "#";
  return `<div class="ad-slot ad-${esc(placement)}">
    <a class="ad-body" href="${esc(href)}" target="_blank" rel="noopener sponsored nofollow" translate="no">
      <img class="ad-img" src="${esc(imgSrc ?? adImg(ad.image))}" alt="${esc(ad.title || "")}" loading="lazy" draggable="false">
      <span class="ad-text"><b>${esc(ad.title || "")}</b>${ad.body ? `<small>${esc(ad.body)}</small>` : ""}</span>
    </a>
    <span class="ad-tag" title="${esc(T("ad_rclick"))}">${esc(T("ad_tag"))}</span>
  </div>`;
}

function closeMenu() {
  $(".ad-menu")?.remove();
}
window.addEventListener("pointerdown", (e) => {
  if (!e.target.closest?.(".ad-menu")) closeMenu();
});
window.addEventListener("scroll", closeMenu, true);

async function openMenu(e, ad, reload) {
  e.preventDefault();
  closeMenu();
  const u = await currentUser();
  const m = document.createElement("div");
  m.className = "ad-menu";
  m.style.left = Math.min(e.clientX, window.innerWidth - 240) + "px";
  m.style.top = Math.min(e.clientY, window.innerHeight - 140) + "px";
  m.innerHTML = `<button data-a="report">⚑ ${esc(T(u ? "ad_report" : "ad_report_login"))}</button>
    ${ADS_PAGE ? `<a href="reklam.html">📣 ${esc(T("ad_advertise"))}</a>` : ""}
    <a href="index.html#pricing">★ ${esc(T("ad_go_pro"))}</a>`;
  document.body.appendChild(m);
  m.querySelector("[data-a=report]").addEventListener("click", () => {
    closeMenu();
    if (!u) location.href = "hesap.html";
    else reportDialog(ad, reload);
  });
}

function reportDialog(ad, reload) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal">
    <div class="row between"><h3 style="margin:0">${esc(T("ad_report"))}</h3><button class="btn btn-sm btn-ghost" data-x>${esc(T("ad_close"))}</button></div>
    <p class="muted small" style="margin:4px 0 12px">${esc(ad.title)}</p>
    <div id="adr-body">
      <p class="small" style="margin:0 0 8px">${esc(T("ad_report_q"))}</p>
      <div class="stack" style="gap:8px;margin-bottom:12px">${AD_REASONS.map(
        (r) => `<label class="chk"><input type="radio" name="adr" value="${r}"><span>${esc(T("ad_r_" + r))}</span></label>`,
      ).join("")}</div>
      <div class="field"><textarea id="adr-note" rows="3" maxlength="500" placeholder="${esc(T("ad_report_note"))}"></textarea></div>
      <div id="adr-err"></div>
      <button class="btn btn-accent" id="adr-send">${esc(T("ad_send"))}</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  let done = false;
  const close = () => {
    bg.remove();
    if (done) reload();
  };
  bg.addEventListener("click", (e) => e.target === bg && close());
  bg.querySelector("[data-x]").addEventListener("click", close);
  bg.querySelector("#adr-send").addEventListener("click", async (e) => {
    const reason = bg.querySelector("input[name=adr]:checked")?.value;
    const err = bg.querySelector("#adr-err");
    if (!reason) return (err.innerHTML = `<div class="msg bad">${esc(T("ad_report_pick"))}</div>`);
    e.target.disabled = true;
    const { error } = await sb.rpc("ad_report", { p_ad: ad.id, p_reason: reason, p_note: bg.querySelector("#adr-note").value.trim() });
    e.target.disabled = false;
    if (error && !/zaten/i.test(error.message)) return (err.innerHTML = `<div class="msg bad">${esc(error.message)}</div>`);
    done = true;
    bg.querySelector("#adr-body").innerHTML = `<div class="msg good">${esc(T(error ? "ad_report_dup" : "ad_report_done"))}</div>
      <button class="btn" data-x2>${esc(T("ad_close"))}</button>`;
    bg.querySelector("[data-x2]").addEventListener("click", close);
  });
}

function observe(el, ad) {
  let timer;
  let counted = false;
  const io = new IntersectionObserver(
    (entries) => {
      const vis = entries.some((x) => x.isIntersecting && x.intersectionRatio >= 0.5);
      clearTimeout(timer);
      if (!vis || counted) return;
      timer = setTimeout(() => {
        if (document.visibilityState !== "visible" || !el.isConnected) return;
        counted = true;
        io.disconnect();
        sb.rpc("ad_impression", { p_ad: ad.id, p_visitor: visitorId() }).then(
          () => {},
          () => {},
        );
      }, 1000);
    },
    { threshold: [0, 0.5, 1] },
  );
  io.observe(el);
}

/** Tek bir yer tutucuyu doldur */
export async function mountAd(el) {
  const placement = el.dataset.ad;
  el.hidden = true;
  try {
    const { data: ad } = await sb.rpc("ad_pick", { p_placement: placement, p_lang: lang, p_visitor: visitorId() });
    if (!ad || !/^https:\/\//.test(ad.url || "")) return;
    el.innerHTML = adHtml(ad, placement);
    el.hidden = false;
    const slot = el.firstElementChild;
    slot.querySelector(".ad-body").addEventListener("click", () => {
      sb.rpc("ad_click", { p_ad: ad.id, p_visitor: visitorId() }).then(
        () => {},
        () => {},
      );
    });
    slot.addEventListener("contextmenu", (e) => openMenu(e, ad, () => mountAd(el)));
    observe(slot, ad);
  } catch {
    el.hidden = true;
  }
}

/** Sayfadaki tüm reklam yer tutucularını doldur */
export function mountAds(root = document) {
  $$("[data-ad]", root).forEach((el) => mountAd(el));
}

// Dil değişince (metinler) yeniden çiz
document.addEventListener("langchange", () => {
  $$("[data-ad]").forEach((el) => {
    const tag = el.querySelector(".ad-tag");
    if (tag) {
      tag.textContent = T("ad_tag");
      tag.title = T("ad_rclick");
    }
  });
});
