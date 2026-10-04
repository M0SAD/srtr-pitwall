// Mesajlara ifade (reaksiyon): özel, takım ve grup sohbetleri (c81: message_react, message_reactions_for).
// Canlı yayın yok: açık sohbet ifadeleri birkaç saniyede bir yeniler; kendi ifaden hemen görünür.
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { api } from "./supabase";

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
export function useReactions(kind: ReactKind, ids: () => string[]) {
  const [map, setMap] = createSignal<Record<string, Reaction[]>>({});
  let dead = false;
  /** Sunucu c81'i tanımıyorsa (eski kurulum) yoklama durur */
  let off = false;
  const load = async () => {
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
  // Mesaj listesi değişince (yeni mesaj, eski mesajlar yüklendi) ve 6 sn'de bir
  createEffect(on(() => ids().length, () => void load()));
  const iv = setInterval(() => void load(), 6000);
  onCleanup(() => {
    dead = true;
    clearInterval(iv);
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
    } finally {
      void load();
    }
  };
  return { of: (id: string) => map()[id] ?? [], toggle };
}
