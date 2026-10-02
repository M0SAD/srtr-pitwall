// Yönetim bölümleri arası "şuraya git" isteği (ör. moderasyon kaydına tıklayınca ilgili bölüm ve öğe).
// Bölüm açılınca kendi isteğini alır (take) ve arama kutusunu doldurur / öğeyi açar.

import { createSignal } from "solid-js";
import { go } from "../ui";

export interface AdminFocus {
  /** Yönetim alt sayfası (adminSubs id) */
  sub: string;
  /** Arama kutusuna yazılacak metin */
  q?: string;
  /** Açılacak öğenin kimliği */
  id?: string;
}

const [focus, setFocus] = createSignal<AdminFocus | null>(null);
export { focus as adminFocus };

/** Arama kutusu olmayan bölümler: öğe metniyle bulunup görünür yapılır ve kısa süre vurgulanır */
const HIGHLIGHT = new Set(["coupons", "voicepacks", "ads"]);

function highlight(text: string, tries = 24) {
  const needle = text.toLocaleLowerCase("tr");
  const root = document.querySelector(".page");
  if (root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!(n.textContent ?? "").toLocaleLowerCase("tr").includes(needle)) continue;
      const el = (n.parentElement?.closest(".admin-user, .apf-row, .card, .row, li, tr, [class*='item'], [class*='row']") ?? n.parentElement) as HTMLElement | null;
      if (!el || el.closest(".toast")) continue;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const prev = el.style.outline;
      el.style.outline = "2px solid var(--accent, #ff8a2a)";
      el.style.outlineOffset = "2px";
      setTimeout(() => (el.style.outline = prev), 2600);
      return;
    }
  }
  if (tries > 0) setTimeout(() => highlight(text, tries - 1), 150);
}

/** Yönetim › sub bölümünü açar; bölüm q / id'yi kullanır */
export function openAdmin(f: AdminFocus) {
  setFocus(f);
  go("admin", f.sub);
  if (f.q && HIGHLIGHT.has(f.sub)) setTimeout(() => highlight(f.q!), 120);
}

/** Bölüm kendi isteğini alır (bir kez) */
export function takeAdminFocus(sub: string): AdminFocus | null {
  const f = focus();
  if (!f || f.sub !== sub) return null;
  setFocus(null);
  return f;
}
