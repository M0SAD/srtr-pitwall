// Ekip odası (c64): bir sürücünün ekibi ve sürücünün kendisi arasındaki sohbet + odada kimler var.
// crew_room() 2,5 sn'de bir yoklanır (yeni mesaj Realtime ile anında tetikler); mesajlar crew_chat_send() ile yazılır.
// Sürücünün uygulaması odadaki mesajları Mesajlar overlay'inde / alt ortadaki kutucukta gösterir (src/host/crew.ts).
// Aynı odanın web sürümü website/assets/crewpanel.js içindedir.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { CREW_CHAT_MAX, WALL_MSGS, crewChatSend, crewRoom, onCrewChat, type CrewChatMsg, type CrewRoom as Room } from "@/cloud/crew";
import { Ic, QUICK_ICONS } from "./CrewGfx";
import "../crew.css";

const initial = (s: string) => (Array.from((s || "?").trim())[0] ?? "?").toLocaleUpperCase("tr");
const clock = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export function CrewRoom(props: {
  owner: string;
  /** Hazır spotter mesajları gösterilsin (sürücünün kendi odasında gerekmez) */
  quick?: boolean;
  /** Sunucuda oda yoksa (c64 kurulmamış) eski tek yönlü mesaj komutu */
  legacySend?: (text: string) => void;
}) {
  // Oda durumu ve mesajlar store'da tutulur ve kimliğe göre yerinde güncellenir (reconcile): her yoklamada
  // diziler baştan kurulmaz, üye / mesaj satırlarının DOM'u yeniden oluşturulmaz (kırpışma ve kaydırma sıçraması olmaz).
  const [st, setSt] = createStore<{ room: Omit<Room, "messages" | "now"> | null; msgs: CrewChatMsg[] }>({ room: null, msgs: [] });
  const room = () => st.room;
  const msgs = () => st.msgs;
  // props.owner üst bileşende 3 sn'de bir yenilenen sürücü nesnesinden okunur: değer aynı kaldıkça oda sıfırlanmamalı
  const owner = createMemo(() => props.owner);
  const [failed, setFailed] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const me = () => session()?.user.id ?? "";
  let alive = true;
  let busy = false;
  let last = "";
  let listEl: HTMLDivElement | undefined;
  onCleanup(() => (alive = false));

  const scrollDown = (force = false) => {
    const el = listEl;
    if (!el) return;
    // Kullanıcı yukarı kaydırıp eski mesajlara bakıyorsa yerinden oynatma
    if (!force && el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  };

  const load = async (force = false) => {
    if (busy || (!force && document.hidden) || !owner() || !me()) return;
    busy = true;
    const id = owner();
    try {
      const r = await crewRoom(id, last || null);
      if (!alive || id !== owner() || !r) return;
      setFailed(false);
      setSt(
        "room",
        reconcile(
          {
            driver: r.driver ?? null,
            control_on: !!r.control_on,
            members: Array.isArray(r.members) ? r.members : [],
            racing: r.racing,
            spotter: r.spotter ?? null,
            spotter_me: !!r.spotter_me,
            can_write: r.can_write,
            cleared_at: r.cleared_at ?? null,
          },
          { key: "id" },
        ),
      );
      // c75: sürücü yarıştan çıkınca oda boşalır (sunucu mesajları siler); eldeki mesajlar da atılır
      if (r.racing === false) {
        last = "";
        if (msgs().length) setSt("msgs", []);
        return;
      }
      if (r.cleared_at && msgs().some((m) => m.at <= r.cleared_at!)) {
        const cut = new Date(r.cleared_at).getTime();
        setSt("msgs", (l) => l.filter((m) => new Date(m.at).getTime() > cut));
      }
      const add = r.messages ?? [];
      if (add.length) {
        const first = !last;
        const known = new Set(msgs().map((m) => m.id));
        const fresh = add.filter((m) => !known.has(m.id));
        last = add[add.length - 1].at;
        if (fresh.length) {
          // Kaydırma konumu eklemeden ÖNCE ölçülür (ekledikten sonra "altta mıydı" bilinemez)
          const el = listEl;
          const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
          setSt("msgs", (l) => {
            const next = [...l, ...fresh];
            return next.length > 200 ? next.slice(-200) : next;
          });
          if (first || atBottom || fresh.some((m) => m.sender === me())) scrollDown(true);
        }
      }
    } catch {
      if (alive) setFailed(true); // eski sunucu (c64 yok) ya da ağ hatası
    } finally {
      busy = false;
    }
  };
  const iv = window.setInterval(() => void load(), 2500);
  onCleanup(() => clearInterval(iv));
  let stopRt: () => void = () => {};
  onCleanup(() => stopRt());
  createEffect(
    on(
      owner,
      (owner) => {
        last = "";
        setSt({ room: null, msgs: [] });
        setErr("");
        stopRt();
        stopRt = () => {};
        void load(true);
        void onCrewChat(owner, () => void load(true)).then((f) => {
          if (!alive || owner !== props.owner) return f();
          stopRt = f;
        });
      },
    ),
  );

  const send = async (raw: string) => {
    const body = raw.trim().slice(0, CREW_CHAT_MAX);
    if (!body || sending()) return;
    setErr("");
    // Oda sunucuda yoksa (c64 kurulmamış) eski yol: sürücünün ekranına tek yönlü mesaj
    if (failed() && !room() && props.legacySend) return props.legacySend(body.slice(0, 120));
    setSending(true);
    try {
      const id = await crewChatSend(owner(), body);
      if (id === null) setErr(t("Sürücü şu an yarışta değil: ekip odası kapalı."));
      await load(true);
      scrollDown(true);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSending(false);
    }
  };
  const submit = () => {
    const v = text();
    if (!v.trim()) return;
    setText("");
    void send(v);
  };

  const present = createMemo(() => (room()?.members ?? []).filter((m) => m.present));
  const away = createMemo(() => (room()?.members ?? []).filter((m) => !m.present));
  // c75: odaya yalnızca o anki spotter yazar (eski sunucu alanı göndermez: herkes yazabilir)
  const closed = () => room()?.racing === false;
  const readOnly = () => !!room() && room()!.can_write === false;
  const isDriver = () => !!me() && owner() === me();
  const whyReadOnly = () => {
    const r = room();
    if (!r || !readOnly()) return "";
    if (closed()) return t("Ekip odası yalnızca sürücü yarıştayken açıktır. Yarış bitince sohbet silinir.");
    if (isDriver()) return r.spotter ? t("Bu odaya yalnızca spotter'ın yazabilir.") : t("Şu an spotter'ın yok. Odaya yalnızca spotter yazabilir.");
    if (r.spotter) return t("Spotter: {0} — sadece izliyorsun. Odaya yalnızca spotter yazabilir.", r.spotter.name || "?");
    return t("Odaya yalnızca spotter yazabilir. Spotter olmak için pit ayarlarını değiştirme yetkisi gerekir.");
  };
  const roleText = (r: CrewChatMsg["role"]) => (r === "driver" ? t("Sürücü") : r === "control" ? t("Pit yetkilisi") : "");

  return (
    <section class="panel crm">
      <h3>
        Ekip odası
        <Show when={room()}>
          <span class="crew-live" classList={{ on: present().length > 0 }}>
            {t("{0} kişi odada", String(present().length + (room()!.driver?.online ? 1 : 0)))}
          </span>
        </Show>
      </h3>
      <Show when={room()} fallback={<p class="muted small">{failed() ? t("Ekip odası okunamadı. Daha sonra tekrar dene.") : t("Yükleniyor…")}</p>}>
        {(r) => (
          <div class="crm-members">
            <Show when={r().racing !== undefined && !closed()}>
              <p class="crm-spot" classList={{ me: !!r().spotter_me, none: !r().spotter }}>
                <Ic n="wrench" />
                <span data-no-i18n>{r().spotter_me ? t("Spotter: sen") : r().spotter ? t("Spotter: {0}", r().spotter!.name || "?") : t("Spotter: yok")}</span>
              </p>
            </Show>
            <Show when={r().driver}>
              {(d) => (
                <div class="crm-m drv" classList={{ off: !d().online }} title={d().racing ? t("Yarışta") : d().online ? t("Çevrimiçi") : t("Çevrimdışı")}>
                  <i class="crm-dot" />
                  <b data-no-i18n>{d().name || "?"}</b>
                  <em class="crm-tag drv">
                    <Ic n="helmet" />
                    {t("Sürücü")}
                  </em>
                </div>
              )}
            </Show>
            <For each={present()}>
              {(m) => (
                <div class="crm-m" classList={{ me: m.me }}>
                  <i class="crm-dot" />
                  <b data-no-i18n>{m.name || "?"}</b>
                  <Show when={m.spotter}>
                    <em class="crm-tag ctl spot" title={t("Pit ayarlarını yöneten ve odaya yazabilen tek kişi")}>
                      <Ic n="wrench" />
                      {t("Spotter")}
                    </em>
                  </Show>
                  <Show when={!m.spotter && r().spotter}>
                    <em class="crm-tag">{t("İzliyor")}</em>
                  </Show>
                  <Show when={!m.spotter && !r().spotter}>
                  <Show when={m.can_control} fallback={<em class="crm-tag">{t("İzliyor")}</em>}>
                    <em class="crm-tag ctl" classList={{ idle: !r().control_on }} title={r().control_on ? t("Yakıt ve lastik ayarlarını değiştirebilir") : t("Yetkili, ancak sürücü ekip kontrolünü kapattı")}>
                      <Ic n="wrench" />
                      {t("Pit yetkilisi")}
                    </em>
                  </Show>
                  </Show>
                </div>
              )}
            </For>
            <Show when={away().length > 0}>
              <p class="crm-away" data-no-i18n>
                {t("Odada değil")}: {away().map((m) => `${m.name || "?"}${m.can_control ? ` (${t("Pit yetkilisi")})` : ""}`).join(", ")}
              </p>
            </Show>
          </div>
        )}
      </Show>
      <div class="crm-chat" ref={listEl} data-no-i18n>
        <Show when={msgs().length > 0} fallback={<p class="crm-empty">{closed() ? t("Sürücü şu an yarışta değil. Ekip odası yarış başlayınca açılır.") : t("Henüz mesaj yok. Buraya yazılanları sürücü ve odadaki tüm ekip görür.")}</p>}>
          <For each={msgs()}>
            {(m) => (
              <div class="crm-msg" classList={{ mine: m.sender === me(), [m.role]: true }}>
                <span class="crm-av">{initial(m.name)}</span>
                <div>
                  <div class="crm-meta">
                    <b>{m.name || "?"}</b>
                    <Show when={roleText(m.role)}>
                      <em>{roleText(m.role)}</em>
                    </Show>
                    <time>{clock(m.at)}</time>
                  </div>
                  <p>{m.body}</p>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={props.quick && !readOnly()}>
        <div class="pg crm-quick">
          <div class="pg-quick">
            <For each={WALL_MSGS}>
              {(m, i) => (
                <button type="button" class="pg-b" disabled={sending()} onClick={() => void send(t(m))}>
                  <Ic n={QUICK_ICONS[i()]} />
                  <span>{t(m)}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={readOnly()}>
        <p class="pg-lock crm-ro">
          <Ic n="lock" />
          <span>{whyReadOnly()}</span>
        </p>
      </Show>
      <div class="crm-input" classList={{ hide: readOnly() }}>
        <input
          class="input"
          maxLength={CREW_CHAT_MAX}
          disabled={readOnly()}
          placeholder={t("Ekip odasına yaz (sürücü ve ekip görür)")}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button class="btn small" disabled={readOnly() || sending() || !text().trim()} onClick={submit}>
          Gönder
        </button>
      </div>
      <Show when={err()}>
        <p class="error">{t(err())}</p>
      </Show>
    </section>
  );
}
