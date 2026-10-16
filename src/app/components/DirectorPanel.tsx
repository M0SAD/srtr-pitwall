// Araçlar › Otomatik Rejisör: iRacing kamerasını yayın için kendiliğinden araçtan araca geçirir
// (Rust: src-tauri/src/director.rs; ayarlar general.director).

import { For, Show, createSignal, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import { DIRECTOR_DEFAULT, settings, updateSettings, type DirectorCfg } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { Slider, Switch } from "./SettingsForm";
import * as I from "../icons";

interface DirStatus {
  enabled: boolean;
  active: boolean;
  why: string;
  kind: string;
  number: string;
  name: string;
  pos: number;
  secs: number;
  len: number;
  pauseLeft: number;
  group: string;
  replay: boolean;
}

const KIND: Record<string, string> = {
  grid: "Grid turu",
  leader: "Lider",
  front: "Ön sıralar",
  battle: "Mücadele",
  field: "Diğer araçlar",
  me: "Kendi aracım",
  incident: "Kaza / pist dışı",
};

export function DirectorPanel() {
  const cfg = (): DirectorCfg => ({ ...DIRECTOR_DEFAULT, ...(settings().general.director ?? {}) });
  const set = <K extends keyof DirectorCfg>(k: K, v: DirectorCfg[K]) =>
    updateSettings((d) => {
      d.general.director = { ...DIRECTOR_DEFAULT, ...(d.general.director ?? {}), [k]: v };
    });
  const [st, setSt] = createSignal<DirStatus | null>(null);
  const [adv, setAdv] = createSignal(false);
  const poll = () => inTauri && invoke<DirStatus>("director_status").then(setSt).catch(() => {});
  poll();
  const timer = window.setInterval(poll, 700);
  onCleanup(() => clearInterval(timer));

  const statusText = () => {
    const s = st();
    if (!cfg().enabled) return t("Kapalı");
    if (!s) return t("Bekleniyor…");
    if (s.active) return "";
    if (s.why === "nosim") return t("iRacing'e bağlanınca başlar");
    if (s.why === "driving") return t("Araçta sürerken kameraya dokunmaz (izleyici modunda, ya da tekrarda çalışır)");
    if (s.why === "manual") return t("Kamerayı elle değiştirdin: {0} sn sonra devam eder", String(Math.ceil(s.pauseLeft)));
    return t("Bekleniyor…");
  };
  const W: { k: "wLeader" | "wFront" | "wBattle" | "wField" | "wMe"; label: string }[] = [
    { k: "wLeader", label: "Lider" },
    { k: "wFront", label: "Ön sıralar" },
    { k: "wBattle", label: "Mücadeleler" },
    { k: "wField", label: "Diğer araçlar (sırayla hepsi)" },
    { k: "wMe", label: "Kendi aracım" },
  ];

  return (
    <section class="panel dir-panel">
      <div class="row">
        <div>
          <b>
            <I.Clapperboard /> Otomatik Rejisör <span class="chip2 small">iRacing</span>
          </b>
          <small>
            Yayında kamerayı kendiliğinden yönetir: yarış başlamadan gridi pole'dan başlayarak sırayla gösterir, yeşil bayrakta TV Mixed kamerasına
            geçer; lideri, ön sıraları ve mücadeleleri gösterir, ara sıra arkadaki araçlara geçer (zamanla bütün araçlar ekrana gelir). Biri pistten
            çıkar ya da kaza yaparsa hemen oraya keser. Tekrar izlerken de çalışır.
          </small>
        </div>
        <Switch checked={cfg().enabled} onChange={(v) => set("enabled", v)} />
      </div>

      <div class="dir-live" classList={{ on: !!st()?.active && cfg().enabled }}>
        <span class="dir-dot" />
        <Show when={st()?.active && cfg().enabled} fallback={<span class="muted">{statusText()}</span>}>
          <span class="dir-kind">{t(KIND[st()!.kind] ?? st()!.kind)}</span>
          <b data-no-i18n>
            #{st()!.number} {st()!.name}
          </b>
          <Show when={st()!.pos > 0 && st()!.kind !== "grid"}>
            <span class="muted" data-no-i18n>
              P{st()!.pos}
            </span>
          </Show>
          <Show when={st()!.group}>
            <span class="chip2 small" data-no-i18n>
              {st()!.group}
            </span>
          </Show>
          <span class="dir-bar">
            <i style={{ width: `${Math.min(100, (st()!.secs / Math.max(1, st()!.len)) * 100)}%` }} />
          </span>
          <Show when={st()!.replay}>
            <span class="chip2 small">{t("Tekrar")}</span>
          </Show>
        </Show>
        <button class="btn small" disabled={!cfg().enabled} onClick={() => inTauri && invoke("director_next")} title={t("Hemen başka bir çekime geç")}>
          <I.SkipForward /> {t("Sonraki çekim")}
        </button>
      </div>

      <div class="row">
        <div>
          <b>Kamera</b>
          <small>Yeşil bayraktan sonra kullanılacak iRacing kamera grubu.</small>
        </div>
        <select class="input" value={cfg().cams} onChange={(e) => set("cams", e.currentTarget.value)}>
          <option value="tvmix">{t("TV Mixed (önerilen)")}</option>
          <option value="keep">{t("Seçtiğim kamera kalsın")}</option>
          <option value="tv">{t("TV kameraları arasında değiştir")}</option>
          <option value="mix">{t("TV + araç üstü kameralar")}</option>
        </select>
      </div>
      <div class="row">
        <div>
          <b>Grid turu</b>
          <small>Yarış başlamadan (gridde ve ısınma turunda) araçları pole'dan başlayarak sırayla göster.</small>
        </div>
        <Switch checked={cfg().gridWalk} onChange={(v) => set("gridWalk", v)} />
      </div>
      <div class="row">
        <div>
          <b>Kazalara odaklan</b>
          <small>Pistten çıkan ya da hızlıyken birden duran araca hemen geçer, birkaç saniye gösterir.</small>
        </div>
        <Switch checked={cfg().incidents} onChange={(v) => set("incidents", v)} />
      </div>
      <div class="row">
        <div>
          <b>Çekim süresi</b>
          <small>Her çekim bu iki süre arasında rastgele uzunlukta.</small>
        </div>
        <div class="dir-pair">
          <Slider value={cfg().minShot} min={3} max={60} unit="sn" onInput={(v) => set("minShot", Math.min(v, cfg().maxShot))} />
          <Slider value={cfg().maxShot} min={3} max={120} unit="sn" onInput={(v) => set("maxShot", Math.max(v, cfg().minShot))} />
        </div>
      </div>

      <button class="link dir-adv" onClick={() => setAdv(!adv())}>
        {adv() ? <I.ChevronDown /> : <I.ChevronRight />} {t("Kurgu ayarları")}
      </button>
      <Show when={adv()}>
        <p class="muted small">{t("Hangi çekimin ne sıklıkla seçileceği (oran). 0: hiç gösterme.")}</p>
        <For each={W}>
          {(w) => (
            <div class="row">
              <b>{t(w.label)}</b>
              <Slider value={cfg()[w.k]} min={0} max={100} step={5} onInput={(v) => set(w.k, v)} />
            </div>
          )}
        </For>
        <div class="row">
          <b>{t("Ön sıralar: ilk kaç araç")}</b>
          <Slider value={cfg().frontN} min={2} max={15} onInput={(v) => set("frontN", v)} />
        </div>
        <div class="row">
          <b>{t("Mücadele sayılan fark")}</b>
          <Slider value={cfg().battleGap} min={0.2} max={3} step={0.1} unit="sn" onInput={(v) => set("battleGap", v)} />
        </div>
        <div class="row">
          <b>{t("Grid turunda araç başına")}</b>
          <Slider value={cfg().gridShot} min={2} max={15} unit="sn" onInput={(v) => set("gridShot", v)} />
        </div>
        <div class="row">
          <div>
            <b>{t("Elle kamera değişince bekle")}</b>
            <small>{t("iRacing'de kamerayı kendin başka araca çevirirsen rejisör bu kadar bekler.")}</small>
          </div>
          <Slider value={cfg().manualPause} min={0} max={120} step={5} unit="sn" onInput={(v) => set("manualPause", v)} />
        </div>
      </Show>
    </section>
  );
}
