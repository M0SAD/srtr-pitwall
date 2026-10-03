import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings } from "@/sdk/settings";
import { t } from "@/sdk/i18n";
import {
  DEFAULT_SHORTCUTS,
  LIVECHAT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  VR_CONFIG_SHORTCUTS,
  VR_SHORTCUTS,
  fromEvent,
  prettyKey,
  sameKey,
  shortcut,
  type ShortcutAction,
} from "@/sdk/shortcuts";
import { PttButtonRow, PttKeyRow, PttModeRow, voiceCmdLocked } from "./VoiceCommands";

/** Genel kısayol olarak atanırsa başka uygulamalarda/uygulama içinde sorun çıkaran tuşlar */
const RESERVED: { key: string; why: string }[] = [
  { key: "Ctrl+Z", why: "Uygulama içinde geri al" },
  { key: "Ctrl+Y", why: "Uygulama içinde yinele" },
  { key: "Ctrl+Shift+Z", why: "Uygulama içinde yinele" },
  { key: "Ctrl+C", why: "Kopyala" },
  { key: "Ctrl+V", why: "Yapıştır" },
  { key: "Ctrl+X", why: "Kes" },
  { key: "Ctrl+A", why: "Tümünü seç" },
  { key: "Alt+F4", why: "Pencereyi kapat" },
  { key: "Alt+Tab", why: "Pencere değiştir" },
];

/** Uygulama içi (değiştirilemeyen) tuşlar */
const IN_APP: { where: string; items: { keys: string; what: string }[] }[] = [
  {
    where: "Yerleşim düzenleme (overlay'ler ve panel)",
    items: [
      { keys: "Ctrl+Z", what: "Geri al" },
      { keys: "Ctrl+Y / Ctrl+Shift+Z", what: "Yinele" },
      { keys: "Sağ tık", what: "Overlay konum ve ayar menüsü" },
      { keys: "Esc", what: "Açık menüyü kapat" },
    ],
  },
  {
    where: "Olaylar penceresi",
    items: [
      { keys: "↑ / ↓", what: "Olaylar arasında gez" },
      { keys: "Enter", what: "Seçili olayın tekrarına git" },
    ],
  },
  {
    where: "Telemetri",
    items: [{ keys: "← / →", what: "Grafik imlecini kaydır" }],
  },
  {
    where: "Ekran görüntüleri",
    items: [
      { keys: "← / →", what: "Önceki / sonraki görüntü" },
      { keys: "Esc", what: "Görüntüyü kapat" },
    ],
  },
  {
    where: "Sohbet ve mesajlar",
    items: [
      { keys: "Enter", what: "Gönder" },
      { keys: "Shift+Enter", what: "Yeni satır" },
      { keys: "Ctrl+Enter", what: "Destek mesajını gönder" },
      { keys: "Esc", what: "Pencereyi / seçiciyi kapat" },
    ],
  },
  {
    where: "Kısayol kaydederken",
    items: [{ keys: "Esc", what: "Vazgeç" }],
  },
];

export function ShortcutsPanel() {
  const [recording, setRec] = createSignal<ShortcutAction | null>(null);
  const [notice, setNotice] = createSignal<{ action: ShortcutAction; text: string } | null>(null);
  // Kaydederken PrintScreen kancası duraklar ki Ctrl+PrintScreen bu pencereye ulaşsın (bkz. prtsc.rs)
  const setRecording = (a: ShortcutAction | null) => {
    setRec(a);
    if (a) setNotice(null);
    invoke("shortcuts_pause", { paused: a !== null }).catch(() => {});
  };
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const refresh = async () => {
    try {
      const list = await invoke<{ action: string; error: string }[]>("shortcuts_status");
      setErrors(Object.fromEntries(list.map((x) => [x.action, x.error])));
    } catch {
      /* tarayıcı */
    }
  };
  const afterSave = () => setTimeout(refresh, 700); // Rust tarafı kaydettikten sonra hataları oku
  const set = (a: ShortcutAction, v: string) => {
    updateSettings((d) => (d.general.shortcuts[a] = v));
    afterSave();
  };

  /** Bu tuş başka bir eylemde kullanılıyor mu */
  // Yerel VR ile Canlı Sohbet kısayolları aynı tuşu paylaşabilir (ör. F9): ikisi de yalnız kendi özelliği çalışırken
  // kaydedilir; ikisi birden çalışıyorsa yerel VR önceliklidir (Rust: apply_shortcuts).
  const mayShare = (a: ShortcutAction, b: ShortcutAction) =>
    (VR_SHORTCUTS.includes(a) && LIVECHAT_SHORTCUTS.includes(b)) || (VR_SHORTCUTS.includes(b) && LIVECHAT_SHORTCUTS.includes(a));
  const usedBy = (a: ShortcutAction, k: string) => SHORTCUT_ACTIONS.find((b) => b !== a && k && !mayShare(a, b) && sameKey(shortcut(b), k));
  const reserved = (k: string) => RESERVED.find((r) => sameKey(r.key, k));

  /** Ata: başka eylemdeyse reddet (çakışma), ayrılmış tuşsa uyar ama ata */
  const assign = (a: ShortcutAction, k: string) => {
    const other = usedBy(a, k);
    if (other) {
      setNotice({ action: a, text: t("{0} zaten “{1}” için kullanılıyor. Önce oradan değiştir.", prettyKey(k), t(SHORTCUT_LABELS[other])) });
      return;
    }
    const r = reserved(k);
    setNotice(r ? { action: a, text: t("Uyarı: {0} genelde “{1}” için kullanılır; genel kısayol olunca diğer uygulamalarda çalışmaz.", prettyKey(k), t(r.why)) } : null);
    set(a, k);
  };

  const allDefault = () => SHORTCUT_ACTIONS.every((a) => shortcut(a) === DEFAULT_SHORTCUTS[a]);
  const resetAll = () => {
    updateSettings((d) => {
      for (const a of SHORTCUT_ACTIONS) d.general.shortcuts[a] = DEFAULT_SHORTCUTS[a];
    });
    setNotice(null);
    afterSave();
  };

  const onKey = (e: KeyboardEvent) => {
    const a = recording();
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      setRecording(null);
      return;
    }
    const k = fromEvent(e, VR_SHORTCUTS.includes(a));
    if (!k) return; // değiştirici bekleniyor
    setRecording(null);
    assign(a, k);
  };

  // Windows, PrintScreen için çoğu zaman sadece "keyup" gönderir; değiştiriciler (Ctrl/Alt/Shift)
  // keyup anında hâlâ basılıysa olayın ctrlKey/altKey/shiftKey alanlarında gelir
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "PrintScreen" || e.key === "PrintScreen") onKey(e);
  };

  onMount(() => {
    refresh();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    onCleanup(() => {
      if (recording()) invoke("shortcuts_pause", { paused: false }).catch(() => {});
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    });
  });

  const note = (a: ShortcutAction) => {
    if (a === "shot")
      return settings().general.screenshots.onlyInGame ? "Sadece oyundayken çalışır; oyun kapalıyken tuş diğer uygulamalara kalır." : "Her zaman çalışır.";
    if (a === "voice") return "Sadece oyundayken kaydedilir; oyun kapalıyken tuş diğer uygulamalara kalır. Onay sesi ve kısa bir bildirim gelir.";
    if (a === "chat") return "Her zaman kayıtlıdır: \"Otomatik başlat\" kapalıyken canlı sohbeti bu tuşla başlatıp durdurursun. Onay sesi ve kısa bir bildirim gelir.";
    if (VR_CONFIG_SHORTCUTS.includes(a)) return "Sadece yerel VR yapılandırma modu açıkken kaydedilir; tek tuş olabilir.";
    if (VR_SHORTCUTS.includes(a))
      return "Sadece yerel VR (Ayarlar → VR) çalışırken kaydedilir; tek tuş olabilir. Canlı Sohbet ile aynı tuştaysa yerel VR çalışırken VR önceliklidir.";
    if (LIVECHAT_SHORTCUTS.includes(a)) return "Sadece Canlı Sohbet çalışırken (altyazı açıkken) kaydedilir; kapalıyken tuş diğer uygulamalara kalır. Onay sesi gelir.";
    return "";
  };

  return (
    <>
      <section class="panel">
        <div class="sc-head">
          <h3>Genel kısayollar</h3>
          <button class="btn ghost small" disabled={allDefault()} onClick={resetAll}>
            Tümünü varsayılana dön
          </button>
        </div>
        <p class="muted small">
          Değiştirmek için kısayola tıkla ve yeni tuş birleşimine bas (Ctrl, Alt veya Shift ile; F tuşları ve Print Screen tek başına
          olabilir). Esc vazgeçer. Bu kısayollar oyun açıkken de, panel arka plandayken de çalışır.
        </p>
        <div class="row">
          <div>
            <b>Kısayol bildirimi göster</b>
            <small>
              Bir kısayola basınca ekranın üst ortasında, yapılan işlemi ve yeni durumu yazan küçük bir bildirim kısa süre görünür (ör. “Sesli
              okuma kapatıldı”). Oyunun üstünde durur, tıklamaları engellemez ve oyundan odağı almaz.
            </small>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={settings().general.shortcutOsd !== false}
              onChange={(e) => {
                const v = e.currentTarget.checked;
                updateSettings((d) => (d.general.shortcutOsd = v));
              }}
            />
            <i />
          </label>
        </div>
        <For each={SHORTCUT_ACTIONS}>
          {(a) => (
            <div class="row">
              <div>
                <span>{SHORTCUT_LABELS[a]}</span>
                <Show when={note(a)}>
                  <small>{note(a)}</small>
                </Show>
                <Show when={usedBy(a, shortcut(a))}>
                  {(o) => <small class="sc-err">{t("Çakışma: “{0}” ile aynı tuş", t(SHORTCUT_LABELS[o()]))}</small>}
                </Show>
                <Show when={errors()[a]}>
                  <small class="sc-err">{errors()[a]}</small>
                </Show>
                <Show when={notice()?.action === a}>
                  <small class="sc-err">{notice()!.text}</small>
                </Show>
              </div>
              <div class="sc-keys">
                <button class="sc-key" classList={{ rec: recording() === a }} onClick={() => setRecording(recording() === a ? null : a)}>
                  {recording() === a ? "Tuşlara bas…" : prettyKey(shortcut(a))}
                </button>
                <button
                  class="btn ghost small"
                  title={t("Varsayılan: {0}", prettyKey(DEFAULT_SHORTCUTS[a]))}
                  disabled={shortcut(a) === DEFAULT_SHORTCUTS[a]}
                  onClick={() => assign(a, DEFAULT_SHORTCUTS[a])}
                >
                  Varsayılana dön
                </button>
                <button class="btn ghost small" title="Kısayolu kaldır" disabled={!shortcut(a)} onClick={() => set(a, "")}>
                  Kaldır
                </button>
              </div>
            </div>
          )}
        </For>
      </section>
      {/* Sesli Mühendis › Sesli komut'taki atamaların aynısı (aynı ayar: general.voice.commands); iki yerden de değiştirilebilir */}
      <section class="panel">
        <h3>Sesli komut (bas-konuş)</h3>
        <p class="muted small">
          Mühendise sesle soru sormak için basılı tutulan düğme ve tuş. Sesli Mühendis sayfasındaki atamalarla aynıdır: birinde
          değiştirirsen diğerinde de değişir. Genel kısayol olarak kaydedilmez (basılı tutma algılanır), tuş oyuna da ulaşır.
        </p>
        <Show when={voiceCmdLocked()}>
          <p class="pro-locked-note">
            <span class="pro-badge">PRO</span> Sesli komut PRO üyelere özel: atamalar PRO olmadan değiştirilemez.
          </p>
        </Show>
        <PttModeRow disabled={voiceCmdLocked()} />
        <PttButtonRow disabled={voiceCmdLocked()} />
        <PttKeyRow label="Klavye tuşu" disabled={voiceCmdLocked()} />
      </section>
      <section class="panel">
        <h3>Uygulama içi tuşlar</h3>
        <p class="muted small">Bunlar sadece ilgili pencere öndeyken çalışır ve değiştirilemez.</p>
        <For each={IN_APP}>
          {(g) => (
            <div class="sc-group">
              <h4>{g.where}</h4>
              <For each={g.items}>
                {(it) => (
                  <div class="row">
                    <span>{it.what}</span>
                    <kbd class="sc-fixed" data-no-i18n={/^[A-Za-z+↑↓←→ /]+$/.test(it.keys) ? "" : undefined}>
                      {it.keys}
                    </kbd>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </section>
    </>
  );
}
