// Canlı Sohbet › Sohbete yaz (PRO: livechat.send). Ayarlar KİŞİYE özeldir; yönetici ayarı / sunucu işlevi yoktur.
// Varsayılan yöntem "Tarayıcı girişi": program içinde açılan pencerede platformun kendi sayfasında giriş yapılır,
// mesaj o sayfanın sohbet kutusundan gönderilir (Rust: livechat/webchat.rs). Şifre ve çerezler programa gelmez.
// İsteğe bağlı "Gelişmiş: kendi API uygulamam": kullanıcının kendi Client ID / Client Secret'ı (Rust: livechat/send.rs).

import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { PlatformIcon } from "@/overlays/livechat/parts";
import { ProLockBox } from "../../components/ProLock";
import { go, openUrl } from "../../ui";
import * as I from "../../icons";
import { StatusPill, errText, toast } from "./common";

type P = LC.SendPlatform;
const PS: P[] = ["twitch", "youtube", "kick"];

export function SendTab() {
  const [st, setSt] = createSignal<LC.SendStatus | null>(null);
  const [busy, setBusy] = createSignal<P | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const refresh = () => LC.sendStatus().then(setSt).catch(() => {});
  // Pencere / yayın durumu olay göndermeden de değişebilir (yayın açıldı, pencere kapatıldı): seyrek yenile
  const tick = setInterval(() => {
    setNow(Date.now());
    if (Math.floor(Date.now() / 1000) % 4 === 0) void refresh();
  }, 1000);
  onCleanup(() => clearInterval(tick));
  onMount(() => {
    void refresh();
    let un: (() => void) | undefined;
    void LC.onSend(setSt).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveSend);
  const web = (p: P) => st()?.web?.[p];
  const api = (p: P) => st()?.api?.[p];

  // Son denemenin hatası (platform başına; kart içinde kalıcı görünür) ve "Bağlantıyı test et" sonuçları
  const [fails, setFails] = createSignal<Partial<Record<P, string>>>({});
  const [tests, setTests] = createSignal<Partial<Record<P, LC.AuthTestStep[]>>>({});
  const [testing, setTesting] = createSignal<P | null>(null);
  /** Komutu çalıştır; hata hem bildirim olarak hem kartta görünür */
  const act = async (p: P, fn: () => Promise<LC.SendStatus>, ok?: string) => {
    if (locked()) {
      toast(t("Sohbete yazma PRO üyelere özel."), true);
      return;
    }
    setBusy(p);
    setFails((x) => ({ ...x, [p]: undefined }));
    try {
      setSt(await fn());
      if (ok) toast(ok);
    } catch (e) {
      toast(errText(e), true);
      setFails((x) => ({ ...x, [p]: errText(e) }));
      void refresh();
    } finally {
      setBusy(null);
    }
  };
  const runTest = async (p: P) => {
    setTesting(p);
    try {
      const steps = await LC.authTest(p);
      setTests((x) => ({ ...x, [p]: steps }));
    } catch (e) {
      setTests((x) => ({ ...x, [p]: [{ name: t("Test"), state: "fail", detail: errText(e) }] }));
    } finally {
      setTesting(null);
      void refresh();
    }
  };
  /** Son hata: bu oturumdaki deneme ya da programın sakladığı (sekme değişse de kalır) */
  const lastErr = (p: P) => fails()[p] || st()?.lastError?.[p] || "";
  const copyLog = async () => {
    const s = st();
    const lines = [
      "SRTR Pitwall · Sohbete yaz tanılama günlüğü",
      `zaman: ${new Date().toISOString()}`,
      `PRO izni: ${s?.allowed ? "var" : "yok"}`,
      ...PS.map((p) => {
        const w = s?.web?.[p];
        const a = s?.api?.[p];
        return `${p}: yöntem ${s?.[p]?.mode || "yok"} · tarayıcı girişi ${w?.enabled ? "açık" : "kapalı"} · oturum ${w?.logged === true ? "var" : w?.logged === false ? "yok" : "belirsiz"} · pencere ${w?.window ? (w.visible ? "görünür" : "gizli") : "yok"} · sohbet ${w?.running ? "çalışıyor" : "duruyor"} · hedef kanal ${w?.hasTarget ? "var" : "yok"} · API ${a?.connected ? "bağlı" : a?.clientId ? "bilgiler girilmiş" : "kullanılmıyor"}${lastErr(p) ? ` · son hata: ${lastErr(p)}` : ""}`;
      }),
      "--- adımlar ---",
      ...(s?.log?.length ? s.log : ["(kayıt yok: önce “Giriş penceresini aç” ya da “Bağlantıyı test et” çalıştır)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast(t("Günlük kopyalandı"));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const copyText = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast(t("Kopyalandı")))
      .catch((e) => toast(errText(e), true));
  const redirectOf = (p: P) => (p === "youtube" ? st()?.ytRedirect : p === "kick" ? st()?.kickRedirect : "") ?? "";
  const apiWaiting = (p: P) => (p === "twitch" && !!st()?.device) || st()?.pending === p;

  const pill = (p: P) => {
    if (api(p)?.connected) return { cls: "on" as const, text: t("Bağlı (API)") };
    const w = web(p);
    if (!w?.enabled || w.logged === false) return { cls: "off" as const, text: t("Giriş yapılmadı") };
    if (w.logged === null || w.logged === undefined) return { cls: "busy" as const, text: w.visible ? t("Giriş bekleniyor…") : t("Giriş doğrulanamadı") };
    if (p === "youtube" && w.running && !w.hasTarget) return { cls: "warn" as const, text: t("Yayın kapalı") };
    return { cls: "on" as const, text: t("Bağlı") };
  };

  /** Gelişmiş: kullanıcının kendi API uygulaması (kapalı bölüm) */
  const Advanced = (c: { p: P }) => {
    const [id, setId] = createSignal<string | null>(null);
    const [secret, setSecret] = createSignal("");
    const idVal = () => id() ?? api(c.p)?.clientId ?? "";
    const needSecret = c.p !== "twitch";
    const save = () =>
      act(c.p, async () => {
        const s = await LC.apiCredsSet(c.p, idVal(), needSecret ? secret() : "");
        setId(null);
        setSecret("");
        return s;
      }, t("Uygulama bilgileri kaydedildi"));
    const ready = () => !!api(c.p)?.clientId && (!needSecret || !!api(c.p)?.hasSecret);
    return (
      <details class="lcp-adv">
        <summary>{t("Gelişmiş: kendi API uygulamam")}</summary>
        <small class="muted">
          {c.p === "twitch"
            ? t("İsteğe bağlı. dev.twitch.tv'de kendi uygulamanı oluştur (Client Type: Public) ve Client ID'sini gir. Bağlanınca bu platformda tarayıcı girişi yerine Twitch API kullanılır.")
            : c.p === "youtube"
              ? t("İsteğe bağlı. Google Cloud'da kendi projende YouTube Data API v3'ü etkinleştir, sonra Kimlik bilgileri › OAuth istemci kimliği oluştur; uygulama türü olarak “Masaüstü uygulaması (Desktop app)” seç. Bu türde dönüş adresi girilecek bir alan yoktur ve girmen gerekmez. İzin ekranı “Test” durumundaysa Google hesabını Test kullanıcıları'na ekle. Client ID ve Client Secret'ını gir. YouTube API'nin günlük mesaj kotası vardır.")
              : t("İsteğe bağlı. Kick › Ayarlar › Developer'da kendi uygulamanı oluştur (kapsamlar: user:read, channel:read, chat:write); Client ID ve Client Secret'ını gir.")}
        </small>
        <small class="muted lcp-adv-links">
          <button class="link" onClick={() => openUrl(c.p === "twitch" ? "https://dev.twitch.tv/console/apps" : c.p === "youtube" ? "https://console.cloud.google.com/apis/credentials" : "https://kick.com/settings/developer")}>
            Geliştirici sayfasını aç
          </button>
          <Show when={c.p === "youtube"}>
            {" · "}
            <button class="link" onClick={() => openUrl("https://console.cloud.google.com/apis/library/youtube.googleapis.com")}>
              YouTube Data API v3'ü etkinleştir
            </button>
          </Show>
        </small>
        <Show when={c.p === "twitch"}>
          <small class="muted">{t("Twitch'te dönüş adresi kullanılmaz (cihaz koduyla bağlanılır). Uygulama formu OAuth Redirect URL'yi zorunlu tutarsa http://localhost yazman yeterlidir.")}</small>
        </Show>
        <Show when={needSecret}>
          <small class="muted">
            {c.p === "youtube" ? t("Yalnızca “Web uygulaması (Web application)” türünü seçtiysen Yetkilendirilmiş yönlendirme URI'leri'ne şu adresi ekle:") : t("Uygulamaya kaydedilecek dönüş adresi:")}{" "}
            <code data-no-i18n>{redirectOf(c.p)}</code>{" "}
            <button class="link" onClick={() => copyText(redirectOf(c.p))}>
              Kopyala
            </button>
          </small>
        </Show>
        <input class="input" spellcheck={false} placeholder="Client ID" value={idVal()} onInput={(e) => setId(e.currentTarget.value)} />
        <Show when={needSecret}>
          <input
            class="input"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder={api(c.p)?.hasSecret ? t("Client Secret (kayıtlı; değiştirmek için yaz)") : "Client Secret"}
            value={secret()}
            onInput={(e) => setSecret(e.currentTarget.value)}
          />
        </Show>
        <Show when={api(c.p)?.connected}>
          <div>
            {t("API hesabı:")} <b data-no-i18n>{api(c.p)!.login || "—"}</b>
          </div>
        </Show>
        <Show when={c.p === "twitch" && st()?.device}>
          <div class="lcp-code">
            <div>
              <small class="muted">{t("Açılan sayfada bu kodu gir:")}</small>
              <br />
              <code>{st()!.device!.userCode}</code>
            </div>
            <span class="lcp-sp" />
            <button class="btn ghost small" onClick={() => copyText(st()!.device!.userCode)}>
              <I.Copy />
            </button>
          </div>
          <small class="muted">
            {t("Kod {0} dakika geçerli.", Math.max(0, Math.ceil((st()!.device!.expiresAt - now()) / 60000)))}{" "}
            <button class="link" onClick={() => invoke("open_url", { url: st()!.device!.verificationUri }).catch(() => {})}>
              Sayfayı yeniden aç
            </button>
          </small>
        </Show>
        <Show when={st()?.pending === c.p}>
          <small class="muted">Tarayıcıda açılan sayfada izin ver; tamamlanınca burası kendiliğinden güncellenir (en fazla 5 dakika).</small>
          <Show when={st()?.authUrl}>
            <small class="muted">
              {t("Tarayıcı açılmadıysa:")}{" "}
              <button class="link" onClick={() => LC.authReopen().catch((e) => toast(errText(e), true))}>
                Sayfayı yeniden aç
              </button>
              {" · "}
              <button class="link" onClick={() => copyText(st()?.authUrl ?? "")}>
                Bağlantıyı kopyala
              </button>
            </small>
          </Show>
        </Show>
        <div class="btns">
          <button class="btn ghost small" disabled={busy() !== null} onClick={save}>
            Kaydet
          </button>
          <Show
            when={api(c.p)?.connected}
            fallback={
              <Show
                when={apiWaiting(c.p)}
                fallback={
                  <button
                    class="btn ghost small"
                    disabled={locked() || !ready() || busy() !== null}
                    title={ready() ? "" : t("Önce uygulama bilgilerini kaydet")}
                    onClick={() => act(c.p, () => (c.p === "twitch" ? LC.twitchLogin() : LC.oauthLogin(c.p)))}
                  >
                    {t("API ile bağlan")}
                  </button>
                }
              >
                <button class="btn ghost small" onClick={async () => setSt(await LC.authCancel().catch(() => st()))}>
                  Vazgeç
                </button>
              </Show>
            }
          >
            <button class="btn ghost small" onClick={() => act(c.p, () => LC.authLogout(c.p))}>
              API bağlantısını kes
            </button>
          </Show>
        </div>
      </details>
    );
  };

  const Card = (c: { p: P; note: JSX.Element }) => {
    const w = () => web(c.p);
    const loggedIn = () => !!w()?.enabled && w()?.logged === true;
    return (
      <div class="lcp-acc">
        <div class="lcp-acc-head">
          <PlatformIcon platform={c.p} size={22} />
          <b>{LC.PLATFORM_NAMES[c.p]}</b>
          <StatusPill cls={pill(c.p).cls} text={pill(c.p).text} />
        </div>
        <Show when={!api(c.p)?.connected && loggedIn() && w()?.login}>
          <div>
            {t("Hesap:")} <b data-no-i18n>{w()!.login}</b>
          </div>
        </Show>
        <Show when={api(c.p)?.connected}>
          <small class="muted">{t("Bu platformda API hesabın bağlı: mesajlar API ile gönderilir. Tarayıcı girişine dönmek için Gelişmiş bölümünden API bağlantısını kes.")}</small>
        </Show>
        <Show when={w()?.visible}>
          <small class="muted">
            {loggedIn()
              ? t("Pencere açık. Giriş tamamlandı; pencereyi gizleyebilirsin.")
              : t("Açılan pencerede kendi hesabınla giriş yap (şifren programa gelmez). Giriş algılanınca burası kendiliğinden güncellenir.")}
          </small>
        </Show>
        <Show when={loggedIn() && w()?.running && !w()?.hasTarget}>
          <small class="muted">
            {c.p === "youtube"
              ? t("Yayın kapalı: YouTube'da ★ benim kanalım olarak işaretli canlı bir yayın olunca yazabilirsin.")
              : t("Yazılacak kanal yok: Kanallar'da bu platformdaki kanalını ★ benim kanalım olarak işaretle.")}
          </small>
        </Show>
        <Show when={lastErr(c.p)}>
          <div class="lcp-err">
            <b>{t("Son hata:")}</b> <span data-no-i18n>{lastErr(c.p)}</span>
          </div>
        </Show>
        <small class="muted">{c.note}</small>
        <div class="btns">
          <Show
            when={w()?.visible}
            fallback={
              <button class={loggedIn() ? "btn ghost small" : "btn primary small"} disabled={locked() || busy() !== null} onClick={() => act(c.p, () => LC.webOpen(c.p))}>
                {busy() === c.p ? t("Açılıyor…") : loggedIn() ? t("Pencereyi aç") : t("Giriş penceresini aç")}
              </button>
            }
          >
            <button class="btn ghost small" disabled={busy() !== null} onClick={() => act(c.p, () => LC.webHide(c.p))}>
              Pencereyi gizle
            </button>
          </Show>
          <Show when={w()?.enabled}>
            <button
              class="btn ghost small"
              disabled={busy() !== null}
              title={t("Pencereyi kapatır ve bu platformun tarayıcı oturumunu bu bilgisayardan siler")}
              onClick={() => act(c.p, () => LC.webLogout(c.p), t("{0} oturumu kapatıldı", LC.PLATFORM_NAMES[c.p]))}
            >
              Çıkış yap
            </button>
          </Show>
          <button class="btn ghost small" disabled={testing() !== null || busy() !== null} title={t("Pencereyi, oturumu ve sohbet kutusunu denetler; mesaj göndermez")} onClick={() => runTest(c.p)}>
            {testing() === c.p ? t("Test ediliyor…") : t("Bağlantıyı test et")}
          </button>
        </div>
        <Show when={tests()[c.p]}>
          <ul class="lcp-test">
            <For each={tests()[c.p]}>
              {(s) => (
                <li class={s.state}>
                  <span class="lcp-test-mark">{s.state === "ok" ? "✓" : s.state === "fail" ? "✕" : s.state === "warn" ? "!" : "–"}</span>
                  <span>
                    <b data-no-i18n>{s.name}</b>
                    <small data-no-i18n>{s.detail}</small>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Advanced p={c.p} />
      </div>
    );
  };

  return (
    <ProLockBox feature={F.liveSend} text={t("Sohbete yazma PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Sohbete yaz</h3>
        </div>
        <p class="muted small">
          Her platform için <b>Giriş penceresini aç</b>'a bas ve açılan pencerede kendi hesabınla giriş yap; başka hiçbir ayar gerekmez. Sonra Sohbet
          sekmesinin altındaki kutudan yazdığın mesaj, Kanallar'da <b>★ benim kanalım</b> olarak işaretlediğin kanal(lar)a ya da seçtiğin tek bir
          kanala kendi hesabınla gider. Mesaj yalnızca sen gönderdiğinde yazılır.
        </p>
        <div class="lcp-accs">
          <Card p="twitch" note={t("Twitch'in kendi sayfasında giriş yaparsın. En fazla 500 karakter.")} />
          <Card p="youtube" note={t("Google hesabınla giriş yaparsın. Yayın canlıyken gönderilir. En fazla 200 karakter.")} />
          <Card p="kick" note={t("Kick'in kendi sayfasında giriş yaparsın. En fazla 500 karakter.")} />
        </div>
        <Show when={st()?.error && !PS.some((p) => lastErr(p) === st()!.error)}>
          <div class="lcp-err" data-no-i18n>
            {st()!.error}
          </div>
        </Show>
        <div class="btns">
          <button class="btn ghost small" title={t("Adımların kaydını panoya kopyalar; mesaj metni, çerez ya da anahtar içermez. Destek isterken yapıştır.")} onClick={copyLog}>
            <I.Copy /> {t("Günlüğü kopyala")}
          </button>
        </div>
        <div class="lcp-note">
          Giriş, platformun kendi sayfasında yapılır: şifren programa gelmez. Oturum sadece bu bilgisayarda, her platform için ayrı bir tarayıcı
          profilinde saklanır; ayar dosyasına ve buluta yazılmaz. “Çıkış yap” o profili siler. Sohbet çalışırken pencereler arka planda gizli
          durur, sohbet durunca kapanır.{" "}
          <button class="link" onClick={() => go("livechat", "chat")}>
            Sohbete dön
          </button>
        </div>
      </section>
    </ProLockBox>
  );
}
