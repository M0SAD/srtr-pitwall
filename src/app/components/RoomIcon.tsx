// Ses odası simgesi: "i:<ad>" uygulamadaki simgelerden, değilse emoji; boşsa odanın türüne göre.
import { For, Show, type JSX } from "solid-js";
import * as I from "../icons";

export const ROOM_ICONS: Record<string, () => JSX.Element> = {
  audio: () => <I.AudioLines />,
  headphones: () => <I.Headphones />,
  mic: () => <I.Mic />,
  trophy: () => <I.Trophy />,
  flag: () => <I.Flag />,
  car: () => <I.Car />,
  gauge: () => <I.Gauge />,
  timer: () => <I.Timer />,
  fuel: () => <I.Fuel />,
  wrench: () => <I.Wrench />,
  siren: () => <I.Siren />,
  users: () => <I.Users />,
  chat: () => <I.MessageCircle />,
  megaphone: () => <I.Megaphone />,
  radio: () => <I.Radio />,
  star: () => <I.Star />,
  crown: () => <I.Crown />,
  shield: () => <I.ShieldCheck />,
  globe: () => <I.Globe />,
  heart: () => <I.Heart />,
  gamepad: () => <I.Gamepad2 />,
  coffee: () => <I.Coffee />,
  zap: () => <I.Zap />,
  flame: () => <I.Flame />,
  music: () => <I.Music />,
  hash: () => <I.Hash />,
};

export function RoomIcon(props: { icon?: string | null; kind?: string }) {
  const key = () => (props.icon ?? "").trim();
  const lucide = () => (key().startsWith("i:") ? ROOM_ICONS[key().slice(2)] : undefined);
  return (
    <Show when={key()} fallback={props.kind === "private" ? <I.Lock /> : props.kind === "team" ? <I.Users /> : <I.AudioLines />}>
      <Show when={lucide()} fallback={<span class="room-emoji">{key()}</span>}>
        {(f) => f()()}
      </Show>
    </Show>
  );
}

/** Simge seçici: uygulama simgeleri + emoji kutusu */
export function RoomIconPicker(props: { value: string; onChange: (v: string) => void }) {
  return (
    <div class="ricp">
      <button type="button" class="ricp-b" classList={{ on: !props.value }} title="Varsayılan" onClick={() => props.onChange("")}>
        <I.X />
      </button>
      <For each={Object.keys(ROOM_ICONS)}>
        {(k) => (
          <button type="button" class="ricp-b" classList={{ on: props.value === `i:${k}` }} onClick={() => props.onChange(`i:${k}`)}>
            {ROOM_ICONS[k]()}
          </button>
        )}
      </For>
      <input
        class="input ricp-emoji"
        maxLength={8}
        placeholder="😀"
        title="Emoji"
        value={props.value.startsWith("i:") ? "" : props.value}
        onInput={(e) => props.onChange(e.currentTarget.value.trim())}
      />
    </div>
  );
}
