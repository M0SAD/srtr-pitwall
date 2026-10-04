// Yönetim › Canlı Sohbet: erişim kuralları (giriş zorunluluğu, üyelerden gizlenen sekmeler; c52).
// "Sohbete yaz" artık kişiye özeldir (Canlı Sohbet › Sohbete yaz: tarayıcı girişi ya da kullanıcının kendi API uygulaması);
// burada genel istemci kimliği ayarı YOKTUR ve program app_config.livechat_*_client_id alanlarını kullanmaz.

import { For } from "solid-js";
import { Switch } from "./SettingsForm";
import { LIVECHAT_PAGES } from "../pages/LiveChatPage";
import { t } from "@/sdk/i18n";
import { config, saveConfig } from "@/cloud/account";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

export function AdminLiveChat(p: { run: Run }) {
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
  return (
    <section class="panel admin-panel">
      <h3>Canlı Sohbet erişimi</h3>
      <p class="muted small">
        Kimin neyi göreceğini buradan, neyin PRO olacağını Yönetim › PRO özellikleri › Canlı Sohbet grubundan belirlersin (birden fazla kanal,
        favori kanallar ve izleyici sayıları, anket, sesli okuma, konuşma → yazı, sohbete yazma, bildirimler, sohbet kaydı, OBS).
      </p>
      <p class="muted small">
        Sohbete yazma için burada ayar yoktur: her üye Canlı Sohbet › Sohbete yaz bölümünde kendi Twitch / YouTube / Kick hesabıyla kendisi
        giriş yapar.
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
