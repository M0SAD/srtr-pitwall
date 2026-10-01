// Topluluk içeriği için ortak parçalar: rapor penceresi, yorum listesi (düzenle/sil/raporla)
// ve bildirimler.

import { friendRespond } from "@/cloud/social";
import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { REPORT_REASONS, deleteNotice, markNoticesRead, notices, sendReport, type Notice, type ReportTarget } from "@/cloud/moderation";
import * as I from "../icons";
import { go, openTicket, openUrl } from "../ui";
import { AD_SITE } from "@/cloud/ads";

export function ReportDialog(props: { type: ReportTarget; id: string; what: string; onClose: () => void }) {
  const [reason, setReason] = createSignal("");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [err, setErr] = createSignal("");
  const submit = async () => {
    if (!reason()) return setErr("Bir sebep seç.");
    setBusy(true);
    setErr("");
    try {
      await sendReport(props.type, props.id, reason(), note().trim());
      setDone(true);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Portal>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
        <div class="modal report-modal">
          <header>
            <div>
              <h3>Raporla</h3>
              <small class="muted" data-no-i18n>
                {props.what}
              </small>
            </div>
            <button class="btn ghost small" onClick={props.onClose}>
              Kapat
            </button>
          </header>
          <Show
            when={!done()}
            fallback={
              <div class="report-done">
                <p class="success">Teşekkürler, raporun yöneticilere iletildi.</p>
                <button class="btn primary" onClick={props.onClose}>
                  Tamam
                </button>
              </div>
            }
          >
            <p class="muted small">Neden raporluyorsun?</p>
            <div class="report-reasons">
              <For each={REPORT_REASONS}>
                {(r) => (
                  <label class="check" classList={{ on: reason() === r.id }}>
                    <input type="radio" name="report-reason" checked={reason() === r.id} onChange={() => setReason(r.id)} />
                    <span>{r.label}</span>
                  </label>
                )}
              </For>
            </div>
            <textarea
              class="input cm-textarea"
              rows={3}
              maxLength={1000}
              placeholder="Açıklama (isteğe bağlı)"
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
            />
            <Show when={err()}>
              <p class="error small">{err()}</p>
            </Show>
            <button class="btn primary" disabled={busy() || !reason()} onClick={submit}>
              {busy() ? "Gönderiliyor…" : "Gönder"}
            </button>
          </Show>
        </div>
      </div>
    </Portal>
  );
}

export interface CommentItem {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  edited_at?: string | null;
}

/** Yorum listesi: kendi yorumunu (ya da izinle başkasınınkini) düzenle/sil, başkasınınkini raporla */
export function CommentList(props: {
  items: CommentItem[];
  canEdit: (c: CommentItem) => boolean;
  canDelete: (c: CommentItem) => boolean;
  onEdit: (c: CommentItem, body: string) => Promise<void>;
  onDelete: (c: CommentItem) => Promise<void>;
  reportType: ReportTarget;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal("");
  const [reporting, setReporting] = createSignal<CommentItem | null>(null);
  const save = async (c: CommentItem) => {
    const b = draft().trim();
    if (!b) return;
    try {
      await props.onEdit(c, b);
      setEditing(null);
    } catch (e) {
      props.onError(String((e as Error).message));
    }
  };
  return (
    <div class="cm-comments">
      <For each={props.items}>
        {(c) => (
          <div class="cm-comment">
            <div class="cm-comment-head">
              <b data-no-i18n>{c.author_name || "?"}</b>
              <small class="muted">
                {new Date(c.created_at).toLocaleString(localeTag())}
                <Show when={c.edited_at}> · düzenlendi</Show>
              </small>
              <span class="lt-sp" />
              <Show when={props.canEdit(c) && editing() !== c.id}>
                <button class="link" onClick={() => (setDraft(c.body), setEditing(c.id))}>
                  Düzenle
                </button>
              </Show>
              <Show when={props.canDelete(c)}>
                <button
                  class="link danger"
                  onClick={() => {
                    if (confirm("Bu yorum silinsin mi?")) props.onDelete(c).catch((e) => props.onError(String(e.message)));
                  }}
                >
                  Sil
                </button>
              </Show>
              <Show when={session() && session()!.user.id !== c.user_id}>
                <button class="link" title="Raporla" onClick={() => setReporting(c)}>
                  <I.Flag />
                </button>
              </Show>
            </div>
            <Show
              when={editing() === c.id}
              fallback={
                <p data-no-i18n>
                  {c.body}
                </p>
              }
            >
              <div class="fr-add">
                <input
                  class="input"
                  maxLength={1000}
                  value={draft()}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(c);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <button class="btn small" onClick={() => save(c)}>
                  Kaydet
                </button>
                <button class="btn ghost small" onClick={() => setEditing(null)}>
                  Vazgeç
                </button>
              </div>
            </Show>
          </div>
        )}
      </For>
      <Show when={reporting()}>
        <ReportDialog type={props.reportType} id={reporting()!.id} what={`${reporting()!.author_name}: ${reporting()!.body.slice(0, 80)}`} onClose={() => setReporting(null)} />
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bildirimler (üst çubukta zil)
// ---------------------------------------------------------------------------

function noticeText(n: Notice): string {
  if (n.ann) return n.ann.body ? `${n.ann.title}\n${n.ann.body}` : n.ann.title;
  if (n.kind === "shot_expired")
    return t('"{0}" adlı görselin 6 aydır görüntülenmediği için otomatik olarak silinmiştir.', n.data.title ?? "?");
  if (n.kind === "shot_removed") return t('"{0}" adlı görselin bir moderatör tarafından kaldırıldı.', n.data.title ?? "?");
  if (n.kind === "friend_request") return t("{0} arkadaşlık isteği gönderdi.", n.data.name ?? "?");
  if (n.kind === "friend_accepted") return t("{0} arkadaşlık isteğini kabul etti.", n.data.name ?? "?");
  if (n.kind === "layout_removed") return t('"{0}" adlı düzenin bir moderatör tarafından kaldırıldı.', n.data.title ?? "?");
  if (n.kind === "pro_expiring") {
    const until = new Date(n.data.until);
    if (n.data.stage === "d1" && until.getTime() > Date.now())
      return t("PRO üyeliğinin son günü! {0} tarihinde sona eriyor.", until.toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" }));
    const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000));
    return t("PRO üyeliğinin bitmesine {0} gün kaldı.", days);
  }
  if (n.kind === "pro_changed") {
    const nu = n.data.new_until ? new Date(n.data.new_until) : null;
    const date = nu ? nu.toLocaleDateString(localeTag()) : "";
    const days = Number(n.data.days ?? 0);
    let s: string;
    if (!nu || nu.getTime() <= Date.now() + 60_000) s = t("PRO üyeliğin sonlandırıldı.");
    else if (nu.getTime() - Date.now() > 3000 * 86400000) s = t("Artık süresiz PRO üyesisin.");
    else if (n.data.mode === "add" && days > 0) s = t("PRO üyeliğine {0} gün eklendi. Yeni bitiş: {1}", days, date);
    else if (n.data.mode === "add" && days < 0) s = t("PRO üyeliğinden {0} gün düşüldü. Yeni bitiş: {1}", Math.abs(days), date);
    else s = t("PRO bitiş tarihin {0} olarak güncellendi.", date);
    return n.data.note ? `${s}\n${t("Not: {0}", n.data.note)}` : s;
  }
  if (n.kind === "support_new") return t('{0} yeni destek talebi açtı: "{1}"', n.data.name ?? "?", n.data.subject ?? "");
  if (n.kind === "support_user_reply") return t('{0} destek talebine yazdı: "{1}"', n.data.name ?? "?", n.data.subject ?? "");
  if (n.kind === "support_reply") return t('Destek talebin yanıtlandı: "{0}"', n.data.subject ?? "");
  if (n.kind === "device_alert") return t("{0} hesabı {1} farklı bilgisayardan kullanılıyor.", n.data.name ?? "?", n.data.count ?? "?");
  if (n.kind === "ad_live") return n.data.resumed ? t('Reklamın yeniden yayında: "{0}"', n.data.title ?? "") : t('Reklamın yayına girdi: "{0}"', n.data.title ?? "");
  if (n.kind === "ad_rejected") {
    if (n.data.mode === "rejected") return t('Reklamın reddedildi: "{0}"', n.data.title ?? "") + (n.data.note ? `\n${t("Not: {0}", n.data.note)}` : "");
    if (n.data.mode === "reports") return t('Reklamın kullanıcı raporları nedeniyle gizlendi: "{0}"', n.data.title ?? "");
    return t('Reklamın durduruldu: "{0}"', n.data.title ?? "") + (n.data.note ? `\n${t("Not: {0}", n.data.note)}` : "");
  }
  if (n.kind === "ad_ended") return t('Reklamın sona erdi: "{0}" ({1} gösterim, {2} tıklama)', n.data.title ?? "", n.data.impressions ?? 0, n.data.clicks ?? 0);
  if (n.kind === "ad_reported")
    return n.data.hidden
      ? t('Reklam raporlarla gizlendi: "{0}" ({1} rapor)', n.data.title ?? "", n.data.reports ?? "?")
      : t('Reklam raporlandı: "{0}" ({1} rapor)', n.data.title ?? "", n.data.reports ?? "?");
  if (n.kind === "ad_pending") return t('Onay bekleyen reklam: "{0}" ({1})', n.data.title ?? "", n.data.name ?? "?");
  return n.data.text ?? n.kind;
}

/** Bildirime tıklayınca gidilecek yer (destek talebi, PRO sayfası) */
function noticeTarget(n: Notice): (() => void) | null {
  if ((n.kind === "support_new" || n.kind === "support_user_reply") && n.data.ticket) return () => openTicket(n.data.ticket, true);
  if (n.kind === "support_reply" && n.data.ticket) return () => openTicket(n.data.ticket, false);
  if (n.kind === "pro_expiring" || n.kind === "pro_changed") return () => go("pro");
  if (n.kind === "ad_reported" || n.kind === "ad_pending") return () => go("admin", "ads");
  if (n.kind === "ad_live" || n.kind === "ad_rejected" || n.kind === "ad_ended") return () => openUrl(AD_SITE);
  return null;
}

export function NoticeBell() {
  const [open, setOpen] = createSignal(false);
  const unread = () => notices().filter((n) => !n.read).length;
  return (
    <Show when={session()}>
      <div class="notice-wrap">
        <button
          class="notice-bell"
          classList={{ on: unread() > 0 }}
          title="Bildirimler"
          onClick={() => {
            const o = !open();
            setOpen(o);
            if (o) setTimeout(markNoticesRead, 1500);
          }}
        >
          <I.Bell />
          <Show when={unread() > 0}>
            <i>{unread()}</i>
          </Show>
        </button>
        <Show when={open()}>
          <div class="notice-pop" onClick={(e) => e.stopPropagation()}>
            <div class="notice-head">
              <b>Bildirimler</b>
              <button class="btn ghost small" onClick={() => setOpen(false)}>
                Kapat
              </button>
            </div>
            <Show when={notices().length > 0} fallback={<p class="muted small">Bildirim yok.</p>}>
              <For each={notices()}>
                {(n) => (
                  <div class="notice-item" classList={{ unread: !n.read, ann: !!n.ann }}>
                    <Show
                      when={n.ann}
                      fallback={
                        <p
                          classList={{ "notice-link": !!noticeTarget(n) }}
                          style={noticeTarget(n) ? { cursor: "pointer", "white-space": "pre-line" } : { "white-space": "pre-line" }}
                          onClick={() => {
                            const fn = noticeTarget(n);
                            if (fn) {
                              fn();
                              setOpen(false);
                            }
                          }}
                        >
                          {noticeText(n)}
                        </p>
                      }
                    >
                      <p data-no-i18n>
                        <b>
                          <I.Megaphone /> {n.ann!.title}
                        </b>
                        <Show when={n.ann!.body}>
                          <br />
                          <span class="notice-body">{n.ann!.body}</span>
                        </Show>
                      </p>
                    </Show>
                    <Show when={n.kind === "friend_request" && n.data.from}>
                      <div class="notice-actions">
                        <button
                          class="btn primary small"
                          onClick={async () => {
                            await friendRespond(n.data.from, true).catch(() => {});
                            deleteNotice(n.id);
                          }}
                        >
                          Kabul et
                        </button>
                        <button
                          class="btn ghost small"
                          onClick={async () => {
                            await friendRespond(n.data.from, false).catch(() => {});
                            deleteNotice(n.id);
                          }}
                        >
                          Reddet
                        </button>
                      </div>
                    </Show>
                    <small class="muted">{new Date(n.created_at).toLocaleString(localeTag())}</small>
                    <button class="link" onClick={() => deleteNotice(n.id)}>
                      Sil
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
