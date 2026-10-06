// Takımlar: tüm takımları listele/ara, takım kur, takım profili (logo, üyeler ve rolleri, duyuru panosu,
// davet / katılma isteği), üyelik yönetimi (yönetici atama, üye çıkarma, sahipliği devretme, takımı silme).
// Takım sohbeti arkadaş listesinde oda olarak görünür. Sunucu: supabase/c30_guncelleme.sql.

import { For, Show, createEffect, createMemo, createResource, createSignal, on, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { localeTag, t } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import { cloudEnabled, session } from "@/cloud/supabase";
import { loadNotices } from "@/cloud/moderation";
import { isAdmin as siteAdmin } from "@/cloud/account";
import { findPeople, friendLook, friendRequest, initialOf, myFriends, type Friend, type Person } from "@/cloud/social";
import { loadAvatars } from "@/cloud/profile";
import { ProfileDialog } from "../components/Profile";
import { openDriverTelemetry, openTelemetrySession } from "./TelemetryPage";
import { SESSION_LABEL, SIM_LABEL, trackLabel } from "@/cloud/telemetry";
import { lapTime } from "@/sdk/format";
import {
  JOIN_LABELS,
  ROLE_LABELS,
  TEAM_SIMS,
  commentPost,
  createTeam,
  deleteComment,
  deletePost,
  deleteTeam,
  inviteToTeam,
  kickMember,
  leaveTeam,
  muteTeamChat,
  myTeamInvites,
  myTeams,
  TEAM_ROOMS,
  pinPost,
  postAnnouncement,
  requestJoin,
  respondInvite,
  searchTeams,
  setMemberRole,
  teamActivity,
  teamSimMeta,
  setTeamFocus,
  teamChatKey,
  teamFocus,
  teamProfile,
  teamWall,
  transferTeam,
  updateTeam,
  uploadTeamLogo,
  type JoinMode,
  type TeamActivity,
  type TeamFields,
  type TeamSim,
  type TeamMember,
  type TeamPost,
  type TeamProfile,
  type TeamSummary,
} from "@/cloud/teams";
import { go } from "../ui";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "../components/ProLock";
import { TeamLogo } from "../components/TeamChat";
import * as I from "../icons";
import Crown from "lucide-solid/icons/crown";
import Pin from "lucide-solid/icons/pin";
import PinOff from "lucide-solid/icons/pin-off";
import LogOut from "lucide-solid/icons/log-out";
import ShieldPlus from "lucide-solid/icons/shield-plus";
import ShieldMinus from "lucide-solid/icons/shield-minus";
import "../teams.css";

type View = { kind: "list" } | { kind: "team"; id: string } | { kind: "create" };

const COLORS = ["#4ea1ff", "#ff8a2a", "#3ddc84", "#e5484d", "#ffc53d", "#a77bff", "#22c3d6", "#ff5fa2", "#eceff4", "#7a8394"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" });
const errText = (e: unknown) => String((e as Error)?.message ?? e);

/** Takım sohbetini aç: Arkadaşlar penceresinde oda olarak */
export function openTeamChat(id: string) {
  if (inTauri) invoke("toast_open_chat", { friend: teamChatKey(id) }).catch(() => {});
}

export function TeamsPage() {
  const [view, setView] = createSignal<View>({ kind: "list" });
  // Bildirimden / sohbetten gelindiyse o takımı aç
  createEffect(() => {
    const id = teamFocus();
    if (id) {
      setView({ kind: "team", id });
      setTeamFocus(null);
    }
  });
  return (
    <div class="page tpage">
      <Show when={cloudEnabled} fallback={<p class="muted">Bulut bağlantısı yapılandırılmamış.</p>}>
        <Show when={view().kind === "list"}>
          <TeamList onOpen={(id) => setView({ kind: "team", id })} onCreate={() => setView({ kind: "create" })} />
        </Show>
        <Show when={view().kind === "create"}>
          <section class="panel tform-wrap">
            <div class="tback">
              <button class="btn ghost small" onClick={() => setView({ kind: "list" })}>
                <I.ChevronLeft /> Takımlar
              </button>
            </div>
            <h3>Takım kur</h3>
            <ProLockNote feature={F.teamCreate} text="Takım kurmak PRO üyelere özel." />
            <TeamForm
              submitLabel="Takımı kur"
              onCancel={() => setView({ kind: "list" })}
              onSubmit={async (f) => {
                const id = await createTeam(f);
                setView({ kind: "team", id: String(id) });
              }}
            />
          </section>
        </Show>
        <Show when={view().kind === "team" && (view() as { id: string }).id} keyed>
          {(id) => <TeamView id={id} onBack={() => setView({ kind: "list" })} />}
        </Show>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

function TeamList(props: { onOpen: (id: string) => void; onCreate: () => void }) {
  const [q, setQ] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [simF, setSimF] = createSignal<TeamSim | "">("");
  const [list, { refetch }] = createResource(
    () => ({ q: query(), sim: simF() }),
    (s) => searchTeams(s.q.trim(), s.sim).catch(() => [] as TeamSummary[]),
  );
  const [invites, { refetch: refetchInv }] = createResource(
    () => session()?.user.id ?? null,
    () => myTeamInvites().catch(() => []),
  );
  const [err, setErr] = createSignal("");
  let timer: number | undefined;
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(timer);
    timer = window.setTimeout(() => setQuery(v), 300);
  };
  const mine = () => (list() ?? []).filter((x) => x.my_role);
  const others = () => (list() ?? []).filter((x) => !x.my_role);
  const respond = async (id: string, accept: boolean, team: string) => {
    setErr("");
    try {
      await respondInvite(id, accept);
      refetchInv();
      refetch();
      loadNotices();
      if (accept) props.onOpen(team);
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <>
      <div class="tlist-head">
        <div class="fsearch tsearch">
          <I.Search />
          <input class="input" placeholder="Takım adı ya da etiketi ara" value={q()} onInput={(e) => onSearch(e.currentTarget.value)} />
        </div>
        <select class="input tsim-filter" title="Oyuna göre süz" value={simF()} onChange={(e) => setSimF(e.currentTarget.value as TeamSim | "")}>
          <option value="">Tüm oyunlar</option>
          <For each={TEAM_SIMS}>
            {(x) => (
              <option value={x.id} data-no-i18n={x.id === "multi" ? undefined : true}>
                {x.label}
              </option>
            )}
          </For>
        </select>
        <Show
          when={session()}
          fallback={
            <button class="btn" onClick={() => go("account")}>
              Takım kurmak için giriş yap
            </button>
          }
        >
          <button class="btn primary" disabled={proLocked(F.teamCreate)} onClick={props.onCreate}>
            <I.Plus /> Takım kur
            <ProLockTag feature={F.teamCreate} />
          </button>
        </Show>
      </div>
      <Show when={session()}>
        <ProLockNote feature={F.teamCreate} text="Takım kurmak PRO üyelere özel." />
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show when={(invites() ?? []).length > 0}>
        <section class="panel tinv">
          <h3>
            <I.Bell /> Takım davetlerin
          </h3>
          <For each={invites()}>
            {(inv) => (
              <div class="tinv-row">
                <TeamLogo team={inv} size={36} />
                <div class="tinv-main">
                  <b data-no-i18n>
                    [{inv.tag}] {inv.name}
                  </b>
                  <small class="muted">{t("{0} seni davet etti · {1}", inv.from_name, fmtDate(inv.created_at))}</small>
                </div>
                <button class="btn ghost small" onClick={() => props.onOpen(inv.team_id)}>
                  Takıma bak
                </button>
                <button class="btn primary small" disabled={proLocked(F.teamJoin)} onClick={() => respond(inv.id, true, inv.team_id)}>
                  Kabul et
                  <ProLockTag feature={F.teamJoin} />
                </button>
                <button class="btn ghost small" onClick={() => respond(inv.id, false, inv.team_id)}>
                  Reddet
                </button>
              </div>
            )}
          </For>
        </section>
      </Show>
      <Show when={mine().length > 0}>
        <h3 class="tsec-title">Takımlarım</h3>
        <div class="tgrid">
          <For each={mine()}>{(tm) => <TeamCard team={tm} onOpen={() => props.onOpen(tm.id)} />}</For>
        </div>
      </Show>
      <h3 class="tsec-title">{query().trim() || simF() ? "Arama sonuçları" : "Tüm takımlar"}</h3>
      <Show
        when={others().length > 0}
        fallback={
          <p class="muted small">
            {list.loading ? "Yükleniyor…" : query().trim() || simF() ? "Eşleşen takım yok." : "Henüz takım yok. İlk takımı sen kur!"}
          </p>
        }
      >
        <div class="tgrid">
          <For each={others()}>{(tm) => <TeamCard team={tm} onOpen={() => props.onOpen(tm.id)} />}</For>
        </div>
      </Show>
    </>
  );
}

function TeamCard(props: { team: TeamSummary; onOpen: () => void }) {
  const tm = () => props.team;
  return (
    <button class="tcard" style={{ "--tc": tm().color }} onClick={props.onOpen}>
      <TeamLogo team={tm()} size={52} />
      <div class="tcard-main">
        <div class="tcard-top">
          <b data-no-i18n>{tm().name}</b>
          <span class="ttag" data-no-i18n>
            {tm().tag}
          </span>
          <TeamSimBadge sim={tm().sim} />
        </div>
        <Show when={tm().description}>
          <p class="tcard-desc" data-no-i18n>
            {tm().description}
          </p>
        </Show>
        <small class="muted">
          {t("{0} üye", tm().member_count)} · {JOIN_LABELS[tm().join_mode]}
        </small>
      </div>
      <Show when={tm().my_role}>
        <span class={`trole r-${tm().my_role}`}>{ROLE_LABELS[tm().my_role!]}</span>
      </Show>
      <Show when={!tm().my_role && tm().my_invite}>
        <span class="trole r-pending">{tm().my_invite === "invite" ? "Davet edildin" : "İstek gönderildi"}</span>
      </Show>
    </button>
  );
}

/** Takımın oyunu rozeti */
function TeamSimBadge(props: { sim?: string | null }) {
  const m = () => teamSimMeta(props.sim);
  return (
    <span class={`sim-badge tsim s-${m().id}`} title={m().id === "multi" ? t("Birden fazla oyun") : m().label} data-no-i18n={m().id === "multi" ? undefined : true}>
      {m().id === "multi" ? t("Çoklu") : m().short}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kurma / düzenleme formu
// ---------------------------------------------------------------------------

function TeamForm(props: { initial?: TeamProfile; submitLabel: string; onSubmit: (f: TeamFields) => Promise<void>; onCancel: () => void }) {
  const i = props.initial;
  const [name, setName] = createSignal(i?.name ?? "");
  const [tag, setTag] = createSignal(i?.tag ?? "");
  const [desc, setDesc] = createSignal(i?.description ?? "");
  const [color, setColor] = createSignal(i?.color ?? COLORS[0]);
  const [logo, setLogo] = createSignal(i?.logo_path ?? "");
  const [mode, setMode] = createSignal<JoinMode>(i?.join_mode ?? "request");
  const [sim, setSim] = createSignal<TeamSim>(i?.sim ?? "iracing");
  const [busy, setBusy] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [err, setErr] = createSignal("");
  const valid = () => name().trim().length >= 2 && /^[\p{L}\p{N}]{2,5}$/u.test(tag().trim());
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    setUploading(true);
    try {
      setLogo(await uploadTeamLogo(f));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    if (!valid() || busy()) return;
    setBusy(true);
    setErr("");
    try {
      await props.onSubmit({ name: name().trim(), tag: tag().trim().toLocaleUpperCase("tr"), description: desc().trim(), color: color(), logo: logo(), joinMode: mode(), sim: sim() });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="tform">
      <div class="tform-logo">
        <TeamLogo team={{ logo_path: logo(), color: color(), tag: tag().trim().toLocaleUpperCase("tr") || "?" }} size={88} />
        <label class="btn small" classList={{ disabled: uploading() }}>
          <I.ImagePlus /> {uploading() ? "Yükleniyor…" : logo() ? "Logoyu değiştir" : "Logo yükle"}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onFile(e.currentTarget.files?.[0])} />
        </label>
        <Show when={logo()}>
          <button class="btn ghost small" onClick={() => setLogo("")}>
            Logoyu kaldır
          </button>
        </Show>
      </div>
      <div class="tform-fields">
        <label class="tfield">
          <span>Takım adı</span>
          <input class="input" maxLength={40} value={name()} placeholder="ör. Hızlı Kurtlar Racing" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="tfield">
          <span>Etiket (2-5 harf/rakam)</span>
          <input class="input ttag-input" maxLength={5} value={tag()} placeholder="HKR" onInput={(e) => setTag(e.currentTarget.value.toLocaleUpperCase("tr"))} />
        </label>
        <label class="tfield">
          <span>Açıklama</span>
          <textarea class="input" rows={3} maxLength={1000} value={desc()} placeholder="Takımın hakkında kısa bilgi, yarıştığınız seriler…" onInput={(e) => setDesc(e.currentTarget.value)} />
        </label>
        <label class="tfield">
          <span>Oyun</span>
          <select class="input" value={sim()} onChange={(e) => setSim(e.currentTarget.value as TeamSim)}>
            <For each={TEAM_SIMS}>
              {(x) => (
                <option value={x.id} data-no-i18n={x.id === "multi" ? undefined : true}>
                  {x.label}
                </option>
              )}
            </For>
          </select>
        </label>
        <div class="tfield">
          <span>Renk</span>
          <div class="tcolors">
            <For each={COLORS}>
              {(c) => <button class="tswatch" classList={{ on: color().toLowerCase() === c }} style={{ background: c }} title={c} onClick={() => setColor(c)} />}
            </For>
            <input type="color" value={color()} title="Özel renk" onInput={(e) => setColor(e.currentTarget.value)} />
          </div>
        </div>
        <label class="tfield">
          <span>Katılım</span>
          <select class="input" value={mode()} onChange={(e) => setMode(e.currentTarget.value as JoinMode)}>
            <For each={Object.keys(JOIN_LABELS) as JoinMode[]}>{(m) => <option value={m}>{JOIN_LABELS[m]}</option>}</For>
          </select>
        </label>
        <Show when={err()}>
          <p class="error small">{err()}</p>
        </Show>
        <div class="tform-btns">
          <button class="btn ghost" onClick={props.onCancel}>
            Vazgeç
          </button>
          <button class="btn primary" disabled={!valid() || busy() || uploading()} onClick={submit}>
            {busy() ? "Kaydediliyor…" : props.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Takım profili
// ---------------------------------------------------------------------------

function TeamView(props: { id: string; onBack: () => void }) {
  const [prof, { refetch, mutate }] = createResource(() => props.id, (id) => teamProfile(id));
  const [friends, { refetch: refetchFriends }] = createResource(
    () => session()?.user.id ?? null,
    () => myFriends().catch(() => [] as Friend[]),
  );
  const [chatMuted, setChatMuted] = createSignal<boolean | null>(null);
  createResource(
    () => (prof()?.my_role ? props.id : null),
    async (id) => {
      const mine = await myTeams().catch(() => []);
      setChatMuted(mine.find((x) => x.team_id === id)?.muted ?? false);
      return true;
    },
  );
  const [editing, setEditing] = createSignal(false);
  const [err, setErr] = createSignal("");
  const [ok, setOk] = createSignal("");
  const role = () => prof()?.my_role ?? null;
  const isAdmin = () => role() === "owner" || role() === "admin";
  const act = async (fn: () => Promise<unknown>, done = "") => {
    setErr("");
    setOk("");
    try {
      await fn();
      if (done) setOk(done);
      await refetch();
      loadNotices();
    } catch (e) {
      setErr(errText(e));
    }
  };

  const join = () =>
    act(async () => {
      const r = await requestJoin(props.id);
      if (r === "requested" || r === "pending") setOk(t("Katılma isteğin takım yöneticilerine gönderildi."));
      else setOk(t("Takıma katıldın!"));
    });

  return (
    <>
      <div class="tback">
        <button class="btn ghost small" onClick={props.onBack}>
          <I.ChevronLeft /> Takımlar
        </button>
      </div>
      <Show when={!prof.loading || prof()} fallback={<p class="muted">Yükleniyor…</p>}>
        <Show when={prof()} fallback={<p class="muted">{prof.error ? errText(prof.error) : "Takım bulunamadı (silinmiş olabilir)."}</p>}>
          {(p) => (
            <>
              <section class="thero" style={{ "--tc": p().color }}>
                <TeamLogo team={p()} size={96} />
                <div class="thero-main">
                  <div class="thero-title">
                    <h2 data-no-i18n>{p().name}</h2>
                    <span class="ttag big" data-no-i18n>
                      {p().tag}
                    </span>
                    <TeamSimBadge sim={p().sim} />
                    <Show when={role()}>
                      <span class={`trole r-${role()}`}>{ROLE_LABELS[role()!]}</span>
                    </Show>
                  </div>
                  <Show when={p().description}>
                    <p class="thero-desc" data-no-i18n>
                      {p().description}
                    </p>
                  </Show>
                  <small class="muted">
                    {t("{0} üye", p().members.length)} · {JOIN_LABELS[p().join_mode]} · {t("Kuran: {0}", p().owner_name)} · {fmtDate(p().created_at)}
                  </small>
                </div>
                <div class="thero-acts">
                  <Show when={session()} fallback={<button class="btn" onClick={() => go("account")}>Katılmak için giriş yap</button>}>
                    <Show when={role()}>
                      <Show when={inTauri && TEAM_ROOMS}>
                        <button class="btn primary" onClick={() => openTeamChat(p().id)}>
                          <I.MessageSquare /> Takım sohbeti
                        </button>
                      </Show>
                      <Show when={TEAM_ROOMS && chatMuted() !== null}>
                        <button
                          class="btn"
                          classList={{ on: !!chatMuted() }}
                          title="Sessizdeyken sohbet mesajları bildirim göstermez ve ses çalmaz"
                          onClick={() =>
                            act(async () => {
                              await muteTeamChat(p().id, !chatMuted());
                              setChatMuted(!chatMuted());
                            })
                          }
                        >
                          {chatMuted() ? <I.BellOff /> : <I.Bell />} {chatMuted() ? "Oda sessizde" : "Odayı sessize al"}
                        </button>
                      </Show>
                      <Show when={isAdmin()}>
                        <button class="btn" classList={{ on: editing() }} onClick={() => setEditing(!editing())}>
                          <I.Pencil /> Düzenle
                        </button>
                      </Show>
                      <Show
                        when={role() === "owner"}
                        fallback={
                          <button
                            class="btn ghost"
                            onClick={() => confirm(t("{0} takımından ayrılmak istiyor musun?", p().name)) && act(() => leaveTeam(p().id).then(() => props.onBack()))}
                          >
                            <LogOut /> Ayrıl
                          </button>
                        }
                      >
                        <button
                          class="btn danger"
                          onClick={() =>
                            confirm(t("{0} takımı ve tüm duyuruları, sohbeti kalıcı olarak silinsin mi?", p().name)) &&
                            act(() => deleteTeam(p().id).then(() => props.onBack()))
                          }
                        >
                          <I.Trash /> Takımı sil
                        </button>
                      </Show>
                    </Show>
                    <Show when={siteAdmin() && role() !== "owner"}>
                      <button
                        class="btn danger"
                        title="Site yöneticisi: kurallara aykırı takımı kaldır (kayda geçer)"
                        onClick={() =>
                          confirm(t("{0} takımı ve tüm duyuruları, sohbeti kalıcı olarak silinsin mi?", p().name)) &&
                          act(() => deleteTeam(p().id).then(() => props.onBack()))
                        }
                      >
                        <I.ShieldCheck /> Takımı kaldır (yönetici)
                      </button>
                    </Show>
                    <Show when={!role()}>
                      <Show
                        when={p().my_invite}
                        fallback={
                          <Show when={p().join_mode !== "invite"} fallback={<span class="muted small">Bu takım sadece davetle üye alıyor.</span>}>
                            <button class="btn primary" disabled={proLocked(F.teamJoin)} onClick={join}>
                              <I.UserPlus /> {p().join_mode === "open" ? "Takıma katıl" : "Katılma isteği gönder"}
                              <ProLockTag feature={F.teamJoin} />
                            </button>
                            <ProLockNote feature={F.teamJoin} text="Takıma katılmak PRO üyelere özel." />
                          </Show>
                        }
                      >
                        {(inv) => (
                          <Show
                            when={inv().kind === "invite"}
                            fallback={
                              <>
                                <span class="trole r-pending">İstek gönderildi</span>
                                <button class="btn ghost small" onClick={() => act(() => respondInvite(inv().id, false), t("İstek geri alındı."))}>
                                  İsteği geri al
                                </button>
                              </>
                            }
                          >
                            <span class="trole r-pending">Davet edildin</span>
                            <button
                              class="btn primary"
                              disabled={proLocked(F.teamJoin)}
                              onClick={() => act(() => respondInvite(inv().id, true), t("Takıma katıldın!"))}
                            >
                              Daveti kabul et
                              <ProLockTag feature={F.teamJoin} />
                            </button>
                            <button class="btn ghost" onClick={() => act(() => respondInvite(inv().id, false))}>
                              Reddet
                            </button>
                          </Show>
                        )}
                      </Show>
                    </Show>
                  </Show>
                </div>
              </section>
              <Show when={err()}>
                <p class="error small" onClick={() => setErr("")}>
                  {err()}
                </p>
              </Show>
              <Show when={ok()}>
                <p class="success small" onClick={() => setOk("")}>
                  {ok()}
                </p>
              </Show>
              <Show when={editing() && isAdmin()}>
                <section class="panel">
                  <h3>Takımı düzenle</h3>
                  <TeamForm
                    initial={p()}
                    submitLabel="Kaydet"
                    onCancel={() => setEditing(false)}
                    onSubmit={async (f) => {
                      await updateTeam(p().id, f);
                      setEditing(false);
                      setOk(t("Takım bilgileri kaydedildi."));
                      refetch();
                    }}
                  />
                </section>
              </Show>
              <div class="tcols">
                <div class="tcol-main">
                  <Show
                    when={role()}
                    fallback={
                      <section class="panel">
                        <h3>
                          <I.Megaphone /> Duyurular
                        </h3>
                        <p class="muted small">Takım duyurularını ve sohbeti sadece üyeler görür.</p>
                      </section>
                    }
                  >
                    <Wall team={p()} isAdmin={isAdmin()} onPinned={(post) => mutate({ ...p(), pinned_post: post })} />
                  </Show>
                  <Activity team={p()} />
                </div>
                <div class="tcol-side">
                  <Members
                    team={p()}
                    friends={friends() ?? []}
                    act={act}
                    onFriend={async (id) => {
                      setErr("");
                      try {
                        await friendRequest(id);
                        setOk(t("Arkadaşlık isteği gönderildi."));
                        refetchFriends();
                      } catch (e) {
                        setErr(errText(e));
                      }
                    }}
                  />
                  <Show when={isAdmin()}>
                    <Pending team={p()} act={act} />
                    <InviteBox team={p()} act={act} />
                  </Show>
                </div>
              </div>
            </>
          )}
        </Show>
      </Show>
    </>
  );
}

/** "3 saat önce" */
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("az önce");
  if (s < 3600) return t("{0} dk önce", Math.floor(s / 60));
  if (s < 86400) return t("{0} saat önce", Math.floor(s / 3600));
  if (s < 86400 * 7) return t("{0} gün önce", Math.floor(s / 86400));
  return fmtDate(iso);
}

/** Son aktiviteler: üyelerin son telemetri oturumları (telemetrisi görünen üyeler) */
function Activity(props: { team: TeamProfile }) {
  const [items] = createResource(
    () => props.team.id,
    (id) => teamActivity(id, 30).catch(() => [] as TeamActivity[]),
  );
  const [more, setMore] = createSignal(false);
  const shown = () => (items() ?? []).slice(0, more() ? 30 : 8);
  const multi = () => (props.team.sim ?? "iracing") === "multi";
  return (
    <section class="panel tact">
      <h3>
        <I.Activity /> Son aktiviteler
      </h3>
      <Show
        when={(items() ?? []).length > 0}
        fallback={
          <p class="muted small">
            {items.loading
              ? "Yükleniyor…"
              : multi()
                ? "Üyelerin henüz görünen bir telemetri oturumu yok."
                : t("Üyelerin henüz görünen bir {0} oturumu yok.", SIM_LABEL[props.team.sim ?? "iracing"] ?? "")}
          </p>
        }
      >
        <div class="tact-list">
          <For each={shown()}>
            {(a) => (
              <button class="tact-row" title="Oturumu Telemetri sayfasında aç" onClick={() => openTelemetrySession(a.session_id)}>
                <Avatar id={a.user_id} name={a.display_name} size={36} />
                <div class="tact-main">
                  <div class="tact-line">
                    {t(
                      "{0}, {1} pistinde {2} ile {3} tur attı",
                      a.display_name,
                      trackLabel(a) || "?",
                      a.car_name || "?",
                      a.laps,
                    )}
                  </div>
                  <small class="muted">
                    <Show when={multi()}>
                      <span data-no-i18n>{SIM_LABEL[a.sim] ?? a.sim}</span> ·{" "}
                    </Show>
                    {SESSION_LABEL[a.session_type] ?? SESSION_LABEL.other}
                    <Show when={a.best_lap}>
                      {" · "}
                      {t("en iyi {0}", lapTime(a.best_lap))}
                    </Show>
                    {" · "}
                    {ago(a.last_lap_at)}
                  </small>
                </div>
                <Show when={a.is_pb}>
                  <span class="tact-pb" title="Bu pist ve araçta kişisel en iyisi">
                    PB
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
        <Show when={(items() ?? []).length > 8}>
          <button class="btn ghost small tact-more" onClick={() => setMore(!more())}>
            {more() ? "Daha az göster" : t("Tümünü göster ({0})", (items() ?? []).length)}
          </button>
        </Show>
      </Show>
    </section>
  );
}

/** Üye avatarı: arkadaşa özel fotoğraf (PRO) > üyenin profil fotoğrafı (c31) > baş harf */
function Avatar(props: { id: string; name: string; size?: number }) {
  createEffect(() => void loadAvatars([props.id]));
  const look = () => friendLook(props.id);
  return (
    <span class="fav" style={{ "--sz": `${props.size ?? 32}px`, "--fc": look().color }}>
      <Show when={look().photo} fallback={<span data-no-i18n>{initialOf(props.name)}</span>}>
        <img src={look().photo} alt="" />
      </Show>
    </span>
  );
}

function Members(props: {
  team: TeamProfile;
  friends: Friend[];
  act: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  onFriend: (id: string) => void;
}) {
  const me = () => session()?.user.id;
  const myRole = () => props.team.my_role;
  const [menu, setMenu] = createSignal<string | null>(null);
  const [profileOf, setProfileOf] = createSignal<string | null>(null);
  createEffect(() => void loadAvatars(props.team.members.map((m) => m.user_id)));
  const friendState = (id: string) => props.friends.find((f) => f.friend_id === id)?.status;
  const canKick = (m: TeamMember) => m.user_id !== me() && m.role !== "owner" && (myRole() === "owner" || (myRole() === "admin" && m.role === "member"));
  const icon = (r: TeamMember["role"]): JSX.Element => (r === "owner" ? <Crown /> : r === "admin" ? <I.ShieldCheck /> : null);
  return (
    <section class="panel tmembers">
      <h3>
        <I.Users /> {t("Üyeler ({0})", props.team.members.length)}
      </h3>
      <For each={props.team.members}>
        {(m) => (
          <div class="tmem" onMouseLeave={() => menu() === m.user_id && setMenu(null)}>
            <button class="fav-btn" title="Profili gör" onClick={() => setProfileOf(m.user_id)}>
              <Avatar id={m.user_id} name={m.display_name} />
            </button>
            <div class="tmem-main tmem-link" title="Profili gör" onClick={() => setProfileOf(m.user_id)}>
              <b data-no-i18n>
                {m.display_name}
                <Show when={m.user_id === me()}>
                  <small class="muted"> {t("(sen)")}</small>
                </Show>
              </b>
              <small class="muted" data-no-i18n={m.iracing_name ? true : undefined}>
                <Show when={m.iracing_name} fallback={t("{0} tarihinden beri", fmtDate(m.joined_at))}>
                  iRacing: {m.iracing_name}
                </Show>
              </small>
            </div>
            <Show when={m.role !== "member"}>
              <span class={`trole r-${m.role}`} title={ROLE_LABELS[m.role]}>
                {icon(m.role)} {ROLE_LABELS[m.role]}
              </span>
            </Show>
            <Show when={session() && m.user_id !== me()}>
              <Show
                when={!friendState(m.user_id)}
                fallback={
                  <span class="tmem-fs muted small" title={friendState(m.user_id) === "accepted" ? t("Arkadaşın") : t("Arkadaşlık isteği bekliyor")}>
                    {friendState(m.user_id) === "accepted" ? <I.Users /> : <I.UserPlus />}
                  </span>
                }
              >
                <button class="icon-btn" title="Arkadaş ekle" onClick={() => props.onFriend(m.user_id)}>
                  <I.UserPlus />
                </button>
              </Show>
            </Show>
            <Show when={myRole() === "owner" ? m.user_id !== me() : canKick(m)}>
              <div class="tmem-menu-wrap">
                <button class="icon-btn" title="Seçenekler" onClick={() => setMenu(menu() === m.user_id ? null : m.user_id)}>
                  <I.MoreVertical />
                </button>
                <Show when={menu() === m.user_id}>
                  <div class="frow-menu tmem-menu">
                    <Show when={myRole() === "owner" && m.role === "member"}>
                      <button onClick={() => (setMenu(null), props.act(() => setMemberRole(props.team.id, m.user_id, "admin"), t("{0} artık yönetici.", m.display_name)))}>
                        <ShieldPlus /> Yönetici yap
                      </button>
                    </Show>
                    <Show when={myRole() === "owner" && m.role === "admin"}>
                      <button onClick={() => (setMenu(null), props.act(() => setMemberRole(props.team.id, m.user_id, "member")))}>
                        <ShieldMinus /> Yöneticiliği al
                      </button>
                    </Show>
                    <Show when={myRole() === "owner"}>
                      <button
                        onClick={() => {
                          setMenu(null);
                          if (confirm(t("Takımın sahipliği {0} kişisine devredilsin mi? Sen yönetici olarak kalırsın.", m.display_name)))
                            props.act(() => transferTeam(props.team.id, m.user_id), t("Sahiplik devredildi."));
                        }}
                      >
                        <Crown /> Sahipliği devret
                      </button>
                    </Show>
                    <Show when={canKick(m)}>
                      <button
                        class="danger"
                        onClick={() => {
                          setMenu(null);
                          if (confirm(t("{0} takımdan çıkarılsın mı?", m.display_name))) props.act(() => kickMember(props.team.id, m.user_id));
                        }}
                      >
                        <I.UserMinus /> Takımdan çıkar
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        )}
      </For>
      <Show when={profileOf()}>
        {(id) => <ProfileDialog id={id()} onClose={() => setProfileOf(null)} onTelemetry={openDriverTelemetry} />}
      </Show>
    </section>
  );
}

function Pending(props: { team: TeamProfile; act: (fn: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const reqs = () => (props.team.pending ?? []).filter((x) => x.kind === "request");
  const invs = () => (props.team.pending ?? []).filter((x) => x.kind === "invite");
  return (
    <Show when={(props.team.pending ?? []).length > 0}>
      <section class="panel tmembers">
        <Show when={reqs().length > 0}>
          <h3>
            <I.UserPlus /> {t("Katılma istekleri ({0})", reqs().length)}
          </h3>
          <For each={reqs()}>
            {(r) => (
              <div class="tmem">
                <Avatar id={r.user_id} name={r.display_name} />
                <div class="tmem-main">
                  <b data-no-i18n>{r.display_name}</b>
                  <small class="muted">{fmtWhen(r.created_at)}</small>
                </div>
                <button class="btn primary small" onClick={() => props.act(() => respondInvite(r.id, true), t("{0} takıma katıldı.", r.display_name))}>
                  Onayla
                </button>
                <button class="btn ghost small" onClick={() => props.act(() => respondInvite(r.id, false))}>
                  Reddet
                </button>
              </div>
            )}
          </For>
        </Show>
        <Show when={invs().length > 0}>
          <h3>
            <I.Bell /> {t("Gönderilen davetler ({0})", invs().length)}
          </h3>
          <For each={invs()}>
            {(r) => (
              <div class="tmem">
                <Avatar id={r.user_id} name={r.display_name} />
                <div class="tmem-main">
                  <b data-no-i18n>{r.display_name}</b>
                  <small class="muted">{fmtWhen(r.created_at)}</small>
                </div>
                <button class="btn ghost small" onClick={() => props.act(() => respondInvite(r.id, false))}>
                  Daveti iptal et
                </button>
              </div>
            )}
          </For>
        </Show>
      </section>
    </Show>
  );
}

function InviteBox(props: { team: TeamProfile; act: (fn: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [q, setQ] = createSignal("");
  const [res, setRes] = createSignal<Person[] | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal("");
  const search = async () => {
    if (q().trim().length < 2) return;
    setNote("");
    setBusy(true);
    try {
      setRes((await findPeople(q().trim())) ?? []);
    } catch {
      setRes([]);
    } finally {
      setBusy(false);
    }
  };
  const state = (id: string) =>
    props.team.members.some((m) => m.user_id === id) ? "member" : (props.team.pending ?? []).find((x) => x.user_id === id)?.kind ?? null;
  return (
    <section class="panel tmembers">
      <h3>
        <I.UserPlus /> Üye davet et
      </h3>
      <div class="fsearch tsearch">
        <I.Search />
        <input
          class="input"
          placeholder="Görünen ad ya da iRacing adı"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button class="btn small" disabled={busy() || q().trim().length < 2} onClick={search}>
          Ara
        </button>
      </div>
      <Show when={note()}>
        <p class="success small">{note()}</p>
      </Show>
      <Show when={res() && res()!.length === 0}>
        <p class="muted small">Kimse bulunamadı.</p>
      </Show>
      <For each={res() ?? []}>
        {(p) => (
          <div class="tmem">
            <Avatar id={p.id} name={p.display_name} />
            <div class="tmem-main">
              <b data-no-i18n>{p.display_name || "?"}</b>
              <Show when={p.iracing_name}>
                <small class="muted" data-no-i18n>
                  iRacing: {p.iracing_name}
                </small>
              </Show>
            </div>
            <Show
              when={!state(p.id)}
              fallback={<small class="muted">{state(p.id) === "member" ? "Takımda" : state(p.id) === "invite" ? "Davet edildi" : "İstek gönderdi"}</small>}
            >
              <button
                class="btn primary small"
                onClick={() =>
                  props.act(async () => {
                    const r = await inviteToTeam(props.team.id, p.id);
                    setNote(r === "joined" ? t("{0} zaten katılmak istemişti; takıma eklendi.", p.display_name) : t("{0} davet edildi.", p.display_name));
                  })
                }
              >
                Davet et
              </button>
            </Show>
          </div>
        )}
      </For>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Duyuru panosu
// ---------------------------------------------------------------------------

function Wall(props: { team: TeamProfile; isAdmin: boolean; onPinned: (post: string | null) => void }) {
  const [posts, { refetch }] = createResource(() => props.team.id, (id) => teamWall(id));
  const [body, setBody] = createSignal("");
  const [pin, setPin] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const me = () => session()?.user.id;
  createEffect(on(() => props.team.pinned_post, () => refetch(), { defer: true }));
  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      await refetch();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const publish = async () => {
    if (!body().trim() || busy()) return;
    setBusy(true);
    await act(async () => {
      await postAnnouncement(props.team.id, body().trim(), pin());
      setBody("");
      setPin(false);
    });
    setBusy(false);
  };
  return (
    <section class="panel twall">
      <h3>
        <I.Megaphone /> Duyurular
      </h3>
      <Show when={props.isAdmin}>
        <ProLockNote feature={F.teamPost} text="Duyuru yazmak PRO üyelere özel." />
        <div class="twall-new" classList={{ "prolock-dim": proLocked(F.teamPost) }}>
          <textarea class="input" rows={3} maxLength={4000} placeholder="Takıma duyuru yaz…" value={body()} onInput={(e) => setBody(e.currentTarget.value)} />
          <div class="twall-new-foot">
            <label class="tpoll-check">
              <input type="checkbox" checked={pin()} onChange={(e) => setPin(e.currentTarget.checked)} /> Sabitle
            </label>
            <small class="muted">Üyelere bildirim gider.</small>
            <span class="lt-sp" />
            <button class="btn primary small" disabled={!body().trim() || busy()} onClick={publish}>
              <I.Megaphone /> Paylaş
            </button>
          </div>
        </div>
      </Show>
      <Show when={err()}>
        <p class="error small">{err()}</p>
      </Show>
      <Show when={(posts() ?? []).length > 0} fallback={<p class="muted small">{posts.loading ? "Yükleniyor…" : "Henüz duyuru yok."}</p>}>
        <For each={posts()}>
          {(post) => (
            <PostItem
              post={post}
              me={me()}
              isAdmin={props.isAdmin}
              onPin={(on) =>
                act(async () => {
                  await pinPost(props.team.id, on ? post.id : null);
                  props.onPinned(on ? post.id : null);
                })
              }
              onDelete={() => confirm(t("Duyuru silinsin mi?")) && act(() => deletePost(post.id))}
              onComment={(b) => act(() => commentPost(post.id, b))}
              onDeleteComment={(id) => act(() => deleteComment(id))}
            />
          )}
        </For>
      </Show>
    </section>
  );
}

function PostItem(props: {
  post: TeamPost;
  me?: string;
  isAdmin: boolean;
  onPin: (on: boolean) => void;
  onDelete: () => void;
  onComment: (body: string) => Promise<void>;
  onDeleteComment: (id: string) => void;
}) {
  const [c, setC] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const p = () => props.post;
  const send = async () => {
    if (!c().trim()) return;
    await props.onComment(c().trim());
    setC("");
  };
  const comments = createMemo(() => p().comments ?? []);
  return (
    <article class="tpost" classList={{ pinned: p().pinned }}>
      <header>
        <Avatar id={p().author ?? "?"} name={p().author_name} size={30} />
        <div class="tpost-who">
          <b data-no-i18n>{p().author_name}</b>
          <small class="muted">{fmtWhen(p().created_at)}</small>
        </div>
        <Show when={p().pinned}>
          <span class="tpin">
            <Pin /> Sabit
          </span>
        </Show>
        <span class="lt-sp" />
        <Show when={props.isAdmin}>
          <button class="icon-btn" title={p().pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onClick={() => props.onPin(!p().pinned)}>
            {p().pinned ? <PinOff /> : <Pin />}
          </button>
        </Show>
        <Show when={props.isAdmin || p().author === props.me}>
          <button class="icon-btn" title="Sil" onClick={props.onDelete}>
            <I.Trash />
          </button>
        </Show>
      </header>
      <p class="tpost-body" data-no-i18n>
        {p().body}
      </p>
      <div class="tpost-comments">
        <Show when={comments().length > 0}>
          <button class="link small" onClick={() => setOpen(!open())}>
            {open() ? t("Yorumları gizle") : t("{0} yorum", comments().length)}
          </button>
        </Show>
        <Show when={open() || comments().length <= 2}>
          <For each={comments()}>
            {(cm) => (
              <div class="tcomment">
                <b data-no-i18n>{cm.author_name}</b>
                <span data-no-i18n>{cm.body}</span>
                <small class="muted">{fmtWhen(cm.created_at)}</small>
                <Show when={props.isAdmin || cm.author === props.me}>
                  <button class="icon-btn" title="Yorumu sil" onClick={() => props.onDeleteComment(cm.id)}>
                    <I.X />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </Show>
        <div class="tcomment-new">
          <input
            class="input"
            maxLength={1000}
            placeholder="Yorum yaz…"
            value={c()}
            onInput={(e) => setC(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button class="btn small" disabled={!c().trim()} onClick={send}>
            Gönder
          </button>
        </div>
      </div>
    </article>
  );
}
