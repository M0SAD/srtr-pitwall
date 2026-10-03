// Moderasyon (izni olanlar), izin grupları ve moderasyon kayıtları (sadece sahip).

import { For, Show, createResource, createSignal } from "solid-js";
import { localeTag, t } from "@/sdk/i18n";
import { publicUrl } from "@/cloud/supabase";
import { adminFindUsers, type AdminUser } from "@/cloud/account";
import {
  PERMS,
  PERM_LABELS,
  REPORT_REASONS,
  TARGET_LABELS,
  deleteGroup,
  listGroups,
  listModLog,
  listReports,
  saveGroup,
  setReportStatus,
  setUserGroup,
  type ModLog,
  type PermGroup,
  type ReportRow,
  adminMessageReportSet,
  adminMessageReports,
  type MessageReportAction,
  type MessageReportRow,
} from "@/cloud/moderation";
import { MESSAGE_REPORT_REASONS } from "@/cloud/social";
import { SHOT_BUCKET, deleteShot, deleteShotComment, getShot, type SharedShot } from "@/cloud/shots";
import { deleteComment, deleteLayout } from "@/cloud/layouts";
import { deleteDash, deleteDashComment } from "@/cloud/dashes";
import { api } from "@/cloud/supabase";
import { SharedShotDetail } from "../pages/CommunityShots";
import { formatModLog, logTargetLabel } from "./modLogFormat";
import { openAdmin } from "./adminFocus";

const fmt = (s: string) => new Date(s).toLocaleString(localeTag(), { dateStyle: "short", timeStyle: "short" });
const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

// ---------------------------------------------------------------------------
// Raporlar
// ---------------------------------------------------------------------------

export function ModerationPanel() {
  const [filter, setFilter] = createSignal<"open" | "all">("open");
  const [list, { refetch }] = createResource(filter, (f) => listReports(f).catch((e) => (setMsg(String(e.message)), [] as ReportRow[])));
  const [msg, setMsg] = createSignal("");
  const [viewing, setViewing] = createSignal<SharedShot | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setMsg("");
    try {
      await fn();
      refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const removeTarget = (r: ReportRow) =>
    act(async () => {
      if (!confirm("Raporlanan içerik silinsin mi?")) return;
      const tg = r.target;
      if (tg) {
        if (r.target_type === "shot") await deleteShot({ id: r.target_id, path: tg.path ?? "", thumb_path: tg.thumb_path ?? "" });
        else if (r.target_type === "shot_comment") await deleteShotComment(r.target_id);
        else if (r.target_type === "layout") await deleteLayout(r.target_id);
        else if (r.target_type === "dash") await deleteDash(r.target_id);
        else if (r.target_type === "dash_comment") await deleteDashComment(r.target_id);
        else await deleteComment(r.target_id);
      }
      await setReportStatus(r.id, "resolved");
    });

  const open = async (r: ReportRow) => {
    const id = r.target_type === "shot" ? r.target_id : r.target?.screenshot_id;
    if (!id) return;
    const s = await getShot(id).catch(() => null);
    if (s) setViewing(s);
    else setMsg("İçerik bulunamadı (silinmiş olabilir).");
  };

  return (
    <section class="panel">
      <h3>Moderasyon</h3>
      <div class="cm-tabs">
        <button classList={{ on: filter() === "open" }} onClick={() => setFilter("open")}>
          Açık raporlar
        </button>
        <button classList={{ on: filter() === "all" }} onClick={() => setFilter("all")}>
          Tümü
        </button>
        <span class="lt-sp" />
        <button class="btn ghost small" onClick={() => refetch()}>
          Yenile
        </button>
      </div>
      <Show when={msg()}>
        <p class="error small">{msg()}</p>
      </Show>
      <Show when={!list.loading && (list() ?? []).length === 0}>
        <p class="muted small">{filter() === "open" ? "Açık rapor yok." : "Rapor yok."}</p>
      </Show>
      <div class="rep-list">
        <For each={list() ?? []}>
          {(r) => (
            <div class="rep-item" classList={{ closed: r.status !== "open" }}>
              <Show when={r.target?.thumb_path}>
                <img class="rep-thumb" src={publicUrl(SHOT_BUCKET, r.target!.thumb_path!)} alt="" onClick={() => open(r)} />
              </Show>
              <div class="rep-body">
                <div class="rep-top">
                  <b class="rep-reason">{reasonLabel(r.reason)}</b>
                  <span class="chip2">{TARGET_LABELS[r.target_type]}</span>
                  <Show when={r.status !== "open"}>
                    <span class="chip2 alt">{r.status === "resolved" ? "Çözüldü" : "Reddedildi"}</span>
                  </Show>
                </div>
                <p class="rep-content" data-no-i18n>
                  {r.target ? r.target.title ?? r.target.body : ""}
                </p>
                <Show when={!r.target}>
                  <p class="muted small">(İçerik silinmiş)</p>
                </Show>
                <small class="muted">
                  {t("İçerik sahibi: {0}", r.target?.author ?? "?")} · {t("Raporlayan: {0}", r.reporter_name)} · {fmt(r.created_at)}
                </small>
                <Show when={r.note}>
                  <p class="rep-note" data-no-i18n>
                    “{r.note}”
                  </p>
                </Show>
                <div class="btns">
                  <Show when={r.target_type === "shot" || r.target_type === "shot_comment"}>
                    <button class="btn ghost small" onClick={() => open(r)}>
                      Görüntüyü aç
                    </button>
                  </Show>
                  <Show when={r.target && r.status === "open"}>
                    <button class="btn ghost small danger" onClick={() => removeTarget(r)}>
                      İçeriği sil
                    </button>
                  </Show>
                  <Show when={r.status === "open"}>
                    <button class="btn ghost small" onClick={() => act(() => setReportStatus(r.id, "resolved"))}>
                      Çözüldü
                    </button>
                    <button class="btn ghost small" onClick={() => act(() => setReportStatus(r.id, "dismissed"))}>
                      Reddet
                    </button>
                  </Show>
                  <Show when={r.status !== "open"}>
                    <button class="btn ghost small" onClick={() => act(() => setReportStatus(r.id, "open"))}>
                      Yeniden aç
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
      <Show when={viewing()}>
        <SharedShotDetail s={viewing()!} onClose={() => setViewing(null)} onChanged={() => refetch()} />
      </Show>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mesaj raporları (arkadaş mesajları; sadece yöneticiler)
// ---------------------------------------------------------------------------

const MSG_STATUS: Record<MessageReportRow["status"], string> = {
  open: "Açık",
  dismissed: "Yoksayıldı",
  resolved: "Çözüldü",
  removed: "Mesaj silindi",
};

export function MessageReportsPanel() {
  const [filter, setFilter] = createSignal<"open" | "all">("open");
  const [msg, setMsg] = createSignal("");
  const [list, { refetch }] = createResource(filter, (f) => adminMessageReports(f).catch((e) => (setMsg(String(e.message)), [] as MessageReportRow[])));
  const [confirmDel, setConfirmDel] = createSignal<string | null>(null);
  const act = async (id: string, a: MessageReportAction) => {
    setMsg("");
    setConfirmDel(null);
    try {
      await adminMessageReportSet(id, a);
      refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };
  const label = (id: string) => MESSAGE_REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  return (
    <section class="panel">
      <h3>Mesaj raporları</h3>
      <p class="muted small">Üyelerin arkadaş mesajlarından raporladıkları. Mesaj metni rapor anındaki kopyadır; mesaj silinse de rapor kalır.</p>
      <div class="cm-tabs">
        <button classList={{ on: filter() === "open" }} onClick={() => setFilter("open")}>
          Açık raporlar
        </button>
        <button classList={{ on: filter() === "all" }} onClick={() => setFilter("all")}>
          Tümü
        </button>
        <span class="lt-sp" />
        <button class="btn ghost small" onClick={() => refetch()}>
          Yenile
        </button>
      </div>
      <Show when={msg()}>
        <p class="error small">{msg()}</p>
      </Show>
      <Show when={!list.loading && (list() ?? []).length === 0}>
        <p class="muted small">{filter() === "open" ? "Açık mesaj raporu yok." : "Mesaj raporu yok."}</p>
      </Show>
      <div class="rep-list">
        <For each={list() ?? []}>
          {(r) => (
            <div class="rep-item" classList={{ closed: r.status !== "open" }}>
              <div class="rep-body">
                <div class="rep-top">
                  <b class="rep-reason">{label(r.reason)}</b>
                  <span class="chip2">Mesaj</span>
                  <Show when={r.status !== "open"}>
                    <span class="chip2 alt">{MSG_STATUS[r.status] ?? r.status}</span>
                  </Show>
                  <Show when={r.reported_total > 1}>
                    <span class="chip2 alt">{t("Bu üye hakkında {0} rapor", r.reported_total)}</span>
                  </Show>
                </div>
                <p class="rep-content" data-no-i18n style={{ "white-space": "pre-line" }}>
                  {r.body}
                </p>
                <small class="muted">
                  {t("Gönderen: {0}", r.reported_name)} · {t("Raporlayan: {0}", r.reporter_name)} · {fmt(r.created_at)}
                  <Show when={r.message_at}> · {t("Mesaj tarihi: {0}", fmt(r.message_at!))}</Show>
                  <Show when={!r.message_exists}> · mesaj silinmiş</Show>
                  <Show when={r.status !== "open" && r.handled_name}> · {t("İşlem: {0}", r.handled_name)}</Show>
                </small>
                <Show when={r.note}>
                  <p class="rep-note" data-no-i18n>
                    “{r.note}”
                  </p>
                </Show>
                <div class="btns">
                  <Show when={r.status === "open"}>
                    <button class="btn ghost small" onClick={() => act(r.id, "dismiss")}>
                      Yoksay
                    </button>
                    <button class="btn ghost small" onClick={() => act(r.id, "resolve")}>
                      Çözüldü
                    </button>
                  </Show>
                  <Show when={r.message_exists}>
                    <Show
                      when={confirmDel() === r.id}
                      fallback={
                        <button class="btn ghost small danger" onClick={() => setConfirmDel(r.id)} title="Mesaj iki taraftan da silinir">
                          Mesajı sil
                        </button>
                      }
                    >
                      <button class="btn small danger" onClick={() => act(r.id, "delete_message")}>
                        Evet, iki taraftan da sil
                      </button>
                      <button class="btn ghost small" onClick={() => setConfirmDel(null)}>
                        Vazgeç
                      </button>
                    </Show>
                  </Show>
                  <Show when={r.status !== "open"}>
                    <button class="btn ghost small" onClick={() => act(r.id, "reopen")}>
                      Yeniden aç
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// İzin grupları (sadece sahip)
// ---------------------------------------------------------------------------

interface Member {
  user_id: string;
  group_id: string;
  profiles: { display_name: string } | null;
}

export function OwnerGroups(props: { run: (fn: () => Promise<unknown>, ok: string) => void }) {
  const [groups, { refetch }] = createResource(() => listGroups().catch(() => [] as PermGroup[]));
  const [members, { refetch: refetchMembers }] = createResource(() =>
    api<Member[]>("GET", "user_groups?select=user_id,group_id,profiles(display_name)").catch(() => [] as Member[]),
  );
  const [adding, setAdding] = createSignal<string | null>(null);
  const [q, setQ] = createSignal("");
  const [found, setFound] = createSignal<AdminUser[]>([]);
  const [newName, setNewName] = createSignal("");

  const reload = () => {
    refetch();
    refetchMembers();
  };

  return (
    <>
      <h4>İzin grupları</h4>
      <p class="muted small">
        Gruptaki kullanıcılar seçilen işleri yapabilir (ör. Moderatör: görsel ve yorum silme/düzenleme, raporlar). Yaptıkları her işlem
        aşağıdaki kayıtlara düşer. Bu bölümü sadece sen görürsün.
      </p>
      <div class="grp-list">
        <For each={groups() ?? []}>
          {(g) => {
            const [draft, setDraft] = createSignal<PermGroup>({ ...g, perms: [...g.perms] });
            const dirty = () => JSON.stringify(draft()) !== JSON.stringify(g);
            const gm = () => (members() ?? []).filter((m) => m.group_id === g.id);
            return (
              <div class="grp-card" style={{ "--gc": draft().color }}>
                <div class="grp-head">
                  <input type="color" value={draft().color} onInput={(e) => setDraft({ ...draft(), color: e.currentTarget.value })} />
                  <input class="input" maxLength={40} value={draft().name} onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })} />
                  <button
                    class="btn primary small"
                    disabled={!dirty()}
                    onClick={() => props.run(async () => (await saveGroup(draft()), reload()), "Grup kaydedildi")}
                  >
                    Kaydet
                  </button>
                  <button
                    class="btn ghost small danger"
                    onClick={() => {
                      if (confirm(t('"{0}" grubu silinsin mi?', g.name))) props.run(async () => (await deleteGroup(g.id), reload()), "Grup silindi");
                    }}
                  >
                    Sil
                  </button>
                </div>
                <div class="grp-perms">
                  <For each={PERMS}>
                    {(p) => (
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={draft().perms.includes(p)}
                          onChange={(e) => {
                            const set = new Set(draft().perms);
                            e.currentTarget.checked ? set.add(p) : set.delete(p);
                            setDraft({ ...draft(), perms: PERMS.filter((x) => set.has(x)) });
                          }}
                        />
                        <span>{PERM_LABELS[p]}</span>
                      </label>
                    )}
                  </For>
                </div>
                <div class="grp-members">
                  <small class="muted">Üyeler:</small>
                  <For each={gm()} fallback={<small class="muted">—</small>}>
                    {(m) => (
                      <span class="grp-chip">
                        <span data-no-i18n>{m.profiles?.display_name || m.user_id.slice(0, 8)}</span>
                        <button
                          title="Gruptan çıkar"
                          onClick={() => props.run(async () => (await setUserGroup(m.user_id, g.id, false), reload()), "Gruptan çıkarıldı")}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </For>
                  <button class="btn ghost small" onClick={() => (setAdding(adding() === g.id ? null : g.id), setFound([]), setQ(""))}>
                    + Üye ekle
                  </button>
                </div>
                <Show when={adding() === g.id}>
                  <div class="fr-add">
                    <input
                      class="input"
                      placeholder="Ad, e-posta ya da iRacing adı"
                      value={q()}
                      onInput={(e) => setQ(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === "Enter" && adminFindUsers(q().trim()).then(setFound)}
                    />
                    <button class="btn small" onClick={() => adminFindUsers(q().trim()).then(setFound)}>
                      Ara
                    </button>
                  </div>
                  <div class="grp-found">
                    <For each={found()}>
                      {(u) => (
                        <button
                          class="grp-chip add"
                          disabled={gm().some((m) => m.user_id === u.id)}
                          onClick={() => props.run(async () => (await setUserGroup(u.id, g.id, true), reload()), "Gruba eklendi")}
                        >
                          <span data-no-i18n>
                            {u.display_name || u.email} · {u.email}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <div class="fr-add">
        <input class="input" maxLength={40} placeholder="Yeni grup adı (ör. Yardımcı)" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} />
        <button
          class="btn"
          disabled={!newName().trim()}
          onClick={() =>
            props.run(async () => {
              await saveGroup({ name: newName().trim(), perms: [] });
              setNewName("");
              reload();
            }, "Grup oluşturuldu")
          }
        >
          Grup oluştur
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Moderasyon kayıtları (sadece sahip)
// ---------------------------------------------------------------------------

export function ModLogPanel() {
  const [offset, setOffset] = createSignal(0);
  const [rows, setRows] = createSignal<ModLog[]>([]);
  const [done, setDone] = createSignal(false);
  const [err, setErr] = createSignal("");
  const load = async (reset = false) => {
    try {
      const o = reset ? 0 : offset();
      const r = (await listModLog(o)) ?? [];
      setRows(reset ? r : [...rows(), ...r]);
      setOffset(o + r.length);
      setDone(r.length < 100);
      setErr("");
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  load(true);
  return (
    <>
      <h4>Moderasyon kayıtları</h4>
      <p class="muted small">Başkasının içeriğini silen/düzenleyen, raporu kapatan, yönetici ya da grup değiştiren herkesin işlemi. Sadece sen görürsün.</p>
      <div class="btns">
        <button class="btn ghost small" onClick={() => load(true)}>
          Yenile
        </button>
      </div>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <div class="log-list">
        <Show when={rows().length > 0} fallback={<p class="muted small">Henüz kayıt yok.</p>}>
          <For each={rows()}>
            {(l) => {
              // Okunur cümle + tıklanınca ilgili yönetim bölümü (modLogFormat.ts)
              const v = formatModLog(l);
              return (
                <div
                  class="log-row"
                  classList={{ link: !!v.target }}
                  style={v.target ? { cursor: "pointer" } : undefined}
                  title={v.target ? "İlgili bölümü aç" : ""}
                  onClick={() => v.target && openAdmin(v.target)}
                >
                  <small class="muted">{fmt(l.created_at)}</small>
                  <b data-no-i18n>{l.actor_name || "?"}</b>
                  <span class="chip2">{logTargetLabel(l.target_type)}</span>
                  <span class="log-act" data-no-i18n>
                    {v.text}
                  </span>
                  <Show when={v.target}>
                    <span class="muted small">›</span>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
      <Show when={!done() && rows().length > 0}>
        <button class="btn ghost small" onClick={() => load()}>
          Daha fazla
        </button>
      </Show>
    </>
  );
}
