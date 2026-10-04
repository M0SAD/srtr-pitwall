// Mesajlara ifade (reaksiyon): özel, takım ve grup sohbetleri (c81: message_react, message_reactions_for).
// Canlı: ifade bırakan, sohbetin haber kanalına (rx:<tür>:<sohbet>) "değişti" der; açık sohbetler hemen tazeler.
// Yedek: pencere öndeyken 3 dk'da bir ve pencereye dönünce.
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { api } from "./supabase";
import { pingLink, type PingLink } from "./social";
import { reactChannel } from "./pings";

export type ReactKind = "dm" | "team" | "group";
export interface Reaction {
  message_id: string;
  emoji: string;
  n: number;
  mine: boolean;
  names: string[];
}

/** Hızlı seçim (mesaj menüsünde) */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🏁"];

const fetchReactions = (kind: ReactKind, ids: string[]) =>
  api<Reaction[]>("POST", "rpc/message_reactions_for", { body: { p_kind: kind, p_ids: ids.slice(-300) } }).then((r) => r ?? []);

/** Bir sohbetin ifadeleri: `of(id)` ile mesajın ifadeleri, `toggle(id, emoji)` ile aç/kapat */
export function useReactions(kind: ReactKind, ids: () => string[], room?: () => string) {
  let link: PingLink | null = null;
  const [map, setMap] = createSignal<Record<string, Reaction[]>>({});
  let dead = false;
  /** Sunucu c81'i tanımıyorsa (eski kurulum) yoklama durur */
  let off = false;
  const load = async (force = true) => {
    if (!force && !document.hasFocus()) return;
    const list = ids().filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (off || !list.length || document.hidden) return;
    try {
      const rows = await fetchReactions(kind, list);
      if (dead) return;
      const next: Record<string, Reaction[]> = {};
      for (const r of rows) (next[r.message_id] ??= []).push(r);
      setMap(next);
    } catch (e) {
      if (/404|PGRST202|does not exist/i.test(String((e as Error)?.message ?? e))) off = true;
    }
  };
  // Mesaj listesi değişince (yeni mesaj, eski mesajlar yüklendi) haber gelince; yedek olarak pencere öndeyken 3 dk'da bir ve pencereye dönünce
  createEffect(on(() => ids().length, () => void load()));
  createEffect(() => {
    const r = room?.();
    link?.close();
    link = r ? pingLink(reactChannel(kind, r), () => void load()) : null;
  });
  const iv = setInterval(() => void load(false), 180_000);
  const onFocus = () => void load();
  window.addEventListener("focus", onFocus);
  onCleanup(() => {
    dead = true;
    clearInterval(iv);
    link?.close();
    window.removeEventListener("focus", onFocus);
  });
  const toggle = async (id: string, emoji: string) => {
    // Hemen göster, sonra sunucuyla eşitle
    const cur = map()[id] ?? [];
    const hit = cur.find((r) => r.emoji === emoji);
    const next = hit
      ? hit.mine
        ? cur.map((r) => (r === hit ? { ...r, n: r.n - 1, mine: false } : r)).filter((r) => r.n > 0)
        : cur.map((r) => (r === hit ? { ...r, n: r.n + 1, mine: true } : r))
      : [...cur, { message_id: id, emoji, n: 1, mine: true, names: [] }];
    setMap({ ...map(), [id]: next });
    try {
      await api("POST", "rpc/message_react", { body: { p_kind: kind, p_id: id, p_emoji: emoji } });
      link?.ping();
    } finally {
      void load();
    }
  };
  return { of: (id: string) => map()[id] ?? [], toggle };
}
