// Destek: talep yazışması (kullanıcı ve yönetici ortak), görsel ekleme, yeni talep formu.

import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { localeTag, t } from "@/sdk/i18n";
import {
  SUPPORT_CATEGORIES,
  adminDeleteTicket,
  SUPPORT_MAX_IMAGES,
  STATUS_LABELS,
  categoryLabel,
  createTicket,
  replyTicket,
  setTicketStatus,
  signImages,
  ticketSeen,
  ticketThread,
  type SupportCategory,
  type SupportStatus,
} from "@/cloud/support";
import * as I from "../icons";
import { EmojiPicker } from "./EmojiPicker";
import "../support.css";

export const fmtWhen = (v: string) => new Date(v).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" });

export function StatusChip(p: { status: SupportStatus }) {
  return <span class={`sp-status ${p.status}`}>{STATUS_LABELS[p.status] ?? p.status}</span>;
}

/** Görsel seçici: en çok 4 görsel, önizleme, kaldırma. Panodan yapıştırma için onPaste dışarıdan bağlanır. */
export function ImagePicker(p: { files: File[]; setFiles: (f: File[]) => void }) {
  let input: HTMLInputElement | undefined;
  const [urls, setUrls] = createSignal<string[]>([]);
  createEffect(() => {
    const u = p.files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    onCleanup(() => u.forEach((x) => URL.revokeObjectURL(x)));
  });
  const add = (list: FileList | null) => {
    const imgs = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    p.setFiles([...p.files, ...imgs].slice(0, SUPPORT_MAX_IMAGES));
    if (input) input.value = "";
  };
  return (
    <div class="sp-pick">
      <For each={urls()}>
        {(u, i) => (
          <div class="sp-thumb">
            <img src={u} alt="" />
            <button type="button" title="Kaldır" onClick={() => p.setFiles(p.files.filter((_, k) => k !== i()))}>
              <I.X />
            </button>
          </div>
        )}
      </For>
      <Show when={p.files.length < SUPPORT_MAX_IMAGES}>
        <button type="button" class="sp-add" title="Görsel ekle (en fazla 4)" onClick={() => input?.click()}>
          <I.ImagePlus />
          <small>{t("Görsel ekle ({0}/{1})", p.files.length, SUPPORT_MAX_IMAGES)}</small>
        </button>
      </Show>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.currentTarget.files)} />
    </div>
  );
}

/** Panodan yapıştırılan görselleri ekle */
export function pasteImages(e: ClipboardEvent, files: File[], setFiles: (f: File[]) => void) {
  const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  e.preventDefault();
  setFiles([...files, ...imgs].slice(0, SUPPORT_MAX_IMAGES));
}

function Lightbox(p: { src: string; onClose: () => void }) {
  return (
    <Portal>
      <div class="sp-lightbox" onClick={p.onClose}>
        <img src={p.src} alt="" />
      </div>
    </Portal>
  );
}

/** Yeni talep formu */
export function NewTicketForm(p: { onCreated: (id: string) => void; onCancel?: () => void }) {
  const [cat, setCat] = createSignal<SupportCategory>("bug");
  const [subject, setSubject] = createSignal("");
  const [body, setBody] = createSignal("");
  const [files, setFiles] = createSignal<File[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  let bodyEl: HTMLTextAreaElement | undefined;
  const submit = async () => {
    if (!subject().trim() || !body().trim()) return setErr(t("Başlık ve mesaj gerekli."));
    setBusy(true);
    setErr("");
    try {
      const id = await createTicket({ category: cat(), subject: subject(), body: body(), files: files() });
      p.onCreated(id);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="sp-form">
      <h3>Yeni destek talebi</h3>
      <p class="muted small">Sorununu ya da isteğini yaz; ekran görüntüsü eklersen daha hızlı yardımcı olabiliriz. Yanıt geldiğinde bildirim ve e-posta alırsın.</p>
      <label class="sp-label">Konu başlığı</label>
      <div class="sp-cats">
        <For each={SUPPORT_CATEGORIES}>
          {(c) => (
            <button type="button" classList={{ on: cat() === c.id }} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          )}
        </For>
      </div>
      <label class="sp-label">Başlık</label>
      <input class="input" maxLength={120} placeholder="Kısaca ne oldu?" value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
      <label class="sp-label">Mesaj</label>
      <textarea
        ref={bodyEl}
        class="input sp-text"
        rows={6}
        maxLength={4000}
        placeholder="Ne yapıyordun, ne bekliyordun, ne oldu? (Görseli buraya yapıştırabilirsin)"
        value={body()}
        onInput={(e) => setBody(e.currentTarget.value)}
        onPaste={(e) => pasteImages(e, files(), setFiles)}
      />
      <div class="sp-compose-tools">
        <EmojiPicker target={() => bodyEl} onInsert={setBody} up={false} />
        <ImagePicker files={files()} setFiles={setFiles} />
      </div>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <div class="btns">
        <button class="btn primary" disabled={busy()} onClick={submit}>
          {busy() ? "Gönderiliyor…" : "Talebi gönder"}
        </button>
        <Show when={p.onCancel}>
          <button class="btn ghost" onClick={() => p.onCancel!()}>
            Vazgeç
          </button>
        </Show>
      </div>
    </div>
  );
}

/** Talep yazışması + yanıt kutusu */
export function TicketThread(p: {
  ticket: { id: string; subject: string; status: SupportStatus; category: string; created_at: string };
  staff: boolean;
  /** Yönetici görünümü: talep sahibinin adı */
  owner?: string;
  onChanged: () => void;
  /** Sadece yönetici: talebi kalıcı silme düğmesi */
  canDelete?: boolean;
  onDeleted?: () => void;
}) {
  const [msgs, { refetch }] = createResource(
    () => p.ticket.id,
    async (id) => {
      const list = (await ticketThread(id)) ?? [];
      const urls = await signImages(list);
      ticketSeen(id);
      return { list, urls };
    },
  );
  const [body, setBody] = createSignal("");
  const [files, setFiles] = createSignal<File[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [zoom, setZoom] = createSignal<string | null>(null);
  const [askDel, setAskDel] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  let listEl: HTMLDivElement | undefined;
  let replyEl: HTMLTextAreaElement | undefined;

  createEffect(() => {
    msgs();
    queueMicrotask(() => listEl && (listEl.scrollTop = listEl.scrollHeight));
  });
  // Açıkken yeni mesajlar için ara ara bak
  const timer = window.setInterval(() => !document.hidden && refetch(), 45_000);
  onCleanup(() => clearInterval(timer));

  const send = async () => {
    if (!body().trim()) return;
    setBusy(true);
    setErr("");
    try {
      await replyTicket(p.ticket.id, body(), files());
      setBody("");
      setFiles([]);
      await refetch();
      p.onChanged();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const status = async (s: SupportStatus) => {
    try {
      await setTicketStatus(p.ticket.id, s);
      p.onChanged();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErr("");
    try {
      await adminDeleteTicket(p.ticket.id);
      setAskDel(false);
      p.onDeleted?.();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setDeleting(false);
    }
  };
  // Başka talebe geçilince silme onayı kapansın
  createEffect(() => {
    p.ticket.id;
    setAskDel(false);
  });

  return (
    <div class="sp-thread">
      <header class="sp-thread-head">
        <div>
          <b data-no-i18n>{p.ticket.subject}</b>
          <small class="muted">
            {categoryLabel(p.ticket.category)} · {fmtWhen(p.ticket.created_at)}
            <Show when={p.owner}>
              {" · "}
              <span data-no-i18n>{p.owner}</span>
            </Show>
          </small>
        </div>
        <StatusChip status={p.ticket.status} />
        <Show
          when={p.ticket.status !== "closed"}
          fallback={
            <button class="btn ghost small" onClick={() => status("open")}>
              Yeniden aç
            </button>
          }
        >
          <button class="btn ghost small" onClick={() => status("closed")}>
            Talebi kapat
          </button>
        </Show>
        <Show when={p.canDelete && !askDel()}>
          <button class="btn ghost small danger" title="Talep, tüm mesajları ve görselleriyle kalıcı silinir" onClick={() => setAskDel(true)}>
            <I.Trash /> Sil
          </button>
        </Show>
      </header>
      <Show when={p.canDelete && askDel()}>
        <div class="sp-del-ask">
          <span>Talep tüm mesajları ve görselleriyle kalıcı olarak silinsin mi? Bu geri alınamaz.</span>
          <button class="btn small danger" disabled={deleting()} onClick={remove}>
            {deleting() ? "Siliniyor…" : "Evet, kalıcı sil"}
          </button>
          <button class="btn ghost small" disabled={deleting()} onClick={() => setAskDel(false)}>
            Vazgeç
          </button>
        </div>
      </Show>
      <div class="sp-msgs" ref={listEl}>
        <Show when={!msgs.loading || msgs()} fallback={<p class="muted small">Yükleniyor…</p>}>
          <For each={msgs()?.list ?? []}>
            {(m) => (
              <div class="sp-msg" classList={{ staff: m.is_staff, mine: m.is_staff === p.staff }}>
                <div class="sp-msg-head">
                  <b>
                    <Show when={m.is_staff} fallback={<span data-no-i18n>{m.author_name}</span>}>
                      <I.ShieldCheck /> {p.staff ? <span data-no-i18n>{m.author_name}</span> : "Destek ekibi"}
                    </Show>
                  </b>
                  <small class="muted">{fmtWhen(m.created_at)}</small>
                </div>
                <p data-no-i18n>{m.body}</p>
                <Show when={m.images?.length}>
                  <div class="sp-imgs">
                    <For each={m.images}>
                      {(path) => (
                        <Show when={msgs()?.urls[path]} fallback={<span class="sp-img-missing">?</span>}>
                          <img src={msgs()!.urls[path]} alt="" loading="lazy" onClick={() => setZoom(msgs()!.urls[path])} />
                        </Show>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
      <div class="sp-reply">
        <Show when={p.ticket.status === "closed" && !p.staff}>
          <p class="muted small">Bu talep kapalı. Yazarsan yeniden açılır.</p>
        </Show>
        <textarea
          ref={replyEl}
          class="input sp-text"
          rows={3}
          maxLength={4000}
          placeholder={p.staff ? "Yanıtın (kullanıcıya bildirim ve e-posta gider)" : "Mesajın… (görsel yapıştırabilirsin)"}
          value={body()}
          onInput={(e) => setBody(e.currentTarget.value)}
          onPaste={(e) => pasteImages(e, files(), setFiles)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <div class="sp-reply-bar">
          <div class="sp-compose-tools">
            <EmojiPicker target={() => replyEl} onInsert={setBody} />
            <ImagePicker files={files()} setFiles={setFiles} />
          </div>
          <button class="btn primary" disabled={busy() || !body().trim()} onClick={send}>
            {busy() ? "Gönderiliyor…" : p.staff ? "Yanıtla" : "Gönder"}
          </button>
        </div>
        <Show when={err()}>
          <p class="error small">{err()}</p>
        </Show>
      </div>
      <Show when={zoom()}>
        <Lightbox src={zoom()!} onClose={() => setZoom(null)} />
      </Show>
    </div>
  );
}
