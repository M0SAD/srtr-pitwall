// Üye profili (sunucu c31): profil fotoğrafı, kısa tanıtım, sosyal bağlantılar (kendi çizdiğimiz tek renk simgeler),
// sim adları ve takımlar. Ziyaretçi görünümü (ProfileCard / ProfileDialog), arkadaş listesindeki oyun rozeti (SimBadge)
// ve Hesap sayfasındaki düzenleyici (PublicProfilePanel).

import { For, Show, createEffect, createResource, createSignal, on, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { localeTag, t } from "@/sdk/i18n";
import { session } from "@/cloud/supabase";
import { friendLook, friendRequest, initialOf } from "@/cloud/social";
import { F, proLocked } from "@/sdk/proFeatures";
import { ProLockNote, ProLockTag } from "./ProLock";
import {
  MAX_BIO,
  MAX_SOCIALS,
  SOCIAL_TYPES,
  avatarUrl,
  guessSocialType,
  iracingCategory,
  loadIracingPublic,
  publicProfile,
  removeAvatar,
  savePublicProfile,
  setIracingPublic,
  socialMeta,
  socialUrlOk,
  uploadAvatar,
  type IracingInfo,
  type PublicProfile,
  type SocialLink,
  type SocialType,
} from "@/cloud/profile";
import { teamLogo } from "@/cloud/teams";
import { openUrl } from "../ui";
import { Flag } from "@/sdk/Flag";
import * as I from "../icons";
import "../profile.css";

// ---------------------------------------------------------------------------
// Simgeler: marka logosu değil, tanınır basit çizgi simgeler (24x24, çizgi rengi currentColor)
// ---------------------------------------------------------------------------
const GLYPHS: Record<SocialType, string> = {
  youtube: `<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.4v5.2l4.5-2.6z" fill="currentColor" stroke="none"/>`,
  twitch: `<path d="M4.5 3.5h15v10l-4 4h-3.5l-3 3v-3h-4.5z"/><path d="M11 8v4M15 8v4"/>`,
  kick: `<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 7.5v9M15 7.5l-4.5 4.5 4.5 4.5"/>`,
  instagram: `<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/>`,
  x: `<path d="M4.5 4.5h4l11 15h-4z"/><path d="M19.5 4.5l-6.2 6.8M4.5 19.5l6.2-6.8"/>`,
  tiktok: `<path d="M13.5 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8"/><path d="M13.5 3.5c.4 2.7 2.4 4.6 5.2 4.8"/>`,
  facebook: `<circle cx="12" cy="12" r="9"/><path d="M13 21v-8.2h2.6M13 21v-11c0-1.6.8-2.4 2.4-2.4h1.1M10.3 12.8H13"/>`,
  discord: `<path d="M7.5 6.5c1.4-.7 2.9-1 4.5-1s3.1.3 4.5 1c1.6 2.3 2.5 5 2.5 8.6-1.3 1.1-2.8 1.9-4.3 2.4l-.9-1.6M7.5 6.5C5.9 8.8 5 11.5 5 15.1c1.3 1.1 2.8 1.9 4.3 2.4l.9-1.6"/><path d="M8.8 15.2c2.1 1 4.3 1 6.4 0"/><circle cx="9.6" cy="11.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.4" cy="11.8" r="1.2" fill="currentColor" stroke="none"/>`,
  steam: `<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.6"/><circle cx="9" cy="15" r="1.9"/><path d="M10.4 13.7l2.8-2.6"/>`,
  website: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z"/>`,
  other: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
};

export function SocialIcon(props: { type: string; size?: number }) {
  return (
    <svg
      class="soc-ico"
      viewBox="0 0 24 24"
      width={props.size ?? 18}
      height={props.size ?? 18}
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      innerHTML={GLYPHS[socialMeta(props.type).id]}
    />
  );
}

/** Adresin kısa hali: "youtube.com/@kanal" */
function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    const s = u.hostname.replace(/^www\./, "") + path;
    return s.length > 34 ? s.slice(0, 33) + "…" : s;
  } catch {
    return url;
  }
}

/** Sosyal bağlantılar: tıklayınca tarayıcıda açılır */
export function SocialLinks(props: { links: SocialLink[]; compact?: boolean }) {
  return (
    <div class="soc-links" classList={{ compact: !!props.compact }}>
      <For each={props.links}>
        {(l) => {
          const m = socialMeta(l.type);
          return (
            <button class="soc-link" style={{ "--brand": m.color }} title={`${m.label} · ${l.url}`} onClick={() => openUrl(l.url)}>
              <SocialIcon type={l.type} size={props.compact ? 16 : 17} />
              <Show when={!props.compact}>
                <span data-no-i18n>{shortUrl(l.url)}</span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oyun rozeti (arkadaş listesi)
// ---------------------------------------------------------------------------
export const SIM_SHORT: Record<string, string> = { iracing: "iRacing", acc: "ACC", ac: "AC", lmu: "LMU", rf2: "rF2", ams2: "AMS2" };
const SIM_LONG: Record<string, string> = {
  iracing: "iRacing",
  acc: "Assetto Corsa Competizione",
  ac: "Assetto Corsa",
  lmu: "Le Mans Ultimate",
  rf2: "rFactor 2",
  ams2: "Automobilista 2",
};

export function SimBadge(props: { sim?: string | null }) {
  return (
    <Show when={props.sim && SIM_SHORT[props.sim]}>
      <span class={`sim-badge s-${props.sim}`} title={t("Şu an {0} oynuyor", SIM_LONG[props.sim!])} data-no-i18n>
        {SIM_SHORT[props.sim!]}
      </span>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Profil kartı (ziyaretçi görünümü)
// ---------------------------------------------------------------------------

/** Büyük avatar: arkadaşa özel fotoğraf (PRO) > üyenin kendi fotoğrafı > baş harf */
export function ProfileAvatar(props: { id: string; name: string; path?: string | null; size?: number }) {
  const look = () => friendLook(props.id);
  const custom = () => {
    const l = look();
    // friendLook kendi fotoğrafı önbellekten verir; önbellek henüz dolmadıysa profildeki yolu kullan
    return l.photo || avatarUrl(props.path);
  };
  return (
    <span class="fav pf-av" style={{ "--sz": `${props.size ?? 72}px`, "--fc": look().color }}>
      <Show when={custom()} fallback={<span data-no-i18n>{initialOf(props.name)}</span>}>
        <img src={custom()} alt="" />
      </Show>
    </span>
  );
}

function FriendAction(props: { p: PublicProfile }) {
  const [st, setSt] = createSignal(props.p.friend);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  const add = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await friendRequest(props.p.id, st() === "pending_in");
      setSt(r === "accepted" ? "accepted" : "pending_out");
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show when={session() && !props.p.is_me}>
      <Show
        when={st() !== "accepted" && st() !== "pending_out"}
        fallback={<span class="tele-tag" classList={{ ok: st() === "accepted" }}>{st() === "accepted" ? "Arkadaş" : "İstek gönderildi"}</span>}
      >
        <button
          class="btn small"
          disabled={busy() || (st() !== "pending_in" && proLocked(F.friendAdd))}
          title={err() || (st() !== "pending_in" && proLocked(F.friendAdd) ? "Arkadaş eklemek PRO üyelere özel" : undefined)}
          onClick={add}
        >
          <I.UserPlus /> {st() === "pending_in" ? "İsteği kabul et" : "Arkadaş ekle"}
          <Show when={st() !== "pending_in"}>
            <ProLockTag feature={F.friendAdd} />
          </Show>
        </button>
      </Show>
    </Show>
  );
}

export function ProfileCard(props: {
  id: string;
  /** Telemetri sayfasına git (verilirse "Telemetri" düğmesi görünür) */
  onTelemetry?: (id: string) => void;
  /** Takıma tıklayınca */
  onTeam?: (id: string) => void;
  /** Kartın sağ üstüne ek düğmeler */
  actions?: JSX.Element;
  /** Yeniden yüklemek için değişen anahtar */
  version?: number;
}) {
  const [data] = createResource(
    () => [props.id, props.version ?? 0] as const,
    ([id]) => publicProfile(id),
  );
  return (
    <div class="pf-card">
      <Show when={data.error}>
        <p class="error small">{String((data.error as Error)?.message ?? data.error)}</p>
      </Show>
      <Show when={data.loading && !data()}>
        <p class="muted small">Yükleniyor…</p>
      </Show>
      <Show when={data()}>
        {(p) => (
          <>
            <div class="pf-head">
              <ProfileAvatar id={p().id} name={p().display_name} path={p().avatar_path} />
              <div class="pf-who">
                <h3>
                  <span data-no-i18n>{p().display_name || "?"}</span>
                  <Show when={p().is_pro}>
                    <span class="pro-badge" style={{ cursor: "default" }}>
                      PRO
                    </span>
                  </Show>
                </h3>
                <Show when={p().iracing_name}>
                  <small class="pf-ir" data-no-i18n>
                    <b>iRacing</b> {p().iracing_name}
                  </small>
                </Show>
                <Show when={p().iracing}>{(ir) => <IracingBadges ir={ir()} />}</Show>
                <Show when={p().sims.filter((s) => s.sim !== "iracing" || s.sim_name !== p().iracing_name).length > 0}>
                  <div class="pf-sims">
                    <For each={p().sims.filter((s) => s.sim !== "iracing" || s.sim_name !== p().iracing_name)}>
                      {(s) => (
                        <span class="tele-tag" data-no-i18n>
                          <b>{SIM_SHORT[s.sim] ?? s.sim}</b> {s.sim_name}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <small class="muted">{t("Üyelik: {0}", new Date(p().created_at).toLocaleDateString(localeTag(), { month: "long", year: "numeric" }))}</small>
              </div>
              <div class="pf-acts">
                <FriendAction p={p()} />
                <Show when={props.onTelemetry}>
                  <button class="btn ghost small" onClick={() => props.onTelemetry!(p().id)}>
                    <I.Gauge /> Telemetri
                  </button>
                </Show>
                {props.actions}
              </div>
            </div>
            <Show when={p().bio}>
              <p class="pf-bio" data-no-i18n>
                {p().bio}
              </p>
            </Show>
            <Show when={p().socials.length > 0}>
              <SocialLinks links={p().socials} />
            </Show>
            <Show when={p().teams.length > 0}>
              <div class="pf-teams">
                <For each={p().teams}>
                  {(tm) => (
                    <button
                      class="pf-team"
                      style={{ "--tc": tm.color }}
                      disabled={!props.onTeam}
                      title={props.onTeam ? "Takım sayfası" : undefined}
                      onClick={() => props.onTeam?.(tm.id)}
                    >
                      <Show when={tm.logo_path} fallback={<i class="pf-team-dot" />}>
                        <img src={teamLogo(tm.logo_path)} alt="" />
                      </Show>
                      <b data-no-i18n>{tm.tag}</b>
                      <span data-no-i18n>{tm.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={!p().bio && !p().socials.length && !p().teams.length && p().is_me}>
              <p class="muted small">Profiline kısa bir tanıtım ve sosyal bağlantılar eklemek için Hesap sayfasına git.</p>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

/** iRacing lisans rozeti (sınıf rengi + SR), iRating, ülke bayrağı ve son güncelleme (SQL c56) */
export function IracingBadges(props: { ir: IracingInfo }) {
  const dark = () => {
    const c = (props.ir.lic_color || "").replace("#", "");
    if (c.length !== 6) return false;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    return r * 0.299 + g * 0.587 + b * 0.114 > 150;
  };
  return (
    <div class="pf-irx">
      <Show when={props.ir.country}>
        <span class="pf-irx-flag" data-no-i18n>
          <Flag code={props.ir.country} />
        </span>
      </Show>
      <span class="pf-lic" classList={{ dark: dark() }} style={{ background: props.ir.lic_color || "#666" }} title="iRacing lisansı ve Safety Rating" data-no-i18n>
        {props.ir.license}
      </span>
      <span class="pf-irating" title="iRating" data-no-i18n>
        <b>iR</b> {props.ir.irating.toLocaleString(localeTag())}
      </span>
      <Show when={props.ir.category}>
        <span class="muted small" data-no-i18n>
          {iracingCategory(props.ir.category)}
        </span>
      </Show>
      <small class="muted">{t("güncellendi: {0}", new Date(props.ir.updated_at).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" }))}</small>
      <Show when={!props.ir.public}>
        <small class="muted">(sadece sen görüyorsun)</small>
      </Show>
    </div>
  );
}

/** Hesap → Herkese açık profil: "iRacing bilgilerimi profilimde göster" (profiles.ir_public; c56 yoksa gizli) */
function IracingPublicToggle(props: { ir: IracingInfo | null | undefined; onChange: (on: boolean) => void }) {
  const [on, setOn] = createSignal<boolean | null>(null);
  const [err, setErr] = createSignal("");
  void loadIracingPublic().then(setOn);
  return (
    <Show when={on() !== null}>
      <div class="pf-irx-set">
        <div>
          <b>iRacing bilgilerimi profilimde göster</b>
          <small class="muted">
            iRating, lisans (Safety Rating) ve ülken; iRacing'de bu programla sürdükçe kendiliğinden güncellenir. Açıkken profilinde ve demo
            modundaki adının yanında görünür.
          </small>
          <Show when={props.ir} fallback={<small class="muted">Henüz bilgi yok: giriş yapmış halde iRacing'de bir oturuma gir.</small>}>
            {(ir) => <IracingBadges ir={{ ...ir(), public: true }} />}
          </Show>
          <Show when={err()}>
            <small class="error">{err()}</small>
          </Show>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={!!on()}
            onChange={(e) => {
              const v = e.currentTarget.checked;
              const prev = on();
              setOn(v);
              setErr("");
              setIracingPublic(v)
                .then(() => props.onChange(v))
                .catch((x) => {
                  setOn(prev);
                  setErr(String(x?.message ?? x));
                });
            }}
          />
          <i />
        </label>
      </div>
    </Show>
  );
}

/** Profil penceresi (arkadaş listesi, takım üyeleri) */
export function ProfileDialog(props: { id: string; onClose: () => void; onTelemetry?: (id: string) => void; onTeam?: (id: string) => void }) {
  return (
    <Portal>
      <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
        <div class="modal pf-modal" onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
          <header>
            <h3>Profil</h3>
            <button class="icon-btn" title="Kapat" onClick={props.onClose}>
              <I.X />
            </button>
          </header>
          <ProfileCard
            id={props.id}
            onTelemetry={props.onTelemetry && ((id) => (props.onClose(), props.onTelemetry!(id)))}
            onTeam={props.onTeam && ((id) => (props.onClose(), props.onTeam!(id)))}
          />
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Hesap sayfası: fotoğraf, tanıtım ve bağlantıları düzenle
// ---------------------------------------------------------------------------

export function PublicProfilePanel() {
  const me = () => session()?.user.id ?? "";
  const [data, { mutate }] = createResource(
    () => me() || null,
    (id) => publicProfile(id),
  );
  const [bio, setBio] = createSignal("");
  const [links, setLinks] = createSignal<SocialLink[]>([]);
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = createSignal(false);
  createEffect(
    on(data, (p) => {
      if (!p || dirty()) return;
      setBio(p.bio ?? "");
      setLinks((p.socials ?? []).map((x) => ({ ...x })));
    }),
  );
  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
    setMsg(null);
  };
  const setLink = (i: number, patch: Partial<SocialLink>) => edit(() => setLinks(links().map((l, j) => (j === i ? { ...l, ...patch } : l))));
  const bad = (l: SocialLink) => l.url.trim() !== "" && !socialUrlOk(l.url);

  const save = async () => {
    const list = links()
      .map((l) => ({ type: l.type, url: l.url.trim() }))
      .filter((l) => l.url);
    if (list.some((l) => !socialUrlOk(l.url))) return setMsg({ ok: false, text: t("Bağlantılar https:// ile başlamalı ve en çok 200 karakter olmalı.") });
    setBusy(true);
    try {
      const r = await savePublicProfile(bio().trim(), list);
      setBio(r?.bio ?? bio().trim());
      setLinks(r?.socials ?? list);
      setDirty(false);
      setMsg({ ok: true, text: t("Kaydedildi.") });
      const p = data();
      if (p) mutate({ ...p, bio: r?.bio ?? bio(), socials: r?.socials ?? list });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  // Fotoğraf
  let file!: HTMLInputElement;
  const [photoBusy, setPhotoBusy] = createSignal(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    setMsg(null);
    try {
      const path = await uploadAvatar(f);
      const p = data();
      if (p) mutate({ ...p, avatar_path: path });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setPhotoBusy(false);
      file.value = "";
    }
  };
  const drop = async () => {
    setPhotoBusy(true);
    try {
      await removeAvatar();
      const p = data();
      if (p) mutate({ ...p, avatar_path: null });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <section class="panel pf-edit">
      <h3>Herkese açık profil</h3>
      <p class="muted small">
        Fotoğrafın, tanıtımın ve bağlantıların arkadaş listesinde, takım sayfalarında, Yarışçılar dizininde ve sitedeki profilinde görünür.
        iRacing adın ve simlerdeki adların kendiliğinden eklenir.
      </p>
      <Show when={data.error && !data()}>
        <p class="error small">{String((data.error as Error)?.message ?? data.error)}</p>
      </Show>
      <Show when={data()} fallback={<Show when={!data.error}><p class="muted small">Yükleniyor…</p></Show>}>
        {(p) => (
          <>
            <div class="pf-photo">
              <span class="fav pf-av" style={{ "--sz": "72px", "--fc": friendLook(p().id).color }}>
                <Show when={p().avatar_path} fallback={<span data-no-i18n>{initialOf(p().display_name)}</span>}>
                  <img src={avatarUrl(p().avatar_path)} alt="" />
                </Show>
              </span>
              <div>
                <b>Profil fotoğrafı</b>
                <small class="muted">JPEG, PNG ya da WebP. Kare olarak kırpılır ve küçültülür.</small>
                <div class="btns">
                  <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
                  <button class="btn small" disabled={photoBusy() || proLocked(F.avatar)} onClick={() => file.click()}>
                    <I.ImagePlus /> {photoBusy() ? "Yükleniyor…" : p().avatar_path ? "Değiştir" : "Fotoğraf yükle"}
                    <ProLockTag feature={F.avatar} />
                  </button>
                  <Show when={p().avatar_path}>
                    <button class="btn ghost small" disabled={photoBusy()} onClick={drop}>
                      <I.Trash /> Kaldır
                    </button>
                  </Show>
                </div>
                <ProLockNote feature={F.avatar} text="Profil fotoğrafı yüklemek PRO üyelere özel." />
              </div>
            </div>

            <ProLockNote feature={F.profilePublic} text="Tanıtım ve sosyal bağlantılar PRO üyelere özel; mevcutları silebilirsin." />
            <label class="pf-label">
              <span>Kısa tanıtım</span>
              <small class="muted">{t("{0}/{1}", bio().length, MAX_BIO)}</small>
            </label>
            <textarea
              class="input pf-bio-input"
              rows={3}
              maxLength={MAX_BIO}
              placeholder="Kendinden kısaca bahset: hangi seride yarışıyorsun, takımın, yayın saatlerin…"
              value={bio()}
              onInput={(e) => edit(() => setBio(e.currentTarget.value))}
            />

            <label class="pf-label">
              <span>Sosyal bağlantılar</span>
              <small class="muted">{t("{0}/{1}", links().length, MAX_SOCIALS)}</small>
            </label>
            <div class="pf-links">
              <For each={links()}>
                {(l, i) => (
                  <div class="pf-link" classList={{ bad: bad(l) }} style={{ "--brand": socialMeta(l.type).color }}>
                    <span class="pf-link-ico">
                      <SocialIcon type={l.type} />
                    </span>
                    <select value={l.type} onChange={(e) => setLink(i(), { type: e.currentTarget.value as SocialType })}>
                      <For each={SOCIAL_TYPES}>{(s) => <option value={s.id}>{s.label}</option>}</For>
                    </select>
                    <input
                      class="input"
                      type="url"
                      maxLength={200}
                      placeholder={socialMeta(l.type).hint}
                      value={l.url}
                      onInput={(e) => {
                        const url = e.currentTarget.value;
                        const g = guessSocialType(url);
                        setLink(i(), g && (l.type === "website" || l.type === "other") ? { url, type: g } : { url });
                      }}
                    />
                    <button class="icon-btn" title="Kaldır" onClick={() => edit(() => setLinks(links().filter((_, j) => j !== i())))}>
                      <I.X />
                    </button>
                  </div>
                )}
              </For>
              <Show when={links().length < MAX_SOCIALS}>
                <button class="btn ghost small pf-add" onClick={() => edit(() => setLinks([...links(), { type: "website", url: "" }]))}>
                  <I.Plus /> Bağlantı ekle
                </button>
              </Show>
            </div>
            <p class="muted small">Sadece https:// ile başlayan adresler. Bağlantı türü adresten kendiliğinden seçilir.</p>

            <IracingPublicToggle
              ir={p().iracing}
              onChange={(v) => {
                const cur = data();
                if (cur?.iracing) mutate({ ...cur, iracing: { ...cur.iracing, public: v } });
              }}
            />

            <div class="btns pf-save">
              <button class="btn primary" disabled={busy() || !dirty()} onClick={save}>
                {busy() ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button class="btn ghost" onClick={() => setPreview(true)}>
                <I.Eye /> Başkaları nasıl görüyor
              </button>
              <Show when={msg()}>
                <span class={msg()!.ok ? "success small" : "error small"}>{msg()!.text}</span>
              </Show>
            </div>
            <Show when={preview()}>
              <ProfileDialog id={p().id} onClose={() => setPreview(false)} />
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
