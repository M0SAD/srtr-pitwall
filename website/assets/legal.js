// Yasal sayfalar: Kullanım koşulları (kosullar.html), Gizlilik politikası (gizlilik.html), İade politikası (iade.html).
// Sayfa <main data-doc="terms|privacy|refund"> ile hangi metnin gösterileceğini söyler. Türkçe arayüzde Türkçe,
// diğer dillerde İngilizce metin gösterilir (yasal metinler yalnızca bu iki dilde tutulur).
// Paddle (Merchant of Record) satıcıdan Kullanım koşulları, Gizlilik ve İade politikası sayfalarını ister; iade için
// Paddle'ın kendi iade politikasına atıf yapılır (Paddle "iade yok" ifadesini kabul etmez).
import { $, boot, lang } from "./core.js";

const SELLER = "Erkin Azcan";
const COUNTRY_TR = "Türkiye";
const COUNTRY_EN = "Türkiye";
const EMAIL = "erkinazcan@gmail.com";
const SITE = "pitwall.simracetr.com";
const UPDATED = { tr: "10 Ekim 2026", en: "10 October 2026" };
const PADDLE_REFUND = "https://www.paddle.com/legal/refund-policy";
const PADDLE_BUYER = "https://www.paddle.com/legal/buyer-terms";

const mail = `<a href="mailto:${EMAIL}">${EMAIL}</a>`;
const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

const DOCS = {
  terms: {
    tr: {
      title: "Kullanım koşulları",
      sections: [
        ["1. Taraflar ve kabul", [
          `SRTR Pitwall; Windows programı, ${SITE} web sitesi ve bunlara bağlı bulut hesabı hizmetlerinden ("Hizmet") oluşur. Hizmet, ${SELLER} (${COUNTRY_TR}) tarafından sunulur ("biz").`,
          "Hizmeti indirerek, kullanarak ya da hesap oluşturarak bu koşulları kabul etmiş olursun. Kabul etmiyorsan Hizmeti kullanma.",
        ]],
        ["2. Hizmet", [
          "SRTR Pitwall, yarış simülasyonları (ör. iRacing, Assetto Corsa Competizione, Le Mans Ultimate) için ekran üstü göstergeler (overlay), telemetri, canlı yayın araçları ve topluluk özellikleri sunan bir programdır.",
          "Programın temel özellikleri ücretsizdir. PRO üyelik ek özellikleri açar. Sitede reklam alanı da satın alınabilir.",
          "Hizmeti geliştirmek için özellikleri zaman zaman değiştirebilir, ekleyebilir ya da kaldırabiliriz.",
        ]],
        ["3. Hesap", [
          "Hesap oluştururken doğru bilgi vermeli ve şifreni gizli tutmalısın. Hesabında yapılan işlemlerden sen sorumlusun.",
          "Hizmeti kullanmak için en az 13 yaşında olmalısın. Yaşadığın ülkede reşit değilsen veli ya da vasinin izni gerekir.",
          "PRO üyelik kişiseldir. Hesabın aynı anda sınırlı sayıda bilgisayarda kullanılabilir; hesabın başkalarıyla paylaşılması yasaktır.",
        ]],
        ["4. Ödeme ve abonelik", [
          "Sipariş sürecimiz çevrimiçi satıcımız Paddle.com tarafından yürütülür. Paddle.com, tüm siparişlerimizin satıcısıdır (Merchant of Record). Ödemeler, faturalar, vergiler ve müşteri hizmetleriyle ilgili ödeme soruları Paddle tarafından yürütülür; satın alma işlemi ayrıca " + link(PADDLE_BUYER, "Paddle'ın alıcı koşullarına") + " tabidir.",
          "PRO üyelik 1, 3, 6 ya da 12 aylık dönemlerle satılan bir aboneliktir ve iptal edilene kadar her dönemin sonunda aynı tutar üzerinden kendiliğinden yenilenir. Fiyatlar ödeme sayfasında, varsa vergiler dahil olarak gösterilir.",
          "Aboneliğini istediğin zaman Hesabım sayfasındaki \"Aboneliği yönet\" bağlantısından ya da paddle.net üzerinden iptal edebilirsin. İptal, ödenmiş dönemin sonunda geçerli olur; o tarihe kadar PRO özellikleri açık kalır. Kalan süre için kısmi iade yapılmaz.",
          "Fiyat değişiklikleri yalnızca yeni aboneliklere uygulanır; mevcut aboneliğin kendi fiyatından yenilenir.",
          "Başka bir üyeye hediye edilen PRO aboneliğinde ödemeyi ve yenilemeleri hediye eden yapar; hediye eden aboneliği istediği zaman sonlandırabilir.",
          "İndirim kuponları ödeme sayfasında belirtilen koşullarla ve süreyle geçerlidir.",
          "Reklam alanı satın alımları tek seferliktir. Reklamlar yayına girmeden önce incelenebilir; uygun bulunmayan ödenmiş reklamın ücreti iade edilir.",
        ]],
        ["5. İade", [
          "İadeler " + `<a href="iade.html">İade politikamıza</a>` + " tabidir.",
        ]],
        ["6. Kabul edilebilir kullanım", [
          "Hizmeti yasalara, kullandığın oyunların ve platformların (ör. iRacing, Twitch, YouTube, Kick) kurallarına uygun kullanmalısın.",
          "PRO kilidini aşmaya çalışmak, programı kırmak, değiştirilmiş kopyasını dağıtmak, Hizmete saldırmak ya da başkalarının hesaplarına erişmeye çalışmak yasaktır.",
          "Paylaştığın içerikler (profil, düzenler, mesajlar, reklamlar) yasa dışı, nefret söylemi içeren, taciz edici ya da başkalarının haklarını ihlal eden nitelikte olamaz.",
        ]],
        ["7. Fikri mülkiyet", [
          "Program, web sitesi, tasarımlar ve markalar bize aittir. Sana Hizmeti kişisel olarak kullanman için devredilemez, münhasır olmayan bir kullanım hakkı veriyoruz.",
          "Paylaştığın içerik sana aittir; bu içeriği Hizmet içinde göstermemiz ve saklamamız için bize gerekli izni vermiş olursun.",
          "iRacing ve diğer oyun, araç ve marka adları sahiplerinin ticari markalarıdır. SRTR Pitwall bu şirketlerle bağlantılı değildir.",
        ]],
        ["8. Hizmet düzeyi ve sorumluluk", [
          "Hizmet \"olduğu gibi\" sunulur. Kesintisiz ya da hatasız çalışacağını, gösterilen verilerin (ör. telemetri, yakıt hesabı, sıralama) her zaman doğru olacağını garanti etmeyiz. Yarış sırasında verdiğin kararlardan sen sorumlusun.",
          "Yasaların izin verdiği ölçüde, Hizmetin kullanımından doğan dolaylı zararlardan sorumlu değiliz. Bu koşullar, tüketici olarak yasalardan doğan haklarını ortadan kaldırmaz.",
        ]],
        ["9. Askıya alma ve fesih", [
          "Bu koşulları ihlal eden hesapları askıya alabilir ya da kapatabiliriz. Hesabını istediğin zaman kapatabilirsin; bunun için bize yazman yeterli.",
        ]],
        ["10. Değişiklikler", [
          "Bu koşulları güncelleyebiliriz. Önemli değişiklikleri sitede duyururuz; değişiklikten sonra Hizmeti kullanmaya devam etmen yeni koşulları kabul ettiğin anlamına gelir.",
        ]],
        ["11. Uygulanacak hukuk", [
          "Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Yaşadığın ülkenin tüketiciyi koruma kuralları sana daha fazla hak tanıyorsa o haklar saklıdır.",
        ]],
        ["12. İletişim", [`Sorular için: ${mail}`]],
      ],
    },
    en: {
      title: "Terms of Service",
      sections: [
        ["1. Parties and acceptance", [
          `SRTR Pitwall consists of the Windows application, the ${SITE} website and the related cloud account services (the "Service"). The Service is provided by ${SELLER} (${COUNTRY_EN}) ("we", "us").`,
          "By downloading or using the Service or creating an account, you agree to these terms. If you do not agree, do not use the Service.",
        ]],
        ["2. The Service", [
          "SRTR Pitwall is an application that provides on-screen overlays, telemetry, live streaming tools and community features for racing simulators (e.g. iRacing, Assetto Corsa Competizione, Le Mans Ultimate).",
          "The core features of the app are free. A PRO membership unlocks additional features. Advertising placements can also be purchased on the website.",
          "We may change, add or remove features from time to time to improve the Service.",
        ]],
        ["3. Your account", [
          "You must provide accurate information and keep your password confidential. You are responsible for activity on your account.",
          "You must be at least 13 years old to use the Service. If you are a minor where you live, you need the consent of a parent or guardian.",
          "A PRO membership is personal. Your account may be used on a limited number of computers; sharing your account with others is not allowed.",
        ]],
        ["4. Payments and subscriptions", [
          "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries about payments and handles returns; purchases are also subject to " + link(PADDLE_BUYER, "Paddle's buyer terms") + ".",
          "PRO membership is a subscription billed every 1, 3, 6 or 12 months. It renews automatically at the end of each period at the same price until cancelled. Prices are shown at checkout, including applicable taxes.",
          "You can cancel at any time from the \"Manage subscription\" link on your account page or via paddle.net. Cancellation takes effect at the end of the paid period; PRO features stay available until then. No partial refunds are given for the remaining time.",
          "Price changes apply to new subscriptions only; an existing subscription renews at its own price.",
          "For a PRO subscription gifted to another member, the gifter pays the initial and renewal payments and may end the gift at any time.",
          "Discount coupons are valid under the conditions and for the period shown at checkout.",
          "Advertising purchases are one-time payments. Ads may be reviewed before going live; a paid ad that is rejected is refunded.",
        ]],
        ["5. Refunds", ["Refunds are governed by our " + `<a href="iade.html">Refund Policy</a>` + "."]],
        ["6. Acceptable use", [
          "You must use the Service in line with the law and the rules of the games and platforms you use (e.g. iRacing, Twitch, YouTube, Kick).",
          "You may not attempt to bypass the PRO lock, crack or redistribute modified copies of the app, attack the Service or access other people's accounts.",
          "Content you share (profile, layouts, messages, ads) must not be illegal, hateful, harassing or infringe the rights of others.",
        ]],
        ["7. Intellectual property", [
          "The application, website, designs and brand belong to us. We grant you a personal, non-transferable, non-exclusive licence to use the Service.",
          "Content you share remains yours; you grant us the permission needed to store and display it within the Service.",
          "iRacing and other game, car and brand names are trademarks of their respective owners. SRTR Pitwall is not affiliated with these companies.",
        ]],
        ["8. Service level and liability", [
          "The Service is provided \"as is\". We do not guarantee that it will be uninterrupted or error-free, or that displayed data (e.g. telemetry, fuel calculations, standings) is always accurate. You are responsible for decisions you make while racing.",
          "To the extent permitted by law, we are not liable for indirect damages arising from the use of the Service. Nothing in these terms limits your statutory consumer rights.",
        ]],
        ["9. Suspension and termination", [
          "We may suspend or close accounts that breach these terms. You may close your account at any time by contacting us.",
        ]],
        ["10. Changes", [
          "We may update these terms. We will announce significant changes on the website; continuing to use the Service after a change means you accept the updated terms.",
        ]],
        ["11. Governing law", [
          "These terms are governed by the laws of the Republic of Türkiye. Any additional rights you have under the consumer protection laws of your country remain unaffected.",
        ]],
        ["12. Contact", [`Questions: ${mail}`]],
      ],
    },
  },

  privacy: {
    tr: {
      title: "Gizlilik politikası",
      sections: [
        ["1. Veri sorumlusu", [
          `Kişisel verilerin, SRTR Pitwall'u sunan ${SELLER} (${COUNTRY_TR}) tarafından işlenir. İletişim: ${mail}. Bu politika 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve geçerli olduğu durumlarda AB Genel Veri Koruma Tüzüğü (GDPR) dikkate alınarak hazırlanmıştır.`,
        ]],
        ["2. Topladığımız veriler", [
          "<b>Hesap:</b> e-posta adresi ve şifre (şifre yalnızca şifrelenmiş olarak saklanır), görünen ad, üyelik tarihi.",
          "<b>Profil (isteğe bağlı):</b> profil fotoğrafı, kısa tanıtım, sosyal medya bağlantıları.",
          "<b>Simülasyon bilgileri:</b> programın oyundan okuduğu kendi sürücü adın ve üye numaran (ör. iRacing adı), lisans / derecelendirme bilgileri, ülke.",
          "<b>Telemetri:</b> sürdüğün turların zamanları, sektörleri, pist / araç bilgisi ve tur izleri. Telemetri verileri sıralamalar ve topluluk karşılaştırmaları için diğer üyelere açık olarak gösterilir.",
          "<b>Ayarlar ve içerik:</b> bulut yedeği alınan program ayarların, paylaştığın düzenler, arkadaş listesi, mesajlar, takım ve grup içerikleri, destek talepleri.",
          "<b>Cihaz:</b> hesabın kullanıldığı bilgisayarları ayırt etmek için bilgisayara özgü bir karma (hash) değeri, bilgisayar adı ve program sürümü (cihaz sınırı ve kötüye kullanımın önlenmesi için).",
          "<b>Ödeme:</b> ödemeler Paddle tarafından işlenir. Kart bilgilerini görmeyiz; Paddle'dan yalnızca e-posta, tutar, para birimi, plan ve abonelik durumu bilgisini alırız.",
          "<b>Web sitesi:</b> sayfa ziyaret sayıları için tarayıcında rastgele oluşturulan anonim bir ziyaretçi kimliği, ziyaret edilen sayfa, yönlendiren adres ve tarayıcı dili.",
          "<b>Canlı sohbet özellikleri:</b> Twitch / YouTube / Kick sohbet bağlantıları ve oturum bilgileri yalnızca senin bilgisayarında, şifrelenmiş olarak tutulur; sohbet mesajları sunucularımıza gönderilmez (sohbet günlüğünü açarsan yalnızca bilgisayarına kaydedilir).",
        ]],
        ["3. Kullanım amaçları ve hukuki sebepler", [
          "Hizmeti sunmak, hesabını yönetmek, ayarlarını yedeklemek ve PRO üyeliği sağlamak (sözleşmenin ifası).",
          "Ödemeleri ve abonelikleri işlemek, faturalama ve muhasebe (sözleşmenin ifası, yasal yükümlülük).",
          "Güvenlik, hesap paylaşımı ve kötüye kullanımın önlenmesi, Hizmetin geliştirilmesi (meşru menfaat).",
          "Bildirim e-postaları: hesap, ödeme, PRO süresi ve destek ile ilgili e-postalar. E-posta tercihlerini Hesabım sayfasından değiştirebilirsin.",
        ]],
        ["4. Verilerin aktarıldığı hizmet sağlayıcılar", [
          "<b>Supabase</b> (veritabanı, kimlik doğrulama, dosya depolama ve sunucu fonksiyonları; sunucular AB'de, Frankfurt).",
          "<b>Paddle</b> (ödeme işleme; satıcı / Merchant of Record). Paddle verilerini kendi gizlilik politikasına göre işler.",
          "<b>GitHub</b> (web sitesinin ve program güncellemelerinin barındırılması).",
          "<b>Google (Gmail)</b> (bildirim e-postalarının gönderilmesi).",
          "Bu sağlayıcıların bir kısmı yurt dışında bulunduğundan veriler yurt dışına aktarılabilir. Verilerini satmayız ve reklam amacıyla üçüncü kişilerle paylaşmayız.",
        ]],
        ["5. Saklama süresi", [
          "Verilerini hesabın açık olduğu sürece saklarız. Hesabını kapatmanı istediğinde kişisel verilerini sileriz ya da anonim hâle getiririz; yasal olarak saklamamız gereken ödeme kayıtları ilgili süre boyunca tutulur.",
        ]],
        ["6. Çerezler ve tarayıcı depolama", [
          "Web sitesi reklam ya da izleme çerezi kullanmaz. Tarayıcı depolaması yalnızca oturumunu açık tutmak, dil tercihini ve anonim ziyaretçi kimliğini saklamak için kullanılır. Ödeme sayfasında Paddle kendi çerezlerini kullanabilir.",
        ]],
        ["7. Hakların", [
          "KVKK'nın 11. maddesi ve GDPR kapsamında; verilerinin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltme, silme, işlemeye itiraz etme, verilerinin bir kopyasını isteme ve şikâyet hakkına sahipsin. Taleplerin için " + mail + " adresine yazabilirsin. Profil bilgilerinin çoğunu Hesabım sayfasından kendin de değiştirebilirsin.",
        ]],
        ["8. Çocuklar", ["Hizmet 13 yaşından küçük çocuklara yönelik değildir ve bilerek bu yaştaki çocukların verilerini toplamayız."]],
        ["9. Değişiklikler", ["Bu politikayı güncelleyebiliriz; güncel hâli her zaman bu sayfadadır."]],
      ],
    },
    en: {
      title: "Privacy Policy",
      sections: [
        ["1. Data controller", [
          `Your personal data is processed by ${SELLER} (${COUNTRY_EN}), who provides SRTR Pitwall. Contact: ${mail}. This policy takes into account Turkish Law No. 6698 on the Protection of Personal Data (KVKK) and, where applicable, the EU General Data Protection Regulation (GDPR).`,
        ]],
        ["2. Data we collect", [
          "<b>Account:</b> e-mail address and password (stored only in hashed form), display name, sign-up date.",
          "<b>Profile (optional):</b> profile photo, short bio, social media links.",
          "<b>Simulator details:</b> your own driver name and member ID read from the game (e.g. iRacing name), licence / rating details, country.",
          "<b>Telemetry:</b> lap times, sectors, track / car details and lap traces you drive. Telemetry is shown publicly to other members for leaderboards and community comparisons.",
          "<b>Settings and content:</b> app settings backed up to the cloud, layouts you share, friends list, messages, team and group content, support tickets.",
          "<b>Device:</b> a hash that identifies the computer, the computer name and the app version, used to enforce the device limit and prevent misuse.",
          "<b>Payments:</b> payments are processed by Paddle. We never see your card details; we only receive your e-mail, the amount, currency, plan and subscription status from Paddle.",
          "<b>Website:</b> an anonymous visitor ID generated in your browser, the page visited, the referrer and browser language, to count page visits.",
          "<b>Live chat features:</b> Twitch / YouTube / Kick chat connections and sign-in details are stored only on your computer, encrypted; chat messages are not sent to our servers (if you enable the chat log, it is saved only on your computer).",
        ]],
        ["3. Purposes and legal bases", [
          "Providing the Service, managing your account, backing up your settings and providing PRO membership (performance of a contract).",
          "Processing payments and subscriptions, billing and accounting (performance of a contract, legal obligation).",
          "Security, preventing account sharing and misuse, improving the Service (legitimate interest).",
          "Notification e-mails about your account, payments, PRO period and support. You can change your e-mail preferences on your account page.",
        ]],
        ["4. Service providers", [
          "<b>Supabase</b> (database, authentication, file storage and server functions; servers in the EU, Frankfurt).",
          "<b>Paddle</b> (payment processing; Merchant of Record). Paddle processes your data under its own privacy policy.",
          "<b>GitHub</b> (hosting of the website and app updates).",
          "<b>Google (Gmail)</b> (sending notification e-mails).",
          "Some of these providers are located abroad, so your data may be transferred internationally. We do not sell your data or share it with third parties for advertising.",
        ]],
        ["5. Retention", [
          "We keep your data while your account is open. When you ask us to close your account we delete or anonymise your personal data; payment records we are legally required to keep are retained for the required period.",
        ]],
        ["6. Cookies and browser storage", [
          "The website does not use advertising or tracking cookies. Browser storage is used only to keep you signed in and to remember your language and the anonymous visitor ID. Paddle may use its own cookies on the checkout.",
        ]],
        ["7. Your rights", [
          "Under KVKK Article 11 and the GDPR you have the right to know whether your data is processed, to request information, rectification, erasure, to object, to receive a copy of your data and to lodge a complaint. Send requests to " + mail + ". You can also edit most profile details yourself on your account page.",
        ]],
        ["8. Children", ["The Service is not directed at children under 13 and we do not knowingly collect their data."]],
        ["9. Changes", ["We may update this policy; the current version is always on this page."]],
      ],
    },
  },

  refund: {
    tr: {
      title: "İade politikası",
      sections: [
        ["1. Satıcı ve iade süreci", [
          "Tüm siparişlerimiz çevrimiçi satıcımız Paddle.com tarafından işlenir; Paddle.com siparişlerin satıcısıdır (Merchant of Record). İadeler " + link(PADDLE_REFUND, "Paddle'ın İade Politikası") + " kapsamında Paddle tarafından değerlendirilir ve yapılır.",
        ]],
        ["2. İade hakkı", [
          "Yasaların zorunlu kıldığı durumlarda (ör. Türkiye, AB ve Birleşik Krallık'ta ilk ödemeden itibaren 14 günlük cayma hakkı) iade hakkın saklıdır. Dijital içeriğin hemen kullanılmaya başlanmasına açıkça onay verdiğin durumlarda bu hak yasaların öngördüğü ölçüde sona erebilir.",
          "Bunun dışında iade talepleri, işlem tarihinden itibaren 14 gün içinde yapılmak şartıyla Paddle tarafından duruma göre değerlendirilir; talepte bulunmak iadeyi garanti etmez.",
          "Abonelik yenileme ödemeleri ve dönemin kalan kısmı için kısmi iade yapılmaz.",
          "İade yapılan ödemeye bağlı PRO süresi ya da hizmet sona erer.",
        ]],
        ["3. Abonelik iptali", [
          "Aboneliğini istediğin zaman Hesabım sayfasındaki \"Aboneliği yönet\" bağlantısından ya da paddle.net üzerinden iptal edebilirsin. İptal sonraki yenilemeleri durdurur ve ödenmiş dönemin sonunda geçerli olur; o tarihe kadar PRO özelliklerini kullanmaya devam edersin.",
        ]],
        ["4. Reklam ödemeleri", [
          "Yayına alınması uygun bulunmayan (reddedilen) ödenmiş reklamların ücreti iade edilir. Yayına girmiş reklamlar için iade yukarıdaki kurallara tabidir.",
        ]],
        ["5. İade talebi", [
          "İade talebi için " + link("https://paddle.net", "paddle.net") + " adresinden siparişini bulup Paddle'a başvurabilir ya da " + mail + " adresine sipariş e-postanla birlikte yazabilirsin.",
        ]],
      ],
    },
    en: {
      title: "Refund Policy",
      sections: [
        ["1. Seller and refund process", [
          "All our orders are processed by our online reseller Paddle.com, the Merchant of Record for our orders. Refunds are assessed and issued by Paddle under " + link(PADDLE_REFUND, "Paddle's Refund Policy") + ".",
        ]],
        ["2. Refund eligibility", [
          "Where the law requires it (e.g. the 14-day right of withdrawal from the first payment in Türkiye, the EU and the UK), your right to a refund is preserved. If you expressly agreed to start using digital content immediately, this right may end to the extent the law allows.",
          "Otherwise, refund requests made within 14 days of the transaction date are reviewed by Paddle case by case; submitting a request does not guarantee a refund.",
          "Subscription renewal payments and the remaining part of a billing period are not partially refunded.",
          "When a payment is refunded, the PRO period or service linked to it ends.",
        ]],
        ["3. Cancelling a subscription", [
          "You can cancel at any time from the \"Manage subscription\" link on your account page or via paddle.net. Cancelling stops future renewals and takes effect at the end of the paid period; you keep PRO features until then.",
        ]],
        ["4. Advertising payments", [
          "Paid ads that are rejected and not published are refunded. Refunds for ads that have gone live follow the rules above.",
        ]],
        ["5. Requesting a refund", [
          "To request a refund, find your order at " + link("https://paddle.net", "paddle.net") + " and contact Paddle, or e-mail " + mail + " with the e-mail address used for the order.",
        ]],
      ],
    },
  },
};

async function main() {
  const main = $("#app");
  const doc = DOCS[main?.dataset.doc] ?? DOCS.terms;
  await boot(main?.dataset.doc ?? "legal");
  const tr = lang === "tr";
  const d = tr ? doc.tr : doc.en;
  document.title = `${d.title} — SRTR Pitwall`;
  main.innerHTML = `
    <article class="page legal" style="max-width:820px">
      <h1>${d.title}</h1>
      <p class="muted small">${tr ? "Son güncelleme" : "Last updated"}: ${tr ? UPDATED.tr : UPDATED.en}
        ${tr ? "" : ` · <a href="?lang=tr">Türkçe</a>`}</p>
      ${d.sections
        .map(
          ([h, ps]) => `<h2 style="font-size:20px;margin:28px 0 8px">${h}</h2>${
            ps.length > 2 && ps.every((p) => p.startsWith("<b>"))
              ? `<ul>${ps.map((p) => `<li style="margin:6px 0">${p}</li>`).join("")}</ul>`
              : ps.map((p) => `<p>${p}</p>`).join("")
          }`,
        )
        .join("")}
      <p class="muted small" style="margin-top:32px">${SELLER} · ${tr ? COUNTRY_TR : COUNTRY_EN} · ${mail}</p>
    </article>`;
}

main();
