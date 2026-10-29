import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import type { OverlayProps } from "@/sdk/overlay";
import { inTauri } from "@/sdk/platform";
import { t } from "@/sdk/i18n";
import { VOICE_OVERLAY_EVENT, VOICE_OVERLAY_REQ, type VoiceOverlayData, type VoiceOverlayMember } from "@/voice/overlayTypes";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const SAMPLE: VoiceOverlayData = {
  room: "Pazar Turnuvası",
  mode: "moderated",
  members: [
    { id: "1", name: "Yarış Müdürü", talking: true, mic: "on", deaf: false, me: false, left: null, role: "owner" },
    { id: "2", name: "Emre Kaya", talking: false, mic: "on", deaf: false, me: false, left: 42, role: "member" },
    { id: "3", name: "Luca Rossi", talking: false, mic: "off", deaf: false, me: false, left: null, role: "mod" },
    { id: "4", name: "Sen", talking: false, mic: "floor", deaf: false, me: true, left: null, role: "member" },
    { id: "5", name: "ModErkin", talking: false, mic: "floor", deaf: true, me: false, left: null, role: "member" },
  ],
};

// Ses Odası: panelin ses odası motorundan (olay) gelen odadakiler; konuşan yanar. Düzenlerken örnek görünür.
export default function VoiceRoom(props: OverlayProps) {
  const o = () => props.options;
  const [data, setData] = createSignal<VoiceOverlayData | null>(null);
  onMount(() => {
    if (!inTauri) return;
    const un = listen<VoiceOverlayData>(VOICE_OVERLAY_EVENT, (e) => setData(e.payload ?? null)).catch(() => null);
    void emit(VOICE_OVERLAY_REQ).catch(() => {});
    onCleanup(() => void un.then((f) => f?.()));
  });
  const d = () => (props.editing || !data()?.room ? (props.editing ? SAMPLE : null) : data());
  const rows = createMemo(() => {
    const v = d();
    if (!v) return [] as VoiceOverlayMember[];
    let list = v.members.filter((m) => o().showMe !== false || !m.me);
    if (o().show === "speakers") list = list.filter((m) => m.mic !== "floor");
    if (o().show === "talking") list = list.filter((m) => m.talking);
    // Konuşanlar ve söz hakkı olanlar üstte
    const rank = (m: VoiceOverlayMember) => (m.talking ? 0 : m.left != null ? 1 : m.mic === "on" ? 2 : 3);
    list = [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return list.slice(0, Math.max(1, num(o().maxRows, 12)));
  });
  const color = () => hex(o().talkColor, "#33d17a");
  const design = () => (["discord", "grid", "bubbles"].includes(o().design) ? (o().design as string) : "list");
  const av = () => Math.round(num(o().avatarSize, 40));
  const name = (m: VoiceOverlayMember) => (m.me ? t("Sen") : m.name);
  const icons = (m: VoiceOverlayMember) => (
    <Show when={o().icons !== false}>
      <Show when={m.deaf}>
        <DeafIcon />
      </Show>
      <Show when={!m.deaf && m.mic !== "on"}>
        <MicOffIcon floor={m.mic === "floor"} />
      </Show>
    </Show>
  );
  const timer = (m: VoiceOverlayMember) => (
    <Show when={o().timer !== false && m.left != null}>
      <span class="vro-left" classList={{ low: (m.left ?? 0) <= 10 }}>
        {clock(m.left ?? 0)}
      </span>
    </Show>
  );
  const avatar = (m: VoiceOverlayMember) => (
    <span class="vro-av" style={{ width: `${av()}px`, height: `${av()}px`, "font-size": `${av() * 0.42}px`, background: m.avatar ? undefined : tint(m.id) }}>
      <Show when={m.avatar} fallback={<span class="vro-ini">{initials(name(m))}</span>}>
        <img src={m.avatar} alt="" draggable={false} />
      </Show>
      {/* Mikrofon / ses kapalı: fotoğrafın sağ altında küçük rozet */}
      <Show when={o().icons !== false && (m.deaf || m.mic !== "on")}>
        <span class="vro-badge" style={{ "font-size": `${Math.max(9, av() * 0.32)}px` }}>
          <Show when={m.deaf} fallback={<MicOffIcon floor={m.mic === "floor"} />}>
            <DeafIcon />
          </Show>
        </span>
      </Show>
    </span>
  );
  return (
    <Show when={d() && (rows().length || o().title !== false)}>
      <div
        class={`vro vro-${design()}`}
        classList={{ "ov-panel": o().bg !== false, bare: o().bg === false, quiet: o().dimSilent !== false }}
        style={{ "font-size": `${(num(o().size, 100) / 100) * 13}px`, "--talk": color() }}
      >
        <Show when={o().title !== false}>
          <div class="vro-title">
            <span class="vro-dot" />
            <span class="vro-name">{d()!.room}</span>
          </div>
        </Show>
        <Switch>
          <Match when={design() === "list"}>
            <For each={rows()}>
              {(m) => (
                <div class="vro-row" classList={{ talking: m.talking, dim: m.mic !== "on" && !m.talking }}>
                  <span class="vro-ind" />
                  <span class="vro-n">{name(m)}</span>
                  {timer(m)}
                  {icons(m)}
                </div>
              )}
            </For>
          </Match>
          <Match when={design() === "discord"}>
            <For each={rows()}>
              {(m) => (
                <div class="vro-dc" classList={{ talking: m.talking, dim: m.mic !== "on" && !m.talking }}>
                  {avatar(m)}
                  <span class="vro-tag">
                    <span class="vro-n">{name(m)}</span>
                    {timer(m)}
                  </span>
                </div>
              )}
            </For>
          </Match>
          <Match when={design() === "grid" || design() === "bubbles"}>
            <div class="vro-wrap">
              <For each={rows()}>
                {(m) => (
                  <div class="vro-cell" classList={{ talking: m.talking, dim: m.mic !== "on" && !m.talking }} style={{ "max-width": `${Math.max(av() + 24, av() * 1.8)}px` }}>
                    {avatar(m)}
                    <Show when={design() === "grid"}>
                      <span class="vro-n">{name(m)}</span>
                      {timer(m)}
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}

function DeafIcon() {
  return (
    <svg class="vro-ic" viewBox="0 0 24 24" aria-label={t("Sesi kapalı")}>
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 14.5-7.1M21 14v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3a9 9 0 0 0-1-4.1M2 2l20 20" />
    </svg>
  );
}

function MicOffIcon(props: { floor: boolean }) {
  return (
    <svg class="vro-ic" classList={{ floor: props.floor }} viewBox="0 0 24 24" aria-label={props.floor ? t("Söz hakkı yok") : t("Mikrofon kapalı")}>
      <path d="M12 2a3 3 0 0 0-3 3v4M15 9.3V5a3 3 0 0 0-5.7-1.3M19 10v2a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 11.9 5M12 19v3M2 2l20 20" />
    </svg>
  );
}

/** Ad baş harfleri (en çok 2) */
function initials(n: string): string {
  const w = n.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0].slice(0, 2)).toUpperCase();
}

/** Fotoğrafı olmayanlar için kimlikten sabit bir renk */
function tint(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${Math.round((h * 137.508) % 360)} 45% 40%)`;
}
