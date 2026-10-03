// Üst çubuğun en solunda, sadece yöneticiye: üye / PRO / yarışta / bekleyen destek sayıları
// ve tıklayınca açılan canlı üye listesi (kim çevrimiçi, kim hangi oyunda, hangi pistte).

import { t } from "@/sdk/i18n";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { isAdmin } from "@/cloud/account";
import { avatarUrl } from "@/cloud/profile";
import { initialOf } from "@/cloud/social";
import { MEMBERS_PAGE, adminMembersLive, adminOverview, refreshAdminOverview, useAdminOverview, type LiveMember, type MemberFilter } from "@/cloud/adminOverview";
import { go } from "../ui";
import * as I from "../icons";
import { SimBadge } from "./Profile";
import { openAdmin } from "./adminFocus";
import { relTime } from "../pages/CommunityKit";
import "./adminTop.css";

const [panel, setPanel] = createSignal<MemberFilter | null>(null);

const big = (n: number) => (n > 9999 ? `${Math.floor(n / 1000)}b` : String(n));

export function AdminTopStats() {
  useAdminOverview();
  const o = adminOverview;
  const open = (f: MemberFilter) => setPanel(f);
  return (
    <Show when={isAdmin() && o()}>
      <div class="ats">
        <button class="ats-chip" aria-label={t("Üyeler")} onClick={() => open("all")}>
          <I.Users />
          <b data-no-i18n>{big(o()!.members)}</b>
          <span class="ats-lbl">üye</span>
          <span class="ats-tip" role="tooltip">
            <span class="ats-tip-row">
              <i class="ats-dot on" />
              {t("{0} çevrimiçi", o()!.online)}
            </span>
            <span class="ats-tip-row">
              <i class="ats-dot" />
              {t("{0} çevrimdışı", o()!.offline)}
            </span>
            <small>Tüm üyeleri görmek için tıkla</small>
          </span>
        </button>
        <button class="ats-chip pro" title={o()!.trial > 0 ? t("{0} PRO üye · {1} deneme", o()!.pro, o()!.trial) : t("{0} PRO üye", o()!.pro)} onClick={() => open("pro")}>
          <I.Star />
          <b data-no-i18n>{big(o()!.pro)}</b>
          <span class="ats-lbl" data-no-i18n>PRO</span>
        </button>
        <button class="ats-chip race" classList={{ live: o()!.racing > 0 }} title={t("Şu an {0} kişi yarışta", o()!.racing)} onClick={() => open("racing")}>
          <I.Flag />
          <b data-no-i18n>{big(o()!.racing)}</b>
          <span class="ats-lbl">yarışta</span>
        </button>
        <Show when={o()!.support_open > 0}>
          <button class="ats-chip sup" title={t("{0} destek talebi yanıt bekliyor", o()!.support_open)} onClick={() => go("admin", "support")}>
            <I.LifeBuoy />
            <b data-no-i18n>{big(o()!.support_open)}</b>
            <span class="ats-lbl">destek</span>
          </button>
        </Show>
      </div>
      <Show when={panel()}>
        <MembersPanel initial={panel()!} onClose={() => setPanel(null)} />
      </Show>
    </Show>
  );
}

const FILTERS: [MemberFilter, string][] = [
  ["all", "Tümü"],
  ["online", "Çevrimiçi"],
  ["racing", "Yarışta"],
  ["pro", "PRO"],
  ["offline", "Çevrimdışı"],
];

function MembersPanel(props: { initial: MemberFilter; onClose: () => void }) {
  const [filter, setFilter] = createSignal<MemberFilter>(props.initial);
  const [q, setQ] = createSignal("");
  const [rows, setRows] = createSignal<LiveMember[]>([]);
  const [more, setMore] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [err, setErr] = createSignal("");
  let seq = 0;

  const load = async (append = false, quiet = false) => {
    const my = ++seq;
    if (!quiet) setLoading(true);
    setErr("");
    try {
      const r = (await adminMembersLive(filter(), q().trim(), append ? rows().length : 0)) ?? [];
      if (my !== seq) return;
      setRows(append ? [...rows(), ...r] : r);
      setMore(r.length === MEMBERS_PAGE);
    } catch (e) {
      if (my === seq) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === seq) setLoading(false);
    }
  };

  let st: number | undefined;
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(st);
    st = window.setTimeout(() => void load(), 300);
  };
  const count = (f: MemberFilter) => {
    const o = adminOverview();
    if (!o) return null;
    return f === "all" ? o.members : f === "online" ? o.online : f === "racing" ? o.racing : f === "pro" ? o.pro : o.offline;
  };

  onMount(() => {
    void refreshAdminOverview();
    void load();
    // Panel açıkken canlı durum 20 sn'de bir tazelenir (ilk sayfa; "daha fazla" yüklendiyse dokunmaz)
    const iv = window.setInterval(() => {
      if (document.hidden || rows().length > MEMBERS_PAGE) return;
      void refreshAdminOverview();
      void load(false, true);
    }, 20_000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    onCleanup(() => {
      clearInterval(iv);
      clearTimeout(st);
      window.removeEventListener("keydown", onKey);
    });
  });

  const openMember = (m: LiveMember) => {
    props.onClose();
    openAdmin({ sub: "members", q: m.email || m.display_name, id: m.id });
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal ats-modal">
        <header>
          <h3>
            <I.Users /> Üyeler
          </h3>
          <div class="ats-head-btns">
            <button class="btn ghost small" title="Yenile" onClick={() => (void refreshAdminOverview(), void load())}>
              <span classList={{ spin: loading() }} style={{ display: "inline-flex" }}>
                <I.RefreshCw />
              </span>
            </button>
            <button class="btn ghost small" onClick={props.onClose}>
              Kapat
            </button>
          </div>
        </header>
        <div class="cm-tabs ats-tabs">
          <For each={FILTERS}>
            {([id, label]) => (
              <button classList={{ on: filter() === id }} onClick={() => (setFilter(id), void load())}>
                {id === "pro" ? <span data-no-i18n>PRO</span> : label}
                <Show when={count(id) !== null}>
                  <i data-no-i18n>{count(id)}</i>
                </Show>
              </button>
            )}
          </For>
        </div>
        <div class="ats-search">
          <I.Search />
          <input class="input" placeholder="Ad, e-posta ya da iRacing adı" value={q()} onInput={(e) => onSearch(e.currentTarget.value)} />
        </div>
        <Show when={err()}>
          <p class="ats-err" data-no-i18n>
            {err()}
          </p>
        </Show>
        <div class="ats-list">
          <For each={rows()}>
            {(m) => (
              <button class="ats-row" classList={{ racing: m.racing, online: m.online }} title="Yönetim › Üyeler'de aç" onClick={() => openMember(m)}>
                <span class="fav ats-av" style={{ "--sz": "34px" }}>
                  <Show when={m.avatar_path} fallback={<span data-no-i18n>{initialOf(m.display_name || m.email || "?")}</span>}>
                    <img src={avatarUrl(m.avatar_path)} alt="" loading="lazy" />
                  </Show>
                  <i class="ats-pres" classList={{ on: m.online, race: m.racing }} />
                </span>
                <span class="ats-main">
                  <span class="ats-name">
                    <b data-no-i18n>{m.display_name || "(adsız)"}</b>
                    <Show when={m.is_pro}>
                      <span class="ats-star" title={(m.pro_source === "trial" ? t("PRO (deneme)") : "PRO") + (m.pro_until ? ` · ${new Date(m.pro_until).toLocaleDateString()}` : "")}>
                        <I.Star />
                      </span>
                    </Show>
                    <Show when={m.is_admin}>
                      <span class="admin-badge">yönetici</span>
                    </Show>
                  </span>
                  <small class="ats-mail" data-no-i18n>
                    {m.email}
                  </small>
                </span>
                <span class="ats-state">
                  <Show
                    when={m.racing}
                    fallback={
                      <Show when={m.online} fallback={<small class="muted">{m.last_seen ? t("son görülme: {0}", relTime(m.last_seen)) : "hiç görülmedi"}</small>}>
                        <span class="ats-on">
                          <SimBadge sim={m.sim} />
                          <span>Çevrimiçi</span>
                          <Show when={m.invisible}>
                            <small class="muted" title="Bu üye &quot;Çevrimdışı&quot; durumunu seçti: diğer üyeler onu çevrimdışı görür">
                              · {t("gizleniyor")}
                            </small>
                          </Show>
                        </span>
                      </Show>
                    }
                  >
                    <span class="ats-race">
                      <I.Flag />
                      <SimBadge sim={m.sim} />
                      <Show when={m.session}>
                        <em data-no-i18n>{m.session}</em>
                      </Show>
                    </span>
                    <small class="ats-where" data-no-i18n>
                      {[m.track, m.car].filter(Boolean).join(" · ") || "—"}
                    </small>
                  </Show>
                </span>
              </button>
            )}
          </For>
          <Show when={!rows().length && !loading() && !err()}>
            <p class="muted ats-empty">{filter() === "racing" ? "Şu an yarışan kimse yok." : "Üye bulunamadı."}</p>
          </Show>
          <Show when={!rows().length && loading()}>
            <p class="muted ats-empty">Yükleniyor…</p>
          </Show>
          <Show when={more()}>
            <button class="btn ghost small ats-more" disabled={loading()} onClick={() => void load(true)}>
              Daha fazla göster
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
