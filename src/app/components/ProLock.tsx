// PRO kilidi gösterimi: kilitli özellik gizlenmez; görünür ama devre dışıdır, yanında "PRO" rozeti,
// kısa bir açıklama ve "PRO'ya bak" bağlantısı olur. Hangi özelliğin PRO olduğuna yönetici karar verir
// (src/sdk/proFeatures.ts, Yönetim › PRO özellikleri).

import { Show, type JSX } from "solid-js";
import { proLocked, requiresPro } from "@/sdk/proFeatures";
import { go } from "../ui";
import "./proLock.css";

/** Küçük "PRO" rozeti; feature verilirse sadece o özellik PRO'ya ayrılmışsa görünür */
export function ProTag(p: { feature?: string }) {
  return (
    <Show when={!p.feature || requiresPro(p.feature)}>
      <span class="pro-badge small prolock-tag" title="PRO üyelere özel">
        PRO
      </span>
    </Show>
  );
}

/** Sadece kullanıcı için kilitliyken görünen "PRO" rozeti (devre dışı düğmelerin yanına) */
export function ProLockTag(p: { feature: string }) {
  return (
    <Show when={proLocked(p.feature)}>
      <span class="pro-badge small prolock-tag" title="PRO üyelere özel">
        PRO
      </span>
    </Show>
  );
}

/** Tek satırlık not: rozet + açıklama + "PRO'ya bak". feature verilirse sadece kilitliyken görünür. */
export function ProLockNote(p: { feature?: string; text: string; class?: string }) {
  return (
    <Show when={!p.feature || proLocked(p.feature)}>
      <div class={`prolock-note ${p.class ?? ""}`}>
        <span class="pro-badge small">PRO</span>
        <span>{p.text}</span>
        <button class="link" onClick={() => go("pro")}>
          PRO'ya bak
        </button>
      </div>
    </Show>
  );
}

/**
 * Bölümü kilitli gösterir: içerik görünür kalır ama tıklanamaz (soluk), üstte not.
 * Kilit yoksa içerik olduğu gibi çizilir.
 */
export function ProLockBox(p: { feature: string; text: string; children: JSX.Element; class?: string }) {
  return (
    <Show when={proLocked(p.feature)} fallback={p.children}>
      <div class={`prolock-box ${p.class ?? ""}`}>
        <ProLockNote text={p.text} />
        <div class="prolock-dim" inert aria-disabled="true">
          {p.children}
        </div>
      </div>
    </Show>
  );
}

/** Kilitli bir sayfa / görünüm yerine gösterilen panel */
export function ProLockPanel(p: { title: string; text: string }) {
  return (
    <section class="panel prolock-panel">
      <h3>
        {p.title} <span class="pro-badge small">PRO</span>
      </h3>
      <p class="muted">{p.text}</p>
      <button class="btn primary" onClick={() => go("pro")}>
        PRO'ya bak
      </button>
    </section>
  );
}
