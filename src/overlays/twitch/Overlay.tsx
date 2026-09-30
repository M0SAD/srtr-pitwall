import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { settings } from "@/sdk/settings";
import { joinChat, type ChatMsg } from "./chat";
import "./style.css";

const SAMPLE: ChatMsg[] = [
  { id: "1", user: "SRTRFan", color: "#ff8a2a", text: "Güzel start! 🏁", mod: false, sub: true, vip: false, broadcaster: false, ts: Date.now() },
  { id: "2", user: "ModErkin", color: "#33ceff", text: "T1'de dikkatli ol", mod: true, sub: false, vip: false, broadcaster: false, ts: Date.now() },
  { id: "3", user: "gt3sever", color: "#9b6cff", text: "Bu tur 1:47 gelir", mod: false, sub: false, vip: true, broadcaster: false, ts: Date.now() },
];

export default function TwitchChat(props: OverlayProps) {
  const channel = () => ((props.options.channel as string) || settings().general.twitch.channel || "").trim();
  const [msgs, setMsgs] = createSignal<ChatMsg[]>([]);
  const [status, setStatus] = createSignal("closed");
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 2000);
  onCleanup(() => clearInterval(tick));

  createEffect(() => {
    const ch = channel();
    if (!ch) return;
    const c = joinChat(ch, props.options.max as number);
    createEffect(() => setMsgs(c.msgs()));
    createEffect(() => setStatus(c.status()));
    onCleanup(() => c.close());
  });

  const bots = createMemo(() =>
    String(props.options.hideBots ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
  const shown = createMemo(() => {
    let l = msgs();
    if (props.options.hideCommands) l = l.filter((m) => !m.text.startsWith("!"));
    if (bots().length) l = l.filter((m) => !bots().includes(m.user.toLowerCase()));
    const fade = (props.options.fade as number) * 1000;
    if (fade > 0 && !props.editing) l = l.filter((m) => now() - m.ts < fade);
    l = l.slice(-(props.options.max as number));
    return l.length === 0 && props.editing ? SAMPLE : l;
  });

  return (
    <div class="tw">
      <Show when={!channel() && props.editing}>
        <div class="ov-panel ov-empty">Kanal adı girilmedi</div>
      </Show>
      <Show when={channel() && status() !== "open" && props.editing}>
        <div class="tw-status">#{channel()} · {status() === "connecting" ? "bağlanıyor…" : "bağlantı yok"}</div>
      </Show>
      <For each={shown()}>
        {(m) => (
          <div class="ov-panel tw-msg">
            <Show when={props.options.showBadges}>
              {m.broadcaster ? <i class="tw-b tw-bc">YAYINCI</i> : m.mod ? <i class="tw-b tw-mod">MOD</i> : m.vip ? <i class="tw-b tw-vip">VIP</i> : m.sub ? <i class="tw-b tw-sub">★</i> : null}
            </Show>
            <b style={{ color: m.color || "var(--ov-accent)" }}>{m.user}</b>
            <span>{m.text}</span>
          </div>
        )}
      </For>
    </div>
  );
}
