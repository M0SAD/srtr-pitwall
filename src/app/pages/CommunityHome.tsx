// Topluluk ana sayfası: bu ayın / tüm zamanların en çok görüntülenen görselleri, en çok kullanılan
// düzenleri, en çok puan ve yorum alanları, en çok indirilen temaları ve genel istatistikler.

import { For, Show, createResource, createSignal, type JSX } from "solid-js";
import { cloudEnabled, session } from "@/cloud/supabase";
import { communityStats, searchThemes, topLayouts, topShots, type LayoutTop, type Period } from "@/cloud/community";
import { shotThumbUrl, type SharedShot } from "@/cloud/shots";
import { LayoutDetail, LayoutPreview, LoginWall, Stars } from "./CommunityPage";
import { SharedShotDetail } from "./CommunityShots";
import { ThemeCard } from "./CommunityThemes";
import { go } from "../ui";
import * as I from "../icons";

const PERIOD_KEY = "pitwall.communityPeriod";

function readPeriod(): Period {
  try {
    return localStorage.getItem(PERIOD_KEY) === "all" ? "all" : "month";
  } catch {
    return "month";
  }
}

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
      <div class="page ch">
        <section class="panel ch-head">
          <div>
            <h3>Topluluk</h3>
            <p class="muted small">{period() === "month" ? "Bu ayın öne çıkanları" : "Tüm zamanların öne çıkanları"}</p>
          </div>
          <span class="lt-sp" />
          <div class="seg">
            <button classList={{ on: period() === "month" }} onClick={() => setPeriod("month")}>
              Bu ay
            </button>
            <button classList={{ on: period() === "all" }} onClick={() => setPeriod("all")}>
              Tüm zamanlar
            </button>
          </div>
        </section>

        <div class="ch-stats">
          <Stat icon={<I.Camera />} n={stats()?.shots} label="Görsel" onClick={() => go("community", "shots")} />
          <Stat icon={<I.LayoutDashboard />} n={stats()?.layouts} label="Düzen" onClick={() => go("community", "layouts")} />
          <Stat icon={<I.Radio />} n={stats()?.streams} label="Yayın düzeni" onClick={() => go("community", "stream")} />
          <Stat icon={<I.Palette />} n={stats()?.themes} label="Tema" onClick={() => go("community", "themes")} />
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
    <button class="ch-stat" classList={{ link: !!p.onClick }} onClick={() => p.onClick?.()} disabled={!p.onClick}>
      {p.icon}
      <b data-no-i18n>{p.n === undefined ? "…" : Number(p.n).toLocaleString()}</b>
      <small>{p.label}</small>
    </button>
  );
}

function Section(p: { title: string; icon: JSX.Element; more?: () => void; tools?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="panel ch-sec">
      <header>
        <h4>
          {p.icon} {p.title}
        </h4>
        <span class="lt-sp" />
        {p.tools}
        <Show when={p.more}>
          <button class="btn ghost small" onClick={() => p.more!()}>
            Tümü <I.ChevronRight />
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
    <Section
      title={p.title}
      icon={p.icon}
      tools={
        <div class="seg small">
          <For each={p.tabs}>
            {(t) => (
              <button classList={{ on: tab() === t.id }} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            )}
          </For>
        </div>
      }
    >
      <For each={p.tabs}>{(t) => <Show when={tab() === t.id}>{t.render()}</Show>}</For>
    </Section>
  );
}

function Empty() {
  return <p class="muted small ch-empty">Bu dönemde henüz bir şey yok.</p>;
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
    <>
      <Show when={!list.loading && (list() ?? []).length === 0}>
        <Empty />
      </Show>
      <div class="ch-row shots">
        <For each={list() ?? []}>
          {(s, i) => (
            <button class="shot-card" onClick={() => p.onOpen(s)}>
              <div class="shot-thumb">
                <img src={shotThumbUrl(s)} alt="" loading="lazy" draggable={false} />
                <i class="ch-rank">{i() + 1}</i>
              </div>
              <span class="shot-cap">
                <b data-no-i18n>{s.title}</b>
                <small data-no-i18n>{s.author_name || "?"}</small>
                <span class="cm-meta">
                  <Show when={p.by === "views"}>
                    <span>
                      <I.Eye /> {s.views ?? 0}
                    </span>
                  </Show>
                  <Stars value={Number(s.rating_avg)} count={s.rating_count} />
                  <span title="Yorumlar">💬 {s.comment_count}</span>
                </span>
              </span>
            </button>
          )}
        </For>
      </div>
    </>
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
    <>
      <Show when={!list.loading && (list() ?? []).length === 0}>
        <Empty />
      </Show>
      <div class="ch-row">
        <For each={list() ?? []}>
          {(l, i) => (
            <button class="cm-card" onClick={() => p.onOpen(l)}>
              <div class="ch-prev">
                <LayoutPreview boxes={l.boxes} w={l.screen_w} h={l.screen_h} scale={l.ui_scale} labels />
                <i class="ch-rank">{i() + 1}</i>
              </div>
              <div class="cm-card-body">
                <b data-no-i18n>{l.title}</b>
                <small data-no-i18n>{l.author_name || "?"}</small>
                <div class="cm-meta">
                  <span>⭳ {l.downloads}</span>
                  <Stars value={Number(l.rating_avg)} count={l.rating_count} />
                  <span title="Yorumlar">💬 {l.comment_count ?? 0}</span>
                </div>
              </div>
            </button>
          )}
        </For>
      </div>
    </>
  );
  return p.bare ? body : <Section title={p.title!} icon={p.icon!} more={p.more} children={body} />;
}

function ThemeRow(p: { k: () => { p: Period; v: number } | null }) {
  const [list] = createResource(p.k, (k) => searchThemes("", "downloads", k.p, 8).catch(() => []));
  return (
    <Section title="En çok indirilen temalar" icon={<I.Palette />} more={() => go("community", "themes")}>
      <Show when={!list.loading && (list() ?? []).length === 0}>
        <Empty />
      </Show>
      <div class="ch-row themes">
        <For each={list() ?? []}>{(t) => <ThemeCard t={t} compact />}</For>
      </div>
    </Section>
  );
}
