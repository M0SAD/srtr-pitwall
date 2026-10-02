import { Show } from "solid-js";
import { friendColor, friendOf, friendsOn, type FriendPlace } from "./friends";

/** İsmin önünde küçük arkadaş rozeti: fotoğraf, simge ya da renkli nokta */
export function FriendBadge(props: { place: FriendPlace; userId?: number; name?: string }) {
  const f = () => (friendsOn(props.place) ? friendOf(props.userId, props.name) : null);
  return (
    <Show when={f()}>
      <span class="fr-badge" style={{ "border-color": friendColor(f()!), background: friendColor(f()!) }} title={f()!.note || "Arkadaş"}>
        <Show when={f()!.photo} fallback={<span>{f()!.icon}</span>}>
          <img src={f()!.photo} alt="" />
        </Show>
      </span>
    </Show>
  );
}
