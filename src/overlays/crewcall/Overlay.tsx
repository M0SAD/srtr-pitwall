// Ekip Çağrısı: ekip odasından gelen mesaj / hazır çağrı ya da uygulanan pit komutu ekranın ortasında büyük bir
// duyuruyla gösterilir. Mesajlar `overlay-message` olayıyla (bkz. sdk/ovmsg.ts, kind "crew"), uygulanan pit
// komutları `crew-call` olayıyla (bkz. sdk/crewcall.ts, host/crew.ts) gelir. Demo modunda örnek çağrılar döner.

import { Match, Show, Switch, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { inTauri } from "@/sdk/platform";
import { useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { OVMSG_EVENT, registerOvMsgFilter, type OvMsg } from "@/sdk/ovmsg";
import { CREWCALL_EVENT, callKind, type CallKind, type CrewCallEvt } from "@/sdk/crewcall";
import "./style.css";

interface Call {
  id: string;
  from: string;
  body: string;
  kind: CallKind;
}

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Demo modunda sırayla gösterilen örnek çağrılar */
const DEMO_CALLS = (): [string, CallKind][] => [
  [t("Bu tur pite gir"), "pit"],
  [t("Push"), "push"],
  [t("Yakıt koru"), "fuel"],
  [t("Arkanda hızlı araç"), "fast"],
];

/** Çağrı türüne göre bip dizisi: [frekans, süre ms, başlangıç ms] */
const BEEPS: Record<string, [number, number, number][]> = {
  pit: [
    [988, 140, 0],
    [988, 140, 200],
    [1319, 260, 400],
  ],
  fast: [
    [1175, 110, 0],
    [1175, 110, 160],
  ],
  push: [
    [784, 110, 0],
    [1175, 200, 140],
  ],
  default: [
    [880, 120, 0],
    [1320, 160, 150],
  ],
};

const Icon = (p: { kind: CallKind }) => (
  <svg class="cc-ico" viewBox="0 0 48 48" aria-hidden="true">
    <Switch
      fallback={
        // Telsiz dalgası
        <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
          <path d="M14 30V18M24 36V12M34 30V18" />
        </g>
      }
    >
      <Match when={p.kind === "pit"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 40V9h10a9 9 0 0 1 0 18H16" />
        </g>
      </Match>
      <Match when={p.kind === "push"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 14l12 10-12 10M26 14l12 10-12 10" />
        </g>
      </Match>
      <Match when={p.kind === "fuel"}>
        <g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round">
          <path d="M24 6c7 9 12 15 12 22a12 12 0 0 1-24 0c0-7 5-13 12-22z" />
          <path d="M18 29a6 6 0 0 0 6 6" stroke-linecap="round" />
        </g>
      </Match>
      <Match when={p.kind === "fast"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22l12-12 12 12M12 38l12-12 12 12" />
        </g>
      </Match>
      <Match when={p.kind === "left"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 12L10 24l12 12M10 24h28" />
        </g>
      </Match>
      <Match when={p.kind === "right"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M26 12l12 12-12 12M38 24H10" />
        </g>
      </Match>
      <Match when={p.kind === "clear"}>
        <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 25l9 9 19-19" />
        </g>
      </Match>
      <Match when={p.kind === "command"}>
        <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M29 12a8 8 0 0 0-10 10L8 33l6 6 11-11a8 8 0 0 0 10-10l-5 5-4-2-2-4z" />
        </g>
      </Match>
    </Switch>
  </svg>
);

export default function CrewCall(props: OverlayProps) {
  const o = () => props.options;
  const status = useTopic("status");
  const [call, setCall] = createSignal<Call | null>(null);
  const [out, setOut] = createSignal(false);
  /** Her yeni çağrıda artar: animasyon yeniden başlasın */
  const [gen, setGen] = createSignal(0);
  let hideT: ReturnType<typeof setTimeout> | undefined;
  let outT: ReturnType<typeof setTimeout> | undefined;
  const beepT: ReturnType<typeof setTimeout>[] = [];

  const accepts = (m: OvMsg) => m.kind === "crew" && !m.mine && o().showMessages !== false && (!o().quickOnly || !!callKind(m.body));

  const beep = (kind: CallKind) => {
    // Panel önizlemesinde ses çalınmaz; OBS sayfasında Tauri komutu yok
    if (!inTauri || !onScreen() || o().sound === false) return;
    const vol = clamp(num(o().volume, 50), 5, 100) / 100;
    for (const [freq, ms, at] of BEEPS[kind] ?? BEEPS.default) {
      beepT.push(setTimeout(() => invoke("overlay_beep", { freq, ms, volume: vol }).catch(() => {}), at));
    }
  };

  const show = (c: Call, silent = false) => {
    if (call()?.id === c.id) return;
    clearTimeout(hideT);
    clearTimeout(outT);
    setOut(false);
    setCall(c);
    setGen(gen() + 1);
    if (!silent) beep(c.kind);
    const ms = clamp(num(o().duration, 8), 2, 60) * 1000;
    outT = setTimeout(() => setOut(true), ms - 450);
    hideT = setTimeout(() => setCall((x) => (x?.id === c.id ? null : x)), ms);
  };

  // Burada gösterilen ekip mesajı için alt ortadaki küçük ekip kutusu ayrıca çıkmaz
  onCleanup(registerOvMsgFilter((m) => accepts(m)));

  onMount(() => {
    if (!inTauri) return;
    let dead = false;
    const uns: (() => void)[] = [];
    void listen<OvMsg>(OVMSG_EVENT, (e) => {
      const m = e.payload;
      if (!m || !accepts(m)) return;
      show({ id: m.id, from: m.name || "?", body: m.body, kind: callKind(m.body) });
    }).then((f) => (dead ? f() : uns.push(f)));
    void listen<CrewCallEvt>(CREWCALL_EVENT, (e) => {
      const c = e.payload;
      if (!c || o().showCommands === false) return;
      show({ id: `cmd-${c.id}`, from: c.from || "?", body: c.body, kind: "command" });
    }).then((f) => (dead ? f() : uns.push(f)));
    onCleanup(() => {
      dead = true;
      uns.forEach((f) => f());
    });
  });

  // Demo modu: örnek çağrılar sırayla (önizleme dondurulunca yenisi üretilmez)
  let demoN = 0;
  const demoOn = () => !!status()?.demo && !status()?.preview && !props.editing;
  createEffect(
    on(demoOn, (d) => {
      if (!d) return;
      const next = () => {
        if (previewFrozen()) return;
        const list = DEMO_CALLS();
        const [body, kind] = list[demoN++ % list.length];
        show({ id: `demo-${demoN}`, from: t("Pit Ekibi"), body, kind });
      };
      const first = setTimeout(next, 2500);
      const iv = setInterval(next, 20_000);
      onCleanup(() => {
        clearTimeout(first);
        clearInterval(iv);
      });
    }),
  );

  onCleanup(() => {
    clearTimeout(hideT);
    clearTimeout(outT);
    beepT.forEach(clearTimeout);
  });

  const SAMPLE: Call = { id: "sample", from: "", body: "", kind: "pit" };
  const view = () => call() ?? (props.editing ? SAMPLE : null);
  const fromOf = (c: Call) => (c.id === "sample" ? t("Pit Ekibi") : c.from);
  const bodyOf = (c: Call) => (c.id === "sample" ? t("Bu tur pite gir") : c.body);
  const kind = () => view()?.kind || "msg";
  const colorOf = () => {
    const k = view()?.kind;
    const c = o();
    if (k === "pit") return c.pitColor || "#ffcc33";
    if (k === "push" || k === "clear") return c.pushColor || "#33d17a";
    if (k === "fuel") return c.fuelColor || "#4aa8ff";
    if (k === "fast") return c.fastColor || "#3b6cff";
    if (k === "command") return "var(--ov-purple)";
    return c.color || "#ff8a2a";
  };
  const anim = () => (["pulse", "flash", "slide", "none"].includes(o().anim) ? (o().anim as string) : "pulse");

  return (
    <div
      class="cc-wrap"
      style={{
        width: `${clamp(num(o().width, 640), 320, 1400)}px`,
        "font-size": `${clamp(num(o().fontSize, 34), 16, 80)}px`,
      }}
    >
      <Show when={view()} keyed>
        {(c) => (
          <div
            class={`cc cc-${kind()} cc-a-${anim()}`}
            classList={{ "cc-out": out() && !props.editing, "cc-up": o().upper !== false, "cc-still": props.editing && !call() }}
            style={{
              "--cc-c": String(colorOf()),
              "--cc-bg": `color-mix(in srgb, var(--ov-bg-solid) ${clamp(num(o().bgOpacity, 92), 30, 100)}%, transparent)`,
            }}
            data-gen={gen()}
          >
            <Show when={o().showIcon !== false}>
              <span class="cc-badge">
                <Icon kind={c.kind} />
              </span>
            </Show>
            <div class="cc-text">
              <Show when={o().showSender !== false || c.kind === "command"}>
                <div class="cc-from">
                  <span>{c.kind === "command" ? "Pit ayarı uygulandı" : "Ekip"}</span>
                  <Show when={o().showSender !== false}>
                    <i>·</i>
                    <b data-no-i18n>{fromOf(c)}</b>
                  </Show>
                </div>
              </Show>
              <div class="cc-body" data-no-i18n>
                {bodyOf(c)}
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
