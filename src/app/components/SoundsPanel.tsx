// Sesler: basit uyarı bipleri (herkese açık). Sesli mühendis ayrı sayfada (PRO).

import { invoke } from "@tauri-apps/api/core";
import { settings, updateSettings, type SoundSettings } from "@/sdk/settings";
import { Slider, Switch } from "./SettingsForm";
import { go } from "../ui";

export function SoundsPanel() {
  const s = () => settings().general.sounds;
  const set = (fn: (x: SoundSettings) => void) => updateSettings((d) => fn(d.general.sounds));
  return (
    <>
      <section class="panel">
        <h3>Arkadan hızlı sınıf geliyor</h3>
        <div class="row">
          <div>
            <b>Etkin</b>
            <small>Daha hızlı sınıftan bir araç arkandan yaklaşınca tek bip.</small>
          </div>
          <Switch checked={s().fasterClass.enabled} onChange={(v) => set((x) => (x.fasterClass.enabled = v))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Ses düzeyi</div>
          <Slider value={s().fasterClass.volume} min={0} max={100} step={5} unit="%" onInput={(v) => set((x) => (x.fasterClass.volume = v))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Ton</div>
          <Slider value={s().fasterClass.pitch} min={200} max={1500} step={50} unit="Hz" onInput={(v) => set((x) => (x.fasterClass.pitch = v))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Uyarı mesafesi</div>
          <Slider value={s().fasterClass.seconds} min={1} max={10} step={1} unit="sn" onInput={(v) => set((x) => (x.fasterClass.seconds = v))} />
        </div>
        <div class="row">
          <div>
            <b>İzlerken sessiz</b>
            <small>Kendi aracını sürmüyorken (garaj, tekrar, izleme) çalmaz.</small>
          </div>
          <Switch checked={s().fasterClass.muteSpectating} onChange={(v) => set((x) => (x.fasterClass.muteSpectating = v))} />
        </div>
        <div class="btns">
          <button class="btn ghost" onClick={() => invoke("sound_test", { kind: "faster" })}>
            Dene
          </button>
        </div>
      </section>
      <section class="panel">
        <h3>Yanında araç (sol / sağ)</h3>
        <div class="row">
          <div>
            <b>Etkin</b>
            <small>Yanında araç varken o tarafa yönlendirilmiş sürekli ton.</small>
          </div>
          <Switch checked={s().alongside.enabled} onChange={(v) => set((x) => (x.alongside.enabled = v))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Ses düzeyi</div>
          <Slider value={s().alongside.volume} min={0} max={100} step={5} unit="%" onInput={(v) => set((x) => (x.alongside.volume = v))} />
        </div>
        <div class="f2">
          <div class="f2-cap">Ton</div>
          <Slider value={s().alongside.pitch} min={200} max={1200} step={50} unit="Hz" onInput={(v) => set((x) => (x.alongside.pitch = v))} />
        </div>
        <div class="row">
          <div>
            <b>İzlerken sessiz</b>
          </div>
          <Switch checked={s().alongside.muteSpectating} onChange={(v) => set((x) => (x.alongside.muteSpectating = v))} />
        </div>
        <div class="btns">
          <button class="btn ghost" onClick={() => invoke("sound_test", { kind: "alongside" })}>
            Dene (önce sol, sonra sağ)
          </button>
        </div>
      </section>
      <section class="panel">
        <h3>Sesli spotter ve mühendis</h3>
        <p class="muted">
          Kayıtlı seslerle konuşan spotter ve mühendis ayrı sayfada.{" "}
          <button class="link" onClick={() => go("voice")}>
            Sesli Mühendis'e git
          </button>
        </p>
      </section>
    </>
  );
}
