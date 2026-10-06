// Arkadaşlar: hesabınla arkadaş ekle (karşı taraf onaylar), bekleyen istekler ve arkadaşa özel görünüm.
// Kabul edilen arkadaşlar aynı yarıştayken Relative, Leaderboard, Live Timing ve haritada seçtiğin renk, simge
// ve fotoğrafla öne çıkar. Bir arkadaşa sağ tıklayıp "Görünümü düzenle" diyerek ayarlarını açabilirsin.
// Görünümü özelleştirmek (varsayılan renk, yoğunluk, arkadaşa özel renk/simge/fotoğraf/etiket) PRO.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { settings, updateSettings, type Friend } from "@/sdk/settings";
import { friendColor, resizePhoto, syncAccountFriends, visibleFriends } from "@/sdk/friends";
import { session } from "@/cloud/supabase";
import { F, proLocked } from "@/sdk/proFeatures";
import { findPeople, friendRemove, friendRequest, friendRespond, myFriends, type Friend as CloudFriend, type Person } from "@/cloud/social";
import { friendFocus, go, setFriendFocus } from "../ui";
import { cachedAvatar } from "@/cloud/profile";
import { SimBadge } from "../components/Profile";
import * as I from "../icons";
import { ProLockNote, ProLockTag } from "../components/ProLock";

/** Arkadaş görünümünü özelleştirebilir mi (PRO özellikleri: social.friend_look) */
const canLook = () => !proLocked("social.friend_look");

const ICONS = ["", "★", "♥", "⚡", "🔥", "👑", "🏁", "😎", "🐺", "🚀"];

/** PRO olmayana: özelleştirme kilitli ipucu (tıklayınca PRO sayfası) */
function ProHint(props: { text: string }) {
  return (
    <button class="btn ghost small pro-lock fr-prohint" onClick={() => go("pro")} title="PRO üyelik">
      <I.Lock /> {props.text} <span class="pro-badge small">PRO</span>
    </button>
  );
}

function cloudStatus(f: CloudFriend | undefined) {
  if (!f) return "";
  if (f.racing) return [f.session, f.track, f.car].filter(Boolean).join(" · ") || t("Yarışta");
  if (f.online) return t("Çevrimiçi");
  return t("Çevrimdışı");
}

export function FriendsPage() {
  const entries = useTopic("entries");
  useSubscriptions([{ name: "entries", hz: 1 }]);

  const fs = () => settings().friends;
  const [q, setQ] = createSignal("");
  const [found, setFound] = createSignal<Person[] | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [ok, setOk] = createSignal("");
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [menu, setMenu] = createSignal<{ x: number; y: number; f: Friend } | null>(null);

  // Hesap arkadaşları (istekler dahil): sayfa açıkken 15 sn'de bir yenilenir
  let last: CloudFriend[] = [];
  const [cloud, { refetch }] = createResource<CloudFriend[], string | null>(
    () => (session() ? session()!.user.id : null),
    async () => {
      last = []; // hesap değişti / yeniden giriş: önceki hesabın listesi yedek olarak kalmasın
      try {
        last = (await myFriends()) ?? [];
        syncAccountFriends(last);
      } catch {
        /* çevrimdışı: son liste kalsın */
      }
      return last;
    },
  );
  // Çıkış yapınca kaynak (resource) son değerini korur: oturum yoksa önceki hesabın listesi gösterilmez
  const all = () => (session() ? cloud() ?? [] : []);
  const incoming = () => all().filter((f) => f.status === "pending_in");
  const outgoing = () => all().filter((f) => f.status === "pending_out");
  const cloudOf = (id?: string) => (id ? all().find((f) => f.friend_id === id) : undefined);
  onMount(() => {
    const iv = setInterval(() => session() && !document.hidden && refetch(), 15_000);
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    onCleanup(() => {
      clearInterval(iv);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    });
  });

  const edit = (id: string, fn: (f: Friend) => void) =>
    updateSettings((d) => {
      const f = d.friends.list.find((x) => x.id === id);
      if (f) fn(f);
    });

  // Arkadaş listesinde sağ tık > "Görünümü düzenle": ilgili kartı aç ve göster
  createEffect(
    on(
      () => [friendFocus(), fs().list.length] as const,
      ([fid]) => {
        if (!fid) return;
        const e = fs().list.find((x) => x.accountId === fid);
        if (!e) return; // eşitleme bitince liste değişir ve tekrar denenir
        setExpanded(e.id);
        setFriendFocus(null);
        setTimeout(() => document.querySelector(`[data-fid="${e.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      },
    ),
  );

  const search = async () => {
    setErr("");
    setOk("");
    if (q().trim().length < 2) return setErr("En az 2 harf yaz.");
    setBusy(true);
    try {
      setFound((await findPeople(q().trim())) ?? []);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, done = "") => {
    setErr("");
    setOk("");
    try {
      await fn();
      if (done) setOk(done);
      await refetch();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const stateOf = (id: string) => all().find((f) => f.friend_id === id)?.status;

  const inSession = createMemo(() => {
    const ids = new Set<number>();
    const names = new Set<string>();
    for (const d of entries()?.drivers ?? []) {
      if (d.userId) ids.add(d.userId);
      names.add(d.name.toLocaleLowerCase("tr"));
    }
    return { ids, names };
  });
  const isHere = (f: Friend) => (f.userId > 0 && inSession().ids.has(f.userId)) || inSession().names.has(f.name.toLocaleLowerCase("tr"));

  const onPhoto = async (id: string, file: File | undefined) => {
    if (!file) return;
    try {
      const url = await resizePhoto(file);
      edit(id, (f) => (f.photo = url));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  // Listede gösterilenler: kabul edilmiş hesap arkadaşları + eski (hesapsız) kayıtlar
  const cards = createMemo(() => {
    const accepted = new Set(all().filter((f) => f.status === "accepted").map((f) => f.friend_id));
    return visibleFriends().filter((f) => !f.accountId || accepted.has(f.accountId) || !cloud());
  });

  const removeFriend = (f: Friend) => {
    if (f.accountId) {
      if (!confirm(t("{0} arkadaşlıktan çıkarılsın mı?", f.name))) return;
      act(() => friendRemove(f.accountId!));
    } else updateSettings((d) => (d.friends.list = d.friends.list.filter((x) => x.id !== f.id)));
  };

  return (
    <div class="page">
      <section class="panel">
        <div class="row">
          <div>
            <b>Arkadaşları öne çıkar</b>
            <small>Aynı yarıştaki arkadaşların satırları farklı renkte, haritada kendi renginde ve simgesiyle görünür.</small>
          </div>
          <label class="switch">
            <input type="checkbox" checked={fs().enabled} onChange={(e) => updateSettings((d) => (d.friends.enabled = e.currentTarget.checked))} />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>
              Varsayılan renk
              <Show when={!canLook()}>
                <span class="pro-badge small" onClick={() => go("pro")}>
                  PRO
                </span>
              </Show>
            </b>
            <small>Kendine özel renk verilmemiş arkadaşlar için</small>
          </div>
          <input
            type="color"
            class="fr-color"
            disabled={!canLook()}
            title={canLook() ? "" : "Arkadaş görünümünü özelleştirmek PRO özelliğidir"}
            value={fs().color}
            onInput={(e) => updateSettings((d) => (d.friends.color = e.currentTarget.value))}
          />
        </div>
        <div class="row">
          <div>
            <b>
              Satır rengi yoğunluğu
              <Show when={!canLook()}>
                <span class="pro-badge small" onClick={() => go("pro")}>
                  PRO
                </span>
              </Show>
            </b>
          </div>
          <div class="fr-range">
            <input
              type="range"
              min="10"
              max="70"
              step="2"
              disabled={!canLook()}
              title={canLook() ? "" : "Arkadaş görünümünü özelleştirmek PRO özelliğidir"}
              value={fs().strength}
              onInput={(e) => updateSettings((d) => (d.friends.strength = Number(e.currentTarget.value)))}
            />
            <span>%{fs().strength}</span>
          </div>
        </div>
        <div class="row">
          <div>
            <b>Nerede gösterilsin</b>
          </div>
          <div class="fr-where">
            <For each={[["relative", "Yakındakiler"], ["standings", "Sıralama Tablosu"], ["timing", "Live Timing"], ["map", "Haritalar"]] as const}>
              {([k, label]) => (
                <label class="check">
                  <input type="checkbox" checked={fs().where[k]} onChange={(e) => updateSettings((d) => (d.friends.where[k] = e.currentTarget.checked))} />
                  <span>{label}</span>
                </label>
              )}
            </For>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Arkadaş ekle</h3>
        <Show
          when={session()}
          fallback={
            <div class="fr-login">
              <I.Lock />
              <div>
                <b>Arkadaş eklemek için giriş yap</b>
                <p class="muted small">Hesap ücretsizdir. Arkadaşlık isteğin karşı tarafa bildirim ve e-postayla gider; kabul edince listende görünür.</p>
              </div>
              <button class="btn primary" onClick={() => go("account")}>
                Giriş yap ya da hesap oluştur
              </button>
            </div>
          }
        >
          <p class="muted small">
            Görünen adı ya da iRacing adıyla ara. İstek gönderince karşı taraf bildirim ve e-posta alır; <b>o kabul edince</b> arkadaşın olur ve
            aşağıdaki listede görünür.
          </p>
          <ProLockNote feature={F.friendAdd} text="Arkadaşlık isteği göndermek PRO üyelere özel. Gelen istekleri kabul edebilirsin." />
          <div class="fr-add">
            <input class="input" placeholder="Görünen ad ya da iRacing adı" value={q()} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button class="btn primary" disabled={busy()} onClick={search}>
              <I.Search /> Ara
            </button>
          </div>
          <Show when={err()}>
            <p class="error">{err()}</p>
          </Show>
          <Show when={ok()}>
            <p class="success">{ok()}</p>
          </Show>
          <Show when={found()}>
            <div class="fr-results">
              <Show when={found()!.length > 0} fallback={<p class="muted small">Sonuç yok.</p>}>
                <For each={found()!}>
                  {(p) => (
                    <div class="fr-req">
                      <span class="fr-sess-name" data-no-i18n>
                        {p.display_name || "?"}
                      </span>
                      <Show when={p.iracing_name}>
                        <span class="muted small" data-no-i18n>
                          iRacing: {p.iracing_name}
                        </span>
                      </Show>
                      <span class="lt-sp" />
                      <Show
                        when={!stateOf(p.id)}
                        fallback={
                          <span class="muted small">
                            {stateOf(p.id) === "accepted" ? "Arkadaşın" : stateOf(p.id) === "pending_in" ? "Sana istek gönderdi" : "İstek gönderildi, onay bekliyor"}
                          </span>
                        }
                      >
                        <button
                          class="btn primary small"
                          disabled={proLocked(F.friendAdd)}
                          onClick={() => act(() => friendRequest(p.id), t("{0} kişisine arkadaşlık isteği gönderildi.", p.display_name || "?"))}
                        >
                          <I.UserPlus /> Arkadaş ekle
                          <ProLockTag feature={F.friendAdd} />
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </Show>
      </section>

      <Show when={session() && (incoming().length > 0 || outgoing().length > 0)}>
        <section class="panel">
          <h3>
            Onay bekleyenler <span class="fr-count">{incoming().length + outgoing().length}</span>
          </h3>
          <Show when={incoming().length > 0}>
            <h4>Sana gelen istekler</h4>
            <For each={incoming()}>
              {(f) => (
                <div class="fr-req">
                  <span class="fr-sess-name" data-no-i18n>
                    {f.display_name || "?"}
                  </span>
                  <Show when={f.iracing_name}>
                    <span class="muted small" data-no-i18n>
                      iRacing: {f.iracing_name}
                    </span>
                  </Show>
                  <span class="lt-sp" />
                  <button class="btn primary small" onClick={() => act(() => friendRespond(f.friend_id, true))}>
                    <I.Check /> Kabul et
                  </button>
                  <button class="btn ghost small" onClick={() => act(() => friendRespond(f.friend_id, false))}>
                    Reddet
                  </button>
                </div>
              )}
            </For>
          </Show>
          <Show when={outgoing().length > 0}>
            <h4>Gönderdiğin istekler (karşı tarafın onayı bekleniyor)</h4>
            <For each={outgoing()}>
              {(f) => (
                <div class="fr-req">
                  <span class="fr-sess-name" data-no-i18n>
                    {f.display_name || "?"}
                  </span>
                  <span class="lt-sp" />
                  <button class="btn ghost small" onClick={() => act(() => friendRemove(f.friend_id))}>
                    İsteği geri çek
                  </button>
                </div>
              )}
            </For>
          </Show>
        </section>
      </Show>

      <section class="panel">
        <h3>
          Arkadaşlarım <span class="fr-count">{cards().length}</span>
        </h3>
        <Show when={cards().length > 0} fallback={<p class="muted">Henüz arkadaşın yok. Yukarıdan arayıp ekleyebilirsin.</p>}>
          <p class="muted small">
            Bir arkadaşa sağ tıkla ya da "Görünüm" düğmesine bas: rengini, simgesini, fotoğrafını ve etiketini ona özel ayarla.
            <Show when={!canLook()}> Görünümü özelleştirmek PRO özelliğidir.</Show>
          </p>
          <div class="fr-list">
            <For each={cards()}>
              {(f) => {
                const c = () => cloudOf(f.accountId);
                const open = () => expanded() === f.id;
                return (
                  <div
                    class="fr-card"
                    classList={{ open: open() }}
                    data-fid={f.id}
                    style={{ "border-left-color": friendColor(f) }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, f });
                    }}
                  >
                    <div class="fr-summary">
                      <div class="fr-avatar" style={{ background: friendColor(f) }}>
                        {/* Ona özel fotoğraf (PRO) > simge > üyenin kendi profil fotoğrafı > baş harf */}
                        <Show
                          when={f.photo || (!f.icon && f.accountId && cachedAvatar(f.accountId))}
                          fallback={<span>{f.icon || (f.name[0] ?? "?").toUpperCase()}</span>}
                        >
                          <img src={f.photo || cachedAvatar(f.accountId!)} alt="" />
                        </Show>
                      </div>
                      <div class="fr-sum-main">
                        <b data-no-i18n>
                          {f.name || "?"}
                          <Show when={f.tag}>
                            <em class="fr-tagchip">{f.tag}</em>
                          </Show>
                        </b>
                        <small class="muted">
                          <Show when={c()} fallback={<span>{f.accountId ? "" : "Elle eklenmiş (hesapsız)"}</span>}>
                            <span classList={{ "fr-on": !!c()?.online || !!c()?.racing }} data-no-i18n>
                              {cloudStatus(c())}
                            </span>{" "}
                            <SimBadge sim={c()?.online ? c()?.sim : ""} />
                          </Show>
                          <Show when={isHere(f)}>
                            <span class="fr-here">bu oturumda</span>
                          </Show>
                        </small>
                      </div>
                      <button class="btn ghost small" onClick={() => setExpanded(open() ? null : f.id)}>
                        <I.Palette /> Görünüm
                      </button>
                    </div>
                    <Show when={open()}>
                      <div class="fr-fields">
                        <div class="fr-line">
                          <input
                            class="input"
                            value={f.name}
                            placeholder="Ad (iRacing'deki tam ad)"
                            title="Yarışta bu adla eşleşen sürücü arkadaş olarak öne çıkar"
                            onChange={(e) =>
                              edit(f.id, (x) => {
                                x.name = e.currentTarget.value.trim();
                                x.autoName = false;
                              })
                            }
                          />
                          <input
                            class="input port"
                            placeholder="Üye no"
                            title="iRacing üye numarası (Customer ID): isim değişse bile tanınır"
                            value={f.userId || ""}
                            onChange={(e) => edit(f.id, (x) => (x.userId = Number(e.currentTarget.value.replace(/\D/g, "")) || 0))}
                          />
                        </div>
                        <Show when={canLook()} fallback={<ProHint text="Renk, simge, fotoğraf ve etiket PRO üyelere özel" />}>
                        <div class="fr-line">
                          <label class="check">
                            <input type="checkbox" checked={!!f.color} onChange={(e) => edit(f.id, (x) => (x.color = e.currentTarget.checked ? fs().color : ""))} />
                            <span>Özel renk</span>
                          </label>
                          <Show when={f.color}>
                            <input type="color" class="fr-color" value={f.color} onInput={(e) => edit(f.id, (x) => (x.color = e.currentTarget.value))} />
                          </Show>
                          <span class="muted small">Simge</span>
                          <select class="input fr-icon" value={ICONS.includes(f.icon) ? f.icon : ""} onChange={(e) => edit(f.id, (x) => (x.icon = e.currentTarget.value))}>
                            <For each={ICONS}>{(i) => <option value={i}>{i || "Yok"}</option>}</For>
                          </select>
                          <label class="btn ghost small fr-upload">
                            Fotoğraf
                            <input type="file" accept="image/*" onChange={(e) => onPhoto(f.id, e.currentTarget.files?.[0])} />
                          </label>
                          <Show when={f.photo}>
                            <button class="btn ghost small" onClick={() => edit(f.id, (x) => (x.photo = ""))}>
                              Fotoğrafı kaldır
                            </button>
                          </Show>
                        </div>
                        </Show>
                        <div class="fr-tagrow">
                          <Show when={canLook()}>
                            <input class="input fr-tag" placeholder="Etiket" maxLength={12} title="Sürücü etiketi: Relative ve Leaderboard'da adın yanında görünür" value={f.tag ?? ""} onChange={(e) => edit(f.id, (x) => (x.tag = e.currentTarget.value.trim()))} />
                          </Show>
                          <input class="input fr-note" placeholder="Not (ör. takım arkadaşı)" value={f.note} onChange={(e) => edit(f.id, (x) => (x.note = e.currentTarget.value))} />
                        </div>
                        <div
                          class="fr-prev"
                          style={{
                            background: `color-mix(in srgb, ${friendColor(f)} ${fs().strength}%, transparent)`,
                            "box-shadow": `inset 3px 0 0 ${friendColor(f)}`,
                          }}
                        >
                          <span class="muted small">Yarışta böyle görünür</span>
                          <b data-no-i18n>
                            {f.icon ? `${f.icon} ` : ""}
                            {f.name || "?"}
                            <Show when={f.tag}>
                              <em class="fr-tagchip">{f.tag}</em>
                            </Show>
                          </b>
                        </div>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
        <p class="muted small">
          Haritada fotoğrafı olan arkadaş yuvarlak fotoğrafıyla, simgesi olan simgesiyle gösterilir. Hesabınla giriş yaptıysan ayarların diğer
          bilgisayarlarına da taşınır.
        </p>
      </section>

      <Show when={menu()}>
        {(() => {
          const m = menu()!;
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            fn();
            setMenu(null);
          };
          return (
            <div class="ovmenu" style={{ left: `${Math.min(m.x, window.innerWidth - 220)}px`, top: `${Math.min(m.y, window.innerHeight - 140)}px` }} onPointerDown={(e) => e.stopPropagation()}>
              <button onPointerUp={run(() => setExpanded(m.f.id))}>
                <I.Palette /> Görünümü düzenle
              </button>
              <button class="danger" onPointerUp={run(() => removeFriend(m.f))}>
                <I.Trash /> {m.f.accountId ? "Arkadaşlıktan çıkar" : "Listeden sil"}
              </button>
            </div>
          );
        })()}
      </Show>
    </div>
  );
}
