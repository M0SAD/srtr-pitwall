// "Webview" overlay'inin ayar kutusu: YouTube oynatıcısını yarışta denetlemek için klavye tuşu / direksiyon düğmesi
// ataması (general.webPlay / webBack / webFwd / webVolUp / webVolDown / webMute; Rust: voicecmd.rs → "webview-key").
import { For, Show, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { settings, updateSettings } from "@/sdk/settings";
import { Section } from "./OverlaySettings";
import { PttButtonRow, PttKeyRow, type BindTarget } from "./VoiceCommands";
import * as I from "../icons";

type Bind = "webPlay" | "webBack" | "webFwd" | "webVolUp" | "webVolDown" | "webMute";
const target = (k: Bind): BindTarget => ({
  get: () => settings().general[k],
  set: (fn) => updateSettings((d) => fn(d.general[k])),
});
const BINDS: { k: Bind; label: string }[] = [
  { k: "webPlay", label: "Durdur / oynat" },
  { k: "webBack", label: "Geri sar" },
  { k: "webFwd", label: "İleri sar" },
  { k: "webVolUp", label: "Sesi aç" },
  { k: "webVolDown", label: "Sesi kıs" },
  { k: "webMute", label: "Sessize al / aç" },
];

export function WebviewPanel() {
  const [open, setOpen] = createSignal<Bind | null>(null);
  const bound = (k: Bind) => {
    const b = settings().general[k];
    return !!(b?.key || b?.button);
  };
  return (
    <Section title="Video denetimi">
      <Show when={inTauri} fallback={<p class="f2-hint">{t("Tuş ataması yalnızca masaüstü uygulamasında çalışır.")}</p>}>
        <div class="f2 mp-binds">
          <small class="f2-hint">
            {t(
              "Webview'de açılan YouTube videosunu yarışta denetle: durdur / oynat, geri / ileri sar, sesi aç / kıs. Düzenleme modunda videonun altındaki düğmelerle de denetlenir. Tuş yutulmaz, oyun öndeyken de çalışır. (Twitch / Kick ve diğer siteler dışarıdan denetlenemez.)",
            )}
          </small>
          <For each={BINDS}>
            {(b) => (
              <div class="mp-bind">
                <button class="mp-bind-head" onClick={() => setOpen(open() === b.k ? null : b.k)}>
                  <span>{t(b.label)}</span>
                  <small classList={{ on: bound(b.k) }}>{bound(b.k) ? t("Atandı") : t("Atanmadı")}</small>
                  <I.ChevronDown />
                </button>
                <Show when={open() === b.k}>
                  <div class="mp-bind-body">
                    <PttButtonRow target={target(b.k)} />
                    <PttKeyRow label="Klavye tuşu" target={target(b.k)} />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Section>
  );
}
