// "Müzik" overlay'inin ayar kutusu (overlay ayarlarının en üstünde): şu an çalan, denetim düğmeleri, açık oynatıcılar
// ve önceki / durdur / sonraki için klavye tuşu ya da direksiyon düğmesi ataması (general.musicToggle / musicNext /
// musicPrev; Rust: voicecmd.rs giriş döngüsü → music.rs).
import { For, Show, createSignal, onCleanup } from "solid-js";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { settings, updateSettings } from "@/sdk/settings";
import { fmtTime, musicControl, musicPos, useMusic } from "@/sdk/music";
import { Section } from "./OverlaySettings";
import { PttButtonRow, PttKeyRow, type BindTarget } from "./VoiceCommands";
import * as I from "../icons";

type Bind = "musicToggle" | "musicNext" | "musicPrev";
const target = (k: Bind, hint: string): BindTarget => ({
  get: () => settings().general[k],
  set: (fn) => updateSettings((d) => fn(d.general[k])),
  hint,
});
const BINDS: { k: Bind; label: string; target: BindTarget }[] = [
  { k: "musicToggle", label: "Durdur / oynat", target: target("musicToggle", "Bir kez bas: çalan şarkı durur, tekrar bas: devam eder.") },
  { k: "musicNext", label: "Sonraki şarkı", target: target("musicNext", "Basınca sonraki şarkıya geçer.") },
  { k: "musicPrev", label: "Önceki şarkı", target: target("musicPrev", "Basınca önceki şarkıya (ya da şarkının başına) döner.") },
];

export function MusicPanel() {
  const st = useMusic(() => true);
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => setNow(Date.now()), 500);
  onCleanup(() => clearInterval(iv));
  const [open, setOpen] = createSignal<Bind | null>(null);
  const bound = (k: Bind) => {
    const b = settings().general[k];
    return !!(b?.key || b?.button);
  };

  return (
    <Section title="Çalan müzik">
      <Show when={inTauri} fallback={<p class="f2-hint">{t("Çalan şarkı yalnızca masaüstü uygulamasında okunur.")}</p>}>
        <div class="mp-now">
          <div class="mp-art">
            <Show when={st().art} fallback={<I.Music />}>
              <img src={st().art} alt="" />
            </Show>
          </div>
          <div class="mp-info">
            <Show
              when={st().active}
              fallback={
                <>
                  <b>{t("Şu an müzik çalmıyor")}</b>
                  <small class="f2-hint">{t("Spotify'ı ya da tarayıcıda YouTube Music'i açıp bir şarkı başlat; burada görünür.")}</small>
                </>
              }
            >
              <b data-no-i18n>{st().title || t("Bilinmeyen parça")}</b>
              <small data-no-i18n>{[st().artist, st().album].filter(Boolean).join(" · ")}</small>
              <small class="muted" data-no-i18n>
                {st().source}
                <Show when={st().durMs > 0}>
                  {" · "}
                  {fmtTime(musicPos(st(), now()))} / {fmtTime(st().durMs)}
                </Show>
              </small>
            </Show>
          </div>
          <Show when={st().active}>
            <div class="mp-btns">
              <button class="btn small ghost" disabled={!st().canPrev} onClick={() => void musicControl("prev")} title={t("Önceki")}>
                <I.SkipBack />
              </button>
              <button class="btn small" disabled={!st().canToggle} onClick={() => void musicControl("toggle")} title={st().playing ? t("Duraklat") : t("Oynat")}>
                {st().playing ? <I.Pause /> : <I.Play />}
              </button>
              <button class="btn small ghost" disabled={!st().canNext} onClick={() => void musicControl("next")} title={t("Sonraki")}>
                <I.SkipForward />
              </button>
            </div>
          </Show>
        </div>
        <Show when={st().error}>
          <small class="f2-hint f2-err">{st().error}</small>
        </Show>
        <Show when={st().sessions.length > 1}>
          <small class="f2-hint">
            {t("Açık oynatıcılar")}:{" "}
            <For each={st().sessions}>
              {(s, i) => (
                <>
                  {i() > 0 ? ", " : ""}
                  <span data-no-i18n>{s[1]}</span>
                  {s[2] ? ` (${t("çalıyor")})` : ""}
                </>
              )}
            </For>
            . {t("Hangisinin gösterileceği aşağıdaki \"Kaynak\" ayarından seçilir.")}
          </small>
        </Show>

        <div class="f2 mp-binds">
          <div class="f2-cap">{t("Tuş / direksiyon düğmesi ata")}</div>
          <small class="f2-hint">{t("Yarışta overlay'e tıklanamaz; şarkıyı direksiyondaki bir düğmeyle ya da klavye tuşuyla değiştirebilirsin. Tuş yutulmaz, oyun öndeyken de çalışır.")}</small>
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
                    <PttButtonRow target={b.target} />
                    <PttKeyRow label="Klavye tuşu" target={b.target} />
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
