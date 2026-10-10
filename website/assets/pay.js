// Ödeme sayfası (odeme.html): Paddle Billing ödemesini açar.
//
// Paddle'ın "default payment link"i bu sayfadır: pro-checkout / ads-checkout'un oluşturduğu ödeme bağlantıları
// (odeme.html?_ptxn=txn_…&done=…) ve Paddle'ın kendi e-postalarındaki bağlantılar (ör. kart güncelleme, başarısız
// yenileme ödemesi) buraya gelir. Paddle.js, adreste _ptxn varsa ödemeyi kendiliğinden açar.
// İstemci anahtarı (client-side token) ve ortam pro-checkout'tan alınır ({op:"paddle_config"}, oturum gerekmez).
// Ödeme bitince "done" adresine (yalnızca bu sitenin hesap / reklam sayfası) dönülür; program ödeme penceresinde de
// bu sayfayı açar ve hesap.html?paid= adresine gidilince pencereyi kapatır.
import { $, T, addDict, boot, esc, loadPaddle, paddleLocale, sb } from "./core.js";

addDict({
  pay_title: ["Ödeme", "Payment"],
  pay_loading: ["Ödeme sayfası açılıyor…", "Opening the checkout…"],
  pay_closed: ["Ödeme penceresi kapatıldı. Ödemeyi tamamlamadıysan yeniden açabilirsin.", "The checkout was closed. If you haven't finished paying, you can open it again."],
  pay_reopen: ["Ödemeyi yeniden aç", "Open the checkout again"],
  pay_done: ["Ödeme alındı, teşekkürler! Yönlendiriliyorsun…", "Payment received, thank you! Redirecting…"],
  pay_invalid: ["Ödeme bağlantısı geçersiz ya da eksik. Ödemeyi hesap sayfandan yeniden başlat.", "The payment link is invalid or incomplete. Start the payment again from your account page."],
  pay_failed: ["Ödeme sayfası açılamadı. Reklam engelleyiciyi kapatıp sayfayı yenile.", "The checkout couldn't be opened. Turn off any ad blocker and reload the page."],
  pay_back: ["Hesabıma dön", "Back to my account"],
  pay_secure: ["Ödeme, satıcı kaydı (Merchant of Record) olarak Paddle tarafından güvenle alınır.", "Payment is processed securely by Paddle as Merchant of Record."],
});

const q = new URLSearchParams(location.search);
const txn = q.get("_ptxn") || "";
/** Dönüş adresi: yalnızca bu sitenin hesap / reklam sayfası (açık yönlendirme olmasın) */
function doneUrl() {
  const d = q.get("done") || "";
  const ok = /^(hesap|reklam)\.html(\?paid=[A-Za-z0-9-]{1,64})?$/.test(d);
  return new URL(ok ? d : "hesap.html", location.href).href;
}

function view(msg, { retry = false, back = true } = {}) {
  $("#app").innerHTML = `
    <section class="page" style="max-width:560px;margin:48px auto;text-align:center">
      <h1>${esc(T("pay_title"))}</h1>
      <p class="muted" id="pay-msg">${esc(msg)}</p>
      <p style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${retry ? `<button type="button" class="btn btn-accent" id="pay-retry">${esc(T("pay_reopen"))}</button>` : ""}
        ${back ? `<a class="btn btn-ghost" href="hesap.html">${esc(T("pay_back"))}</a>` : ""}
      </p>
      <p class="muted small" style="margin-top:28px">${esc(T("pay_secure"))}</p>
    </section>`;
  $("#pay-retry")?.addEventListener("click", open);
}

let paddle = null;
let completed = false;

function open() {
  if (!paddle) return;
  view(T("pay_loading"), { back: false });
  paddle.Checkout.open({ transactionId: txn, settings: { displayMode: "overlay", theme: "dark", locale: paddleLocale(), successUrl: doneUrl() } });
}

async function main() {
  await boot("odeme");
  if (!/^txn_[A-Za-z0-9]{8,64}$/.test(txn)) return view(T("pay_invalid"));
  view(T("pay_loading"), { back: false });
  try {
    const { data, error } = await sb.functions.invoke("pro-checkout", { body: { op: "paddle_config" } });
    if (error || !data?.token) throw new Error("config");
    paddle = await loadPaddle(
      data.token,
      data.env,
      (e) => {
        if (e?.name === "checkout.completed") {
          completed = true;
          view(T("pay_done"), { back: false });
          // successUrl yönlendirmesi gecikirse
          setTimeout(() => (location.href = doneUrl()), 2500);
        } else if (e?.name === "checkout.closed" && !completed) {
          view(T("pay_closed"), { retry: true });
        }
      },
      // _ptxn adreste olduğu için Paddle.js ödemeyi Initialize ile kendiliğinden açar; ayarlar burada verilir
      { displayMode: "overlay", theme: "dark", locale: paddleLocale(), successUrl: doneUrl() },
    );
  } catch {
    view(T("pay_failed"), { retry: false });
  }
}

main();
