// Hesap sayfası: giriş / kayıt / şifre sıfırlama (e-postadaki 6 haneli kodla) ve hesap paneli
// (profil, PRO durumu, satın alma, abonelik yönetimi, ödeme geçmişi).
import {
  $,
  $$,
  T,
  PLANS,
  addDict,
  appConfig,
  applyLang,
  boot,
  checkoutUrl,
  daysLeft,
  esc,
  fmtDate,
  fmtMoney,
  isProCheckout,
  lang,
  myProfile,
  planFor,
  planName,
  promoUntil,
  rememberChoice,
  sb,
  setRememberMe,
  startProCheckout,
  toast,
  region,
} from "./core.js";
import { attachEmoji } from "./emoji.js";
import { mountProfileEditor } from "./profile.js";
import { maybeClaimTrial } from "./trial.js";
import { couponBox, decoratePlans, proCouponFor } from "./coupon.js";

addDict({
  a_login: ["Giriş yap", "Sign in"],
  a_signup: ["Kayıt ol", "Sign up"],
  a_email: ["E-posta", "E-mail"],
  a_password: ["Şifre", "Password"],
  a_password_new: ["Yeni şifre (en az 6 karakter)", "New password (min. 6 characters)"],
  a_name: ["Görünen ad", "Display name"],
  a_forgot: ["Şifremi unuttum", "Forgot password"],
  a_remember: ["Beni hatırla", "Remember me"],
  a_code: ["E-postadaki 6 haneli kod", "6-digit code from the e-mail"],
  a_verify: ["Doğrula", "Verify"],
  a_resend: ["Kodu yeniden gönder", "Resend code"],
  a_code_sent: ["{0} adresine bir kod gönderdik. Kodu aşağıya yaz.", "We sent a code to {0}. Enter it below."],
  a_reset_sent: ["Şifre sıfırlama kodu {0} adresine gönderildi.", "A password reset code was sent to {0}."],
  a_send_code: ["Kod gönder", "Send code"],
  a_set_password: ["Şifreyi değiştir", "Change password"],
  a_back: ["Girişe dön", "Back to sign in"],
  a_same_account: [
    "Bu hesapla SRTR Pitwall programına da giriş yaparsın (program → Hesap).",
    "Use this account to sign in to the SRTR Pitwall app too (app → Account).",
  ],
  a_buy_after: ["Giriş yapınca ödeme sayfasına yönlendirileceksin.", "After signing in you'll be taken to checkout."],
  a_opening_checkout: ["Ödeme sayfası açılıyor…", "Opening checkout…"],
  a_paid_pro: [
    "Ödemen alındı, teşekkürler! PRO birkaç saniye içinde hesabına işlenir; görünmezse sayfayı yenile.",
    "Payment received, thank you! PRO is applied to your account within a few seconds; refresh the page if you don't see it.",
  ],
  a_title: ["Hesabım", "My account"],
  a_tele_title: ["Telemetri", "Telemetry"],
  a_tele_public: ["Telemetri verilerimi başkaları görebilsin", "Let others see my telemetry"],
  ep_title: ["E-posta bildirimleri", "E-mail notifications"],
  ep_lead: [
    "Hangi bildirimlerin e-postayla da gelmesini istediğini seç. Uygulama içi bildirimler her zaman gelir.",
    "Choose which notifications should also be sent by e-mail. In-app notifications always arrive.",
  ],
  ep_friends: ["Arkadaşlık istekleri", "Friend requests"],
  ep_friends_sub: ["Sana gelen arkadaşlık istekleri", "Friend requests you receive"],
  ep_teams: ["Takım bildirimleri", "Team notifications"],
  ep_teams_sub: ["Davet, katılma isteği, kabul, duyuru, yöneticilik", "Invites, join requests, approvals, announcements, admin roles"],
  ep_support: ["Destek yanıtları", "Support replies"],
  ep_support_sub: ["Destek talebine yanıt geldiğinde", "When your support ticket gets a reply"],
  ep_ads: ["Reklam durumu", "Ad status"],
  ep_ads_sub: ["Reklamın yayına alındı, reddedildi ya da bitti", "Your ad went live, was rejected or ended"],
  ep_pro: ["PRO hatırlatmaları", "PRO reminders"],
  ep_pro_sub: ["PRO üyeliğinin bitmesine 10 gün ve 1 gün kala", "10 days and 1 day before your PRO membership ends"],
  ep_shots: ["Ekran görüntüleri", "Screenshots"],
  ep_shots_sub: ["6 ay açılmadığı için silinen ekran görüntüleri", "Screenshots deleted after 6 months without views"],
  ep_always: ["Hesap ve ödeme e-postaları", "Account and payment e-mails"],
  ep_always_sub: [
    "Ödeme makbuzları, hediye PRO, PRO süresi değişiklikleri ve giriş kodları her zaman gönderilir",
    "Payment receipts, gifted PRO, PRO changes and sign-in codes are always sent",
  ],
  ep_always_on: ["Her zaman açık", "Always on"],
  a_tele_lead: [
    "Programın kaydettiği turların, kişisel en iyilerin ve tur izlerin diğer üyelere açık olur. Kapalıyken sadece sen ve takım arkadaşların görebilir.",
    "Laps recorded by the app, your personal bests and lap traces are visible to other members. When off, only you and your teammates can see them.",
  ],
  a_tele_open: ["Telemetrimi gör", "View my telemetry"],
  a_logout: ["Çıkış yap", "Sign out"],
  a_profile: ["Profil", "Profile"],
  a_iracing: ["iRacing adı", "iRacing name"],
  a_pay_email: ["Ödeme e-postası (Patreon/Ko-fi farklıysa)", "Payment e-mail (if different on Patreon/Ko-fi)"],
  a_member_since: ["Üyelik", "Member since"],
  a_pro: ["PRO üyelik", "PRO membership"],
  a_pro_active: ["PRO aktif", "PRO active"],
  a_pro_none: ["PRO değil", "Not PRO"],
  a_pro_days: ["gün kaldı", "days left"],
  a_pro_until: ["Bitiş", "Ends"],
  a_pro_source: ["Kaynak", "Source"],
  a_renewing: ["Kendiliğinden yenilenir", "Renews automatically"],
  a_not_renewing: ["Yenilenmeyecek", "Won't renew"],
  a_next_renew: ["Sonraki yenileme", "Next renewal"],
  a_manage: ["Aboneliği yönet / iptal et", "Manage / cancel subscription"],
  a_buy_title: ["PRO satın al ya da uzat", "Buy or extend PRO"],
  a_buy_note: [
    "Ödeme sayfasında hesabın otomatik eşlenir; ödeme olunca PRO birkaç saniyede açılır. Süren varsa üstüne eklenir.",
    "Your account is linked automatically at checkout; PRO turns on within seconds. Existing time is extended.",
  ],
  a_patreon_note: [
    "Patreon ile ödersen, Patreon e-postan bu hesabın e-postasıyla ya da yukarıdaki ödeme e-postasıyla aynı olmalı. Patreon ile sadece aylık abonelik alınabilir.",
    "If you pay on Patreon, your Patreon e-mail must match this account's e-mail or the payment e-mail above. Patreon offers the monthly subscription only.",
  ],
  a_payments: ["Ödeme geçmişi", "Payment history"],
  a_no_payments: ["Henüz ödeme yok.", "No payments yet."],
  a_date: ["Tarih", "Date"],
  a_plan: ["Plan", "Plan"],
  a_amount: ["Tutar", "Amount"],
  a_refund: ["İade", "Refund"],
  a_app: ["Program", "The app"],
  a_app_lead: [
    "SRTR Pitwall'u indir, kur ve <b>Hesap</b> sayfasından bu e-posta ve şifreyle giriş yap. Ayarların buluta yedeklenir, PRO özellikleri açılır.",
    "Download and install SRTR Pitwall, then sign in on the <b>Account</b> page with this e-mail and password. Your settings are backed up and PRO features unlock.",
  ],
  a_download: ["Programı indir", "Download the app"],
  a_admin_link: ["Yönetim paneline git", "Go to the admin panel"],
  a_err_confirm: ["E-postan henüz onaylanmamış. Kodu gönderdik, aşağıya yaz.", "Your e-mail isn't confirmed yet. We sent a code, enter it below."],
  a_security: ["Güvenlik", "Security"],
  a_promo_active: ["Kampanya ile PRO: {0} tarihine kadar tüm PRO özellikleri açık.", "PRO via promotion: every PRO feature is unlocked until {0}."],
  s_title: ["Destek", "Support"],
  s_lead: [
    "Bir sorun mu var ya da önerin mi? Talep aç; yanıt geldiğinde bildirim ve e-posta alırsın.",
    "Having a problem or a suggestion? Open a ticket; you'll get a notification and an e-mail when we reply.",
  ],
  s_new: ["Yeni talep", "New ticket"],
  s_none: ["Henüz talebin yok.", "You have no tickets yet."],
  s_category: ["Konu başlığı", "Topic"],
  s_cat_bug: ["Hata bildirimi", "Bug report"],
  s_cat_overlay: ["Overlay / görünüm", "Overlay / appearance"],
  s_cat_payment: ["Ödeme / abonelik", "Payment / subscription"],
  s_cat_account: ["Hesap", "Account"],
  s_cat_feature: ["Öneri / istek", "Suggestion / request"],
  s_cat_other: ["Diğer", "Other"],
  s_subject: ["Başlık", "Subject"],
  s_subject_ph: ["Kısaca ne oldu?", "What happened, in short?"],
  s_message: ["Mesaj", "Message"],
  s_message_ph: ["Ne yapıyordun, ne bekliyordun, ne oldu?", "What were you doing, what did you expect, what happened?"],
  s_images: ["Görseller (en fazla 4)", "Images (up to 4)"],
  s_add_image: ["+ Görsel", "+ Image"],
  s_send: ["Gönder", "Send"],
  s_sending: ["Gönderiliyor…", "Sending…"],
  s_reply_ph: ["Mesajın…", "Your message…"],
  s_status_open: ["Açık", "Open"],
  s_status_answered: ["Yanıtlandı", "Answered"],
  s_status_closed: ["Kapalı", "Closed"],
  s_close: ["Talebi kapat", "Close ticket"],
  s_reopen: ["Yeniden aç", "Reopen"],
  s_team: ["Destek ekibi", "Support team"],
  s_new_reply: ["Yeni yanıt", "New reply"],
  s_closed_note: ["Bu talep kapalı. Yazarsan yeniden açılır.", "This ticket is closed. Writing will reopen it."],
  s_required: ["Başlık ve mesaj gerekli.", "Subject and message are required."],
  s_created: ["Talebin gönderildi.", "Your ticket was sent."],
  s_too_big: ["Görsel çok büyük (en fazla 5 MB).", "Image too large (max 5 MB)."],
  s_back: ["← Taleplerim", "← My tickets"],
  s_emoji: ["İfade ekle", "Insert emoji"],
  g_title: ["🎁 Hediye PRO", "🎁 Gift PRO"],
  g_lead: [
    "Kayıtlı bir üyeye PRO aboneliği hediye et. Ödemeyi sen yaparsın, PRO onun hesabına işlenir; istediğin zaman sonlandırabilirsin.",
    "Gift a PRO subscription to a registered member. You pay, PRO is applied to their account, and you can end it anytime.",
  ],
  g_search_ph: ["Üye ara (görünen ad ya da iRacing adı)", "Search members (display name or iRacing name)"],
  g_search: ["Ara", "Search"],
  g_min: ["En az 2 harf yaz.", "Type at least 2 letters."],
  g_none: ["Kimse bulunamadı.", "No one found."],
  g_pick: ["Seç", "Select"],
  g_to: ["Alıcı", "Recipient"],
  g_change: ["Değiştir", "Change"],
  g_plan_pick: ["Plan seç ve öde:", "Pick a plan and pay:"],
  g_note: [
    "Ödeme sayfasında senin e-postan kullanılır; fatura ve yenileme ödemeleri sana aittir. Alıcının e-postası kimseyle paylaşılmaz. Alıcının PRO süresi varsa hediye üstüne eklenir.",
    "Your own e-mail is used at checkout; invoices and renewal charges are yours. The recipient's e-mail is never shared. If they already have PRO, the gift is added on top.",
  ],
  g_unavailable: ["Hediye PRO şu an kullanılamıyor.", "Gift PRO isn't available right now."],
  g_mine: ["Hediye ettiğim abonelikler", "Subscriptions I gifted"],
  g_mine_none: ["Henüz kimseye PRO hediye etmedin.", "You haven't gifted PRO to anyone yet."],
  g_active: ["Aktif", "Active"],
  g_cancelled: ["İptal edildi – bitiş {0}", "Cancelled – ends {0}"],
  g_expired: ["Sona erdi", "Ended"],
  g_next: ["Sonraki yenileme: {0}", "Next renewal: {0}"],
  g_end: ["Sonlandır", "End"],
  g_end_q: [
    "Hediye sonlandırılsın mı? Artık yenilenmez; {0} ödenen dönemin sonuna kadar PRO kalır.",
    "End this gift? It won't renew; {0} keeps PRO until the paid period ends.",
  ],
  g_end_yes: ["Evet, sonlandır", "Yes, end it"],
  g_ended: ["Hediye sonlandırıldı.", "The gift was ended."],
  g_from: ["🎁 {0} tarafından hediye edildi", "🎁 Gifted by {0}"],
  g_from_ended: ["Hediye sonlandırıldı; PRO {0} tarihine kadar sürer.", "The gift was ended; PRO lasts until {0}."],
  g_for: ["Hediye: {0}", "Gift: {0}"],
  a_paid_gift: [
    "Hediye ödemen alındı, teşekkürler! PRO birkaç saniye içinde alıcının hesabına işlenir.",
    "Gift payment received, thank you! PRO is applied to the recipient's account within a few seconds.",
  ],
});

let mode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "login";
let buyPlan = new URLSearchParams(location.search).get("buy");
let pendingEmail = "";

const app = () => $("#app");

// ---------------------------------------------------------------------------
// Giriş / kayıt
// ---------------------------------------------------------------------------
function authView(msg = "", bad = false) {
  const tabs = `<div class="tabs"><button data-m="login" class="${mode === "login" ? "on" : ""}">${T("a_login")}</button><button data-m="signup" class="${mode === "signup" ? "on" : ""}">${T("a_signup")}</button></div>`;
  const note = msg ? `<div class="msg ${bad ? "bad" : ""}">${msg}</div>` : "";
  let body = "";
  if (mode === "login") {
    body = `<form id="f">
      <div class="field"><label>${T("a_email")}</label><input name="email" type="email" autocomplete="email" required value="${esc(pendingEmail)}"></div>
      <div class="field"><label>${T("a_password")}</label><input name="password" type="password" autocomplete="current-password" required></div>
      <label class="chk small" style="margin:-2px 0 14px"><input type="checkbox" name="remember"${rememberChoice() ? " checked" : ""}><span>${T("a_remember")}</span></label>
      <button class="btn btn-accent" style="width:100%">${T("a_login")}</button>
      <p class="small" style="margin-top:12px"><button type="button" class="linkbtn" id="forgot">${T("a_forgot")}</button></p>
    </form>`;
  } else if (mode === "signup") {
    body = `<form id="f">
      <div class="field"><label>${T("a_name")}</label><input name="name" autocomplete="nickname" maxlength="40" required></div>
      <div class="field"><label>${T("a_email")}</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>${T("a_password_new")}</label><input name="password" type="password" autocomplete="new-password" minlength="6" required></div>
      <button class="btn btn-accent" style="width:100%">${T("a_signup")}</button>
    </form>`;
  } else if (mode === "verify") {
    body = `<form id="f">
      <div class="field"><label>${T("a_code")}</label><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
      <button class="btn btn-accent" style="width:100%">${T("a_verify")}</button>
      <p class="small row between" style="margin-top:12px"><button type="button" class="linkbtn" id="resend">${T("a_resend")}</button><button type="button" class="linkbtn" data-m="login">${T("a_back")}</button></p>
    </form>`;
  } else if (mode === "forgot") {
    body = `<form id="f">
      <div class="field"><label>${T("a_email")}</label><input name="email" type="email" required value="${esc(pendingEmail)}"></div>
      <button class="btn btn-accent" style="width:100%">${T("a_send_code")}</button>
      <p class="small" style="margin-top:12px"><button type="button" class="linkbtn" data-m="login">${T("a_back")}</button></p>
    </form>`;
  } else if (mode === "reset") {
    body = `<form id="f">
      <div class="field"><label>${T("a_code")}</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required></div>
      <div class="field"><label>${T("a_password_new")}</label><input name="password" type="password" minlength="6" autocomplete="new-password" required></div>
      <button class="btn btn-accent" style="width:100%">${T("a_set_password")}</button>
      <p class="small" style="margin-top:12px"><button type="button" class="linkbtn" data-m="login">${T("a_back")}</button></p>
    </form>`;
  }
  app().innerHTML = `<div class="auth-box">
    <div class="card">
      ${mode === "login" || mode === "signup" ? tabs : `<h2 style="font-size:26px">${mode === "verify" ? T("a_verify") : T("a_forgot")}</h2>`}
      ${buyPlan ? `<div class="msg">${T("a_buy_after")}</div>` : ""}
      ${note}${body}
    </div>
    <p class="muted small" style="text-align:center;margin-top:14px">${T("a_same_account")}</p>
  </div>`;
  $$("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.m;
      authView();
    }),
  );
  $("#forgot")?.addEventListener("click", () => {
    pendingEmail = $("#f [name=email]")?.value || pendingEmail;
    mode = "forgot";
    authView();
  });
  $("#resend")?.addEventListener("click", async () => {
    const { error } = await sb.auth.resend({ type: "signup", email: pendingEmail });
    error ? toast(error.message, true) : toast(T("a_code_sent", pendingEmail));
  });
  $("#f").addEventListener("submit", onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector("button.btn-accent");
  btn.disabled = true;
  try {
    if (mode === "login") {
      pendingEmail = String(f.get("email")).trim();
      // Oturumun nerede saklanacağı girişten önce belirlenir (işaretsiz: tarayıcı kapanınca çıkış)
      setRememberMe(f.get("remember") === "on");
      const { error } = await sb.auth.signInWithPassword({ email: pendingEmail, password: String(f.get("password")) });
      if (error) {
        if (/confirm/i.test(error.message)) {
          await sb.auth.resend({ type: "signup", email: pendingEmail });
          mode = "verify";
          return authView(T("a_err_confirm"));
        }
        throw error;
      }
      return afterLogin();
    }
    if (mode === "signup") {
      pendingEmail = String(f.get("email")).trim();
      const { data, error } = await sb.auth.signUp({
        email: pendingEmail,
        password: String(f.get("password")),
        options: { data: { display_name: String(f.get("name")).trim(), lang } },
      });
      if (error) throw error;
      if (data.session) return afterLogin();
      mode = "verify";
      return authView(T("a_code_sent", esc(pendingEmail)));
    }
    if (mode === "verify") {
      const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token: String(f.get("code")).replace(/\s/g, ""), type: "signup" });
      if (error) throw error;
      return afterLogin();
    }
    if (mode === "forgot") {
      pendingEmail = String(f.get("email")).trim();
      const { error } = await sb.auth.resetPasswordForEmail(pendingEmail);
      if (error) throw error;
      mode = "reset";
      return authView(T("a_reset_sent", esc(pendingEmail)));
    }
    if (mode === "reset") {
      const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token: String(f.get("code")).replace(/\s/g, ""), type: "recovery" });
      if (error) throw error;
      const { error: e2 } = await sb.auth.updateUser({ password: String(f.get("password")) });
      if (e2) throw e2;
      toast(T("saved"));
      return afterLogin();
    }
  } catch (err) {
    authView(esc(err.message || String(err)), true);
  } finally {
    btn.disabled = false;
  }
}

/** ?next= : sadece aynı sitedeki basit bir sayfa adı (ör. "crew.html?d=…"); şema, eğik çizgi, başka alan adı kabul edilmez */
function safeNext() {
  const n = new URLSearchParams(location.search).get("next") || "";
  return /^[a-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/.test(n) && !n.startsWith("hesap.html") ? n : "";
}

async function afterLogin() {
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  // Reklam ver sayfasından gelindiyse oraya dön
  if (u && new URLSearchParams(location.search).get("next") === "reklam") {
    location.href = "reklam.html";
    return;
  }
  // Başka bir sayfadan (ör. crew.html) girişe gönderildiyse oraya dön
  const nextPage = safeNext();
  if (u && nextPage) {
    location.href = nextPage;
    return;
  }
  // Fiyatlardan gelindiyse doğrudan ödemeye
  if (u && buyPlan) {
    const cfg = await appConfig().catch(() => ({}));
    const p = PLANS.find((x) => x.id === buyPlan);
    const link = p && planFor(cfg, p).checkout;
    buyPlan = null;
    if (link && isProCheckout(link)) {
      app().innerHTML = `<p class="muted page">${T("a_opening_checkout")}</p>`;
      if (await startProCheckout(p.id)) return;
    } else if (link) {
      location.href = checkoutUrl(link, u);
      return;
    }
  }
  history.replaceState(null, "", "hesap.html" + (location.hash === "#destek" || location.hash === "#eposta" ? location.hash : ""));
  render();
}

// ---------------------------------------------------------------------------
// Hesap paneli
// ---------------------------------------------------------------------------
async function dashboard(u) {
  const [prof, cfg, pro, pays, gifts] = await Promise.all([
    myProfile(true),
    appConfig().catch(() => ({})),
    sb.rpc("my_pro").then((r) => r.data ?? null),
    sb.rpc("my_payments").then((r) => r.data ?? []),
    sb.rpc("my_gifts").then((r) => r.data ?? [], () => []),
  ]);
  const p = prof || {};
  const d = daysLeft(p.pro_until);
  const promo = promoUntil(cfg);
  const active = p.is_admin || (d !== null && d > 0);
  const forever = p.is_admin || (d !== null && d > 3000);
  const sub = pro?.sub;
  const gotGift = pro?.gift;
  const planBtns = PLANS.map((x) => ({ x, ...planFor(cfg, x) }))
    .filter((o) => o.checkout)
    .map((o) =>
      isProCheckout(o.checkout)
        ? `<button class="btn ${o.x.id === "12m" ? "btn-accent" : ""}" data-pro="${o.x.id}">
        ${esc(planName(o.x))} <span class="muted">${esc(o.price)}</span></button>`
        : `<a class="btn ${o.x.id === "12m" ? "btn-accent" : ""}" href="${esc(checkoutUrl(o.checkout, u))}">
        ${esc(planName(o.x))} <span class="muted">${esc(o.price)}</span></a>`,
    )
    .join("");
  const srcName = { lemon: "Lemon Squeezy", patreon: "Patreon", kofi: "Ko-fi", admin: T("nav_admin") }[p.pro_source] || p.pro_source || "—";

  app().innerHTML = `<div class="page">
    <div class="page-head">
      <div><h1>${T("a_title")}</h1><p class="muted" style="margin:4px 0 0">${esc(u.email)}</p></div>
      <div class="row">
        ${p.is_admin ? `<a class="btn" href="yonetim.html">${T("a_admin_link")}</a>` : ""}
        <button class="btn btn-ghost" id="logout">${T("a_logout")}</button>
      </div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="stack">
        ${active || promo ? "" : `<div id="pro-promo"></div>`}
        <div class="card">
          <div class="row between"><h3>${T("a_pro")}</h3>${active || promo ? `<span class="badge pro">PRO</span>` : `<span class="badge">${T("a_pro_none")}</span>`}</div>
          ${promo ? `<div class="msg good" style="margin-top:10px">${esc(T("a_promo_active", fmtDate(promo, true)))}${cfg.promo_note ? `<br><span class="muted small">${esc(cfg.promo_note)}</span>` : ""}</div>` : ""}
          ${
            active
              ? `<div class="pro-status" style="margin:10px 0 14px">
                  <div class="pro-days">${forever ? "∞" : d}</div>
                  <div><b>${forever ? T("unlimited") : T("a_pro_days")}</b><br><span class="muted small">${forever ? "" : `${T("a_pro_until")}: ${fmtDate(p.pro_until)}`}</span></div>
                </div>
                ${forever ? "" : `<div class="meter"><i style="width:${Math.max(3, Math.min(100, (d / 365) * 100))}%"></i></div>`}`
              : `<p class="muted" style="margin-top:8px">${esc(cfg.pro_note || "")}</p>`
          }
          <dl class="kv" style="margin-top:14px">
            ${active && !forever ? `<dt>${T("a_pro_source")}</dt><dd>${esc(srcName)}</dd>` : ""}
            ${sub ? `<dt>${T("a_plan")}</dt><dd>${esc(sub.plan || "—")} <span class="badge ${pro.renewing ? "ok" : "warn"}">${pro.renewing ? T("a_renewing") : T("a_not_renewing")}</span></dd>` : ""}
            ${sub?.renews_at && pro.renewing ? `<dt>${T("a_next_renew")}</dt><dd>${fmtDate(sub.renews_at)}</dd>` : ""}
          </dl>
          ${
            gotGift
              ? `<div class="msg good gift-from">${esc(T("g_from", gotGift.gifted_by_name || "?"))}${
                  gotGift.status === "cancelled" ? `<br><span class="muted small">${esc(T("g_from_ended", fmtDate(p.pro_until)))}</span>` : ""
                }</div>`
              : ""
          }
          ${sub?.portal_url ? `<p style="margin-top:14px"><a class="btn btn-sm" href="${esc(sub.portal_url)}" target="_blank" rel="noopener">${T("a_manage")}</a></p>` : ""}
        </div>

        <div class="card">
          <h3>${T("a_buy_title")}</h3>
          <p class="muted small">${T("a_buy_note")}</p>
          ${planBtns.includes("data-pro=") ? `<div id="cp-pro"></div>` : ""}
          <div class="row">${planBtns || `<span class="muted small">${T("soon")}</span>`}</div>
          ${
            ((region === "tr" && cfg.patreon_url_tr) || cfg.patreon_url) || ((region === "tr" && cfg.kofi_url_tr) || cfg.kofi_url)
              ? `<div class="row" style="margin-top:14px">
                  ${(region === "tr" && cfg.patreon_url_tr) || cfg.patreon_url ? `<a class="btn btn-patreon btn-sm" href="${esc((region === "tr" && cfg.patreon_url_tr) || cfg.patreon_url)}" target="_blank" rel="noopener">Patreon</a>` : ""}
                  ${((region === "tr" && cfg.kofi_url_tr) || cfg.kofi_url) ? `<a class="btn btn-sm" href="${esc(((region === "tr" && cfg.kofi_url_tr) || cfg.kofi_url))}" target="_blank" rel="noopener">Ko-fi</a>` : ""}
                </div><p class="muted small" style="margin:10px 0 0">${T("a_patreon_note")}</p>`
              : ""
          }
        </div>

        <div class="card" id="hediye">
          <h3>${T("g_title")}</h3>
          <p class="muted small">${T("g_lead")}</p>
          <div id="g-pick"></div>
          <h3 style="margin-top:18px;font-size:16px">${T("g_mine")}</h3>
          <div id="g-list"></div>
        </div>

        <div class="card">
          <h3>${T("a_payments")}</h3>
          ${
            pays.length
              ? `<div class="table-scroll"><table class="list"><thead><tr><th>${T("a_date")}</th><th>${T("a_plan")}</th><th class="num">${T("a_amount")}</th></tr></thead><tbody>
                ${pays
                  .map(
                    (x) =>
                      `<tr><td>${fmtDate(x.created_at)}</td><td>${esc(x.plan || x.source)}${x.gift_name != null ? ` <span class="badge">${esc(T("g_for", x.gift_name || "?"))}</span>` : ""}${x.kind === "refund" ? ` <span class="badge bad">${T("a_refund")}</span>` : ""}</td><td class="num">${fmtMoney(x.kind === "refund" ? -x.amount : x.amount, x.currency)}</td></tr>`,
                  )
                  .join("")}
              </tbody></table></div>`
              : `<p class="muted small">${T("a_no_payments")}</p>`
          }
        </div>
      </div>

      <div class="stack">
        <form class="card" id="prof">
          <h3>${T("a_profile")}</h3>
          <div class="field"><label>${T("a_name")}</label><input name="display_name" maxlength="40" value="${esc(p.display_name || "")}"></div>
          <div class="field"><label>${T("a_iracing")}</label><input name="iracing_name" maxlength="60" value="${esc(p.iracing_name || "")}"></div>
          <div class="field"><label>${T("a_pay_email")}</label><input name="pay_email" type="email" value="${esc(p.pay_email || "")}"></div>
          <div class="row between"><span class="muted small">${T("a_member_since")}: ${fmtDate(u.created_at)}</span><button class="btn btn-accent btn-sm">${T("save")}</button></div>
        </form>

        <div class="card" id="profil"><p class="muted small">${T("loading")}</p></div>

        <form class="card" id="pw">
          <h3>${T("a_security")}</h3>
          <div class="field"><label>${T("a_password_new")}</label><input name="password" type="password" minlength="6" autocomplete="new-password" required></div>
          <button class="btn btn-sm">${T("a_set_password")}</button>
        </form>

        <div class="card" id="destek">
          <div class="row between"><h3 style="margin:0">${T("s_title")}</h3><button class="btn btn-sm btn-accent" id="sp-new">${T("s_new")}</button></div>
          <p class="muted small">${T("s_lead")}</p>
          <div id="sp-body"><p class="muted small">${T("loading")}</p></div>
        </div>

        <div class="card" id="telemetri">
          <h3>${T("a_tele_title")}</h3>
          <label class="row between" style="gap:14px;cursor:pointer">
            <span><b>${T("a_tele_public")}</b><br><span class="muted small">${T("a_tele_lead")}</span></span>
            <input type="checkbox" id="tele-public" style="width:auto" ${p.telemetry_public !== false ? "checked" : ""}>
          </label>
          <a class="btn btn-sm" href="yarisci.html?u=me" style="margin-top:10px">${T("a_tele_open")}</a>
        </div>

        <div class="card" id="eposta">
          <h3>${T("ep_title")}</h3>
          <p class="muted small">${T("ep_lead")}</p>
          <div id="ep-body"><p class="muted small">${T("loading")}</p></div>
        </div>

        <div data-ad="site_account" hidden></div>

        <div class="card">
          <h3>${T("a_app")}</h3>
          <p class="muted small">${T("a_app_lead")}</p>
          <a class="btn btn-accent" href="#" data-download>⬇ ${T("a_download")}</a> <span class="muted small" data-version></span>
        </div>
      </div>
    </div>
  </div>`;

  // PRO tanıtım kartı (yönetici ayarlar; PRO olmayanlara)
  if ($("#pro-promo")) import("./propromo.js").then((m) => m.mountProPromo($("#pro-promo")), () => {});
  // İndirim kuponu: satın alma ve hediye kartlarındaki fiyatlar güncellenir
  couponBox($("#cp-pro"), {
    product: "pro",
    onChange: () => {
      decoratePlans(document, "pro");
      decoratePlans($("#g-pick"), "gplan", true);
    },
  });
  decoratePlans(document, "pro");
  $$("[data-pro]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      if (!(await startProCheckout(b.dataset.pro, null, proCouponFor(b.dataset.pro)?.code))) b.disabled = false;
    }),
  );
  $("#logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    render();
  });
  $("#prof").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const patch = {
      display_name: String(f.get("display_name")).trim(),
      iracing_name: String(f.get("iracing_name")).trim() || null,
      pay_email: String(f.get("pay_email")).trim() || null,
    };
    const { error } = await sb.from("profiles").update(patch).eq("id", u.id);
    error ? toast(error.message, true) : toast(T("saved"));
  });
  $("#pw").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: String(new FormData(e.target).get("password")) });
    error ? toast(error.message, true) : (toast(T("saved")), e.target.reset());
  });
  $("#tele-public")?.addEventListener("change", async (e) => {
    const { error } = await sb.rpc("telemetry_set_public", { p_on: e.target.checked });
    if (error) {
      e.target.checked = !e.target.checked;
      toast(error.message, true);
    } else toast(T("saved"));
  });
  mountProfileEditor($("#profil"), u).then(() => location.hash === "#profil" && $("#profil")?.scrollIntoView({ block: "start" }));
  initSupport(u);
  initEmailPrefs();
  initGift(u, cfg, gifts);
  import("./adslot.js").then((m) => m.mountAds(app()), () => {});
  // İndirme bağlantısı
  const { latestRelease, hit } = await import("./core.js");
  latestRelease().then((r) => {
    $$("[data-download]").forEach((a) => {
      a.href = r.url;
      a.onclick = () => hit("/download");
    });
    $$("[data-version]").forEach((el) => (el.textContent = r.version || ""));
  });
}

// ---------------------------------------------------------------------------
// E-posta bildirim tercihleri (c35: my_email_prefs / email_prefs_set). Hesap/ödeme e-postaları her zaman açık.
// ---------------------------------------------------------------------------
const EP_CATS = ["friends", "teams", "support", "ads", "pro", "shots"];

async function initEmailPrefs() {
  const el = $("#ep-body");
  if (!el) return;
  const { data: prefs, error } = await sb.rpc("my_email_prefs");
  if (error || !prefs) {
    el.innerHTML = `<p class="msg bad small">${esc(error?.message || "—")}</p>`;
    return;
  }
  const row = (k, on, locked = false) => `<label class="row between" style="gap:14px;margin:0 0 10px;${locked ? "opacity:.7" : "cursor:pointer"}">
      <span><b>${T(locked ? "ep_always" : `ep_${k}`)}</b><br><span class="muted small">${T(locked ? "ep_always_sub" : `ep_${k}_sub`)}</span></span>
      <input type="checkbox" style="width:auto" ${locked ? `checked disabled title="${esc(T("ep_always_on"))}"` : `data-ep="${k}" ${on ? "checked" : ""}`}>
    </label>`;
  el.innerHTML = EP_CATS.map((k) => row(k, prefs[k] === true)).join("") + row("", true, true);
  $$("[data-ep]", el).forEach((cb) =>
    cb.addEventListener("change", async () => {
      cb.disabled = true;
      const { error: e } = await sb.rpc("email_prefs_set", { p_prefs: { [cb.dataset.ep]: cb.checked } });
      cb.disabled = false;
      if (e) {
        cb.checked = !cb.checked;
        toast(e.message, true);
      } else toast(T("saved"));
    }),
  );
  if (location.hash === "#eposta") setTimeout(() => $("#eposta")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

// ---------------------------------------------------------------------------
// Hediye PRO: üye ara, plan seç, öde; hediye ettiklerimi listele ve sonlandır
// ---------------------------------------------------------------------------

/** Kimlikten sabit renk (programdaki arkadaş avatarıyla aynı) */
function hashColor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `hsl(${h % 360} 58% 50%)`;
}
const avatar = (id, name) =>
  `<span class="gift-av" translate="no" style="background:${hashColor(String(id || "?"))}">${esc(([...String(name || "?").trim()][0] || "?").toLocaleUpperCase(lang))}</span>`;
const GIFT_LIVE = ["active", "on_trial", "past_due"];

let giftTo = null; // { id, name }
let giftRes = null; // son arama sonuçları
let giftQ = "";
let giftConfirm = null; // sonlandırma onayı bekleyen lemon_id

function initGift(u, cfg, gifts) {
  giftTo = null;
  giftRes = null;
  giftConfirm = null;
  drawGiftPick(u, cfg);
  drawGiftList(u, gifts);
  if (location.hash === "#hediye") setTimeout(() => $("#hediye")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

/** Üye arama (programdaki arkadaş aramasıyla aynı sorgu; kendisi hariç) */
async function findMembers(u, q) {
  const t = q.replace(/[(),*%]/g, " ").trim();
  const { data, error } = await sb
    .from("profiles_public")
    .select("id,display_name,iracing_name")
    .or(`display_name.ilike.*${t}*,iracing_name.ilike.*${t}*`)
    .neq("id", u.id)
    .limit(20);
  if (error) throw new Error(error.message);
  return (data || []).filter((x) => x.id !== u.id);
}

function drawGiftPick(u, cfg) {
  const el = $("#g-pick");
  if (!el) return;
  const plans = PLANS.map((x) => ({ x, ...planFor(cfg, x) })).filter((o) => isProCheckout(o.checkout));
  if (!plans.length) {
    el.innerHTML = `<p class="muted small">${T("g_unavailable")}</p>`;
    return;
  }
  if (giftTo) {
    el.innerHTML = `<div class="gift-sel">${avatar(giftTo.id, giftTo.name)}
        <span class="grow" style="flex:1;min-width:0"><span class="muted small">${T("g_to")}</span><br><b translate="no">${esc(giftTo.name)}</b></span>
        <button type="button" class="btn btn-sm btn-ghost" id="g-change">${T("g_change")}</button></div>
      <p class="small" style="margin:0 0 8px">${T("g_plan_pick")}</p>
      <div class="row">${plans
        .map((o) => `<button type="button" class="btn ${o.x.id === "12m" ? "btn-accent" : ""}" data-gplan="${o.x.id}">${esc(planName(o.x))} <span class="muted">${esc(o.price)}</span></button>`)
        .join("")}</div>
      <p class="muted small" style="margin:10px 0 0">${T("g_note")}</p>`;
    decoratePlans(el, "gplan", true);
    $("#g-change").addEventListener("click", () => {
      giftTo = null;
      drawGiftPick(u, cfg);
    });
    $$("[data-gplan]", el).forEach((b) =>
      b.addEventListener("click", async () => {
        $$("[data-gplan]", el).forEach((x) => (x.disabled = true));
        if (!(await startProCheckout(b.dataset.gplan, giftTo.id, proCouponFor(b.dataset.gplan, true)?.code)))
          $$("[data-gplan]", el).forEach((x) => (x.disabled = false));
      }),
    );
    return;
  }
  el.innerHTML = `<form class="gift-search" id="g-f">
      <input name="q" maxlength="40" autocomplete="off" placeholder="${esc(T("g_search_ph"))}" value="${esc(giftQ)}">
      <button class="btn btn-sm">${T("g_search")}</button>
    </form>
    <div class="gift-list" id="g-res">${
      giftRes === null
        ? ""
        : giftRes.length
          ? giftRes
              .map(
                (x) => `<div class="gift-row">${avatar(x.id, x.display_name)}
                  <span class="grow"><b translate="no">${esc(x.display_name || "?")}</b>${x.iracing_name ? `<span class="muted small" translate="no">iRacing: ${esc(x.iracing_name)}</span>` : ""}</span>
                  <button type="button" class="btn btn-sm btn-accent" data-gto="${esc(x.id)}">${T("g_pick")}</button></div>`,
              )
              .join("")
          : `<p class="muted small">${T("g_none")}</p>`
    }</div>`;
  $("#g-f").addEventListener("submit", async (e) => {
    e.preventDefault();
    giftQ = String(new FormData(e.target).get("q") || "").trim();
    if (giftQ.length < 2) return toast(T("g_min"), true);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      giftRes = await findMembers(u, giftQ);
      drawGiftPick(u, cfg);
    } catch (err) {
      toast(err.message || String(err), true);
      btn.disabled = false;
    }
  });
  $$("[data-gto]", el).forEach((b) =>
    b.addEventListener("click", () => {
      const x = (giftRes || []).find((r) => r.id === b.dataset.gto);
      if (!x) return;
      giftTo = { id: x.id, name: x.display_name || "?" };
      drawGiftPick(u, cfg);
    }),
  );
}

function drawGiftList(u, gifts) {
  const el = $("#g-list");
  if (!el) return;
  if (!gifts.length) {
    el.innerHTML = `<p class="muted small">${T("g_mine_none")}</p>`;
    return;
  }
  el.innerHTML = `<div class="gift-list">${gifts
    .map((g) => {
      const live = GIFT_LIVE.includes(g.status);
      const status = live
        ? `<span class="badge ok">${T("g_active")}</span>`
        : g.status === "cancelled"
          ? `<span class="badge warn">${esc(T("g_cancelled", fmtDate(g.ends_at || g.until)))}</span>`
          : `<span class="badge">${T("g_expired")}</span>`;
      const ask = giftConfirm === g.lemon_id;
      return `<div class="gift-row" style="align-items:flex-start">${avatar(g.recipient, g.recipient_name)}
        <span class="grow">
          <b translate="no">${esc(g.recipient_name || "?")}</b>
          <span class="small">${esc(g.plan || "—")} ${status}</span>
          ${live && g.renews_at ? `<span class="muted small">${esc(T("g_next", fmtDate(g.renews_at)))}</span>` : ""}
          ${
            ask
              ? `<span class="small" style="margin-top:6px">${esc(T("g_end_q", g.recipient_name || "?"))}</span>
                 <span class="gift-confirm"><button type="button" class="btn btn-sm btn-danger" data-gyes="${esc(g.lemon_id)}">${T("g_end_yes")}</button>
                 <button type="button" class="btn btn-sm btn-ghost" data-gno>${T("cancel")}</button></span>`
              : ""
          }
        </span>
        ${live && !ask ? `<button type="button" class="btn btn-sm" data-gend="${esc(g.lemon_id)}">${T("g_end")}</button>` : ""}
      </div>`;
    })
    .join("")}</div>`;
  $$("[data-gend]", el).forEach((b) =>
    b.addEventListener("click", () => {
      giftConfirm = b.dataset.gend;
      drawGiftList(u, gifts);
    }),
  );
  $$("[data-gno]", el).forEach((b) =>
    b.addEventListener("click", () => {
      giftConfirm = null;
      drawGiftList(u, gifts);
    }),
  );
  $$("[data-gyes]", el).forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const { data, error } = await sb.functions.invoke("gift-cancel", { body: { lemon_id: b.dataset.gyes } });
        if (error) {
          let msg = error.message;
          try {
            msg = (await error.context?.json())?.error || msg;
          } catch {}
          throw new Error(msg);
        }
        toast(T("g_ended"));
        giftConfirm = null;
        const g = gifts.find((x) => x.lemon_id === b.dataset.gyes);
        if (g) {
          g.status = "cancelled";
          g.ends_at = data?.ends_at || g.ends_at || g.renews_at;
        }
        const fresh = await sb.rpc("my_gifts").then((r) => r.data, () => null);
        drawGiftList(u, fresh || gifts);
      } catch (err) {
        toast(err.message || String(err), true);
        b.disabled = false;
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Destek talepleri
// ---------------------------------------------------------------------------
const SP_CATS = ["bug", "overlay", "payment", "account", "feature", "other"];
const SP_MAX = 4;
let spView = { mode: "list" };

async function spRpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const spStatus = (s) => `<span class="sp-status ${esc(s)}">${esc(T("s_status_" + s))}</span>`;

/** Görseli küçültüp (en çok 1920 px) kullanıcının klasörüne yükler; yolları döner */
async function spUpload(u, files) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const out = [];
  for (let i = 0; i < Math.min(files.length, SP_MAX); i++) {
    const f = files[i];
    let blob = f;
    let ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      if (k < 1 || f.size > 1500000 || !["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
        ext = "jpg";
      }
    } catch {}
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error(T("s_too_big"));
    const path = `${u.id}/${stamp}/${i + 1}.${ext}`;
    const { error } = await sb.storage.from("support").upload(path, blob, { contentType: ext === "jpg" ? "image/jpeg" : blob.type });
    if (error) throw new Error(error.message);
    out.push(path);
  }
  return out;
}

/** Görsel seçici (önizlemeli); seçilen dosyaları döndüren fonksiyon verir */
function spPicker(el) {
  let files = [];
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  const draw = () => {
    el.innerHTML = files.map((f, i) => `<div class="sp-thumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join("") +
      (files.length < SP_MAX ? `<button type="button" class="sp-add">${T("s_add_image")}<br>${files.length}/${SP_MAX}</button>` : "");
    el.appendChild(input);
    el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => ((files = files.filter((_, k) => k !== +b.dataset.rm)), draw())));
    el.querySelector(".sp-add")?.addEventListener("click", () => input.click());
  };
  const add = (list) => {
    files = [...files, ...[...list].filter((f) => f.type.startsWith("image/"))].slice(0, SP_MAX);
    draw();
  };
  input.addEventListener("change", () => {
    add(input.files || []);
    input.value = "";
  });
  draw();
  return { get: () => files, add, clear: () => ((files = []), draw()) };
}

async function spList(u, body) {
  const rows = (await spRpc("my_support_tickets")) || [];
  if (!rows.length) {
    body.innerHTML = `<p class="muted small">${T("s_none")}</p>`;
    return;
  }
  body.innerHTML = `<div class="sp-list">${rows
    .map(
      (r) => `<button class="sp-item" data-t="${esc(r.id)}">
        ${r.unread ? `<i class="sp-dot" title="${esc(T("s_new_reply"))}"></i>` : ""}
        <span class="grow"><b>${esc(r.subject)}</b><span class="muted small">${esc(T("s_cat_" + r.category))} · ${fmtDate(r.updated_at, true)}</span></span>
        ${spStatus(r.status)}
      </button>`,
    )
    .join("")}</div>`;
  body.querySelectorAll("[data-t]").forEach((b) =>
    b.addEventListener("click", () => {
      spView = { mode: "thread", id: b.dataset.t };
      spShow(u);
    }),
  );
}

function spForm(u, body) {
  let cat = "bug";
  body.innerHTML = `<form id="sp-f">
    <p class="small"><button type="button" class="linkbtn" id="sp-back">${T("s_back")}</button></p>
    <div class="field"><label>${T("s_category")}</label><div class="sp-cats">${SP_CATS.map((c) => `<button type="button" data-c="${c}" class="${c === cat ? "on" : ""}">${T("s_cat_" + c)}</button>`).join("")}</div></div>
    <div class="field"><label>${T("s_subject")}</label><input name="subject" maxlength="120" placeholder="${esc(T("s_subject_ph"))}"></div>
    <div class="field"><label>${T("s_message")}</label><textarea name="body" rows="6" maxlength="4000" placeholder="${esc(T("s_message_ph"))}"></textarea><div class="sp-tools" id="sp-emo"></div></div>
    <div class="field"><label>${T("s_images")}</label><div class="sp-pick" id="sp-pick"></div></div>
    <button class="btn btn-accent">${T("s_send")}</button>
  </form>`;
  const pick = spPicker(body.querySelector("#sp-pick"));
  body.querySelector("textarea").addEventListener("paste", (e) => {
    if (e.clipboardData?.files?.length) pick.add(e.clipboardData.files);
  });
  attachEmoji(body.querySelector("textarea"), { host: body.querySelector("#sp-emo"), title: T("s_emoji"), up: false });
  body.querySelector("#sp-back").addEventListener("click", () => ((spView = { mode: "list" }), spShow(u)));
  body.querySelectorAll("[data-c]").forEach((b) =>
    b.addEventListener("click", () => {
      cat = b.dataset.c;
      body.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("on", x === b));
    }),
  );
  body.querySelector("#sp-f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = String(f.get("subject")).trim();
    const text = String(f.get("body")).trim();
    if (!subject || !text) return toast(T("s_required"), true);
    const btn = e.target.querySelector("button.btn-accent");
    btn.disabled = true;
    btn.textContent = T("s_sending");
    try {
      const images = await spUpload(u, pick.get());
      const id = await spRpc("support_create", { p_category: cat, p_subject: subject, p_body: text, p_images: images });
      toast(T("s_created"));
      spView = { mode: "thread", id };
      spShow(u);
    } catch (err) {
      toast(err.message || String(err), true);
      btn.disabled = false;
      btn.textContent = T("s_send");
    }
  });
}

async function spThread(u, body, id) {
  const [tickets, msgs] = await Promise.all([spRpc("my_support_tickets"), spRpc("support_thread", { p_ticket: id })]);
  const t = (tickets || []).find((x) => x.id === id);
  if (!t) {
    spView = { mode: "list" };
    return spShow(u);
  }
  sb.rpc("support_seen", { p_ticket: id }).then(() => {}, () => {});
  const paths = [...new Set((msgs || []).flatMap((m) => m.images || []))];
  const urls = {};
  if (paths.length) {
    const { data } = await sb.storage.from("support").createSignedUrls(paths, 3600);
    (data || []).forEach((x) => x.signedUrl && (urls[x.path] = x.signedUrl));
  }
  body.innerHTML = `
    <p class="small row between"><button type="button" class="linkbtn" id="sp-back">${T("s_back")}</button>
      <button type="button" class="btn btn-sm" id="sp-st">${t.status === "closed" ? T("s_reopen") : T("s_close")}</button></p>
    <div class="row between"><b>${esc(t.subject)}</b>${spStatus(t.status)}</div>
    <span class="muted small">${esc(T("s_cat_" + t.category))} · ${fmtDate(t.created_at, true)}</span>
    <div class="sp-msgs">${(msgs || [])
      .map(
        (m) => `<div class="sp-msg ${m.is_staff ? "staff" : "mine"}">
          <div class="head"><b>${m.is_staff ? esc(T("s_team")) : esc(m.author_name)}</b><span>${fmtDate(m.created_at, true)}</span></div>
          <p>${esc(m.body)}</p>
          ${(m.images || []).length ? `<div class="sp-imgs">${m.images.map((p) => (urls[p] ? `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt=""></a>` : "")).join("")}</div>` : ""}
        </div>`,
      )
      .join("")}</div>
    ${t.status === "closed" ? `<p class="muted small">${T("s_closed_note")}</p>` : ""}
    <form id="sp-r">
      <div class="field"><textarea name="body" rows="3" maxlength="4000" placeholder="${esc(T("s_reply_ph"))}"></textarea></div>
      <div class="row between" style="align-items:flex-end"><div class="sp-tools" id="sp-emo"><div class="sp-pick" id="sp-pick"></div></div><button class="btn btn-accent">${T("s_send")}</button></div>
    </form>`;
  const box = body.querySelector(".sp-msgs");
  box.scrollTop = box.scrollHeight;
  const pick = spPicker(body.querySelector("#sp-pick"));
  body.querySelector("textarea").addEventListener("paste", (e) => {
    if (e.clipboardData?.files?.length) pick.add(e.clipboardData.files);
  });
  attachEmoji(body.querySelector("textarea"), { host: body.querySelector("#sp-emo"), title: T("s_emoji") });
  body.querySelector("#sp-back").addEventListener("click", () => ((spView = { mode: "list" }), spShow(u)));
  body.querySelector("#sp-st").addEventListener("click", async () => {
    try {
      await spRpc("support_set_status", { p_ticket: id, p_status: t.status === "closed" ? "open" : "closed" });
      spShow(u);
    } catch (err) {
      toast(err.message, true);
    }
  });
  body.querySelector("#sp-r").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = String(new FormData(e.target).get("body")).trim();
    if (!text) return;
    const btn = e.target.querySelector("button.btn-accent");
    btn.disabled = true;
    try {
      const images = await spUpload(u, pick.get());
      await spRpc("support_reply", { p_ticket: id, p_body: text, p_images: images });
      spShow(u);
    } catch (err) {
      toast(err.message || String(err), true);
      btn.disabled = false;
    }
  });
}

async function spShow(u) {
  const body = $("#sp-body");
  if (!body) return;
  try {
    if (spView.mode === "new") spForm(u, body);
    else if (spView.mode === "thread") await spThread(u, body, spView.id);
    else await spList(u, body);
  } catch (e) {
    body.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
  }
}

function initSupport(u) {
  $("#sp-new")?.addEventListener("click", () => {
    spView = { mode: "new" };
    spShow(u);
  });
  spShow(u);
  if (location.hash === "#destek") setTimeout(() => $("#destek")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

async function render() {
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  if (!u) return authView();
  if (buyPlan || new URLSearchParams(location.search).get("next") === "reklam" || safeNext()) return afterLogin();
  app().innerHTML = `<p class="muted page">${T("loading")}</p>`;
  try {
    await dashboard(u);
  } catch (e) {
    app().innerHTML = `<div class="page"><div class="msg bad">${esc(e.message || e)}</div></div>`;
  }
  // Yeni hesaba deneme PRO (c41): bir kez sorulur; verilirse kutlama penceresi, kapanınca panel yenilenir
  maybeClaimTrial(u, render);
}

await boot("/hesap", "account");
// PRO ödemesinden dönüş (pro-checkout redirect_url)
const paidKind = new URLSearchParams(location.search).get("paid");
if (paidKind === "pro" || paidKind === "gift") {
  toast(T(paidKind === "gift" ? "a_paid_gift" : "a_paid_pro"));
  history.replaceState(null, "", "hesap.html" + (paidKind === "gift" && !location.hash ? "#hediye" : location.hash));
}
render();
document.addEventListener("langchange", () => {
  render();
  applyLang();
});
