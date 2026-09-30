// Ayrı pencereler: "Arkadaşlar" listesi (Steam arkadaş listesi gibi, tepsiden de açılır) ve
// bir arkadaşın canlı verisi (yakıt, turlar, pistteki yeri) penceresi.
import { Show, createResource, createSignal } from "solid-js";
import { session } from "@/cloud/supabase";
import { myFriends, type Friend } from "@/cloud/social";
import { FriendsPanel } from "@/app/components/FriendsDock";
import FriendData from "@/app/components/FriendData";
import { t } from "@/sdk/i18n";

function NeedLogin() {
  return <p class="muted small fdock-empty">Arkadaş listesi için programda Hesap sayfasından giriş yap.</p>;
}

export function FriendsWindow() {
  const [open] = createSignal(true);
  return (
    <Show when={session()} fallback={<NeedLogin />}>
      <FriendsPanel standalone open={open} />
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
