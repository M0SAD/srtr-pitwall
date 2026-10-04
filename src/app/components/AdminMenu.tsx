// Yönetim › Görünürlük: Menü görünürlüğü (c77). Bölümler ve alt sayfaları; işaretli = görünür.
// Bölüm → app_config.hidden_sections (c21), alt sayfa → app_config.hidden_menu ("bölüm.sayfa").

import { t } from "@/sdk/i18n";
import { For, Show } from "solid-js";
import { config, saveConfig, type AppConfig } from "@/cloud/account";
import { DEFAULT_HIDDEN_MENU, MENU_TREE, hiddenMenu } from "../menu";

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

export function AdminMenu(p: { run: Run }) {
  const secHidden = (id: string) => (config()?.hidden_sections ?? []).includes(id) || hiddenMenu().includes(id);
  const itemHidden = (sec: string, id: string) => hiddenMenu().includes(`${sec}.${id}`);
  const save = (patch: Partial<AppConfig>, hide: boolean) => p.run(() => saveConfig(patch), hide ? t("Gizlendi") : t("Gösteriliyor"));

  const toggleSec = (id: string, hide: boolean) => {
    const secs = new Set(config()?.hidden_sections ?? []);
    hide ? secs.add(id) : secs.delete(id);
    // Bölüm kimliği hidden_menu'ye de yazılmış olabilir (site paneli / elle): tek yerde tutulur
    const patch: Partial<AppConfig> = { hidden_sections: [...secs] };
    if (hiddenMenu().includes(id)) patch.hidden_menu = hiddenMenu().filter((x) => x !== id);
    save(patch, hide);
  };
  const toggleItem = (sec: string, id: string, hide: boolean) => {
    const cur = new Set(hiddenMenu());
    hide ? cur.add(`${sec}.${id}`) : cur.delete(`${sec}.${id}`);
    save({ hidden_menu: [...cur] }, hide);
  };

  return (
    <section class="panel admin-panel">
      <h3>Menü görünürlüğü</h3>
      <p class="muted small">
        İşareti kaldırılan bölümler ve alt sayfalar yönetici olmayan kullanıcıların menüsünden kalkar ve doğrudan da açılamaz. Yöneticiler hepsini
        görmeye devam eder ("gizli" rozetiyle). Lig sayfaları varsayılan olarak gizlidir. Yönetim, Hesap ve Ayarlar gizlenemez; Canlı Sohbet sekmeleri
        Canlı Sohbet ayarları'ndan yönetilir.
      </p>
      <div class="btns vis-bulk">
        <button class="btn ghost small" onClick={() => p.run(() => saveConfig({ hidden_menu: DEFAULT_HIDDEN_MENU }), t("Varsayılana döndürüldü"))}>
          Alt sayfaları varsayılana döndür
        </button>
      </div>
      <div class="menu-vis">
        <For each={MENU_TREE}>
          {(c) => (
            <div class="menu-vis-cat" classList={{ off: secHidden(c.id) }}>
              <label class="vis-item menu-vis-head" classList={{ off: secHidden(c.id) }}>
                <input type="checkbox" checked={!secHidden(c.id)} onChange={(e) => toggleSec(c.id, !e.currentTarget.checked)} />
                <span>{c.label}</span>
                <Show when={secHidden(c.id)}>
                  <i class="vis-badge">gizli</i>
                </Show>
              </label>
              <For each={c.items}>
                {(s) => (
                  <label class="vis-item menu-vis-sub" classList={{ off: secHidden(c.id) || itemHidden(c.id, s.id) }}>
                    <input type="checkbox" checked={!itemHidden(c.id, s.id)} disabled={secHidden(c.id)} onChange={(e) => toggleItem(c.id, s.id, !e.currentTarget.checked)} />
                    <span>{s.label}</span>
                    <Show when={secHidden(c.id) || itemHidden(c.id, s.id)}>
                      <i class="vis-badge">gizli</i>
                    </Show>
                  </label>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
