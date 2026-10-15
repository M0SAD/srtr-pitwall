// Ses Odaları › Ayarlar: ses aygıtları, gürültü engelleme, algılama eşiği (mikrofon testiyle), bas-konuş ve
// mikrofon / ses aç-kapat tuşları, overlay. Motor: src/voice/engine.ts, mikrofon zinciri: src/voice/micChain.ts

import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import { settings, updateSettings } from "@/sdk/settings";
import {
  applyVolumes,
  audioDevices,
  autoGain,
  changeOutput,
  cueSounds,
  echoCancel,
  gateDb,
  gateHold,
  gateMode,
  inputDevice,
  inputGain,
  inputMode,
  masterVolume,
  micMeter,
  noiseMode,
  outputDevice,
  restartMic,
  setAutoGain,
  setCueSounds,
  setEchoCancel,
  setGateDb,
  setGateHold,
  setGateMode,
  setInputDevice,
  setInputGain,
  setInputMode,
  setMasterVolume,
  setNoiseMode,
  setOutputDevice,
  startMicTest,
  stopMicTest,
  updateMic,
  voice,
  type NoiseMode,
} from "@/voice/engine";
import { Slider, Switch } from "../components/SettingsForm";
import { PttButtonRow, PttKeyRow, type BindTarget } from "../components/VoiceCommands";
import { go } from "../ui";
import { ProLockNote } from "../components/ProLock";
import { F, proLocked } from "@/sdk/proFeatures";
import { ROOM_THEMES, TILE_STYLES, roomTheme, setRoomThemePref, setTileStylePref, tileStyle } from "@/voice/roomTheme";

type Bind = "voiceRoom" | "voiceRoomMute" | "voiceRoomDeafen";
const target = (k: Bind, hint: string, held?: string): BindTarget => ({
  get: () => settings().general[k],
  set: (fn) => updateSettings((d) => fn(d.general[k])),
  hint,
  heldEvent: held,
});

/** Ses odası bas-konuş (general.voiceRoom; Rust: voicecmd.rs "voiceroom-ptt") */
export const VOICE_ROOM_TARGET = target("voiceRoom", "Basılı tuttuğun sürece mikrofonun açık olur. Tuş yutulmaz, oyun öndeyken de çalışır.", "voiceroom-ptt");
/** Mikrofonu kapat / aç (general.voiceRoomMute; Rust: "voiceroom-key" mute) */
export const VOICE_MUTE_TARGET = target("voiceRoomMute", "Bir kez bas: mikrofon kapanır, tekrar bas: açılır.");
/** Sesi kapat / aç: kimseyi duymazsın, mikrofonun da kapanır (general.voiceRoomDeafen) */
export const VOICE_DEAFEN_TARGET = target("voiceRoomDeafen", "Bir kez bas: kimseyi duymazsın ve mikrofonun kapanır, tekrar bas: açılır.");

const NOISE: { id: NoiseMode; label: string }[] = [
  { id: "off", label: "Kapalı" },
  { id: "standard", label: "Standart" },
  { id: "strong", label: "Güçlü" },
];

/** -80..0 dB → % (ölçer ve eşik çubuğu) */
const pct = (db: number) => Math.max(0, Math.min(100, ((db + 80) / 80) * 100));

export function VoiceRoomSettings() {
  const [devs, { refetch }] = createResource(audioDevices);
  onMount(() => {
    const h = () => void refetch();
    navigator.mediaDevices?.addEventListener?.("devicechange", h);
    onCleanup(() => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", h);
      stopMicTest();
    });
  });
  const label = (d: MediaDeviceInfo, i: number) => d.label || t("Aygıt {0}", i + 1);
  const testing = () => voice.micTest() || !!voice.room();
  const [loop, setLoop] = createSignal(false);
  const restart = () => {
    void restartMic();
    void refetch();
  };

  return (
    <>
      <RoomLook />
      <section class="panel vr-audio">
        <h3>Ses aygıtları</h3>
        <div class="row">
          <span>Mikrofon</span>
          <select
            class="vr-sel"
            value={inputDevice()}
            onChange={(e) => {
              setInputDevice(e.currentTarget.value);
              restart();
            }}
          >
            <option value="">{t("Varsayılan")}</option>
            <For each={(devs()?.inputs ?? []).filter((d) => d.deviceId && d.deviceId !== "default")}>
              {(d, i) => <option value={d.deviceId}>{label(d, i())}</option>}
            </For>
          </select>
        </div>
        <div class="row">
          <span>Hoparlör / kulaklık</span>
          <select
            class="vr-sel"
            value={outputDevice()}
            onChange={(e) => {
              setOutputDevice(e.currentTarget.value);
              changeOutput();
            }}
          >
            <option value="">{t("Varsayılan")}</option>
            <For each={(devs()?.outputs ?? []).filter((d) => d.deviceId && d.deviceId !== "default")}>
              {(d, i) => <option value={d.deviceId}>{label(d, i())}</option>}
            </For>
          </select>
        </div>
        <div class="row">
          <span>Mikrofon kazancı</span>
          <div class="vr-slider">
            <Slider
              value={inputGain()}
              min={0}
              max={300}
              step={5}
              unit="%"
              onInput={(v) => {
                setInputGain(v);
                updateMic();
              }}
            />
          </div>
        </div>
        <div class="row">
          <span>Genel ses</span>
          <div class="vr-slider">
            <Slider
              value={masterVolume()}
              min={0}
              max={200}
              step={5}
              unit="%"
              onInput={(v) => {
                setMasterVolume(v);
                applyVolumes();
              }}
            />
          </div>
        </div>
      </section>

      <section class="panel vr-audio">
        <h3>Gürültü engelleme</h3>
        <div class="row">
          <div>
            <span>Gürültü engelleme</span>
            <small>
              Güçlü: yapay zekâ tabanlı gürültü engelleme (RNNoise) klavye, fan, araba, köpek, ortam konuşması gibi sesleri konuşmandan ayırır. Standart:
              Windows / tarayıcı gürültü bastırma. Ayrıca 90 Hz altı uğultu her zaman kesilir.
            </small>
          </div>
          <div class="seg">
            <For each={NOISE}>
              {(n) => (
                <button
                  classList={{ on: noiseMode() === n.id }}
                  onClick={() => {
                    setNoiseMode(n.id);
                    restart();
                  }}
                >
                  {t(n.label)}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="row">
          <div>
            <span>Algılama eşiği</span>
            <small>
              Sesin bu seviyenin altındaysa hiç gönderilmez (nefes, uzaktan gelen sesler). Otomatik: ortam gürültüsünü ölçer, eşiği kendisi ayarlar. Bas-konuşta
              da geçerlidir.
            </small>
          </div>
          <div class="seg">
            <button
              classList={{ on: gateMode() === "auto" }}
              onClick={() => {
                setGateMode("auto");
                updateMic();
              }}
            >
              Otomatik
            </button>
            <button
              classList={{ on: gateMode() === "manual" }}
              onClick={() => {
                setGateMode("manual");
                updateMic();
              }}
            >
              Elle
            </button>
            <button
              classList={{ on: gateMode() === "off" }}
              onClick={() => {
                setGateMode("off");
                updateMic();
              }}
            >
              Kapalı
            </button>
          </div>
        </div>

        {/* Ölçer: canlı seviye, eşik çizgisi; elle modda çubuğa tıklayıp eşiği taşı */}
        <div class="vr-test">
          <div
            class="vr-gauge"
            classList={{ manual: gateMode() === "manual", open: micMeter.open() }}
            title={gateMode() === "manual" ? t("Eşiği ayarlamak için tıkla ya da sürükle") : ""}
            onPointerDown={(e) => {
              if (gateMode() !== "manual") return;
              const el = e.currentTarget;
              const at = (x: number) => {
                const r = el.getBoundingClientRect();
                const db = Math.round(((x - r.left) / r.width) * 80 - 80);
                setGateDb(Math.max(-80, Math.min(-5, db)));
                updateMic();
              };
              at(e.clientX);
              el.setPointerCapture(e.pointerId);
              const mv = (ev: PointerEvent) => at(ev.clientX);
              const up = () => {
                el.removeEventListener("pointermove", mv);
                el.removeEventListener("pointerup", up);
              };
              el.addEventListener("pointermove", mv);
              el.addEventListener("pointerup", up);
            }}
          >
            <i class="vr-gauge-lv" style={{ width: `${testing() ? pct(micMeter.db()) : 0}%` }} />
            <Show when={gateMode() !== "off"}>
              <b class="vr-gauge-thr" style={{ left: `${pct(gateMode() === "manual" ? gateDb() : micMeter.thr())}%` }} />
            </Show>
          </div>
          <div class="vr-test-row">
            <small class="muted">
              {gateMode() === "off" ? t("Eşik kapalı") : t("Eşik: {0} dB", Math.round(gateMode() === "manual" ? gateDb() : micMeter.thr()))}
              {testing() ? ` · ${micMeter.open() ? t("Ses gidiyor") : t("Kapalı (sessiz)")}` : ""}
            </small>
            <span class="vr-test-sp" />
            <Show
              when={voice.micTest() || voice.room()}
              fallback={
                <button class="btn small" onClick={() => void startMicTest(false)}>
                  Mikrofonu dene
                </button>
              }
            >
              <label class="vr-inline">
                <Switch
                  checked={loop()}
                  onChange={(v) => {
                    setLoop(v);
                    void startMicTest(v);
                  }}
                />
                <span>Kendimi duy</span>
              </label>
              <Show when={!voice.room()}>
                <button class="btn small" onClick={() => stopMicTest()}>
                  Testi bitir
                </button>
              </Show>
            </Show>
          </div>
          <p class="muted small">Konuşurken çubuk eşiği geçmeli, sessizken altında kalmalı. Kendini duymak için kulaklık kullan (hoparlörde yankı yapar).</p>
        </div>

        <Show when={gateMode() !== "off"}>
          <div class="row">
            <span>Konuşma bitince bekleme</span>
            <div class="vr-slider">
              <Slider value={gateHold()} min={100} max={1500} step={50} unit=" ms" onInput={(v) => (setGateHold(v), updateMic())} />
            </div>
          </div>
        </Show>
        <div class="row">
          <span>Yankı giderme</span>
          <Switch checked={echoCancel()} onChange={(v) => (setEchoCancel(v), restart())} />
        </div>
        <div class="row">
          <span>Otomatik ses seviyesi</span>
          <Switch checked={autoGain()} onChange={(v) => (setAutoGain(v), restart())} />
        </div>
      </section>

      <section class="panel vr-audio">
        <h3>Konuşma ve kısayollar</h3>
        <div class="row">
          <span>Konuşma şekli</span>
          <div class="seg">
            <button classList={{ on: inputMode() === "open" }} onClick={() => setInputMode("open")}>
              Açık mikrofon
            </button>
            <button classList={{ on: inputMode() === "ptt" }} onClick={() => setInputMode("ptt")}>
              Bas-konuş
            </button>
          </div>
        </div>
        <Show when={inputMode() === "ptt"}>
          <h4>Bas-konuş</h4>
          <PttButtonRow target={VOICE_ROOM_TARGET} />
          <PttKeyRow label="Klavye tuşu" target={VOICE_ROOM_TARGET} />
        </Show>
        <h4>Mikrofonu kapat / aç</h4>
        <PttButtonRow target={VOICE_MUTE_TARGET} />
        <PttKeyRow label="Klavye tuşu" target={VOICE_MUTE_TARGET} />
        <h4>Sesi kapat / aç (kimseyi duyma, mikrofon da kapanır)</h4>
        <PttButtonRow target={VOICE_DEAFEN_TARGET} />
        <PttKeyRow label="Klavye tuşu" target={VOICE_DEAFEN_TARGET} />
        <p class="muted small">Tuşlar ve direksiyon düğmeleri oyun öndeyken de çalışır; basınca ekranda kısa bir bildirim çıkar.</p>
        <div class="row">
          <span>Girme / söz hakkı sesleri</span>
          <Switch checked={cueSounds()} onChange={setCueSounds} />
        </div>
      </section>

      <section class="panel vr-audio">
        <h3>Overlay</h3>
        <p class="muted small">
          “Ses Odası” overlay'i oyunda odadakileri gösterir: konuşanın adı yanar, mikrofonu kapalı olanlar ve söz hakkı süresi görünür. Overlaylarım sayfasından
          aç.
        </p>
        <button class="btn small" onClick={() => go("overlays")}>
          Overlaylarım'a git
        </button>
      </section>
    </>
  );
}

/** Görünüm: tema ve kişi görünümü (PRO) */
function RoomLook() {
  const locked = () => proLocked(F.voiceRoomTheme);
  return (
    <section class="panel vr-look">
      <h3>Görünüm</h3>
      <p class="muted small">Ses odalarının renk teması ve odadaki kişilerin nasıl görüneceği. Sadece senin ekranında değişir.</p>
      <ProLockNote feature={F.voiceRoomTheme} text={t("Temalar ve kişi görünümleri PRO üyelere özel. Önizlemelere bakabilirsin.")} />
      <h4>Tema</h4>
      <div class="vr-themes">
        <For each={ROOM_THEMES}>
          {(th) => (
            <button
              class="vr-theme-card"
              classList={{ on: roomTheme() === th.id, locked: locked() && th.id !== "default" }}
              disabled={locked() && th.id !== "default"}
              onClick={() => setRoomThemePref(th.id)}
              title={locked() && th.id !== "default" ? t("PRO üyelere özel") : ""}
            >
              <span class="vr-theme-prev" style={{ background: th.sw[0] }}>
                <i class="side" style={{ background: th.sw[1] }} />
                <i class="tile" style={{ background: th.sw[1], "box-shadow": `inset 0 0 0 2px ${th.sw[3]}` }} />
                <i class="tile" style={{ background: th.sw[1] }} />
                <i class="bar" style={{ background: th.sw[2] }} />
              </span>
              <span class="vr-theme-name">
                {t(th.label)}
                <Show when={th.id !== "default"}>
                  <span class="pro-badge small">PRO</span>
                </Show>
              </span>
            </button>
          )}
        </For>
      </div>
      <h4>Kişi görünümü</h4>
      <div class="vr-tilestyles">
        <For each={TILE_STYLES}>
          {(ts) => (
            <button
              class="vr-ts-card"
              classList={{ on: tileStyle() === ts.id, locked: locked() && ts.id !== "tiles" }}
              disabled={locked() && ts.id !== "tiles"}
              onClick={() => setTileStylePref(ts.id)}
            >
              <span class={`vr-ts-prev ${ts.id}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
              <b>
                {t(ts.label)}
                <Show when={ts.id !== "tiles"}>
                  <span class="pro-badge small">PRO</span>
                </Show>
              </b>
              <small class="muted">{t(ts.hint)}</small>
            </button>
          )}
        </For>
      </div>
      <Show when={locked()}>
        <button class="btn primary small vr-look-pro" onClick={() => go("pro")}>
          PRO'ya bak
        </button>
      </Show>
    </section>
  );
}
