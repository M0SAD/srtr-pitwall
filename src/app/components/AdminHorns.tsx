// Yönetim › Kornalar: korna sesi ekle (MP3 / OGG / WAV / M4A; WAV'a çevrilip yüklenir), dinle, adını / sırasını değiştir,
// kimin kullanacağını seç (PRO üyeler ya da yalnızca yöneticiler), aç / kapat, sil. Hazır kornalar programın içindedir.
// Sunucu: supabase/c136_guncelleme.sql (horns tablosu, 'horns' kovası).

import { For, Index, Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { BUILTIN_HORNS, hornAdd, hornDelete, hornList, hornSave, type Horn, type HornAccess } from "@/cloud/horns";
import * as I from "../icons";

export function AdminHorns(props: { run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [list, { refetch }] = createResource(() => hornList());
  const own = () => (list() ?? []).filter((h) => !h.builtin);
  const [name, setName] = createSignal("");
  const [access, setAccess] = createSignal<HornAccess>("pro");
  const [file, setFile] = createSignal<File | null>(null);
  const [busy, setBusy] = createSignal(false);
  let input: HTMLInputElement | undefined;

  const play = (h: Horn) => inTauri && void invoke("horn_play", { key: h.key, url: h.url ?? null, fromIdx: -1, fromName: null, volume: 0.9, nearM: null }).catch(() => {});
  const add = () =>
    props.run(async () => {
      const f = file();
      if (!f) throw new Error("Önce ses dosyası seç");
      const n = name().trim() || f.name.replace(/\.[^.]+$/, "");
      setBusy(true);
      try {
        await hornAdd(f, n, access(), (own().at(-1)?.sort ?? 0) + 1);
        setName("");
        setFile(null);
        if (input) input.value = "";
        await refetch();
      } finally {
        setBusy(false);
      }
    }, "Korna eklendi");
  const save = (h: Horn, p: Parameters<typeof hornSave>[1]) =>
    props.run(async () => {
      if (!h.id) return;
      await hornSave(h.id, p);
      await refetch();
    }, "Kaydedildi");
  const move = (i: number, d: number) =>
    props.run(async () => {
      const l = own();
      const j = i + d;
      if (j < 0 || j >= l.length) return;
      await Promise.all([hornSave(l[i].id!, { sort: l[j].sort }), hornSave(l[j].id!, { sort: l[i].sort === l[j].sort ? l[i].sort + d : l[i].sort })]);
      await refetch();
    }, "Sıra değişti");

  return (
    <div class="page narrow horn-admin">
      <section class="panel">
        <h3>Kornalar</h3>
        <p class="muted small">
          Korna çalmak PRO özelliğidir (PRO özellikleri › Ses › Korna); gelen kornaları herkes duyar. Burada eklediğin sesleri "PRO üyeler" ya da yalnızca
          "Yönetici özel" olarak işaretlersin: yönetici özel kornaları yalnızca yöneticiler seçebilir. Ses dosyası en çok 4 saniyeye kısaltılır, baştaki
          sessizlik atılır ve sesi dengelenir.
        </p>
      </section>

      <section class="panel">
        <h3>Yeni korna</h3>
        <div class="f2">
          <div class="f2-cap">Ses dosyası (MP3, OGG, WAV, M4A)</div>
          <div class="hed-inline">
            <input ref={input} type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a" hidden onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
            <button class="btn small" onClick={() => input?.click()}>
              <I.Upload /> {file() ? "Değiştir" : "Dosya seç"}
            </button>
            <small class="muted" data-no-i18n>
              {file()?.name ?? ""}
            </small>
          </div>
        </div>
        <div class="f2">
          <div class="f2-cap">Ad</div>
          <input class="input" maxLength={40} placeholder="ör. Tren düdüğü" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div class="f2">
          <div class="f2-cap">Kimler kullanabilir</div>
          <div class="seg">
            <button classList={{ on: access() === "pro" }} onClick={() => setAccess("pro")}>
              PRO üyeler
            </button>
            <button classList={{ on: access() === "admin" }} onClick={() => setAccess("admin")}>
              Yönetici özel
            </button>
          </div>
        </div>
        <button class="btn primary small" disabled={busy() || !file()} onClick={add}>
          {busy() ? "Yükleniyor…" : "Korna ekle"}
        </button>
      </section>

      <section class="panel">
        <h3>Eklenen kornalar</h3>
        <Show when={list.error}>
          <p class="error">Kornalar yüklenemedi. Supabase'de c136_guncelleme.sql çalıştırılmalı.</p>
        </Show>
        <div class="horn-alist">
          <Index each={own()} fallback={<small class="muted">Henüz korna eklenmedi.</small>}>
            {(h, i) => (
              <div class="horn-arow" classList={{ off: !h().active }}>
                <button class="horn-play" title="Dinle" onClick={() => play(h())}>
                  <I.Play />
                </button>
                <input class="input" maxLength={40} value={h().name} onChange={(e) => e.currentTarget.value.trim() && save(h(), { name: e.currentTarget.value.trim() })} data-no-i18n />
                <select class="input" value={h().access} onChange={(e) => save(h(), { access: e.currentTarget.value as HornAccess })}>
                  <option value="pro">PRO üyeler</option>
                  <option value="admin">Yönetici özel</option>
                </select>
                <small class="muted">{((h().duration_ms ?? 0) / 1000).toFixed(1)} sn</small>
                <label class="hed-switch" title="Açık / kapalı">
                  <input type="checkbox" checked={h().active} onChange={(e) => save(h(), { active: e.currentTarget.checked })} /> Açık
                </label>
                <button class="btn ghost small" title="Yukarı" disabled={i === 0} onClick={() => move(i, -1)}>
                  <I.ArrowUp />
                </button>
                <button class="btn ghost small" title="Aşağı" disabled={i === own().length - 1} onClick={() => move(i, 1)}>
                  <I.ArrowDown />
                </button>
                <button
                  class="btn ghost small danger"
                  title="Sil"
                  onClick={() => confirm(`"${h().name}" kornası silinsin mi?`) && props.run(async () => (await hornDelete(h()), await refetch()), "Korna silindi")}
                >
                  <I.Trash />
                </button>
              </div>
            )}
          </Index>
        </div>
      </section>

      <section class="panel">
        <h3>Hazır kornalar</h3>
        <p class="muted small">Programın içinde gelir, PRO üyeler kullanabilir.</p>
        <div class="horn-alist">
          <For each={BUILTIN_HORNS}>
            {(h) => (
              <div class="horn-arow">
                <button class="horn-play" title="Dinle" onClick={() => play(h)}>
                  <I.Play />
                </button>
                <span>{h.name}</span>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
