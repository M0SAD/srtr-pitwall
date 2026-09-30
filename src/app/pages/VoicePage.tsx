// Sesli spotter ve mühendis (PRO). Sesler kullanıcının CrewChief ses paketinden okunur.

import { For, Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, VOICE_CATEGORIES, type VoiceSettings } from "@/sdk/settings";
import { entitlement, isPro } from "@/cloud/account";
import { Slider, Switch } from "../components/SettingsForm";
import { go } from "../ui";
import * as I from "../icons";

interface VoiceInfo {
  soundsDir: string;
  found: boolean;
  packs: string[];
  spotters: string[];
  phrases: number;
  files: number;
  active: boolean;
  error: string | null;
}

const TESTS: { key: string; label: string }[] = [
  { key: "radio", label: "Telsiz testi" },
  { key: "car_left", label: "Solda araç" },
  { key: "car_right", label: "Sağda araç" },
  { key: "three_wide", label: "Üç araç" },
  { key: "clear", label: "Temiz" },
  { key: "position", label: "Pozisyon (P5)" },
  { key: "laps_left", label: "5 tur kaldı" },
  { key: "fuel", label: "Yakıt" },
  { key: "yellow", label: "Sarı bayrak" },
  { key: "last_lap", label: "Son tur" },
];

export function VoicePage() {
  const v = () => settings().general.voice;
  const set = (fn: (x: VoiceSettings) => void) => updateSettings((d) => fn(d.general.voice));
  const [info, { refetch }] = createResource(
    () => [v().soundsDir, v().pack, v().spotter] as const,
    () => invoke<VoiceInfo>("voice_info").catch((e) => ({ error: String(e) }) as VoiceInfo),
  );
  const [msg, setMsg] = createSignal("");
  const locked = () => entitlement().locked.includes("voice") && !isPro();

  const test = async (key: string) => {
    setMsg("");
    try {
      await invoke("voice_test", { key });
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div class="page narrow">
      <section class="panel voice-hero">
        <div class="voice-hero-ic">
          <I.Mic />
        </div>
        <div>
          <h3>
            Sesli spotter ve mühendis <span class="pro-badge">PRO</span>
          </h3>
          <p class="muted">
            CrewChief gibi: yanında araç olduğunda spotter uyarır, mühendis bayrakları, yakıtı, pozisyonu, kalan turu, pit
            penceresini ve tur rekorlarını söyler. Sesler bilgisayarındaki CrewChief ses paketinden okunur; SRTR Pitwall'u
            CrewChief ile birlikte çalıştırmana gerek yok.
          </p>
        </div>
      </section>

      <Show when={locked()}>
        <section class="panel warn-panel">
          <p>
            Sesli mühendis PRO üyelere özel.{" "}
            <button class="link" onClick={() => go("pro")}>
              PRO'ya bak
            </button>
          </p>
        </section>
      </Show>

      <section class="panel">
        <div class="row">
          <div>
            <b>Etkin</b>
            <small>{info()?.active ? "Çalışıyor" : v().enabled ? "Ses paketi bekleniyor" : "Kapalı"}</small>
          </div>
          <Switch checked={v().enabled} disabled={locked()} onChange={(on) => set((x) => (x.enabled = on))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Mühendis ses düzeyi</div>
          <Slider value={v().volume} min={0} max={100} step={5} unit="%" onInput={(n) => set((x) => (x.volume = n))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Spotter ses düzeyi</div>
          <Slider value={v().spotterVolume} min={0} max={100} step={5} unit="%" onInput={(n) => set((x) => (x.spotterVolume = n))} />
        </div>
      </section>

      <section class="panel">
        <h3>Ses paketi</h3>
        <div class="row">
          <div>
            <b>CrewChief ses klasörü</b>
            <small>{info()?.soundsDir || "…"}</small>
          </div>
          <div class="mqtt-host">
            <input
              class="input"
              placeholder="Boş: varsayılan konum"
              value={v().soundsDir}
              onChange={(e) => set((x) => (x.soundsDir = e.currentTarget.value.trim()))}
            />
            <button class="btn ghost small" onClick={() => refetch()}>
              Yenile
            </button>
          </div>
        </div>
        <Show
          when={info()?.found}
          fallback={
            <p class="error">
              Ses klasörü bulunamadı. CrewChief kurulu ve ses paketi indirilmiş olmalı (varsayılan konum
              %LOCALAPPDATA%\CrewChiefV4\Sounds). Farklı bir yerdeyse yukarıya yaz.
            </p>
          }
        >
          <div class="row">
            <div>
              <b>Mühendis sesi</b>
              <small>{info()!.phrases} ifade, {info()!.files} kayıt</small>
            </div>
            <select class="f2-select" value={v().pack} onChange={(e) => set((x) => (x.pack = e.currentTarget.value))}>
              <option value="">Varsayılan</option>
              <For each={info()!.packs}>{(p) => <option value={p}>{p}</option>}</For>
            </select>
          </div>
          <div class="row">
            <div>
              <b>Spotter sesi</b>
            </div>
            <select class="f2-select" value={v().spotter} onChange={(e) => set((x) => (x.spotter = e.currentTarget.value))}>
              <option value="">Otomatik</option>
              <For each={info()!.spotters}>{(p) => <option value={p}>{p.replace(/^spotter_?/, "") || "Varsayılan"}</option>}</For>
            </select>
          </div>
        </Show>
        <Show when={info()?.error}>
          <p class="error">{info()!.error}</p>
        </Show>
      </section>

      <section class="panel">
        <h3>Ne söylesin</h3>
        <For each={VOICE_CATEGORIES}>
          {(c) => (
            <div class="row">
              <div>
                <b>{c.name}</b>
                <small>{c.desc}</small>
              </div>
              <Switch checked={v().categories[c.id] !== false} onChange={(on) => set((x) => (x.categories[c.id] = on))} />
            </div>
          )}
        </For>
        <div class="row">
          <div>
            <b>Ovallerde iç / dış de</b>
            <small>Sol/sağ yerine "içte araç", "dışta araç".</small>
          </div>
          <Switch checked={v().ovalInsideOutside} onChange={(on) => set((x) => (x.ovalInsideOutside = on))} />
        </div>
      </section>

      <section class="panel">
        <h3>Dene</h3>
        <div class="voice-tests">
          <For each={TESTS}>
            {(t) => (
              <button class="btn ghost small" disabled={!info()?.found} onClick={() => test(t.key)}>
                <I.Volume2 /> {t.label}
              </button>
            )}
          </For>
        </div>
        <Show when={msg()}>
          <p class="error">{msg()}</p>
        </Show>
      </section>
    </div>
  );
}
