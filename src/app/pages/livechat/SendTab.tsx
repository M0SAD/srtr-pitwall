// Canlı Sohbet › Sohbete yaz: Twitch / YouTube / Kick hesabını bağla (PRO: livechat.send).
// Twitch: cihaz kodu (twitch.tv/activate); YouTube ve Kick: tarayıcıda giriş, anahtar değişimi SRTR sunucusu (chat-oauth) üzerinden.
// Anahtarlar bu bilgisayarda Windows hesabına bağlı şifrelenir (DPAPI); arayüze ve buluta gelmez.

import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { config } from "@/cloud/account";
import { cloudEnabled, session } from "@/cloud/supabase";
import { PlatformIcon } from "@/overlays/livechat/parts";
import { ProLockBox } from "../../components/ProLock";
import { go } from "../../ui";
import * as I from "../../icons";
import { StatusPill, errText, toast } from "./common";

type P = "twitch" | "youtube" | "kick";

export function SendTab() {
  const [st, setSt] = createSignal<LC.SendStatus | null>(null);
  const [busy, setBusy] = createSignal<P | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  onMount(() => {
    LC.sendStatus().then(setSt).catch(() => {});
    let un: (() => void) | undefined;
    void LC.onSend(setSt).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveSend);
  const clientId = (p: P) => ((p === "twitch" ? config()?.livechat_twitch_client_id : p === "youtube" ? config()?.livechat_youtube_client_id : config()?.livechat_kick_client_id) ?? "").trim();
  const acc = (p: P) => st()?.[p];

  const connect = async (p: P) => {
    setBusy(p);
    setFails((x) => ({ ...x, [p]: undefined }));
    try {
      if (p === "twitch") setSt(await LC.twitchLogin(clientId(p)));
      else {
        setSt(await LC.oauthLogin(p, clientId(p)));
        toast(t("{0} hesabı bağlandı", LC.PLATFORM_NAMES[p]));
      }
    } catch (e) {
      toast(errText(e), true);
      setFails((x) => ({ ...x, [p]: errText(e) }));
      LC.sendStatus().then(setSt).catch(() => {});
    } finally {
      setBusy(null);
    }
  };
  const logout = async (p: P) => {
    try {
      setSt(await LC.authLogout(p));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const cancel = async () => setSt(await LC.authCancel().catch(() => st()));

  // Son bağlanma denemesinin hatası (platform başına; kart içinde kalıcı görünür) ve "Bağlantıyı test et" sonuçları
  const [fails, setFails] = createSignal<Partial<Record<P, string>>>({});
  const [tests, setTests] = createSignal<Partial<Record<P, LC.AuthTestStep[]>>>({});
  const [testing, setTesting] = createSignal<P | null>(null);
  const runTest = async (p: P) => {
    setTesting(p);
    try {
      const steps = await LC.authTest(p, clientId(p));
      setTests((x) => ({ ...x, [p]: steps }));
    } catch (e) {
      setTests((x) => ({ ...x, [p]: [{ name: t("Test"), state: "fail", detail: errText(e) }] }));
    } finally {
      setTesting(null);
      LC.sendStatus().then(setSt).catch(() => {});
    }
  };
  const redirectOf = (p: P) => (p === "youtube" ? st()?.ytRedirect : p === "kick" ? st()?.kickRedirect : "") ?? "";

  const pill = (p: P) => {
    if (acc(p)?.connected) return { cls: "on" as const, text: t("Bağlı") };
    if (!clientId(p)) return { cls: "warn" as const, text: t("Yönetici ayarı eksik") };
    if ((p === "twitch" && st()?.device) || st()?.pending === p) return { cls: "busy" as const, text: t("Giriş bekleniyor…") };
    return { cls: "off" as const, text: t("Bağlı değil") };
  };

  const Card = (c: { p: P; note: JSX.Element }) => {
    const needCloud = () => c.p !== "twitch" && (!cloudEnabled || !session());
    const waiting = () => (c.p === "twitch" && !!st()?.device) || st()?.pending === c.p;
    return (
      <div class="lcp-acc">
        <div class="lcp-acc-head">
          <PlatformIcon platform={c.p} size={22} />
          <b>{LC.PLATFORM_NAMES[c.p]}</b>
          <StatusPill cls={pill(c.p).cls} text={pill(c.p).text} />
        </div>
        <Show when={acc(c.p)?.connected}>
          <div>
            {t("Hesap:")} <b data-no-i18n>{acc(c.p)!.login || "—"}</b>
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
            <button class="btn ghost small" onClick={() => navigator.clipboard.writeText(st()!.device!.userCode).then(() => toast(t("Kopyalandı")))}>
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
          <small class="muted">
            {t("Tarayıcı izin ekranı yerine bir hata sayfası gösteriyorsa (redirect_uri_mismatch, invalid_client, access blocked…) Vazgeç'e bas: sebep sağlayıcıdaki uygulama ayarındadır. Programın dönüş adresi:")}{" "}
            <code data-no-i18n>{redirectOf(c.p)}</code>
          </small>
        </Show>
        <Show when={fails()[c.p] && !acc(c.p)?.connected && !waiting()}>
          <div class="lcp-err" data-no-i18n>
            {fails()[c.p]}
          </div>
        </Show>
        <Show when={needCloud() && !acc(c.p)?.connected}>
          <small class="muted">{t("Bağlamak için SRTR Pitwall hesabına giriş yapmalısın (Hesap).")}</small>
        </Show>
        <small class="muted">{c.note}</small>
        <div class="btns">
          <Show
            when={acc(c.p)?.connected}
            fallback={
              <Show
                when={waiting()}
                fallback={
                  <button class="btn primary small" disabled={locked() || !clientId(c.p) || needCloud() || busy() !== null} onClick={() => connect(c.p)}>
                    {busy() === c.p ? t("Açılıyor…") : t("Hesabı bağla")}
                  </button>
                }
              >
                <button class="btn ghost small" onClick={cancel}>
                  Vazgeç
                </button>
              </Show>
            }
          >
            <button class="btn ghost small" onClick={() => logout(c.p)}>
              Bağlantıyı kes
            </button>
          </Show>
          <button class="btn ghost small" disabled={testing() !== null || waiting()} title={t("Giriş zincirini adım adım dener; mesaj göndermez")} onClick={() => runTest(c.p)}>
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
          Hesabını bağladıktan sonra Sohbet sekmesinin altındaki kutudan yazdığın mesaj, Kanallar'da <b>★ benim kanalım</b> olarak işaretlediğin
          kanal(lar)a ya da seçtiğin tek bir kanala gider. Kendi hesabınla yazarsın; mesaj bağlı olduğun kanalın sohbetinde görünür.
        </p>
        <div class="lcp-accs">
          <Card p="twitch" note={t("Twitch'te izin verince bağlanır. En fazla 500 karakter.")} />
          <Card p="youtube" note={t("Yayın canlıyken gönderilir. En fazla 200 karakter. YouTube'un günlük mesaj kotası vardır.")} />
          <Card p="kick" note={t("Kick hesabınla izin ver. En fazla 500 karakter.")} />
        </div>
        <Show when={st()?.error && !Object.values(fails()).includes(st()!.error!)}>
          <div class="lcp-err" data-no-i18n>
            {st()!.error}
          </div>
        </Show>
        <Show when={!clientId("twitch") || !clientId("youtube") || !clientId("kick")}>
          <div class="lcp-note">“Yönetici ayarı eksik” görünen platformlar SRTR Pitwall yöneticisi uygulama kimliğini girince kullanılabilir.</div>
        </Show>
        <div class="lcp-note">
          Oturum anahtarları sadece bu bilgisayarda, Windows hesabına bağlı şifreli olarak saklanır; ayar dosyasına ve buluta yazılmaz.{" "}
          <button class="link" onClick={() => go("livechat", "chat")}>
            Sohbete dön
          </button>
        </div>
      </section>
    </ProLockBox>
  );
}
