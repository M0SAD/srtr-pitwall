// Yönetim › Mesajlar: üyeler arası tüm özel mesajlar (sadece yönetici).
// Süzgeç: üye adı / iRacing adı (eşleşen üyelerin tüm sohbetleri), isteğe bağlı ikinci üye (ikili sohbet),
// tarih aralığı, metin. Sohbetlere göre gruplu ya da düz liste; sayfalı. Her arama moderasyon kaydına yazılır.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { adminMessages, type AdminMessageFilter, type AdminMessageRow } from "@/cloud/moderation";
import "../admin.css";

const PAGE = 100;
const fmt = (s: string) => new Date(s).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });
/** "2026-10-01" → yerel gün başı (ISO); bitiş için ertesi gün başı */
const dayIso = (v: string, next = false) => {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (next) d.setDate(d.getDate() + 1);
  return d.toISOString();
};

interface Pair {
  a: { id: string; name: string };
  b: { id: string; name: string };
}

const who = (name: string, iracing: string | null) => (iracing && iracing !== name ? `${name} (${iracing})` : name);

export function AdminMessages() {
  const [user, setUser] = createSignal("");
  const [other, setOther] = createSignal("");
  const [text, setText] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [pair, setPair] = createSignal<Pair | null>(null);
  const [view, setView] = createSignal<"conv" | "flat">("conv");
  const [err, setErr] = createSignal("");
  // Aranan süzgeç (yazarken değil, Ara'ya basınca değişir)
  const [query, setQuery] = createSignal<AdminMessageFilter | null>(null);

  const [rows] = createResource(query, (q) =>
    adminMessages(q).catch((e) => {
      setErr(String((e as Error).message));
      return [] as AdminMessageRow[];
    }),
  );
  const total = () => rows()?.[0]?.total ?? 0;
  const offset = () => query()?.offset ?? 0;

  const search = (off = 0) => {
    setErr("");
    const pr = pair();
    setQuery({
      user: pr ? pr.a.id : user(),
      other: pr ? pr.b.id : other(),
      text: text(),
      from: dayIso(from()),
      to: dayIso(to(), true),
      limit: PAGE,
      offset: off,
    });
  };
  const openPair = (m: AdminMessageRow) => {
    setPair({ a: { id: m.sender, name: m.sender_name }, b: { id: m.recipient, name: m.recipient_name } });
    setView("flat");
    queueMicrotask(() => search(0));
  };
  const clearPair = () => {
    setPair(null);
    queueMicrotask(() => search(0));
  };

  // Bu sayfadaki mesajlar sohbetlere göre (iki taraf sırasız), en yeni sohbet üstte
  const convs = createMemo(() => {
    const map = new Map<string, { key: string; first: AdminMessageRow; list: AdminMessageRow[] }>();
    for (const m of rows() ?? []) {
      const key = [m.sender, m.recipient].sort().join(":");
      const c = map.get(key);
      if (c) c.list.push(m);
      else map.set(key, { key, first: m, list: [m] });
    }
    return [...map.values()];
  });

  const onEnter = (e: KeyboardEvent) => e.key === "Enter" && search(0);

  const Msg = (p: { m: AdminMessageRow; compact?: boolean }) => (
    <div class="amsg" classList={{ reported: p.m.reported }}>
      <div class="amsg-head">
        <b data-no-i18n>{who(p.m.sender_name, p.m.sender_iracing)}</b>
        <span class="muted">→</span>
        <b data-no-i18n>{who(p.m.recipient_name, p.m.recipient_iracing)}</b>
        <span class="lt-sp" />
        <small class="muted">{fmt(p.m.created_at)}</small>
      </div>
      <p data-no-i18n>{p.m.body}</p>
      <div class="amsg-tags">
        <span class="chip2 small" classList={{ alt: !p.m.read_at }}>{p.m.read_at ? t("Okundu {0}", fmt(p.m.read_at)) : t("Okunmadı")}</span>
        <Show when={p.m.hidden_by_sender}>
          <span class="chip2 small alt">Gönderen kendinden sildi</span>
        </Show>
        <Show when={p.m.hidden_by_recipient}>
          <span class="chip2 small alt">Alıcı kendinden sildi</span>
        </Show>
        <Show when={p.m.reported}>
          <span class="chip2 small amsg-rep">Raporlandı</span>
        </Show>
        <Show when={!p.compact && !pair()}>
          <button class="link" onClick={() => openPair(p.m)}>
            Bu sohbeti aç
          </button>
        </Show>
      </div>
    </div>
  );

  return (
    <section class="panel admin-panel amsgs">
      <h3>Mesajlar</h3>
      <p class="muted small">
        Üyeler arasındaki tüm özel mesajlar. Bir üyenin adını ya da iRacing adını yaz: o üyenin dahil olduğu tüm sohbetler gelir. İkinci bir ad yazarsan sadece ikisi
        arasındaki mesajlar gösterilir. Üyelerin "benden sil" ile kaldırdığı mesajlar da burada görünür. Her arama moderasyon kayıtlarına yazılır.
      </p>
      <div class="amsg-filters">
        <Show
          when={pair()}
          fallback={
            <>
              <input class="input" placeholder="Üye adı ya da iRacing adı" value={user()} onInput={(e) => setUser(e.currentTarget.value)} onKeyDown={onEnter} />
              <input class="input" placeholder="İkinci üye (isteğe bağlı)" value={other()} onInput={(e) => setOther(e.currentTarget.value)} onKeyDown={onEnter} />
            </>
          }
        >
          <div class="amsg-pair">
            <span data-no-i18n>
              {pair()!.a.name} ↔ {pair()!.b.name}
            </span>
            <button class="btn ghost small" onClick={clearPair}>
              Kaldır
            </button>
          </div>
        </Show>
        <input class="input" placeholder="Metinde ara" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={onEnter} />
        <label class="amsg-date">
          <small class="muted">Başlangıç</small>
          <input class="input" type="date" value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
        </label>
        <label class="amsg-date">
          <small class="muted">Bitiş</small>
          <input class="input" type="date" value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
        </label>
        <button class="btn primary" onClick={() => search(0)}>
          Ara
        </button>
      </div>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show when={query()} fallback={<p class="muted small">Aramak için süzgeç gir ve Ara'ya bas (boş bırakırsan en yeni mesajlar gelir).</p>}>
        <div class="cm-tabs">
          <button classList={{ on: view() === "conv" }} onClick={() => setView("conv")}>
            Sohbetler
          </button>
          <button classList={{ on: view() === "flat" }} onClick={() => setView("flat")}>
            Liste
          </button>
          <span class="lt-sp" />
          <Show when={total() > 0}>
            <small class="muted">{t("{0}–{1} / {2} mesaj", offset() + 1, offset() + (rows()?.length ?? 0), total())}</small>
          </Show>
          <button class="btn ghost small" disabled={rows.loading || offset() === 0} onClick={() => search(Math.max(0, offset() - PAGE))}>
            Önceki
          </button>
          <button class="btn ghost small" disabled={rows.loading || offset() + PAGE >= total()} onClick={() => search(offset() + PAGE)}>
            Sonraki
          </button>
        </div>
        <Show when={!rows.loading} fallback={<p class="muted small">Yükleniyor…</p>}>
          <Show when={(rows() ?? []).length > 0} fallback={<p class="muted small">Mesaj bulunamadı.</p>}>
            <Show
              when={view() === "conv"}
              fallback={
                <div class="amsg-list">
                  <For each={rows()}>{(m) => <Msg m={m} />}</For>
                </div>
              }
            >
              <div class="amsg-convs">
                <For each={convs()}>
                  {(c) => (
                    <details class="amsg-conv" open={convs().length <= 3}>
                      <summary>
                        <b data-no-i18n>
                          {c.first.sender_name} ↔ {c.first.recipient_name}
                        </b>
                        <small class="muted">
                          {t("{0} mesaj", c.list.length)} · {fmt(c.first.created_at)}
                        </small>
                        <span class="lt-sp" />
                        <Show when={!pair()}>
                          <button
                            class="btn ghost small"
                            onClick={(e) => {
                              e.preventDefault();
                              openPair(c.first);
                            }}
                          >
                            Tüm sohbet
                          </button>
                        </Show>
                      </summary>
                      <div class="amsg-list">
                        <For each={[...c.list].reverse()}>{(m) => <Msg m={m} compact />}</For>
                      </div>
                    </details>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
