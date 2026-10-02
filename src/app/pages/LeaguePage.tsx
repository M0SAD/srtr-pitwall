// League Builder: lig yarışları için özel kategoriler (Pro / Pro-Am / Am gibi).
// Sürücüler sürükle-bırak ile kategorilere atanır; tüm overlay'ler iRacing sınıfı yerine
// bu kategorileri gösterir.

import { For, Show, createMemo, createSignal } from "solid-js";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { settings, updateSettings, type LeagueConfig } from "@/sdk/settings";
import type { Entry } from "@/sdk/types";
import { F } from "@/sdk/proFeatures";
import { ProLockBox } from "../components/ProLock";

const COLORS = ["#ffda59", "#33ceff", "#ff5c8a", "#7dff6b", "#b76cff", "#ff9a3c"];
const AUTO = "__auto";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function newConfig(name: string): LeagueConfig {
  return {
    id: uid(),
    name,
    leagueId: 0,
    tiers: [
      { id: uid(), name: "Pro", color: COLORS[0] },
      { id: uid(), name: "Pro-Am", color: COLORS[1] },
      { id: uid(), name: "Am", color: COLORS[2] },
    ],
    classDefaults: {},
    assignments: {},
  };
}

export function LeaguePage() {
  const entries = useTopic("entries");
  useSubscriptions([{ name: "entries", hz: 1 }]);

  const league = () => settings().league;
  const [selId, setSelId] = createSignal<string>(league().active || league().configs[0]?.id || "");
  const cfg = () => league().configs.find((c) => c.id === selId()) ?? null;
  const isActive = () => !!cfg() && league().active === cfg()!.id;
  const [io, setIo] = createSignal<"" | "export" | "import">("");
  const [ioText, setIoText] = createSignal("");
  const [ioErr, setIoErr] = createSignal("");
  const [manNum, setManNum] = createSignal("");
  const [manTier, setManTier] = createSignal("");
  const [over, setOver] = createSignal("");

  /** Seçili yapılandırmayı değiştir */
  const edit = (fn: (c: LeagueConfig) => void) =>
    updateSettings((d) => {
      const c = d.league.configs.find((x) => x.id === selId());
      if (c) fn(c);
    });

  const create = () => {
    const c = newConfig(`Lig ${league().configs.length + 1}`);
    updateSettings((d) => d.league.configs.push(c));
    setSelId(c.id);
  };
  const remove = () => {
    const c = cfg();
    if (!c || !confirm(`"${c.name}" silinsin mi?`)) return;
    updateSettings((d) => {
      d.league.configs = d.league.configs.filter((x) => x.id !== c.id);
      if (d.league.active === c.id) d.league.active = "";
    });
    setSelId(league().configs[0]?.id ?? "");
  };
  const setActive = (on: boolean) => updateSettings((d) => (d.league.active = on ? selId() : ""));

  const drivers = (): Entry[] => entries()?.drivers ?? [];
  const classes = createMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers()) if (d.origClass) m.set(d.origClass, d.origColor);
    for (const k of Object.keys(cfg()?.classDefaults ?? {})) if (!m.has(k)) m.set(k, "#888");
    return [...m.entries()];
  });

  const tierOf = (id: string) => cfg()?.tiers.find((t) => t.id === id);

  /** Sütunlar: her kategori + otomatik (sınıfa göre) */
  const columns = createMemo(() => {
    const c = cfg();
    if (!c) return [];
    const byNum = new Map(drivers().map((d) => [d.number, d]));
    const cols = c.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      items: Object.entries(c.assignments)
        .filter(([, tid]) => tid === t.id)
        .map(([num]) => ({ num, d: byNum.get(num) }))
        .sort((a, b) => (b.d?.irating ?? 0) - (a.d?.irating ?? 0)),
    }));
    const auto = drivers()
      .filter((d) => !c.assignments[d.number] || !tierOf(c.assignments[d.number]))
      .map((d) => ({ num: d.number, d }));
    return [{ id: AUTO, name: "Otomatik (sınıfa göre)", color: "#5a6272", items: auto }, ...cols];
  });

  const assign = (num: string, tierId: string) =>
    edit((c) => {
      if (tierId === AUTO) delete c.assignments[num];
      else c.assignments[num] = tierId;
    });

  const onDrop = (e: DragEvent, col: string) => {
    e.preventDefault();
    setOver("");
    const num = e.dataTransfer?.getData("text/plain");
    if (num) assign(num, col);
  };

  const addManual = () => {
    const num = manNum().trim().replace(/^#/, "");
    const tier = manTier() || cfg()?.tiers[0]?.id;
    if (!num || !tier) return;
    assign(num, tier);
    setManNum("");
  };

  const doExport = async () => {
    const c = cfg();
    if (!c) return;
    const text = JSON.stringify({ ...c, id: undefined }, null, 2);
    setIoText(text);
    setIo("export");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* pano yok; metin kutusundan kopyalanabilir */
    }
  };

  const doImport = () => {
    setIoErr("");
    try {
      const v = JSON.parse(ioText());
      if (!v || !Array.isArray(v.tiers)) throw new Error("Geçersiz yapılandırma (tiers yok)");
      const c: LeagueConfig = {
        ...newConfig(String(v.name || "İçe aktarılan lig")),
        leagueId: Number(v.leagueId) || 0,
        tiers: v.tiers.map((t: any, i: number) => ({ id: String(t.id || uid()), name: String(t.name || `Kategori ${i + 1}`), color: String(t.color || COLORS[i % COLORS.length]) })),
        classDefaults: typeof v.classDefaults === "object" && v.classDefaults ? v.classDefaults : {},
        assignments: typeof v.assignments === "object" && v.assignments ? v.assignments : {},
      };
      updateSettings((d) => d.league.configs.push(c));
      setSelId(c.id);
      setIo("");
      setIoText("");
    } catch (e) {
      setIoErr(String((e as Error).message || e));
    }
  };

  return (
    <ProLockBox feature={F.league} text="Lig kategorileri (League Builder) PRO üyelere özel.">
      <div class="page league">
        <section class="panel">
          <h3>Lig Kategorileri (League Builder)</h3>
          <p class="muted small">
            Lig yarışlarında sürücüler çoğu zaman iRacing'in araç sınıflarına göre değil, ligin kendi kategorilerine göre
            yarışır: ör. aynı GT3 araçlarıyla <b>Pro</b>, <b>Pro-Am</b> ve <b>Am</b> ayrı sıralanır. iRacing bunu bilmediği
            için overlay'ler herkesi tek sınıf gösterir. Bu bölümde ligin kategorilerini tanımlayıp sürücüleri (ya da
            araç sınıflarını) kategorilere atarsın; SRTR Pitwall da overlay'leri buna göre çizer.
          </p>
          <div class="lg-help">
            <div>
              <b>1. Kategorileri oluştur</b>
              <span>Ad ve renk ver (ör. Pro kırmızı, Am yeşil).</span>
            </div>
            <div>
              <b>2. Sürücüleri ata</b>
              <span>Oturumdaki sürücüleri tek tek ya da araç sınıfına göre toplu olarak bir kategoriye koy.</span>
            </div>
            <div>
              <b>3. Etkinleştir</b>
              <span>
<<<<<<< HEAD
                Sıralama Tablosu başlıkları, sınıf renkleri, sınıf içi sıralar, Yakındakiler, harita ve Live Timing bu
=======
                Sıralama Tablosu başlıkları, sınıf renkleri, sınıf içi sıralar, Relative, harita ve Live Timing bu
>>>>>>> 325d8c04093ce39f66572348391ed80bd7d7d044
                kategorilere göre gösterilir.
              </span>
            </div>
            <div>
              <b>4. Ligle sınırla (isteğe bağlı)</b>
              <span>Lig kimliğini yazarsan sadece o ligin oturumlarında devreye girer; diğer yarışlar normal görünür.</span>
            </div>
          </div>
          <p class="muted small">Yapılandırmayı dışa aktarıp lig arkadaşlarınla paylaşabilir, onların yapılandırmasını içe aktarabilirsin.</p>
          <div class="lg-bar">
            <select class="input" value={selId()} onChange={(e) => setSelId(e.currentTarget.value)}>
              <Show when={league().configs.length === 0}>
                <option value="">Yapılandırma yok</option>
              </Show>
              <For each={league().configs}>
                {(c) => (
                  <option value={c.id}>
                    {c.name}
                    {league().active === c.id ? " (etkin)" : ""}
                  </option>
                )}
              </For>
            </select>
            <button class="btn" onClick={create}>
              Yeni
            </button>
            <Show when={cfg()}>
              <button class="btn ghost" onClick={doExport}>
                Dışa aktar
              </button>
            </Show>
            <button class="btn ghost" onClick={() => (setIo(io() === "import" ? "" : "import"), setIoText(""), setIoErr(""))}>
              İçe aktar
            </button>
            <Show when={cfg()}>
              <button class="btn ghost danger" onClick={remove}>
                Sil
              </button>
            </Show>
          </div>

          <Show when={io()}>
            <div class="lg-io">
              <Show when={io() === "export"}>
                <small class="muted">Panoya kopyalandı. Lig arkadaşlarınla paylaşabilirsin.</small>
              </Show>
              <Show when={io() === "import"}>
                <small class="muted">Dışa aktarılan yapılandırmayı yapıştır.</small>
              </Show>
              <textarea class="input" rows={8} value={ioText()} onInput={(e) => setIoText(e.currentTarget.value)} readOnly={io() === "export"} />
              <div class="btns">
                <Show when={io() === "import"}>
                  <button class="btn primary" onClick={doImport}>
                    Ekle
                  </button>
                </Show>
                <button class="btn ghost" onClick={() => setIo("")}>
                  Kapat
                </button>
              </div>
              <Show when={ioErr()}>
                <p class="error">{ioErr()}</p>
              </Show>
            </div>
          </Show>
        </section>

        <Show
          when={cfg()}
          fallback={
            <section class="panel">
              <p class="muted">Başlamak için "Yeni" ile bir lig yapılandırması oluştur.</p>
            </section>
          }
        >
          <section class="panel">
            <div class="row">
              <div>
                <b>Bu yapılandırmayı uygula</b>
                <small>
                  <Show when={entries()} fallback="Oturum bekleniyor (Demo ile deneyebilirsin).">
                    Oturumun lig kimliği: {entries()!.leagueId || "yok (lig oturumu değil)"} ·{" "}
                    <span classList={{ "lg-on": entries()!.active }}>{entries()!.active ? "şu an uygulanıyor" : "uygulanmıyor"}</span>
                  </Show>
                </small>
              </div>
              <label class="switch">
                <input type="checkbox" checked={isActive()} onChange={(e) => setActive(e.currentTarget.checked)} />
                <i />
              </label>
            </div>
            <div class="row">
              <div>
                <b>Ad</b>
              </div>
              <input class="input" value={cfg()!.name} onChange={(e) => edit((c) => (c.name = e.currentTarget.value.trim() || c.name))} />
            </div>
            <div class="row">
              <div>
                <b>iRacing lig kimliği</b>
                <small>0: her oturumda uygula. Lig sayfasının adresindeki league_id.</small>
              </div>
              <div class="mqtt-host">
                <input class="input port" type="number" min="0" value={cfg()!.leagueId} onChange={(e) => edit((c) => (c.leagueId = Math.max(0, Number(e.currentTarget.value) || 0)))} />
                <Show when={entries()?.leagueId}>
                  <button class="btn ghost small" onClick={() => edit((c) => (c.leagueId = entries()!.leagueId))}>
                    Bu oturumu kullan ({entries()!.leagueId})
                  </button>
                </Show>
              </div>
            </div>
          </section>

          <section class="panel">
            <h4>Kategoriler</h4>
            <div class="lg-tiers">
              <For each={cfg()!.tiers}>
                {(t, i) => (
                  <div class="lg-tier">
                    <input type="color" value={t.color} onInput={(e) => edit((c) => (c.tiers[i()].color = e.currentTarget.value))} />
                    <input class="input" value={t.name} onChange={(e) => edit((c) => (c.tiers[i()].name = e.currentTarget.value.trim() || t.name))} />
                    <button class="btn ghost small" disabled={i() === 0} title="Yukarı" onClick={() => edit((c) => c.tiers.splice(i() - 1, 0, c.tiers.splice(i(), 1)[0]))}>
                      ↑
                    </button>
                    <button
                      class="btn ghost small danger"
                      onClick={() =>
                        edit((c) => {
                          c.tiers.splice(i(), 1);
                          for (const [k, v] of Object.entries(c.assignments)) if (v === t.id) delete c.assignments[k];
                          for (const [k, v] of Object.entries(c.classDefaults)) if (v === t.id) delete c.classDefaults[k];
                        })
                      }
                    >
                      Kaldır
                    </button>
                  </div>
                )}
              </For>
            </div>
            <button
              class="btn ghost"
              onClick={() => edit((c) => c.tiers.push({ id: uid(), name: `Kategori ${c.tiers.length + 1}`, color: COLORS[c.tiers.length % COLORS.length] }))}
            >
              Kategori ekle
            </button>

            <h4>iRacing sınıfına göre varsayılan</h4>
            <p class="muted small">Tek tek atanmamış sürücüler, iRacing sınıflarına göre buradaki kategoriye girer.</p>
            <Show when={classes().length > 0} fallback={<p class="muted small">Oturumda sınıf bilgisi yok.</p>}>
              <For each={classes()}>
                {([name, color]) => (
                  <div class="row">
                    <div class="lg-class">
                      <i style={{ background: color || "#888" }} />
                      <b>{name}</b>
                    </div>
                    <select
                      class="input"
                      value={cfg()!.classDefaults[name] ?? ""}
                      onChange={(e) =>
                        edit((c) => {
                          if (e.currentTarget.value) c.classDefaults[name] = e.currentTarget.value;
                          else delete c.classDefaults[name];
                        })
                      }
                    >
                      <option value="">iRacing sınıfı kalsın</option>
                      <For each={cfg()!.tiers}>{(t) => <option value={t.id}>{t.name}</option>}</For>
                    </select>
                  </div>
                )}
              </For>
            </Show>
          </section>

          <section class="panel">
            <h4>Sürücü atamaları</h4>
            <p class="muted small">
              Sürücüleri sütunlar arasında sürükle. Atamalar araç numarasına göre saklanır; oturumda olmayan numaraları
              elle ekleyebilirsin.
            </p>
            <div class="lg-manual">
              <input class="input port" placeholder="#no" value={manNum()} onInput={(e) => setManNum(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && addManual()} />
              <select class="input" value={manTier() || cfg()!.tiers[0]?.id || ""} onChange={(e) => setManTier(e.currentTarget.value)}>
                <For each={cfg()!.tiers}>{(t) => <option value={t.id}>{t.name}</option>}</For>
              </select>
              <button class="btn" onClick={addManual} disabled={cfg()!.tiers.length === 0}>
                Ekle
              </button>
            </div>
            <div class="lg-board">
              <For each={columns()}>
                {(col) => (
                  <div
                    class="lg-col"
                    classList={{ over: over() === col.id }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(col.id);
                    }}
                    onDragLeave={() => setOver("")}
                    onDrop={(e) => onDrop(e, col.id)}
                  >
                    <header style={{ "border-top-color": col.color }}>
                      <b>{col.name}</b>
                      <span class="muted">{col.items.length}</span>
                    </header>
                    <For each={col.items}>
                      {(it) => {
                        const auto = () => (col.id === AUTO && it.d ? tierOf(cfg()!.classDefaults[it.d.origClass] ?? "") : undefined);
                        return (
                          <div
                            class="lg-card"
                            classList={{ ghost: !it.d }}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer?.setData("text/plain", it.num);
                              if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                            }}
                          >
                            <span class="lg-num">#{it.num}</span>
                            <span class="lg-name">{it.d?.name ?? "oturumda değil"}</span>
                            <Show when={it.d}>
                              <span class="lg-meta" style={{ color: it.d!.origColor || undefined }}>
                                {it.d!.origClass}
                              </span>
                              <span class="lg-meta">{it.d!.irating}</span>
                            </Show>
                            <Show when={col.id === AUTO}>
                              <span class="lg-meta" style={{ color: auto()?.color }}>
                                → {auto()?.name ?? "iRacing sınıfı"}
                              </span>
                            </Show>
                            <Show when={col.id !== AUTO}>
                              <button class="lg-x" title="Atamayı kaldır" onClick={() => assign(it.num, AUTO)}>
                                ×
                              </button>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>
    </ProLockBox>
  );
}
