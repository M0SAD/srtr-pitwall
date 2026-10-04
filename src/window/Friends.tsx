// Ayrı pencereler: "Arkadaşlar" listesi (Steam arkadaş listesi gibi, tepsiden de açılır) ve
// bir arkadaşın canlı verisi (yakıt, turlar, pistteki yeri) penceresi.
// Stil sırası (hangi kural hangisini ezer) panel sayfaları bölündükten sonra da eskisiyle aynı kalsın diye açıkça yazılır
import "@/app/chatlook.css";
import "@/app/components/proLock.css";
import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { session } from "@/cloud/supabase";
import { myFriends, type Friend } from "@/cloud/social";
import { myTeams } from "@/cloud/teams";
import { myGroups } from "@/cloud/groups";
import { Avatar, FriendsPanel, shownName, statusText } from "@/app/components/FriendsDock";
import FriendData from "@/app/components/FriendData";
import { t } from "@/sdk/i18n";

function NeedLogin() {
  return <p class="muted small fdock-empty">Arkadaş listesi için programda Hesap sayfasından giriş yap.</p>;
}

export function FriendsWindow(props: { chat?: string }) {
  const [open] = createSignal(true);
  return (
    <Show when={session()} fallback={<NeedLogin />}>
      <FriendsPanel standalone open={open} initialChat={props.chat} />
    </Show>
  );
}

/** Sohbet penceresi (Steam gibi): tek pencere, her arkadaş bir sekme; yeni mesajda sekmede sarı nokta, görev çubuğunda yanıp sönme */
export function ChatWindow(props: { id: string }) {
  const [open] = createSignal(true);
  const [tabs, setTabs] = createSignal<string[]>(props.id ? [props.id] : []);
  const [active, setActive] = createSignal(props.id || "");
  const [unread, setUnread] = createSignal<Record<string, boolean>>({});
  // Pencere simge durumundayken (görünmezken) sohbet takılmaz: yoksa gelen mesajlar "okundu" sayılır ve
  // Arkadaşlar penceresindeki "Okunmamış mesajlar" boş kalırdı. Pencere açılınca sohbet yüklenir.
  const [shown, setShown] = createSignal(!document.hidden);
  /** En son okunmamış mesaj gelen sekme */
  let lastUnread = "";
  const [list, { refetch }] = createResource(async () => (await myFriends().catch(() => [])) ?? []);
  const friend = (id: string) => (list() ?? []).find((x) => x.friend_id === id);
  const [teamList] = createResource(async () => (await myTeams().catch(() => [])) ?? []);
  const [groupList, { refetch: refetchGroups }] = createResource(async () => (await myGroups().catch(() => [])) ?? []);
  /** Sekmenin rengi arkadaş listesindeki gibi: yarışta (yeşil), çevrimiçi (mavi), çevrimdışı (gri); odalar çevrimiçi sayılır */
  const pres = (id: string) => {
    if (id.includes(":")) return "online";
    const f = friend(id);
    return f?.racing && !f.invisible ? "racing" : f?.online && !f.invisible ? "online" : "offline";
  };
  /** Sekme başlığı: arkadaş, takım odası ("team:<id>") ya da grup ("group:<id>") */
  const info = (id: string): { name: string; sub: string } => {
    if (id.startsWith("team:")) {
      const tm = (teamList() ?? []).find((x) => x.team_id === id.slice(5));
      return { name: tm ? `[${tm.tag}] ${tm.name}` : "…", sub: t("Takım sohbeti") };
    }
    if (id.startsWith("group:")) {
      const g = (groupList() ?? []).find((x) => x.group_id === id.slice(6));
      return { name: g?.name ?? "…", sub: t("Grup sohbeti") };
    }
    const f = friend(id);
    // Arkadaşlar penceresindeki satırla aynı durum yazısı (oturum · pist, oyun, son çevrimiçi…)
    return { name: f ? shownName(f) : "…", sub: f ? statusText(f) : "" };
  };
  const select = (id: string) => {
    setActive(id);
    if (unread()[id]) setUnread({ ...unread(), [id]: false });
  };
  const take = async () => {
    const q = await invoke<[string, boolean][]>("chat_tabs_take").catch(() => [] as [string, boolean][]);
    for (const [id, front] of q) {
      const fresh = !tabs().includes(id);
      if (fresh) setTabs([...tabs(), id]);
      if (fresh && id.startsWith("group:")) void refetchGroups();
      else if (fresh && !id.includes(":") && !friend(id)) void refetch();
      if (front) select(id);
      else {
        // Arka planda gelen mesaj: sekme seçili ve pencere önde değilse sarı nokta
        if (!active()) setActive(id);
        if (id !== active() || !document.hasFocus() || document.hidden) {
          setUnread({ ...unread(), [id]: true });
          lastUnread = id;
        }
      }
    }
  };
  // Kapanan sekme önce daralır (sağdakiler yumuşakça sola kayar), sonra listeden çıkar
  const [closing, setClosing] = createSignal<string[]>([]);
  const close = (id: string) => {
    if (closing().includes(id)) return;
    setClosing([...closing(), id]);
    setTimeout(() => {
      setClosing(closing().filter((x) => x !== id));
      closeNow(id);
    }, 200);
  };
  const closeNow = (id: string) => {
    const rest = tabs().filter((x) => x !== id);
    setTabs(rest);
    if (!rest.length) return void getCurrentWindow().close().catch(() => {});
    if (active() === id) select(rest[rest.length - 1]);
  };
  onMount(() => {
    void take();
    // Sekmelerdeki durum yazısı güncel kalsın
    const iv = setInterval(() => !document.hidden && void refetch(), 30_000);
    onCleanup(() => clearInterval(iv));
    let un: (() => void) | undefined;
    void listen("chat-tab", take).then((u) => (un = u));
    // Pencereye geçilince (görev çubuğundan tıklanınca): en son mesaj gelen sekme öne gelir ve okunmuş olur
    const focus = () => {
      if (lastUnread && unread()[lastUnread] && tabs().includes(lastUnread)) select(lastUnread);
      else if (active() && unread()[active()]) setUnread({ ...unread(), [active()]: false });
      lastUnread = "";
    };
    const vis = () => setShown(!document.hidden);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", vis);
    onCleanup(() => (un?.(), window.removeEventListener("focus", focus), document.removeEventListener("visibilitychange", vis)));
  });
  return (
    <Show when={session()} fallback={<NeedLogin />}>
      <div class="cwin">
        <div class="cwin-tabs">
          <For each={tabs()}>
            {(id) => (
              <div class="cwin-tab" classList={{ on: active() === id, unread: !!unread()[id], [`p-${pres(id)}`]: true, closing: closing().includes(id) }} onClick={() => select(id)} onAuxClick={(e) => e.button === 1 && close(id)}>
                <Avatar id={id.replace(/^(team|group):/, "")} name={info(id).name.replace(/^\[[^\]]*\]\s*/, "")} size={26} />
                <span class="cwin-tab-name">
                  <b data-no-i18n>{info(id).name}</b>
                  <small data-no-i18n={id.includes(":") ? undefined : true}>{info(id).sub}</small>
                </span>
                <i class="cwin-dot" />
                <button class="cwin-x" title="Kapat" onClick={(e) => (e.stopPropagation(), close(id))}>
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="cwin-body">
          <Show when={shown() && active()} keyed>
            {(id) => <FriendsPanel standalone open={open} chatOnly={id} />}
          </Show>
        </div>
      </div>
    </Show>
  );
}

export function FriendWindow(props: { id: string }) {
  const [f] = createResource(async () => {
    const l = (await myFriends().catch(() => [])) ?? [];
    return (l.find((x) => x.friend_id === props.id) ?? { friend_id: props.id, display_name: "?" }) as Friend;
  });
  return (
    <Show when={session()} fallback={<NeedLogin />}>
      <div class="fwin">
        <Show when={f()}>
          {(fr) => {
            document.title = `SRTR Pitwall – ${t("{0} · canlı veri", fr().display_name)}`;
            return (
              <>
                <div class="fwin-head">
                  <b data-no-i18n>{fr().display_name}</b>
                  <small class="muted">{fr().racing ? [fr().session, fr().track].filter(Boolean).join(" · ") : fr().online ? t("Çevrimiçi") : t("Çevrimdışı")}</small>
                </div>
                <FriendData f={fr()} />
              </>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}
