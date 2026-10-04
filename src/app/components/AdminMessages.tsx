// Yönetim › Mesajlar (c80): tüm sohbetler tarihe göre — arkadaş (özel mesaj), takım, grup ve ekip odası (sadece yönetici).
// Sol: sohbet listesi (en yeni üstte) + tür süzgeci, arama (ad ya da metin), tarih aralığı, üye seçici.
// Sağ: seçilen sohbetin salt okunur dökümü (gün ayraçları, "Daha eski") ya da aramaya uyan mesajların düz listesi.
// Her açılış / arama sunucuda moderasyon kaydına yazılır (aynı süzgeç 10 dakikada bir kez).

import { For, Show, createSignal, onMount } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import {
  adminChatMessages,
  adminChatThreads,
  adminChatUsers,
  chatNotDeployed,
  type AdminChatMessage,
  type AdminChatThread,
  type AdminChatUser,
  type ChatKind,
} from "@/cloud/adminChat";
import { avatarUrl } from "@/cloud/profile";
import { msgPreview, type MsgMeta } from "@/cloud/social";
import { takeAdminFocus } from "./adminFocus";
import "../admin.css";

const T_PAGE = 60;
const M_PAGE = 100;

const fmtTime = (s: string) => new Date(s).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
const fmtDay = (s: string) => new Date(s).toLocaleDateString(localeTag(), { dateStyle: "full" });
const fmtFull = (s: string) => new Date(s).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });
const dayKey = (s: string) => new Date(s).toDateString();
/** Liste için kısa zaman: bugünse saat, değilse tarih */
const fmtShort = (s: string) => (dayKey(s) === new Date().toDateString() ? fmtTime(s) : new Date(s).toLocaleDateString(localeTag(), { dateStyle: "short" }));
/** "2026-10-01" → yerel gün başı (ISO); bitiş için ertesi gün başı */
const dayIso = (v: string, next = false) => {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (next) d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const kindLabel = (k: ChatKind) => (k === "dm" ? t("Arkadaş") : k === "team" ? t("Takım") : k === "group" ? t("Grup") : t("Ekip"));
const threadKey = (x: { kind: string; a: string; b: string | null }) => `${x.kind}:${x.a}:${x.b ?? ""}`;
const threadTitle = (x: AdminChatThread) => (x.kind === "dm" ? `${x.a_name} ↔ ${x.b_name ?? "?"}` : x.kind === "crew" ? t("{0} — ekip odası", x.a_name) : x.a_name);

/** Mesaj metni: silinmiş / anket / sistem mesajı ayrımıyla */
function bodyText(m: { body: string; deleted?: boolean; meta?: Record<string, any> | null }): string {
  if (m.deleted) return t("Bu mesaj silindi");
  if (m.meta?.poll && !m.body) return `📊 ${t("Anket")}`;
  return msgPreview({ body: m.body, meta: m.meta?.t ? (m.meta as MsgMeta) : null });
}

/** Mesajdan sohbet (dm: iki taraf sıralı; oda: peer) */
function threadOf(m: AdminChatMessage): AdminChatThread {
  const base = { last_at: m.created_at, msg_count: 0, last_body: m.body, last_sender_name: m.sender_name };
  if (m.kind !== "dm") return { kind: m.kind, a: m.peer, a_name: m.peer_name, a_avatar: m.peer_avatar, b: null, b_name: null, b_avatar: null, ...base };
  const s = { id: m.sender ?? "", name: m.sender_name, av: m.sender_avatar };
  const r = { id: m.peer, name: m.peer_name, av: m.peer_avatar };
  const [x, y] = s.id < r.id ? [s, r] : [r, s];
  return { kind: "dm", a: x.id, a_name: x.name, a_avatar: x.av, b: y.id, b_name: y.name, b_avatar: y.av, ...base };
}

function Avatar(p: { path: string | null | undefined; name: string }) {
  return (
    <span class="amx-av" data-no-i18n>
      <Show when={avatarUrl(p.path)} fallback={(p.name || "?").trim().charAt(0).toUpperCase() || "?"}>
        <img src={avatarUrl(p.path)} alt="" loading="lazy" />
      </Show>
    </span>
  );
}

export function AdminMessages() {
  // Süzgeç girişleri (Ara'ya basınca uygulanır)
  const [kind, setKind] = createSignal<ChatKind | null>(null);
  const [text, setText] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [member, setMember] = createSignal<AdminChatUser | null>(null);
  // Uygulanan metin (boş değilse sağda "arama sonuçları" kipi vardır)
  const [applied, setApplied] = createSignal("");

  // Üye seçici
  const [mq, setMq] = createSignal("");
  const [found, setFound] = createSignal<AdminChatUser[] | null>(null);
  let mqTimer: ReturnType<typeof setTimeout> | undefined;
  let mqSeq = 0;

  const [threads, setThreads] = createSignal<AdminChatThread[]>([]);
  const [tLoading, setTLoading] = createSignal(false);
  const [tMore, setTMore] = createSignal(false);
  const [tErr, setTErr] = createSignal("");
  const [off, setOff] = createSignal(false);

  const [sel, setSel] = createSignal<AdminChatThread | null>(null);
  // Döküm: eskiden yeniye. Arama sonuçları: yeniden eskiye.
  const [msgs, setMsgs] = createSignal<AdminChatMessage[]>([]);
  const [hits, setHits] = createSignal<AdminChatMessage[]>([]);
  const [mLoading, setMLoading] = createSignal(false);
  const [mMore, setMMore] = createSignal(false);
  const [hMore, setHMore] = createSignal(false);
  const [mErr, setMErr] = createSignal("");
  const [focusId, setFocusId] = createSignal("");

  let tSeq = 0;
  let mSeq = 0;
  let scroller: HTMLDivElement | undefined;

  const fail = (e: unknown) => {
    if (chatNotDeployed(e)) {
      setOff(true);
      return "";
    }
    return String((e as Error)?.message ?? e);
  };
  const filter = () => ({ kind: kind(), user: member()?.id ?? null, query: applied() || null, from: dayIso(from()), to: dayIso(to(), true) });

  async function loadThreads(more = false) {
    const seq = ++tSeq;
    setTLoading(true);
    setTErr("");
    try {
      const cur = more ? threads() : [];
      const rows = await adminChatThreads({ ...filter(), before: more ? cur[cur.length - 1]?.last_at : null, limit: T_PAGE });
      if (seq !== tSeq) return;
      setThreads(more ? [...cur, ...rows] : rows);
      setTMore(rows.length >= T_PAGE);
    } catch (e) {
      if (seq !== tSeq) return;
      setTErr(fail(e));
      if (!more) setThreads([]);
    } finally {
      if (seq === tSeq) setTLoading(false);
    }
  }

  /** Aramaya uyan mesajlar (düz liste) */
  async function loadHits(more = false) {
    const seq = ++mSeq;
    setMLoading(true);
    setMErr("");
    try {
      const cur = more ? hits() : [];
      const last = cur[cur.length - 1];
      const rows = await adminChatMessages({ ...filter(), before: more ? last?.created_at : null, beforeId: more ? last?.id : null, limit: M_PAGE });
      if (seq !== mSeq) return;
      setHits(more ? [...cur, ...rows] : rows);
      setHMore(rows.length >= M_PAGE);
    } catch (e) {
      if (seq !== mSeq) return;
      setMErr(fail(e));
    } finally {
      if (seq === mSeq) setMLoading(false);
    }
  }

  /** Seçili sohbetin dökümü (süzgeçsiz, tamamı); more = daha eski sayfa */
  async function loadMsgs(th: AdminChatThread, more = false, until: string | null = null) {
    const seq = ++mSeq;
    setMLoading(true);
    setMErr("");
    try {
      const cur = more ? msgs() : [];
      const first = cur[0];
      const rows = await adminChatMessages({
        kind: th.kind,
        user: th.kind === "dm" ? th.a : null,
        other: th.kind === "dm" ? th.b : null,
        room: th.kind === "dm" ? null : th.a,
        // Aramadan gelindiyse o mesajın bulunduğu sayfadan başla (to hariç olduğundan 1 ms sonrası)
        to: !more && until ? new Date(new Date(until).getTime() + 1).toISOString() : null,
        before: more ? first?.created_at : null,
        beforeId: more ? first?.id : null,
        limit: M_PAGE,
      });
      if (seq !== mSeq) return;
      const prevH = scroller?.scrollHeight ?? 0;
      setMsgs([...rows].reverse().concat(cur));
      setMMore(rows.length >= M_PAGE);
      queueMicrotask(() => {
        if (!scroller) return;
        // İlk açılışta en alta, eski sayfa eklenince bulunduğu yerde kal
        scroller.scrollTop = more ? scroller.scrollHeight - prevH : scroller.scrollHeight;
      });
    } catch (e) {
      if (seq !== mSeq) return;
      setMErr(fail(e));
    } finally {
      if (seq === mSeq) setMLoading(false);
    }
  }

  const open = (th: AdminChatThread, hit?: AdminChatMessage) => {
    setSel(th);
    setMsgs([]);
    setMMore(false);
    setFocusId(hit?.id ?? "");
    void loadMsgs(th, false, hit?.created_at ?? null);
  };
  const close = () => {
    mSeq++;
    setSel(null);
    setMsgs([]);
    setMErr("");
    setMLoading(false);
  };

  const search = () => {
    setApplied(text().trim());
    close();
    setHits([]);
    setHMore(false);
    void loadThreads();
    if (applied()) void loadHits();
  };
  const pickKind = (k: ChatKind | null) => {
    setKind(k);
    search();
  };
  const pickMember = (u: AdminChatUser | null) => {
    setMember(u);
    setMq("");
    setFound(null);
    search();
  };
  const onMq = (v: string) => {
    setMq(v);
    clearTimeout(mqTimer);
    const q = v.trim();
    if (q.length < 2) {
      setFound(null);
      return;
    }
    const seq = ++mqSeq;
    mqTimer = setTimeout(() => {
      adminChatUsers(q)
        .then((r) => seq === mqSeq && setFound(r))
        .catch((e) => {
          if (seq !== mqSeq) return;
          setFound([]);
          setTErr(fail(e));
        });
    }, 300);
  };
  const clearAll = () => {
    setText("");
    setFrom("");
    setTo("");
    setKind(null);
    pickMember(null);
  };

  onMount(() => {
    const f = takeAdminFocus("messages");
    if (f?.q) setText(f.q);
    search();
  });

  const onEnter = (e: KeyboardEvent) => e.key === "Enter" && search();
  const hasFilter = () => !!(applied() || from() || to() || member() || kind());

  return (
    <section class="panel admin-panel amx">
      <h3>Mesajlar</h3>
      <p class="muted small">
        Üyelerin tüm sohbetleri tarihe göre: arkadaş mesajları, takım ve grup sohbetleri, açık ekip odaları. Burası salt okunurdur. Her açılış ve arama moderasyon
        kayıtlarına yazılır. Ekip odası mesajları yarış bitince silindiği için yalnızca o an açık odalar görünür.
      </p>
      <Show when={!off()} fallback={<p class="muted">Bu görünüm sunucuda henüz etkin değil.</p>}>
        <div class="amx-bar">
          <div class="amx-chips">
            <button classList={{ on: kind() === null }} onClick={() => pickKind(null)}>
              Tümü
            </button>
            <For each={["dm", "team", "group", "crew"] as ChatKind[]}>
              {(k) => (
                <button classList={{ on: kind() === k }} onClick={() => pickKind(k)}>
                  {kindLabel(k)}
                </button>
              )}
            </For>
          </div>
          <input class="input amx-q" placeholder="Ad ya da mesaj metni ara" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={onEnter} />
          <label class="amsg-date">
            <small class="muted">Başlangıç</small>
            <input class="input" type="date" value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
          </label>
          <label class="amsg-date">
            <small class="muted">Bitiş</small>
            <input class="input" type="date" value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
          </label>
          <button class="btn primary" onClick={search}>
            Ara
          </button>
          <Show when={hasFilter()}>
            <button class="btn ghost" onClick={clearAll}>
              Temizle
            </button>
          </Show>
        </div>
        <div class="amx-member">
          <Show
            when={member()}
            fallback={
              <div class="amx-pick">
                <input class="input" placeholder="Üye seç: ad ya da iRacing adı" value={mq()} onInput={(e) => onMq(e.currentTarget.value)} />
                <Show when={found()}>
                  <div class="amx-pop">
                    <For each={found()} fallback={<p class="muted small">Üye bulunamadı.</p>}>
                      {(u) => (
                        <button onClick={() => pickMember(u)}>
                          <Avatar path={u.avatar_path} name={u.display_name} />
                          <span data-no-i18n>
                            {u.display_name}
                            <Show when={u.iracing_name && u.iracing_name !== u.display_name}>
                              <small class="muted"> ({u.iracing_name})</small>
                            </Show>
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="amsg-pair">
              <Avatar path={member()!.avatar_path} name={member()!.display_name} />
              <span>{t("{0} üyesinin sohbetleri", member()!.display_name)}</span>
              <button class="btn ghost small" onClick={() => pickMember(null)}>
                Kaldır
              </button>
            </div>
          </Show>
        </div>

        <div class="amx-grid" classList={{ open: !!sel() }}>
          <div class="amx-list">
            <Show when={tErr()}>
              <p class="error small">{tErr()}</p>
            </Show>
            <For each={threads()}>
              {(th) => (
                <button class="amx-th" classList={{ on: !!sel() && threadKey(sel()!) === threadKey(th) }} onClick={() => open(th)}>
                  <Avatar path={th.a_avatar} name={th.a_name} />
                  <span class="amx-th-main">
                    <span class="amx-th-top">
                      <b data-no-i18n>{threadTitle(th)}</b>
                      <small class="muted">{fmtShort(th.last_at)}</small>
                    </span>
                    <span class="amx-th-sub">
                      <span class="chip2 small">{kindLabel(th.kind)}</span>
                      <small class="muted amx-prev" data-no-i18n>
                        {th.last_sender_name}: {th.last_body ? bodyText({ body: th.last_body }) : "…"}
                      </small>
                      <small class="muted">{t("{0} mesaj", th.msg_count)}</small>
                    </span>
                  </span>
                </button>
              )}
            </For>
            <Show when={tLoading()}>
              <p class="muted small">Yükleniyor…</p>
            </Show>
            <Show when={!tLoading() && !tErr() && threads().length === 0}>
              <p class="muted small">Sohbet bulunamadı.</p>
            </Show>
            <Show when={tMore() && !tLoading()}>
              <button class="btn ghost small" onClick={() => loadThreads(true)}>
                Daha eski sohbetler
              </button>
            </Show>
          </div>

          <div class="amx-view">
            <Show
              when={sel()}
              fallback={
                <Show when={applied()} fallback={<p class="muted amx-empty">Dökümünü görmek için soldan bir sohbet seç.</p>}>
                  <div class="amx-head">
                    <b>{t("“{0}” geçen mesajlar", applied())}</b>
                  </div>
                  <div class="amx-scroll">
                    <For each={hits()}>
                      {(m) => (
                        <div class="amx-hit">
                          <div class="amsg-head">
                            <span class="chip2 small">{kindLabel(m.kind)}</span>
                            <b data-no-i18n>{m.sender_name}</b>
                            <span class="muted">→</span>
                            <b data-no-i18n>{m.peer_name}</b>
                            <span class="lt-sp" />
                            <small class="muted">{fmtFull(m.created_at)}</small>
                          </div>
                          <p classList={{ "amx-del": m.deleted }} data-no-i18n>
                            {bodyText(m)}
                          </p>
                          <button class="link" onClick={() => open(threadOf(m), m)}>
                            Sohbete git
                          </button>
                        </div>
                      )}
                    </For>
                    <Show when={mErr()}>
                      <p class="error small">{mErr()}</p>
                    </Show>
                    <Show when={mLoading()}>
                      <p class="muted small">Yükleniyor…</p>
                    </Show>
                    <Show when={!mLoading() && !mErr() && hits().length === 0}>
                      <p class="muted small">Mesaj bulunamadı.</p>
                    </Show>
                    <Show when={hMore() && !mLoading()}>
                      <button class="btn ghost small" onClick={() => loadHits(true)}>
                        Daha eski
                      </button>
                    </Show>
                  </div>
                </Show>
              }
            >
              <div class="amx-head">
                <button class="btn ghost small" onClick={close}>
                  {applied() ? t("Sonuçlara dön") : t("Kapat")}
                </button>
                <b data-no-i18n>{threadTitle(sel()!)}</b>
                <span class="chip2 small">{kindLabel(sel()!.kind)}</span>
                <span class="lt-sp" />
                <small class="muted">Salt okunur</small>
              </div>
              <div class="amx-scroll" ref={scroller}>
                <Show when={mMore() && !mLoading()}>
                  <button class="btn ghost small amx-older" onClick={() => loadMsgs(sel()!, true)}>
                    Daha eski
                  </button>
                </Show>
                <Show when={mLoading()}>
                  <p class="muted small">Yükleniyor…</p>
                </Show>
                <For each={msgs()}>
                  {(m, i) => (
                    <>
                      <Show when={i() === 0 || dayKey(msgs()[i() - 1].created_at) !== dayKey(m.created_at)}>
                        <div class="amx-day">
                          <span>{fmtDay(m.created_at)}</span>
                        </div>
                      </Show>
                      <div class="amx-msg" classList={{ sys: !!m.meta?.t, hit: focusId() === m.id, right: sel()!.kind === "dm" && m.sender === sel()!.b }}>
                        <Avatar path={m.sender_avatar} name={m.sender_name} />
                        <div class="amx-bub">
                          <div class="amx-who">
                            <b data-no-i18n>{m.sender_name}</b>
                            <small class="muted" title={fmtFull(m.created_at)}>
                              {fmtTime(m.created_at)}
                            </small>
                            <Show when={m.deleted}>
                              <span class="chip2 small alt">Silindi</span>
                            </Show>
                          </div>
                          <p classList={{ "amx-del": m.deleted }} data-no-i18n>
                            {bodyText(m)}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </For>
                <Show when={mErr()}>
                  <p class="error small">{mErr()}</p>
                </Show>
                <Show when={!mLoading() && !mErr() && msgs().length === 0}>
                  <p class="muted small">Bu sohbette mesaj yok.</p>
                </Show>
                <Show when={focusId() && !mLoading() && msgs().length > 0}>
                  <button class="btn ghost small amx-older" onClick={() => open(sel()!)}>
                    En yeni mesajlara git
                  </button>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </section>
  );
}
