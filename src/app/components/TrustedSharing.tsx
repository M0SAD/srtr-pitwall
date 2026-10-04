// Ayarlar › Paylaşım: güvenilir arkadaşlar (c44).
//  - "Güvenilir arkadaşlar": canlı verimi (takım yakıtı, tur süreleri) kod vermeden görebilecek arkadaşlar
//    (arkadaş başına anahtar + "Tüm arkadaşlarım"). Yetki sunucuda denetlenir (live_visible).
//  - "Arkadaşlarının paylaşımları": bana güvenen arkadaşlar; tek tıkla takım listesine eklenir / çıkarılır.
// Veri, Yakıt overlay'inin Takım bölümünde ve Pitwall'da görünür. Takım kodu kimseye gönderilmez.

import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { emit } from "@tauri-apps/api/event";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { settings, updateSettings } from "@/sdk/settings";
import { friendShares, friendTrustSet, myFriends, shareTrustAllSet, shareTrustGet, type Friend, type FriendShare, type ShareTrust } from "@/cloud/social";
import { Switch } from "./SettingsForm";

export function TrustedSharing() {
  const [err, setErr] = createSignal("");
  const [friends, { refetch: refetchFriends, mutate: setFriends }] = createResource(
    () => session()?.user.id,
    () => myFriends().then((l) => (l ?? []).filter((f) => f.status === "accepted")).catch(() => [] as Friend[]),
  );
  const [trust, { refetch: refetchTrust, mutate: setTrust }] = createResource(
    () => session()?.user.id,
    () => shareTrustGet().catch(() => null as ShareTrust | null),
  );
  const [shares, { refetch: refetchShares }] = createResource(
    () => session()?.user.id,
    () => friendShares().catch(() => null as FriendShare[] | null),
  );
  // Kimin şu an paylaştığı sık değişir
  const iv = window.setInterval(() => !document.hidden && void refetchShares(), 30_000);
  onCleanup(() => clearInterval(iv));

  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      // Overlay penceresindeki arkadaş servisi güven listesini hemen yenilesin
      void emit("social-refresh");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      void refetchFriends();
      void refetchTrust();
    }
  };
  const all = () => !!trust()?.trust_all;
  const setAll = (on: boolean) => {
    setTrust((x) => ({ needs_pro: !!x?.needs_pro, trust_all: on }));
    void act(() => shareTrustAllSet(on));
  };
  const setOne = (f: Friend, on: boolean) => {
    setFriends((l) => (l ?? []).map((x) => (x.friend_id === f.friend_id ? { ...x, trusted: on } : x)));
    void act(() => friendTrustSet(f.friend_id, on));
  };

  const hidden = () => settings().general.sharing.hiddenFriends ?? [];
  const shown = (id: string) => !hidden().includes(id);
  const toggleShown = (id: string) =>
    updateSettings((d) => {
      const cur = d.general.sharing.hiddenFriends ?? [];
      d.general.sharing.hiddenFriends = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  const state = (s: FriendShare) => {
    if (s.live && s.data) {
      const d = s.data;
      const laps = d.lapsLeft > 0 ? t(" · {0} tur", d.lapsLeft.toFixed(1)) : "";
      return t("Canlı · {0} L{1}", (d.level ?? 0).toFixed(1), laps) + (d.track ? ` · ${d.track}` : "");
    }
    if (s.racing) return t("Yarışta") + (s.track ? ` · ${s.track}` : "");
    return s.online ? t("Çevrimiçi · şu an paylaşmıyor") : t("Çevrimdışı");
  };

  return (
    <>
      <section class="panel">
        <h3>Güvenilir arkadaşlar</h3>
        <p class="muted small">
          Güvenilir işaretlediğin arkadaşların, sen yarışırken yakıtını ve tur sürelerini kod girmeden görür (Yakıt overlay'inin Takım bölümü ve
          Pitwall). Takım kodun onlara gönderilmez. Arkadaşlıktan çıkarırsan paylaşım da biter.
        </p>
        <Show when={session()} fallback={<p class="muted">Bu özellik için hesabına giriş yapmalısın.</p>}>
          <Show when={trust()?.needs_pro}>
            <p class="muted small">Veri paylaşımı PRO üyelere özel: verini paylaşmak için PRO olmalısın. Sana güvenen PRO arkadaşlarının verisini PRO olmadan da görebilirsin.</p>
          </Show>
          <div class="row">
            <div>
              <b>Tüm arkadaşlarım</b>
              <small>Kabul ettiğin bütün arkadaşların (sonradan eklenenler dahil) verilerini görebilir</small>
            </div>
            <Switch checked={all()} onChange={setAll} />
          </div>
          <Show when={!friends.loading && (friends() ?? []).length === 0}>
            <p class="muted small">Henüz arkadaşın yok. Arkadaşlar penceresinden arkadaş ekleyebilirsin.</p>
          </Show>
          <For each={friends() ?? []}>
            {(f) => (
              <div class="row">
                <div>
                  <b data-no-i18n>{f.display_name || "?"}</b>
                  <small>{all() ? t("Tüm arkadaşlarım açık olduğu için görebilir") : f.trusted ? t("Verilerini görebilir") : t("Verilerini göremez")}</small>
                </div>
                <Switch checked={all() || f.trusted} disabled={all()} onChange={(v) => setOne(f, v)} />
              </div>
            )}
          </For>
          <Show when={err()}>
            <p class="error">{t(err())}</p>
          </Show>
        </Show>
      </section>
      <Show when={session()}>
        <section class="panel">
          <h3>Arkadaşlarının paylaşımları</h3>
          <p class="muted small">
            Seni güvenilir işaretleyen arkadaşların. Açık olanların canlı verisi kod girmeden takım listene eklenir; görmek istemediğini tek tıkla
            kapatabilirsin. Yakıt overlay'inde "Takım yakıtı" seçeneği açık olmalı.
          </p>
          <Show when={shares() === null}>
            <p class="muted small">Liste okunamadı. Daha sonra tekrar dene.</p>
          </Show>
          <Show when={!shares.loading && shares() && shares()!.length === 0}>
            <p class="muted small">Şu an seninle veri paylaşan arkadaşın yok. Arkadaşın, Ayarlar › Paylaşım'dan seni güvenilir işaretlemeli.</p>
          </Show>
          <For each={shares() ?? []}>
            {(s) => (
              <div class="row">
                <div>
                  <b data-no-i18n>{s.display_name || "?"}</b>
                  <small classList={{ success: s.live }}>{state(s)}</small>
                </div>
                <Switch checked={shown(s.friend_id)} onChange={() => toggleShown(s.friend_id)} />
              </div>
            )}
          </For>
          <div class="btns">
            <button class="btn ghost small" onClick={() => void refetchShares()}>
              Yenile
            </button>
          </div>
        </section>
      </Show>
    </>
  );
}
