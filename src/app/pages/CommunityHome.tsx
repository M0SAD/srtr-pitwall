// Topluluk ana sayfası: seçilen dönemin (hafta / ay / yıl / tüm zamanlar) en çok görüntülenen görselleri,
// en çok kullanılan düzenleri, en çok puan ve yorum alanları, en çok indirilen temaları ve genel istatistikler.

import { For, Show, createResource, createSignal, type JSX } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { communityStats, searchThemes, topLayouts, topShots, type LayoutTop, type Period } from "@/cloud/community";
import type { SharedShot } from "@/cloud/shots";
import { LayoutCard, LayoutDetail, LoginWall } from "./CommunityPage";
import { SharedShotDetail, ShotCard } from "./CommunityShots";
import { ThemeCard } from "./CommunityThemes";
import { Tabs, compact } from "./CommunityKit";
import { go } from "../ui";
import * as I from "../icons";

const PERIOD_KEY = "pitwall.communityPeriod";
const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Bu hafta" },
  { id: "month", label: "Bu ay" },
  { id: "year", label: "Bu yıl" },
  { id: "all", label: "Tüm zamanlar" },
];

function readPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY) as Period | null;
    return v && PERIODS.some((p) => p.id === v) ? v : "month";
  } catch {
    return "month";
  }
}

const SUB: Record<Period, string> = {
  week: "Son 7 günün öne çıkanları",
  month: "Bu ayın öne çıkanları",
  year: "Bu yılın öne çıkanları",
  all: "Tüm zamanların öne çıkanları",
};

export function CommunityHome() {
  const [period, setPeriodRaw] = createSignal<Period>(readPeriod());
  const setPeriod = (p: Period) => {
    setPeriodRaw(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* yok */
    }
  };
  const [version, setVersion] = createSignal(0);
  const [openShot, setOpenShot] = createSignal<SharedShot | null>(null);
  const [openLayout, setOpenLayout] = createSignal<LayoutTop | null>(null);

  const [stats] = createResource(() => (session() ? version() + 1 : null), () => communityStats());

  if (!cloudEnabled) {
    return (
      <div class="page narrow">
        <section class="panel">
          <h3>Topluluk kapalı</h3>
          <p class="muted">Topluluk için bulut bağlantısı gerekir (bkz. Hesap sayfası).</p>
        </section>
      </div>
    );
  }

  const key = () => (session() ? { p: period(), v: version() } : null);

  return (
    <Show when={session()} fallback={<LoginWall what="Topluluk" />}>
      <div class="page cx-page ch">
        <section class="cx-hero home">
          <div class="cx-hero-ic">
            <I.Users />
          </div>
          <div class="cx-hero-txt">
            <span class="cx-kicker">SRTR Pitwall</span>
            <h2>Topluluk</h2>
            <p>{SUB[period()]}. Düzenleri, yayın sahnelerini, temaları ve ekran görüntülerini keşfet.</p>
          </div>
          <div class="cx-hero-act">
            <Tabs<Period> value={period()} onChange={setPeriod} tabs={PERIODS} />
          </div>
        </section>

        <div class="cx-statgrid">
          <Stat icon={<I.Camera />} n={stats()?.shots} label="Görsel" onClick={() => go("community", "shots")} />
          <Stat icon={<I.LayoutDashboard />} n={stats()?.layouts} label="Düzen" onClick={() => go("community", "layouts")} />
          <Stat icon={<I.Radio />} n={stats()?.streams} label="Yayın düzeni" onClick={() => go("community", "stream")} />
          <Stat icon={<I.Palette />} n={stats()?.themes} label="Tema" onClick={() => go("community", "themes")} />
        </div>
        <div class="cx-statgrid small">
          <Stat icon={<I.Download />} n={stats()?.downloads} label="İndirme" />
          <Stat icon={<I.Eye />} n={stats()?.views} label="Görüntülenme" />
          <Stat icon={<I.MessageCircle />} n={stats()?.comments} label="Yorum" />
          <Stat icon={<I.Star />} n={stats()?.ratings} label="Puan" />
          <Stat icon={<I.Users />} n={stats()?.members} label="Üye" />
        </div>

        <ShotRow title="En çok görüntülenen görseller" icon={<I.Eye />} k={key} by="views" onOpen={setOpenShot} more={() => go("community", "shots")} />
        <LayoutRow title="En çok kullanılan düzenler" icon={<I.Download />} k={key} by="downloads" kind="layout" onOpen={setOpenLayout} more={() => go("community", "layouts")} />
        <LayoutRow title="En çok kullanılan yayın düzenleri" icon={<I.Radio />} k={key} by="downloads" kind="stream" onOpen={setOpenLayout} more={() => go("community", "stream")} />
        <Tabbed
          title="En çok puan alanlar"
          icon={<I.Trophy />}
          tabs={[
            { id: "shots", label: "Görseller", render: () => <ShotRow bare k={key} by="rating" onOpen={setOpenShot} /> },
            { id: "layouts", label: "Düzenler", render: () => <LayoutRow bare k={key} by="rating" kind="layout" onOpen={setOpenLayout} /> },
            { id: "stream", label: "Yayın düzenleri", render: () => <LayoutRow bare k={key} by="rating" kind="stream" onOpen={setOpenLayout} /> },
          ]}
        />
        <Tabbed
          title="En çok yorum alanlar"
          icon={<I.MessageCircle />}
          tabs={[
            { id: "shots", label: "Görseller", render: () => <ShotRow bare k={key} by="comments" onOpen={setOpenShot} /> },
            { id: "layouts", label: "Düzenler", render: () => <LayoutRow bare k={key} by="comments" kind="layout" onOpen={setOpenLayout} /> },
            { id: "stream", label: "Yayın düzenleri", render: () => <LayoutRow bare k={key} by="comments" kind="stream" onOpen={setOpenLayout} /> },
          ]}
        />
        <ThemeRow k={key} />

        <Show when={openShot()}>
          <SharedShotDetail s={openShot()!} onClose={() => setOpenShot(null)} onChanged={() => setVersion(version() + 1)} />
        </Show>
        <Show when={openLayout()}>
          <LayoutDetail
            l={openLayout()!}
            kind={openLayout()!.kind ?? "layout"}
            onClose={() => setOpenLayout(null)}
            onChanged={() => setVersion(version() + 1)}
          />
        </Show>
      </div>
    </Show>
  );
}

function Stat(p: { icon: JSX.Element; n?: number; label: string; onClick?: () => void }) {
  return (
    <button class="cx-stat" classList={{ go: !!p.onClick }} onClick={() => p.onClick?.()} disabled={!p.onClick}>
      <span class="cx-stat-ic">{p.icon}</span>
      <span>
        <b data-no-i18n title={p.n === undefined ? "" : Number(p.n).toLocaleString()}>
          {p.n === undefined ? "…" : compact(p.n)}
        </b>
        <small>{p.label}</small>
      </span>
      <Show when={p.onClick}>
        <I.ChevronRight />
      </Show>
    </button>
  );
}

function Section(p: { title: string; icon: JSX.Element; more?: () => void; tools?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="cx-sec">
      <header>
        <h4>
          <span class="cx-sec-ic">{p.icon}</span> {p.title}
        </h4>
        <span class="lt-sp" />
        {p.tools}
        <Show when={p.more}>
          <button class="cx-more-link" onClick={() => p.more!()}>
            Tümünü gör <I.ChevronRight />
          </button>
        </Show>
      </header>
      {p.children}
    </section>
  );
}

function Tabbed(p: { title: string; icon: JSX.Element; tabs: { id: string; label: string; render: () => JSX.Element }[] }) {
  const [tab, setTab] = createSignal(p.tabs[0].id);
  return (
    <Section title={p.title} icon={p.icon} tools={<Tabs value={tab()} onChange={setTab} tabs={p.tabs} />}>
      <For each={p.tabs}>{(t) => <Show when={tab() === t.id}>{t.render()}</Show>}</For>
    </Section>
  );
}

function Empty() {
  return (
    <div class="cx-row-empty">
      <I.Search /> Bu dönemde henüz bir şey yok. Dönemi genişletmeyi dene.
    </div>
  );
}

function RowSkel(p: { n?: number; cls?: string }) {
  return (
    <div class={`cx-row ${p.cls ?? ""}`}>
      <For each={Array.from({ length: p.n ?? 4 })}>
        {() => (
          <div class="cx-card cx-skel">
            <div class="cx-cover" />
            <div class="cx-body">
              <span class="sk w70" />
              <span class="sk w45" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function ShotRow(p: {
  title?: string;
  icon?: JSX.Element;
  bare?: boolean;
  k: () => { p: Period; v: number } | null;
  by: "views" | "rating" | "comments";
  onOpen: (s: SharedShot) => void;
  more?: () => void;
}) {
  const [list] = createResource(p.k, (k) => topShots(k.p, p.by, 8).catch(() => [] as SharedShot[]));
  const body = (
    <Show when={list.latest || !list.loading} fallback={<RowSkel cls="shots" />}>
      <Show when={(list.latest ?? []).length > 0} fallback={<Empty />}>
        <div class="cx-row shots">
          <For each={list.latest ?? []}>{(s, i) => <ShotCard s={s} rank={i() + 1} onOpen={() => p.onOpen(s)} />}</For>
        </div>
      </Show>
    </Show>
  );
  return p.bare ? body : <Section title={p.title!} icon={p.icon!} more={p.more} children={body} />;
}

function LayoutRow(p: {
  title?: string;
  icon?: JSX.Element;
  bare?: boolean;
  k: () => { p: Period; v: number } | null;
  by: "downloads" | "rating" | "comments";
  kind: "layout" | "stream";
  onOpen: (l: LayoutTop) => void;
  more?: () => void;
}) {
  const [list] = createResource(p.k, (k) => topLayouts(k.p, p.by, p.kind, 8).catch(() => [] as LayoutTop[]));
  const body = (
    <Show when={list.latest || !list.loading} fallback={<RowSkel />}>
      <Show when={(list.latest ?? []).length > 0} fallback={<Empty />}>
        <div class="cx-row">
          <For each={list.latest ?? []}>{(l, i) => <LayoutCard l={l} rank={i() + 1} onOpen={() => p.onOpen(l)} />}</For>
        </div>
      </Show>
    </Show>
  );
  return p.bare ? body : <Section title={p.title!} icon={p.icon!} more={p.more} children={body} />;
}

function ThemeRow(p: { k: () => { p: Period; v: number } | null }) {
  const [list] = createResource(p.k, (k) => searchThemes("", "downloads", k.p, 8).catch(() => []));
  return (
    <Section title="En çok indirilen temalar" icon={<I.Palette />} more={() => go("community", "themes")}>
      <Show when={list.latest || !list.loading} fallback={<RowSkel cls="themes" />}>
        <Show when={(list.latest ?? []).length > 0} fallback={<Empty />}>
          <div class="cx-row themes">
            <For each={list.latest ?? []}>{(t) => <ThemeCard t={t} compact />}</For>
          </div>
        </Show>
      </Show>
    </Section>
  );
}
