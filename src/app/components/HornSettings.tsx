// Ayarlar › Korna: korna sesi seçimi (dinleyerek), korna tuşu / direksiyon düğmesi, gelen kornaları duyma (yakındakiler /
// herkes / kapalı), mesafe, ses düzeyi ve susturulanlar. Çalmak PRO (F.horn), duymak herkese açık.
// Gönderme / alma: src/host/horn.ts, çalma: src-tauri/src/horn.rs

import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { settings, updateSettings } from "@/sdk/settings";
import { F, proLocked } from "@/sdk/proFeatures";
import { isAdmin } from "@/cloud/account";
import { hornList, type Horn } from "@/cloud/horns";
import { HORN_RECENT_KEY, hornRecent, type HornRecent } from "@/host/horn";
import { PttButtonRow, PttKeyRow, type BindTarget } from "./VoiceCommands";
import { Slider } from "./SettingsForm";
import { ProLockNote } from "./ProLock";
import * as I from "../icons";

const TARGET: BindTarget = {
  get: () => settings().general.horn,
  set: (fn) => updateSettings((d) => fn(d.general.horn)),
  hint: "Bir kez bas: korna çalar (en sık 2,5 sn'de bir). Tuş yutulmaz, oyun öndeyken de çalışır.",
};

export function HornSettings() {
  const [horns] = createResource(() => hornList().catch(() => [] as Horn[]));
  const g = () => settings().general;
  const locked = () => proLocked(F.horn);
  const usable = (h: Horn) => h.active && (h.access !== "admin" || isAdmin());
  const visible = () => (horns() ?? []).filter((h) => h.active && (h.access !== "admin" || isAdmin()));
  const [recent, setRecent] = createSignal<HornRecent[]>(hornRecent());
  onMount(() => {
    const h = (e: StorageEvent) => e.key === HORN_RECENT_KEY && setRecent(hornRecent());
    window.addEventListener("storage", h);
    const iv = setInterval(() => setRecent(hornRecent()), 5000);
    onCleanup(() => {
      window.removeEventListener("storage", h);
      clearInterval(iv);
    });
  });
  const play = (h: Horn) =>
    inTauri &&
    void invoke("horn_play", { key: h.key, url: h.url ?? null, fromIdx: -1, fromName: null, volume: Math.max(0.05, (g().hornVolume ?? 80) / 100), nearM: null }).catch(() => {});
  const muted = () => g().hornMuted ?? [];
  const toggleMute = (uid: string) =>
    updateSettings((d) => {
      const m = d.general.hornMuted ?? [];
      d.general.hornMuted = m.includes(uid) ? m.filter((x) => x !== uid) : [...m, uid];
    });
  const nameOf = (uid: string) => recent().find((r) => r.uid === uid)?.name || t("Üye");

  return (
    <div class="page narrow horn-page">
      <section class="panel">
        <h3>
          <I.Megaphone /> {t("Korna")}
        </h3>
        <p class="muted small">
          {t("Atadığın düğmeye basınca aynı iRacing sunucusunda SRTR Pitwall kullanan herkes kornanı duyar. Korna çalmak PRO üyelere özel; gelen kornaları herkes duyar.")}
        </p>
        <ProLockNote feature={F.horn} text={t("Korna çalmak PRO üyelere özel. Gelen kornaları yine duyarsın.")} />
      </section>

      <section class="panel">
        <h3>{t("Korna sesim")}</h3>
        <div class="horn-grid" classList={{ locked: locked() }}>
          <For each={visible()} fallback={<small class="muted">{t("Yükleniyor…")}</small>}>
            {(h) => (
              <div class="horn-card" classList={{ on: g().hornSound === h.key }}>
                <button class="horn-play" title={t("Dinle")} onClick={() => play(h)}>
                  <I.Play />
                </button>
                <button
                  class="horn-pick"
                  disabled={locked() || !usable(h)}
                  onClick={() => updateSettings((d) => (d.general.hornSound = h.key))}
                  title={locked() ? t("Korna çalmak PRO üyelere özel") : t("Bu kornayı seç")}
                >
                  <b data-no-i18n={!h.builtin}>{h.builtin ? t(h.name) : h.name}</b>
                  <Show when={h.access === "admin"}>
                    <span class="hc-badge admin">{t("Yönetici özel")}</span>
                  </Show>
                  <Show when={g().hornSound === h.key}>
                    <I.Check />
                  </Show>
                </button>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="panel">
        <h3>{t("Korna tuşu")}</h3>
        <PttButtonRow target={TARGET} disabled={locked()} />
        <PttKeyRow label="Klavye tuşu" target={TARGET} disabled={locked()} />
      </section>

      <section class="panel">
        <h3>{t("Gelen kornalar")}</h3>
        <div class="row">
          <span>{t("Kimin kornasını duyayım")}</span>
          <div class="seg">
            <button classList={{ on: g().hornHear === "near" }} onClick={() => updateSettings((d) => (d.general.hornHear = "near"))}>
              {t("Yakındakiler")}
            </button>
            <button classList={{ on: g().hornHear === "all" }} onClick={() => updateSettings((d) => (d.general.hornHear = "all"))}>
              {t("Sunucudaki herkes")}
            </button>
            <button classList={{ on: g().hornHear === "off" }} onClick={() => updateSettings((d) => (d.general.hornHear = "off"))}>
              {t("Kapalı")}
            </button>
          </div>
        </div>
        <Show when={g().hornHear === "near"}>
          <div class="row">
            <span class="horn-lbl">
              {t("Mesafe")}
              <small class="muted">{t("Bu mesafedeki araçların kornası duyulur; uzaklaştıkça ses kısılır.")}</small>
            </span>
            <div class="horn-slider">
              <Slider value={g().hornNear ?? 300} min={50} max={1000} step={25} unit=" m" onInput={(v) => updateSettings((d) => (d.general.hornNear = v))} />
            </div>
          </div>
        </Show>
        <Show when={g().hornHear !== "off"}>
          <div class="row">
            <span>{t("Ses düzeyi")}</span>
            <div class="horn-slider">
              <Slider value={g().hornVolume ?? 80} min={0} max={150} step={5} unit="%" onInput={(v) => updateSettings((d) => (d.general.hornVolume = v))} />
            </div>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>{t("Susturulanlar")}</h3>
        <small class="muted">{t("Susturduğun kişinin kornasını duymazsın. Son korna çalanlar aşağıda.")}</small>
        <div class="horn-people">
          <For each={recent()} fallback={<small class="muted">{t("Henüz kimsenin kornasını duymadın.")}</small>}>
            {(r) => (
              <div class="horn-person">
                <span data-no-i18n>{r.name || t("Üye")}</span>
                <small class="muted">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                <span class="lt-sp" />
                <button class="btn small" classList={{ ghost: !muted().includes(r.uid) }} onClick={() => toggleMute(r.uid)}>
                  {muted().includes(r.uid) ? t("Susturmayı kaldır") : t("Sustur")}
                </button>
              </div>
            )}
          </For>
          <For each={muted().filter((u) => !recent().some((r) => r.uid === u))}>
            {(uid) => (
              <div class="horn-person">
                <span data-no-i18n>{nameOf(uid)}</span>
                <span class="lt-sp" />
                <button class="btn small" onClick={() => toggleMute(uid)}>
                  {t("Susturmayı kaldır")}
                </button>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
