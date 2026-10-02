// Canlı Sohbet › Moderasyon, Bildirimler (Streamlabs), OBS (Sohbet kaydı: LogTab.tsx)

import { For, Show, createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockBox, ProLockNote } from "../../components/ProLock";
import { CopyUrl, type ServerInfo } from "../../components/ServerPanel";
import { Slider, Switch } from "../../components/SettingsForm";
import { go } from "../../ui";
import * as I from "../../icons";
import { StatusPill, errText, lc, setLc, toast } from "./common";

// ---------------------------------------------------------------------------
// Moderasyon
// ---------------------------------------------------------------------------

export function ModerationTab() {
  const m = () => lc().moderation;
  const [user, setUser] = createSignal("");
  const ban = async () => {
    const u = user().trim().replace(/^@/, "");
    if (!u) return;
    try {
      await LC.banUser(u);
      setUser("");
      toast(t("{0} engellendi", u));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  return (
    <>
      <section class="panel">
        <h3>Engellenen kullanıcılar</h3>
        <p class="muted small">
          Bu kullanıcıların mesajları hiçbir platformda gösterilmez, okunmaz ve oy sayılmaz. Sohbette bir mesajın üstündeki engelle düğmesiyle de
          eklenir. Sadece bu programda geçerlidir (platformda yasaklamaz).
        </p>
        <div class="lcp-inline">
          <input
            class="input"
            placeholder={t("Kullanıcı adı")}
            value={user()}
            onInput={(e) => setUser(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void ban()}
          />
          <button class="btn small" onClick={ban}>
            <I.Ban /> Engelle
          </button>
        </div>
        <Show when={m().banned.length} fallback={<p class="muted small">Engellenen kullanıcı yok.</p>}>
          <div class="lcp-chips" data-no-i18n>
            <For each={m().banned}>
              {(u) => (
                <span class="lcp-chip">
                  {u}
                  <button title={t("Engeli kaldır")} onClick={() => LC.unbanUser(u).catch((e) => toast(errText(e), true))}>
                    ×
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Kelime filtresi</h3>
        <div class="row">
          <div>
            <b>Kelime filtresi açık</b>
            <small>Türkçe büyük/küçük harf ve ı/i farkı yok sayılır.</small>
          </div>
          <Switch checked={m().wordFilter} onChange={(v) => setLc((x) => (x.moderation.wordFilter = v))} />
        </div>
        <div class="lcp-field">
          <label>Kelimeler (virgülle ayır; “kelime*” o kelimeyle başlayan her şey)</label>
          <textarea class="input" value={m().words} onChange={(e) => setLc((x) => (x.moderation.words = e.currentTarget.value))} />
        </div>
        <div class="row">
          <div>
            <b>Eşleşince</b>
          </div>
          <div class="seg small">
            <button classList={{ on: m().wordMode === "mask" }} onClick={() => setLc((x) => (x.moderation.wordMode = "mask"))}>
              Yıldızla (k***)
            </button>
            <button classList={{ on: m().wordMode === "hide" }} onClick={() => setLc((x) => (x.moderation.wordMode = "hide"))}>
              Mesajı gizle
            </button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Diğer filtreler</h3>
        <div class="row">
          <div>
            <b>Bağlantı içeren mesajları gizle</b>
            <small>http://, www. ve .com / .net / .tv … ile biten adresler</small>
          </div>
          <Switch checked={m().blockLinks} onChange={(v) => setLc((x) => (x.moderation.blockLinks = v))} />
        </div>
        <div class="row">
          <div>
            <b>Tekrar (spam) filtresi</b>
            <small>Aynı kişinin aynı mesajı bu süre içinde tekrar gösterilmez.</small>
          </div>
          <Switch checked={m().spam} onChange={(v) => setLc((x) => (x.moderation.spam = v))} />
        </div>
        <Show when={m().spam}>
          <div class="row">
            <div>
              <b>Tekrar süresi</b>
            </div>
            <div style={{ width: "240px" }}>
              <Slider value={m().spamWindow} min={1} max={120} unit={t("sn")} onInput={(n) => setLc((x) => (x.moderation.spamWindow = n))} />
            </div>
          </div>
        </Show>
        <div class="row">
          <div>
            <b>Platformdaki silmeleri yansıt</b>
            <small>Moderatörlerin sildiği mesajlar ve yasaklanan / susturulan kullanıcıların mesajları burada da silinir.</small>
          </div>
          <Switch checked={m().mirrorDeletes} onChange={(v) => setLc((x) => (x.moderation.mirrorDeletes = v))} />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bildirimler (Streamlabs)
// ---------------------------------------------------------------------------

export function AlertsTab() {
  const store = LC.useLiveChat(300);
  const [token, setToken] = createSignal("");
  const [sl, setSl] = createSignal<LC.StreamlabsStatus | null>(null);
  onMount(() => LC.streamlabsStatus().then(setSl).catch(() => {}));
  const st = () => store.status()?.streamlabs ?? sl();
  const saveToken = async (v: string) => {
    try {
      setSl(await LC.setStreamlabsToken(v));
      setToken("");
      toast(v ? t("Anahtar kaydedildi (şifreli)") : t("Anahtar silindi"));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const pill = () => {
    const s = st();
    if (!s?.hasToken) return { cls: "off" as const, text: t("Anahtar yok") };
    if (!lc().streamlabs) return { cls: "off" as const, text: t("Kapalı") };
    if (s.connected) return { cls: "on" as const, text: t("Bağlı") };
    if (s.error) return { cls: "err" as const, text: t("Bağlanamadı") };
    return { cls: store.status()?.running ? ("busy" as const) : ("off" as const), text: store.status()?.running ? t("Bağlanıyor…") : t("Sohbet başlayınca bağlanır") };
  };
  return (
    <ProLockBox feature={F.liveAlerts} text={t("Streamlabs uyarıları PRO üyelere özel.")}>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Streamlabs uyarıları</h3>
          <StatusPill cls={pill().cls} text={pill().text} />
        </div>
        <p class="muted small">
          Bağış, abone, takip, bits, raid, üyelik ve ödül uyarıları sohbette renkli satır olarak görünür, overlay'e ve OBS sayfasına düşer, sesli
          okuma açıksa okunur. Twitch abonelik / raid ve YouTube Super Chat / üyelik olayları Streamlabs olmadan da sohbetten gelir.
        </p>
        <div class="row">
          <div>
            <b>Streamlabs uyarılarını al</b>
          </div>
          <Switch checked={lc().streamlabs} onChange={(v) => setLc((x) => (x.streamlabs = v))} />
        </div>
        <div class="lcp-field">
          <label>Socket API Token</label>
          <div class="lcp-inline">
            <input
              class="input"
              type="password"
              autocomplete="off"
              placeholder={st()?.hasToken ? t("Kayıtlı (değiştirmek için yenisini yapıştır)") : t("Socket API Token'ı yapıştır")}
              value={token()}
              onInput={(e) => setToken(e.currentTarget.value)}
            />
            <button class="btn small primary" disabled={!token().trim()} onClick={() => saveToken(token().trim())}>
              Kaydet
            </button>
            <Show when={st()?.hasToken}>
              <button class="btn small ghost" onClick={() => saveToken("")}>
                Sil
              </button>
            </Show>
          </div>
        </div>
        <Show when={st()?.error}>
          <div class="lcp-err" data-no-i18n>
            {st()!.error}
          </div>
        </Show>
        <div class="lcp-note">
          Streamlabs › Ayarlar › API Settings › <b>API Tokens</b> sekmesindeki <b>Your Socket API Token</b> değerini yapıştır (Widget Token
          değil).{" "}
          <button class="link" onClick={() => invoke("open_url", { url: "https://streamlabs.com/dashboard#/settings/api-settings" }).catch(() => {})}>
            Streamlabs'te aç
          </button>
          <br />
          Anahtar bu bilgisayarda Windows hesabına bağlı olarak şifrelenir (DPAPI); ayar dosyasına ve buluta yazılmaz.
        </div>
      </section>
    </ProLockBox>
  );
}

// ---------------------------------------------------------------------------
// OBS
// ---------------------------------------------------------------------------

export function ObsTab() {
  const [info, setInfo] = createSignal<ServerInfo | null>(null);
  onMount(() =>
    invoke<ServerInfo>("server_status")
      .then(setInfo)
      .catch(() => {}),
  );
  const base = () => (info()?.url ?? "").replace(/\/$/, "");
  const locked = () => proLocked(F.liveObs);
  return (
    <section class="panel lcp-obs">
      <div class="lcp-panel-head">
        <h3>OBS tarayıcı kaynakları</h3>
        <Show when={info()}>
          <StatusPill cls={info()!.running ? "on" : "warn"} text={info()!.running ? t("Sunucu açık") : t("Sunucu kapalı")} />
        </Show>
      </div>
      <ProLockNote feature={F.liveObs} text={t("OBS sohbet, anket ve altyazı sayfaları PRO üyelere özel.")} />
      <p class="muted small">
        OBS › Kaynaklar › + › <b>Tarayıcı</b> ekle ve aşağıdaki adresi yapıştır. Görünüm (renkler, yazı boyu, kaç mesaj…) Overlay'ler sayfasındaki
        “Canlı Sohbet”, “Anket” ve “Altyazı” overlay ayarlarından gelir.
      </p>
      <Show
        when={info()?.running && base()}
        fallback={
          <div class="lcp-note">
            Yerel web sunucusu kapalı. Ayarlar › Entegrasyonlar › <b>HTTP sunucusu</b>'nu aç.{" "}
            <button class="link" onClick={() => go("settings", "integrations")}>
              Ayarlara git
            </button>
          </div>
        }
      >
        <div classList={{ "prolock-dim": locked() }}>
          <CopyUrl label={t("Canlı Sohbet")} url={`${base()}/livechat`} hint={t("Önerilen boyut: 400 × 600")} />
          <CopyUrl label={t("Anket")} url={`${base()}/livepoll`} hint={t("Sadece anket kutusu (anket yokken boş). 500 × 400")} />
          <CopyUrl label={t("Altyazı")} url={`${base()}/captions`} hint={t("Konuşma → yazı altyazısı, alt ortada. 1920 × 300")} />
        </div>
      </Show>
    </section>
  );
}
