// Yönetim › Canlı Sohbet ayarları: "Sohbete yaz" için geliştirici uygulamalarının herkese açık istemci kimlikleri
// (app_config.livechat_*_client_id, c43). Gizli anahtarlar (client secret) burada DEĞİL: Supabase secrets'ta,
// sadece chat-oauth edge function'ı kullanır. Ayrıntılı kurulum: docs/canli_sohbet_kurulum.md

import { For, createSignal } from "solid-js";
import { Switch } from "./SettingsForm";
import { LIVECHAT_PAGES } from "../pages/LiveChatPage";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import { config, saveConfig, type AppConfig } from "@/cloud/account";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;
type Key = "livechat_twitch_client_id" | "livechat_youtube_client_id" | "livechat_kick_client_id";

const FIELDS: { key: Key; label: string; hint: string; url: string }[] = [
  {
    key: "livechat_twitch_client_id",
    label: "Twitch Client ID",
    hint: "dev.twitch.tv › Your Console › Applications › Register Your Application. Client Type: Public, OAuth Redirect URL: http://localhost. Gizli anahtar gerekmez (Device Code Flow).",
    url: "https://dev.twitch.tv/console/apps/create",
  },
  {
    key: "livechat_youtube_client_id",
    label: "YouTube (Google) OAuth Client ID",
    hint: "Google Cloud Console: YouTube Data API v3'ü etkinleştir, OAuth izin ekranını yapılandır, Kimlik bilgileri › OAuth istemci kimliği › Masaüstü uygulaması. Yönlendirme: http://127.0.0.1:8767/callback. Client secret → Supabase secret YT_CLIENT_SECRET.",
    url: "https://console.cloud.google.com/apis/credentials",
  },
  {
    key: "livechat_kick_client_id",
    label: "Kick Client ID",
    hint: "kick.com › Ayarlar › Developer (hesapta 2FA açık olmalı) › Create App. Redirect URL: http://localhost:8767/callback, kapsamlar: user:read, channel:read, chat:write. Client secret → Supabase secret KICK_CLIENT_SECRET.",
    url: "https://kick.com/settings/developer",
  },
];

export function AdminLiveChat(p: { run: Run }) {
  const [vals, setVals] = createSignal<Record<Key, string>>({
    livechat_twitch_client_id: config()?.livechat_twitch_client_id ?? "",
    livechat_youtube_client_id: config()?.livechat_youtube_client_id ?? "",
    livechat_kick_client_id: config()?.livechat_kick_client_id ?? "",
  });
  // Erişim kuralları (c52): giriş zorunluluğu ve üyelerden gizlenen sekmeler. PRO kararları Yönetim › PRO özellikleri'nde.
  const requireLogin = () => config()?.livechat_require_login !== false;
  const hiddenTabs = () => config()?.livechat_hidden_tabs ?? [];
  const setRequireLogin = (on: boolean) =>
    p.run(() => saveConfig({ livechat_require_login: on }), on ? t("Canlı Sohbet için giriş zorunlu") : t("Canlı Sohbet girişsiz de kullanılabilir"));
  const toggleTab = (id: string, hidden: boolean) => {
    const next = hiddenTabs().filter((x) => x !== id);
    if (hidden) next.push(id);
    return p.run(() => saveConfig({ livechat_hidden_tabs: next }), t("Canlı Sohbet sekmeleri kaydedildi"));
  };
  const save = () => {
    const v = vals();
    const patch: Partial<AppConfig> = {};
    for (const f of FIELDS) patch[f.key] = v[f.key].trim();
    return p.run(() => saveConfig(patch), t("Canlı Sohbet ayarları kaydedildi"));
  };
  return (
    <section class="panel admin-panel">
      <h3>Canlı Sohbet ayarları</h3>
      <p class="muted small">
        Üyelerin Canlı Sohbet › Sohbete yaz bölümünden kendi Twitch / YouTube / Kick hesaplarıyla sohbete yazabilmesi için SRTR Pitwall adına
        oluşturulan geliştirici uygulamalarının <b>herkese açık istemci kimlikleri</b>. Gizli anahtarları (client secret) buraya YAZMA: onlar
        Supabase › Edge Functions › Secrets bölümüne girilir ve sadece <code>chat-oauth</code> sunucu işlevi kullanır.
      </p>
      <For each={FIELDS}>
        {(f) => (
          <div class="row">
            <div>
              <b>{f.label}</b>
              <small>
                {f.hint}{" "}
                <button class="link" onClick={() => invoke("open_url", { url: f.url }).catch(() => {})}>
                  Aç
                </button>
              </small>
            </div>
            <input
              class="input"
              style={{ width: "320px" }}
              spellcheck={false}
              placeholder={t("Boş: bu platform kapalı")}
              value={vals()[f.key]}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setVals((x) => ({ ...x, [f.key]: v }));
              }}
            />
          </div>
        )}
      </For>
      <div class="row">
        <div>
          <b>Supabase secrets (chat-oauth)</b>
          <small>
            YT_CLIENT_ID, YT_CLIENT_SECRET, KICK_CLIENT_ID, KICK_CLIENT_SECRET. İşlev JWT doğrulaması AÇIK yayınlanmalı (sadece giriş yapmış üyeler
            kullanabilir). Twitch için secret gerekmez.
          </small>
        </div>
        <button class="btn primary" onClick={save}>
          Kaydet
        </button>
      </div>
      <p class="muted small">Adım adım kurulum: docs/canli_sohbet_kurulum.md</p>

      <h3 style={{ "margin-top": "18px" }}>Canlı Sohbet erişimi</h3>
      <p class="muted small">
        Kimin neyi göreceğini buradan, neyin PRO olacağını Yönetim › PRO özellikleri › Canlı Sohbet grubundan belirlersin (birden fazla kanal,
        favori kanallar ve izleyici sayıları, anket, sesli okuma, konuşma → yazı, sohbete yazma, bildirimler, sohbet kaydı, OBS).
      </p>
      <div class="row">
        <div>
          <b>Canlı Sohbet için giriş zorunlu</b>
          <small>
            Açıkken giriş yapmamış kullanıcıda Canlı Sohbet'in hiçbir bölümü (ücretsiz olanlar dahil) çalışmaz: sekmeler görünür ama kilitlidir,
            sohbet başlatılamaz, sohbet overlay'leri ekranda görünmez. Çıkış yapılınca çalışan sohbet durur.
          </small>
        </div>
        <Switch checked={requireLogin()} onChange={setRequireLogin} />
      </div>
      <div class="row" style={{ "align-items": "flex-start" }}>
        <div>
          <b>Görünen sekmeler</b>
          <small>İşareti kaldırılan sekme üyelerin menüsünden gizlenir (yöneticiler hepsini görmeye devam eder). Özellik kapanmaz, sadece sayfası gizlenir.</small>
        </div>
        <div style={{ display: "grid", "grid-template-columns": "repeat(2, auto)", gap: "4px 18px" }}>
          <For each={LIVECHAT_PAGES}>
            {(pg) => (
              <label style={{ display: "flex", gap: "6px", "align-items": "center", "white-space": "nowrap" }}>
                <input type="checkbox" checked={!hiddenTabs().includes(pg.id)} onChange={(e) => void toggleTab(pg.id, !e.currentTarget.checked)} />
                {pg.label}
              </label>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
