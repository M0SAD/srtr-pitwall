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
  lang,
  myProfile,
  planFor,
  planName,
  promoUntil,
  sb,
  toast,
} from "./core.js";

addDict({
  a_login: ["Giriş yap", "Sign in"],
  a_signup: ["Kayıt ol", "Sign up"],
  a_email: ["E-posta", "E-mail"],
  a_password: ["Şifre", "Password"],
  a_password_new: ["Yeni şifre (en az 6 karakter)", "New password (min. 6 characters)"],
  a_name: ["Görünen ad", "Display name"],
  a_forgot: ["Şifremi unuttum", "Forgot password"],
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
  a_title: ["Hesabım", "My account"],
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
    "Patreon ile ödersen, Patreon e-postan bu hesabın e-postasıyla ya da yukarıdaki ödeme e-postasıyla aynı olmalı.",
    "If you pay on Patreon, your Patreon e-mail must match this account's e-mail or the payment e-mail above.",
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
});

let mode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "login";
const buyPlan = new URLSearchParams(location.search).get("buy");
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

async function afterLogin() {
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  // Fiyatlardan gelindiyse doğrudan ödemeye
  if (u && buyPlan) {
    const cfg = await appConfig().catch(() => ({}));
    const p = PLANS.find((x) => x.id === buyPlan);
    const link = p && planFor(cfg, p).checkout;
    if (link) {
      location.href = checkoutUrl(link, u);
      return;
    }
  }
  history.replaceState(null, "", "hesap.html" + (location.hash === "#destek" ? "#destek" : ""));
  render();
}

// ---------------------------------------------------------------------------
// Hesap paneli
// ---------------------------------------------------------------------------
async function dashboard(u) {
  const [prof, cfg, pro, pays] = await Promise.all([
    myProfile(true),
    appConfig().catch(() => ({})),
    sb.rpc("my_pro").then((r) => r.data ?? null),
    sb.rpc("my_payments").then((r) => r.data ?? []),
  ]);
  const p = prof || {};
  const d = daysLeft(p.pro_until);
  const promo = promoUntil(cfg);
  const active = p.is_admin || (d !== null && d > 0);
  const forever = p.is_admin || (d !== null && d > 3000);
  const sub = pro?.sub;
  const planBtns = PLANS.map((x) => ({ x, ...planFor(cfg, x) }))
    .filter((o) => o.checkout)
    .map(
      (o) => `<a class="btn ${o.x.id === "12m" ? "btn-accent" : ""}" href="${esc(checkoutUrl(o.checkout, u))}">
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
          ${sub?.portal_url ? `<p style="margin-top:14px"><a class="btn btn-sm" href="${esc(sub.portal_url)}" target="_blank" rel="noopener">${T("a_manage")}</a></p>` : ""}
        </div>

        <div class="card">
          <h3>${T("a_buy_title")}</h3>
          <p class="muted small">${T("a_buy_note")}</p>
          <div class="row">${planBtns || `<span class="muted small">${T("soon")}</span>`}</div>
          ${
            cfg.patreon_url || cfg.kofi_url
              ? `<div class="row" style="margin-top:14px">
                  ${cfg.patreon_url ? `<a class="btn btn-patreon btn-sm" href="${esc(cfg.patreon_url)}" target="_blank" rel="noopener">Patreon</a>` : ""}
                  ${cfg.kofi_url ? `<a class="btn btn-sm" href="${esc(cfg.kofi_url)}" target="_blank" rel="noopener">Ko-fi</a>` : ""}
                </div><p class="muted small" style="margin:10px 0 0">${T("a_patreon_note")}</p>`
              : ""
          }
        </div>

        <div class="card">
          <h3>${T("a_payments")}</h3>
          ${
            pays.length
              ? `<div class="table-scroll"><table class="list"><thead><tr><th>${T("a_date")}</th><th>${T("a_plan")}</th><th class="num">${T("a_amount")}</th></tr></thead><tbody>
                ${pays
                  .map(
                    (x) =>
                      `<tr><td>${fmtDate(x.created_at)}</td><td>${esc(x.plan || x.source)}${x.kind === "refund" ? ` <span class="badge bad">${T("a_refund")}</span>` : ""}</td><td class="num">${fmtMoney(x.kind === "refund" ? -x.amount : x.amount, x.currency)}</td></tr>`,
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

        <div class="card">
          <h3>${T("a_app")}</h3>
          <p class="muted small">${T("a_app_lead")}</p>
          <a class="btn btn-accent" href="#" data-download>⬇ ${T("a_download")}</a> <span class="muted small" data-version></span>
        </div>
      </div>
    </div>
  </div>`;

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
  initSupport(u);
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
    <div class="field"><label>${T("s_message")}</label><textarea name="body" rows="6" maxlength="4000" placeholder="${esc(T("s_message_ph"))}"></textarea></div>
    <div class="field"><label>${T("s_images")}</label><div class="sp-pick" id="sp-pick"></div></div>
    <button class="btn btn-accent">${T("s_send")}</button>
  </form>`;
  const pick = spPicker(body.querySelector("#sp-pick"));
  body.querySelector("textarea").addEventListener("paste", (e) => {
    if (e.clipboardData?.files?.length) pick.add(e.clipboardData.files);
  });
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
      <div class="row between" style="align-items:flex-end"><div class="sp-pick" id="sp-pick"></div><button class="btn btn-accent">${T("s_send")}</button></div>
    </form>`;
  const box = body.querySelector(".sp-msgs");
  box.scrollTop = box.scrollHeight;
  const pick = spPicker(body.querySelector("#sp-pick"));
  body.querySelector("textarea").addEventListener("paste", (e) => {
    if (e.clipboardData?.files?.length) pick.add(e.clipboardData.files);
  });
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
  if (buyPlan) return afterLogin();
  app().innerHTML = `<p class="muted page">${T("loading")}</p>`;
  try {
    await dashboard(u);
  } catch (e) {
    app().innerHTML = `<div class="page"><div class="msg bad">${esc(e.message || e)}</div></div>`;
  }
}

await boot("/hesap", "account");
render();
document.addEventListener("langchange", () => {
  render();
  applyLang();
});
