// Kendi ödeme bağlantısı (ör. ByNoGame) için pencere: açıklama, ödeme sayfasını açma ve isteğe bağlı "Satın alım yaptım"
// bildirimi. Üye düğmeye basıp kullanıcı adını / e-postasını ve ödeme bilgisini gönderir; yöneticilere uygulama içi bildirim
// ve e-posta gider, PRO elle (gün içinde) tanımlanır.
import { Show, createSignal } from "solid-js";
import { profile, sendPayClaim, type PayCat, type PayLink } from "@/cloud/account";
import { session } from "@/cloud/supabase";
import { t } from "@/sdk/i18n";
import * as I from "../icons";

export function PayLinkDialog(p: { link: PayLink; cat?: PayCat | null; gift?: string; open: (url: string) => void; onClose: () => void }) {
  /** Hediye ödemesinde alıcıyı iletmek için form her zaman açık */
  const form = () => !!p.link.claim || !!p.gift;
  const method = () => [p.cat?.title, p.link.title || p.link.url, p.link.price].filter(Boolean).join(" · ");
  const [contact, setContact] = createSignal(profile()?.display_name || session()?.user.email || "");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal(false);
  /** "Satın alım yaptım" denince bildirim formu açılır (hediyede alıcıyı iletmek için baştan açık) */
  const [bought, setBought] = createSignal(!!p.gift);
  /** Sabit Patreon kategorisinde PRO kendiliğinden açılır; diğer (kendi) bağlantılarda yönetici gün içinde elle tanımlar */
  const manual = () => p.cat?.id !== "__patreon";
  const bynogame = () => /(^|\.)bynogame\.com$/i.test((() => {
    try {
      return new URL(p.link.url).hostname;
    } catch {
      return "";
    }
  })());
  const send = async () => {
    if (busy() || contact().trim().length < 2) return;
    setBusy(true);
    setErr("");
    try {
      await sendPayClaim(method(), contact().trim(), [p.gift ? t("Hediye alıcısı: {0}", p.gift) : "", note().trim()].filter(Boolean).join("\n"));
      setSent(true);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="modal paydlg">
        <header>
          <Show when={p.cat?.img}>
            <img class="paydlg-logo" src={p.cat!.img} alt="" draggable={false} />
          </Show>
          <h3 data-no-i18n>
            {p.link.title || p.link.url}
            <Show when={p.link.price}>
              <span class="paydlg-price">{p.link.price}</span>
            </Show>
          </h3>
          <button class="icon-btn" title={t("Kapat")} onClick={p.onClose}>
            <I.X />
          </button>
        </header>
        <Show when={p.gift}>
          <p class="paydlg-gift">{t("🎁 Hediye alıcısı: {0}", p.gift!)}</p>
        </Show>
        <Show when={p.link.note}>
          <p class="paydlg-note" data-no-i18n>
            {p.link.note}
          </p>
        </Show>
        <div class="paydlg-step">
          <Show when={form()}>
            <b>1. Ödemeyi yap</b>
          </Show>
          <button class="btn primary" onClick={() => p.open(p.link.url)}>
            <I.ExternalLink /> Ödeme sayfasını aç
          </button>
          <Show when={manual()}>
            <p class="paydlg-info">PRO üyeliğin, ödemen kontrol edildikten sonra gün içinde tanımlanır.</p>
          </Show>
          <Show when={bynogame()}>
            <p class="paydlg-warn">ByNoGame'de siparişin teslim edildiğinde teslimatı onaylamayı unutma.</p>
          </Show>
        </div>
        <Show when={form()}>
          <div class="paydlg-step">
            <b>2. Satın alımını bildir (isteğe bağlı)</b>
            <Show when={session()} fallback={<p class="muted small">Bildirim göndermek için önce hesabına giriş yap.</p>}>
              <Show
                when={!sent()}
                fallback={<p class="paydlg-ok">Bildirimin gönderildi. Ödemen kontrol edildikten sonra PRO üyeliğin gün içinde tanımlanacak.</p>}
              >
                <Show
                  when={bought()}
                  fallback={
                    <>
                      <p class="muted small">Ödemeyi yaptıysan haber ver; üyeliğin daha hızlı tanımlanır.</p>
                      <button class="btn" onClick={() => setBought(true)}>
                        <I.Check /> Satın alım yaptım
                      </button>
                    </>
                  }
                >
                  <p class="muted small">Ödemeyi yaptıktan sonra SRTR Pitwall kullanıcı adını ya da e-postanı yazıp gönder; üyeliğin bu bilgiye göre tanımlanır.</p>
                  <input class="input" maxLength={200} placeholder="Kullanıcı adın ya da e-postan" value={contact()} onInput={(e) => setContact(e.currentTarget.value)} />
                  <label class="paydlg-lbl">Ödeme bilgilerin</label>
                  <textarea
                    class="input"
                    rows={4}
                    maxLength={900}
                    placeholder="Ödemede kullandığın ad, tutar, tarih ve saat, sipariş / işlem numarası, seçtiğin süre…"
                    value={note()}
                    onInput={(e) => setNote(e.currentTarget.value)}
                  />
                  <Show when={err()}>
                    <p class="error small">{err()}</p>
                  </Show>
                  <button class="btn primary" disabled={busy() || contact().trim().length < 2} onClick={send}>
                    {busy() ? "Gönderiliyor…" : "Bildirimi gönder"}
                  </button>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
