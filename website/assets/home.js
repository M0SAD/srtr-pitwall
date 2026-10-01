// Tanıtım sayfası: özellikler, karşılaştırma, fiyatlar (yönetim panelinden girilen fiyat ve ödeme bağlantıları), SSS
import { $, T, addDict, appConfig, applyLang, boot, checkoutUrl, currentUser, esc, fmtMoney, isProCheckout, locale, planFor, planName, PLANS, startProCheckout } from "./core.js";

addDict({
  hero_eyebrow: ["iRacing, ACC, LMU ve daha fazlası için hepsi bir arada", "All-in-one for iRacing, ACC, LMU and more"],
  pill_sims: ["iRacing · ACC · AC · LMU · rF2 · AMS2", "iRacing · ACC · AC · LMU · rF2 · AMS2"],
  f10_t: ["Birden çok simülasyon", "Multiple sims"],
  f10_d: [
    "iRacing'in yanında Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate, rFactor 2 ve Automobilista 2. Hangi oyunu açarsan kendiliğinden algılar.",
    "Besides iRacing: Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate, rFactor 2 and Automobilista 2. Detects whichever game you start.",
  ],
  f11_t: ["Destek", "Support"],
  f11_d: [
    "Program içinden ya da siteden destek talebi aç, konu seç, ekran görüntüsü ekle; yanıt gelince bildirim ve e-posta alırsın.",
    "Open a support ticket from the app or the website, pick a topic, attach screenshots; you get a notification and e-mail when we reply.",
  ],
  f12_t: ["Steam gibi arkadaş listesi", "Steam-like friends list"],
  f12_d: [
    "Ayrı arkadaş penceresi, masaüstünde mesaj bildirimleri, ifadeler (:D → 😄) ve arkadaşının canlı verisi ayrı pencerede.",
    "A separate friends window, desktop message pop-ups, emojis (:D → 😄) and your friend's live data in its own window.",
  ],
  q8: ["Hangi oyunları destekliyor?", "Which games are supported?"],
  a8: [
    "iRacing, Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate ve rFactor 2 (rF2 Shared Memory eklentisiyle), Automobilista 2 / Project CARS 2 (oyun ayarlarında Shared Memory: Project CARS 2). Her oyunun sağladığı veri farklıdır; en eksiksiz destek iRacing'dedir.",
    "iRacing, Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate and rFactor 2 (with the rF2 Shared Memory plugin), Automobilista 2 / Project CARS 2 (Shared Memory: Project CARS 2 in the game options). Each game exposes different data; iRacing has the most complete support.",
  ],
  hero_title: ["Sim kokpitin için <span class=\"accent\">eksiksiz bir pit duvarı</span>", "A complete <span class=\"accent\">pit wall</span> for your sim rig"],
  hero_lead: [
    "Overlay'ler, görsel ve sesli spotter, yakıt stratejisi, arkadaşlarla canlı veri, OBS yayın düzenleri ve topluluk — tek, hafif bir uygulamada.",
    "Overlays, visual and voice spotter, fuel strategy, live data with friends, OBS streaming layouts and a community hub — in one lightweight app.",
  ],
  hero_download: ["⬇ Ücretsiz indir", "⬇ Download free"],
  hero_pro: ["PRO'ya bak", "See PRO"],
  hero_meta: ["Windows 10/11 · son sürüm", "Windows 10/11 · latest"],
  pill_overlays: ["26 overlay", "26 overlays"],
  pill_spotter: ["Sesli spotter", "Voice spotter"],
  pill_langs: ["15 dil", "15 languages"],
  pill_free: ["Hesapsız da çalışır", "Works without an account"],

  feat_eyebrow: ["Özellikler", "Features"],
  feat_title: ["Overlay'de kalmayan bir overlay uygulaması", "An overlay app that goes beyond overlays"],
  feat_lead: [
    "Pistte ihtiyacın olan her şey, yarış dışında da işine yarayan araçlarla birlikte.",
    "Everything you need on track, plus tools that help you off track too.",
  ],
  f1_t: ["26 overlay, tek şeffaf pencere", "26 overlays, one transparent window"],
  f1_d: [
    "Relative, leaderboard, yakıt, lastikler, radar, pist haritası, delta, pedal girdileri, hava durumu, bayraklar ve daha fazlası.",
    "Relative, leaderboard, fuel, tyres, radar, track map, delta, inputs, weather, flags and more.",
  ],
  f2_t: ["Görsel ve sesli spotter", "Visual and voice spotter"],
  f2_d: [
    "Solda / sağda araç, üçlü yan yana, bayrak, yakıt ve pozisyon anonsları; daha hızlı sınıf ve piste dönüş uyarıları.",
    "Car left / right, three wide, flag, fuel and position calls; faster class and rejoin warnings.",
  ],
  f3_t: ["Yakıt stratejisi", "Fuel strategy"],
  f3_d: [
    "Tur başı tüketim, bitiş için eklenecek yakıt, pit pencereleri ve takım arkadaşlarının yakıtı canlı.",
    "Per-lap usage, fuel to add to finish, pit windows and your teammates' fuel live.",
  ],
  f4_t: ["Arkadaşlar ve canlı veri", "Friends and live data"],
  f4_d: [
    "Kim çevrimiçi, kim yarışta gör. Güvendiğin arkadaşların yakıtını, turlarını ve pistteki yerini izle.",
    "See who's online or racing. Follow trusted friends' fuel, laps and position on track.",
  ],
  f5_t: ["Yarış içi mesajlar", "In-race messages"],
  f5_d: [
    "Mesajlar sen sürerken ekrana düşer, masaüstünde Steam gibi bildirim gelir. Rahatsız etme modu hepsini sessize alır.",
    "Messages pop up while you drive, with Steam-style desktop notifications. Do Not Disturb keeps them quiet.",
  ],
  f6_t: ["OBS yayın düzenleri", "OBS streaming layouts"],
  f6_d: [
    "Yayına özel düzenler, hazır sahneler (birazdan başlıyoruz, mola, kapanış) ve Twitch sohbet overlay'i.",
    "Stream-only layouts, ready scenes (starting soon, be right back, ending) and a Twitch chat overlay.",
  ],
  f7_t: ["Topluluk merkezi", "Community hub"],
  f7_d: [
    "Komple düzenleri, yayın düzenlerini ve temaları paylaş, indir, puanla, yorumla.",
    "Share, download, rate and comment on complete layouts, stream layouts and themes.",
  ],
  f8_t: ["Tek tuşla ekran görüntüsü", "One-key screenshots"],
  f8_d: [
    "Print Screen oyunu overlay'ler ve filigranla birlikte yakalar; galeride paylaş.",
    "Print Screen captures the game with overlays and watermark; share it in the gallery.",
  ],
  f9_t: ["Tema motoru ve düzen yöneticisi", "Theme engine and layout manager"],
  f9_d: [
    "Font, renk, opaklık ve boyut tek hamlede. Araca ve oturuma göre otomatik düzen, çoklu monitör.",
    "Font, colour, opacity and size in one go. Automatic layouts per car and session, multi-monitor.",
  ],

  f13_t: ["Olaylar ekranı ve replay", "Events screen and replay"],
  f13_d: [
    "Yarış bitince olaylar listesi kendiliğinden açılır: kazalar, geçişler, pit girişleri. Birine tıkla, iRacing replay'i o ana atlasın.",
    "When the race ends the events list opens by itself: incidents, overtakes, pit stops. Click one and the iRacing replay jumps to that moment.",
  ],
  f14_t: ["Reklam ver", "Advertise"],
  f14_d: [
    "Sim yarışçılarına ulaş: gösterim ya da süre paketi seç, yerini belirle, öde; reklamın otomatik yayına girsin.",
    "Reach sim racers: pick an impressions or time package, choose a placement, pay, and your ad goes live automatically.",
  ],
  panel_eyebrow: ["Kontrol paneli", "Control panel"],
  panel_title: ["Her şey tek yerde, gerçek pist üstünde önizleme", "Everything in one place, previewed on a real track"],
  panel_lead: [
    "Overlay'leri aç, sürükle, boyutlandır; demo moduyla iRacing açmadan düzenini hazırla.",
    "Toggle, drag and resize overlays; build your layout with demo mode without launching iRacing.",
  ],
  panel_c1: ["Hizalama kılavuzları ve ızgara", "Alignment guides and grid"],
  panel_c2: ["Araca ve oturuma göre otomatik düzen", "Automatic layouts per car and session"],
  panel_c3: ["Ayarların bulut yedeği", "Cloud backup of your settings"],
  panel_c4: ["İmzalı otomatik güncellemeler", "Signed automatic updates"],

  friends_eyebrow: ["Arkadaşlar", "Friends"],
  friends_title: ["Takım arkadaşın çevrimdışıyken bile verileri elinde", "Your teammate's data, even when they're offline"],
  friends_lead: [
    "Seni güvenilir işaretleyen arkadaşının yakıtını, tur sürelerini ve pistteki konumunu gör.",
    "See the fuel, lap times and track position of friends who marked you as trusted.",
  ],
  friends_c1: ["Yakıt, kalan tur, bitiş için eklenecek", "Fuel, laps left, fuel to add"],
  friends_c2: ["En iyi / son tur ve son 10 tur", "Best / last lap and the last 10 laps"],
  friends_c3: ["Pist haritasında anlık konum", "Live position on the track map"],
  friends_c4: ["Mesajlar ve masaüstü bildirimleri", "Messages and desktop notifications"],

  perf_eyebrow: ["Performans", "Performance"],
  perf_title: ["GPU'n ve CPU'n simülasyona ait", "Your GPU and CPU belong to the sim"],
  perf1_t: ["Rust ile yazıldı", "Written in Rust"],
  perf1_d: ["Telemetri okuma ve hesaplar tek bir arka plan iş parçacığında.", "Telemetry and calculations run on a single background thread."],
  perf2_t: ["Sadece gereken veri", "Only what's needed"],
  perf2_d: ["Her overlay kendi verisini kendi hızında alır; kapalı olanlar hiç hesaplanmaz.", "Each overlay gets only its data at its own rate; closed ones cost nothing."],
  perf3_t: ["Boşta sıfır yük", "Zero idle load"],
  perf3_d: ["iRacing kapalıyken overlay penceresi tamamen gizlenir.", "The overlay window hides completely when iRacing isn't running."],
  perf4_t: ["Efekt yok", "No effects"],
  perf4_d: ["Bulanıklık ya da sürekli animasyon yok; hiçbir şey oyunla yarışmaz.", "No blur or constant animation; nothing competes with the game."],

  cmp_eyebrow: ["Ücretsiz ve PRO", "Free and PRO"],
  cmp_title: ["Ücretsiz başla, istersen PRO'ya geç", "Start free, go PRO when you want"],
  cmp_lead: [
    "SRTR Pitwall hesap olmadan da eksiksiz çalışır. Ücretsiz hesap topluluğu ve bulut yedeğini açar; PRO geri kalanını.",
    "SRTR Pitwall works fully without an account. A free account unlocks community and cloud backup; PRO unlocks the rest.",
  ],
  cmp_free: ["Hesapsız", "No account"],
  cmp_account: ["Ücretsiz hesap", "Free account"],
  c_r1: ["Temel overlay'ler, spotter, yakıt hesaplayıcı", "Core overlays, spotter, fuel calculator"],
  c_r2: ["Düzen yöneticisi, temalar, OBS düzenleri", "Layout manager, themes, OBS layouts"],
  c_r3: ["Ayarların bulut yedeği", "Cloud backup of settings"],
  c_r4: ["Topluluk: gezin, indir, ekran görüntüsü paylaş", "Community: browse, download, share screenshots"],
  c_r5: ["Arkadaş listesi, çevrimiçi / yarışta durumu", "Friends list, online / racing status"],
  c_r6: ["Premium overlay'ler", "Premium overlays"],
  c_r7: ["Sesli yarış mühendisi", "Voice race engineer"],
  c_r8: ["Güvenilir arkadaşlarla canlı veri paylaşımı", "Live data sharing with trusted friends"],
  c_r9: ["Arkadaşlara mesaj gönderme", "Messaging friends"],
  c_r10: ["Topluluk düzen ve temalarını kullanma, puanlama, yorum", "Using, rating and commenting on community layouts and themes"],

  price_eyebrow: ["Fiyatlar", "Pricing"],
  price_title: ["SRTR Pitwall PRO", "SRTR Pitwall PRO"],
  price_lead: [
    "Abonelik kendiliğinden yenilenir, istediğin zaman iptal edebilirsin; ödediğin dönemin sonuna kadar PRO kalırsın. Ödeme olunca PRO hesabına hemen işlenir.",
    "Subscriptions renew automatically and can be cancelled any time; you stay PRO until the end of the paid period. PRO is applied to your account right after payment.",
  ],
  per_month: ["ayda {0}", "{0} per month"],
  best_value: ["En avantajlı", "Best value"],
  popular: ["Popüler", "Popular"],
  buy: ["Satın al", "Buy"],
  soon: ["Yakında", "Coming soon"],
  price_tbd: ["—", "—"],
  patreon_title: ["Patreon ya da Ko-fi ile destekle", "Support on Patreon or Ko-fi"],
  patreon_lead: [
    "İstersen Patreon'dan ödeyebilirsin. Patreon e-postan SRTR Pitwall hesabınla aynı olsun (değilse Hesabım sayfasından ödeme e-postanı yaz); PRO kendiliğinden açılır.",
    "You can pay on Patreon if you prefer. Use the same e-mail as your SRTR Pitwall account (or set your payment e-mail on My account); PRO turns on automatically.",
  ],

  faq_eyebrow: ["SSS", "FAQ"],
  faq_title: ["Sık sorulan sorular", "Frequently asked questions"],
  q1: ["iRacing'de kullanmak güvenli mi?", "Is it safe to use with iRacing?"],
  a1: [
    "Evet. SRTR Pitwall iRacing'in resmi telemetri arayüzünü (SDK) okur; oyuna müdahale etmez, dosyalarını değiştirmez.",
    "Yes. SRTR Pitwall reads iRacing's official telemetry interface (SDK); it doesn't touch the game or modify its files.",
  ],
  q2: ["Sitedeki hesapla programa giriş yapabilir miyim?", "Can I sign in to the app with my website account?"],
  a2: [
    "Evet, hesap aynıdır. Sitede kayıt ol, programda Hesap sayfasından aynı e-posta ve şifreyle giriş yap. PRO her iki yerde de görünür.",
    "Yes, it's the same account. Sign up here and sign in on the app's Account page with the same e-mail and password. PRO shows in both.",
  ],
  q3: ["PRO ne zaman açılır?", "When does PRO activate?"],
  a3: [
    "Ödeme tamamlanınca birkaç saniye içinde. Programda Hesap → PRO sayfasında kalan süreyi görürsün.",
    "Within seconds after payment. You'll see the remaining time on the app's Account → PRO page.",
  ],
  q4: ["Aboneliği nasıl iptal ederim?", "How do I cancel?"],
  a4: [
    "Hesabım sayfasındaki <b>Aboneliği yönet</b> bağlantısından. İptal edersen ödediğin dönemin sonuna kadar PRO kalırsın.",
    "From the <b>Manage subscription</b> link on My account. If you cancel, you stay PRO until the end of the paid period.",
  ],
  q5: ["Kaç bilgisayarda kullanabilirim?", "On how many computers can I use it?"],
  a5: [
    "Bir PRO hesap aynı anda 2 bilgisayarda kullanılabilir (ör. sim kokpiti ve yayın bilgisayarı).",
    "One PRO account can be used on 2 computers (e.g. your sim rig and your streaming PC).",
  ],
  q6: ["Özel tam ekranda overlay görünmüyor", "Overlays don't show in exclusive fullscreen"],
  a6: [
    "Windows özel tam ekranın üstünde overlay'e izin vermez. iRacing'i kenarlıksız / pencereli tam ekranda çalıştır.",
    "Windows doesn't allow overlays over exclusive fullscreen. Run iRacing in borderless / windowed fullscreen.",
  ],
  q7: ["Hangi dilleri destekliyor?", "Which languages are supported?"],
  a7: [
    "15 dil: English, Türkçe, Deutsch, Español, Français, Italiano, Português (BR/PT), Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.",
    "15 languages: English, Türkçe, Deutsch, Español, Français, Italiano, Português (BR/PT), Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.",
  ],

  cta_title: ["Pist seni bekliyor", "The track is waiting"],
  cta_lead: ["Ücretsiz indir, dakikalar içinde kur. Hesap açmak da ücretsiz.", "Download free, set up in minutes. Creating an account is free too."],
  cta_signup: ["Ücretsiz hesap aç", "Create a free account"],
});

const FEATS = [
  ["🏎️", "f1"],
  ["🎙️", "f2"],
  ["⛽", "f3"],
  ["👥", "f4"],
  ["💬", "f5"],
  ["📺", "f6"],
  ["🌍", "f7"],
  ["📸", "f8"],
  ["🎨", "f9"],
  ["🏁", "f10"],
  ["🛟", "f11"],
  ["😄", "f12"],
  ["🎬", "f13"],
  ["📣", "f14"],
];
// hesapsız, ücretsiz hesap, PRO
const CMP = [
  ["c_r1", 1, 1, 1],
  ["c_r2", 1, 1, 1],
  ["c_r3", 0, 1, 1],
  ["c_r4", 0, 1, 1],
  ["c_r5", 0, 1, 1],
  ["c_r6", 0, 0, 1],
  ["c_r7", 0, 0, 1],
  ["c_r8", 0, 0, 1],
  ["c_r9", 0, 0, 1],
  ["c_r10", 0, 0, 1],
];

let cfg = null;
let user = null;

function renderStatic() {
  $("#feat-grid").innerHTML = FEATS.map(
    ([ic, k]) => `<div class="card feat"><div class="ic">${ic}</div><h3>${T(k + "_t")}</h3><p>${T(k + "_d")}</p></div>`,
  ).join("");
  const mark = (v) => (v ? `<span class="y">✓</span>` : `<span class="n">—</span>`);
  $("#cmp-body").innerHTML = CMP.map(([k, a, b, c]) => `<tr><td>${T(k)}</td><td>${mark(a)}</td><td>${mark(b)}</td><td>${mark(c)}</td></tr>`).join("");
  $("#faq-list").innerHTML = [1, 8, 2, 3, 4, 5, 6, 7]
    .map((i) => `<details><summary>${T("q" + i)}</summary><p>${T("a" + i)}</p></details>`)
    .join("");
}

/** "€4,99" gibi fiyat metninden sayı (aylık karşılık için) */
function priceNum(s) {
  const m = String(s || "").replace(/\s/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : NaN;
}
/** Aylık karşılığı fiyattaki para birimiyle yazar: "83,25₺", "€3,75", "$4.16" */
function perMonth(s, n) {
  const str = String(s || "");
  const sym = (str.match(/[€$£₺]/) || str.match(/\b(TL|TRY|USD|EUR|GBP)\b/i) || [""])[0];
  const v = n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sym) return v;
  return /₺|TL|TRY/i.test(sym) ? `${v}${sym === "₺" ? "₺" : " " + sym}` : /^[A-Z]+$/i.test(sym) ? `${v} ${sym}` : `${sym}${v}`;
}

function renderPlans() {
  const c = cfg || {};
  $("#plans").innerHTML = PLANS.map((p) => {
    const { price, checkout: link, num, cur } = planFor(c, p);
    let per = "";
    if (p.months > 1 && num > 0) per = T("per_month", fmtMoney(num / p.months, cur));
    else if (p.months > 1 && !num) {
      const n = priceNum(price);
      if (isFinite(n)) per = T("per_month", perMonth(price, n / p.months));
    }
    const tag = p.id === "12m" ? T("best_value") : p.id === "3m" ? T("popular") : "";
    const cls = `btn ${p.id === "12m" ? "btn-accent" : ""}`;
    // Otomatik fiyat (pro-checkout) + giriş yapılmış: düğme; giriş yoksa önce hesap sayfası
    const dyn = isProCheckout(link);
    const href = link ? (!user ? `hesap.html?buy=${p.id}` : dyn ? "" : checkoutUrl(link, user)) : "";
    const btn = !link
      ? `<button class="btn" disabled>${T("soon")}</button>`
      : href
        ? `<a class="${cls}" href="${esc(href)}" data-plan="${p.id}">${T("buy")}</a>`
        : `<button class="${cls}" data-pro="${p.id}">${T("buy")}</button>`;
    return `<div class="card plan${p.id === "12m" ? " best" : ""}">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ""}
      <div class="name">${esc(planName(p))}</div>
      <div class="price">${esc(price || T("price_tbd"))}</div>
      <div class="per">${esc(per)}</div>
      ${btn}
    </div>`;
  }).join("");
  const alt = [];
  if (c.patreon_url) alt.push(`<a class="btn btn-patreon" href="${esc(c.patreon_url)}" target="_blank" rel="noopener">Patreon</a>`);
  if (c.kofi_url) alt.push(`<a class="btn" href="${esc(c.kofi_url)}" target="_blank" rel="noopener">Ko-fi</a>`);
  $("#alt-pay-btns").innerHTML = alt.join("") || `<span class="muted small">${T("soon")}</span>`;
  $("#pro-note").textContent = c.pro_note || "";
}

async function main() {
  await boot("/");
  import("./adslot.js").then((m) => m.mountAds(), () => {});
  renderStatic();
  renderPlans();
  $("#plans").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pro]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const ok = await startProCheckout(b.dataset.pro);
    if (!ok) b.disabled = false;
  });
  document.addEventListener("langchange", () => {
    renderStatic();
    renderPlans();
  });
  [cfg, user] = await Promise.all([appConfig().catch(() => ({})), currentUser()]);
  renderPlans();
  applyLang();
}
main();
