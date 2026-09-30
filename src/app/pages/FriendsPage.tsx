// Arkadaşlar: aynı yarıştaki arkadaşları Relative, Leaderboard, Live Timing ve haritada öne çıkar.

import { For, Show, createMemo, createSignal } from "solid-js";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { settings, updateSettings, type Friend } from "@/sdk/settings";
import { friendColor, friendOf, resizePhoto } from "@/sdk/friends";

const ICONS = ["", "★", "♥", "⚡", "🔥", "👑", "🏁", "😎", "🐺", "🚀"];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function FriendsPage() {
  const entries = useTopic("entries");
  useSubscriptions([{ name: "entries", hz: 1 }]);

  const fs = () => settings().friends;
  const [name, setName] = createSignal("");
  const [custId, setCustId] = createSignal("");
  const [q, setQ] = createSignal("");
  const [err, setErr] = createSignal("");

  const edit = (id: string, fn: (f: Friend) => void) =>
    updateSettings((d) => {
      const f = d.friends.list.find((x) => x.id === id);
      if (f) fn(f);
    });

  const add = (n: string, userId: number) => {
    setErr("");
    n = n.trim();
    if (!n && !userId) return;
    if (friendOf(userId, n)) {
      setErr("Bu kişi zaten listende.");
      return;
    }
    updateSettings((d) => d.friends.list.unshift({ id: uid(), name: n, userId, color: "", icon: "", photo: "", note: "" }));
  };

  const inSession = createMemo(() => {
    const ids = new Set<number>();
    const names = new Set<string>();
    for (const d of entries()?.drivers ?? []) {
      if (d.userId) ids.add(d.userId);
      names.add(d.name.toLocaleLowerCase("tr"));
    }
    return { ids, names };
  });
  const isHere = (f: Friend) => (f.userId > 0 && inSession().ids.has(f.userId)) || inSession().names.has(f.name.toLocaleLowerCase("tr"));

  const sessionDrivers = createMemo(() => {
    const s = q().trim().toLocaleLowerCase("tr");
    return (entries()?.drivers ?? [])
      .filter((d) => !s || d.name.toLocaleLowerCase("tr").includes(s) || d.number === s.replace("#", ""))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  });

  const onPhoto = async (id: string, file: File | undefined) => {
    if (!file) return;
    try {
      const url = await resizePhoto(file);
      edit(id, (f) => (f.photo = url));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <div class="page">
      <section class="panel">
        <div class="row">
          <div>
            <b>Arkadaşları öne çıkar</b>
            <small>Aynı yarıştaki arkadaşların satırları farklı renkte, haritada kendi renginde ve simgesiyle görünür.</small>
          </div>
          <label class="switch">
            <input type="checkbox" checked={fs().enabled} onChange={(e) => updateSettings((d) => (d.friends.enabled = e.currentTarget.checked))} />
            <i />
          </label>
        </div>
        <div class="row">
          <div>
            <b>Varsayılan renk</b>
            <small>Kendine özel renk verilmemiş arkadaşlar için</small>
          </div>
          <input type="color" class="fr-color" value={fs().color} onInput={(e) => updateSettings((d) => (d.friends.color = e.currentTarget.value))} />
        </div>
        <div class="row">
          <div>
            <b>Satır rengi yoğunluğu</b>
          </div>
          <div class="fr-range">
            <input type="range" min="10" max="70" step="2" value={fs().strength} onInput={(e) => updateSettings((d) => (d.friends.strength = Number(e.currentTarget.value)))} />
            <span>%{fs().strength}</span>
          </div>
        </div>
        <div class="row">
          <div>
            <b>Nerede gösterilsin</b>
          </div>
          <div class="fr-where">
            <For each={[["relative", "Relative"], ["standings", "Leaderboard"], ["timing", "Live Timing"], ["map", "Haritalar"]] as const}>
              {([k, label]) => (
                <label class="check">
                  <input type="checkbox" checked={fs().where[k]} onChange={(e) => updateSettings((d) => (d.friends.where[k] = e.currentTarget.checked))} />
                  <span>{label}</span>
                </label>
              )}
            </For>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Arkadaş ekle</h3>
        <p class="muted small">
          iRacing'deki tam adını yaz. Üye numarasını (iRacing profilindeki Customer ID) da girersen isim değişse bile
          tanınır. Aynı oturumdaysanız aşağıdaki listeden tek tıkla ekleyebilirsin; numara otomatik gelir.
        </p>
        <div class="fr-add">
          <input class="input" placeholder="Ad Soyad" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <input class="input port" placeholder="Üye no" inputMode="numeric" value={custId()} onInput={(e) => setCustId(e.currentTarget.value.replace(/\D/g, ""))} />
          <button
            class="btn primary"
            onClick={() => {
              add(name(), Number(custId()) || 0);
              setName("");
              setCustId("");
            }}
          >
            Ekle
          </button>
        </div>
        <Show when={err()}>
          <p class="error">{err()}</p>
        </Show>

        <Show when={(entries()?.drivers.length ?? 0) > 0}>
          <h4>Bu oturumdaki sürücüler</h4>
          <input class="input fr-search" placeholder="Ara (ad ya da #numara)" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
          <div class="fr-session">
            <For each={sessionDrivers()}>
              {(d) => {
                const f = () => friendOf(d.userId, d.name);
                return (
                  <div class="fr-sess-row">
                    <span class="muted">#{d.number}</span>
                    <span class="fr-sess-name">{d.name}</span>
                    <span class="muted small">{d.irating}</span>
                    <Show
                      when={!f()}
                      fallback={
                        <span class="fr-dot" style={{ background: friendColor(f()!) }}>
                          arkadaş
                        </span>
                      }
                    >
                      <button class="btn ghost small" onClick={() => add(d.name, d.userId)}>
                        Ekle
                      </button>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Arkadaşlarım ({fs().list.length})</h3>
        <Show when={fs().list.length > 0} fallback={<p class="muted">Henüz arkadaş eklemedin.</p>}>
          <div class="fr-list">
            <For each={fs().list}>
              {(f) => (
                <div class="fr-card" style={{ "border-left-color": friendColor(f) }}>
                  <div class="fr-avatar" style={{ background: friendColor(f) }}>
                    <Show when={f.photo} fallback={<span>{f.icon || (f.name[0] ?? "?").toUpperCase()}</span>}>
                      <img src={f.photo} alt="" />
                    </Show>
                  </div>
                  <div class="fr-fields">
                    <div class="fr-line">
                      <input class="input" value={f.name} placeholder="Ad" onChange={(e) => edit(f.id, (x) => (x.name = e.currentTarget.value.trim()))} />
                      <input
                        class="input port"
                        placeholder="Üye no"
                        value={f.userId || ""}
                        onChange={(e) => edit(f.id, (x) => (x.userId = Number(e.currentTarget.value.replace(/\D/g, "")) || 0))}
                      />
                      <Show when={isHere(f)}>
                        <span class="fr-here">bu oturumda</span>
                      </Show>
                    </div>
                    <div class="fr-line">
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={!!f.color}
                          onChange={(e) => edit(f.id, (x) => (x.color = e.currentTarget.checked ? fs().color : ""))}
                        />
                        <span>Özel renk</span>
                      </label>
                      <Show when={f.color}>
                        <input type="color" class="fr-color" value={f.color} onInput={(e) => edit(f.id, (x) => (x.color = e.currentTarget.value))} />
                      </Show>
                      <span class="muted small">Simge</span>
                      <select class="input fr-icon" value={ICONS.includes(f.icon) ? f.icon : ""} onChange={(e) => edit(f.id, (x) => (x.icon = e.currentTarget.value))}>
                        <For each={ICONS}>{(i) => <option value={i}>{i || "Yok"}</option>}</For>
                      </select>
                      <label class="btn ghost small fr-upload">
                        Fotoğraf
                        <input type="file" accept="image/*" onChange={(e) => onPhoto(f.id, e.currentTarget.files?.[0])} />
                      </label>
                      <Show when={f.photo}>
                        <button class="btn ghost small" onClick={() => edit(f.id, (x) => (x.photo = ""))}>
                          Fotoğrafı kaldır
                        </button>
                      </Show>
                    </div>
                    <div class="fr-tagrow">
                    <input class="input fr-tag" placeholder="Etiket" maxLength={12} title="Sürücü etiketi: Relative ve Leaderboard'da adın yanında görünür" value={f.tag ?? ""} onChange={(e) => edit(f.id, (x) => (x.tag = e.currentTarget.value.trim()))} />
                    <input class="input fr-note" placeholder="Not (ör. takım arkadaşı)" value={f.note} onChange={(e) => edit(f.id, (x) => (x.note = e.currentTarget.value))} />
                    </div>
                  </div>
                  <button
                    class="btn ghost small danger"
                    onClick={() => updateSettings((d) => (d.friends.list = d.friends.list.filter((x) => x.id !== f.id)))}
                  >
                    Sil
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <p class="muted small">
          Haritada fotoğrafı olan arkadaş yuvarlak fotoğrafıyla, simgesi olan simgesiyle gösterilir. Hesabınla giriş
          yaptıysan arkadaş listen diğer bilgisayarlarına da taşınır.
        </p>
      </section>
    </div>
  );
}
