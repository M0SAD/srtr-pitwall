// Liste satırını tutup sürükleyerek sıralama (düzen listesi, düzendeki overlay listesi).
// Satırın onPointerDown'ında çağrılır; 5 px hareketten sonra başlar, bırakılacak yer turuncu çizgiyle gösterilir.
export function dragSort(e: PointerEvent, opts: { container: HTMLElement | null; selector: string; onDrop: (from: number, to: number) => void }) {
  const row = e.currentTarget as HTMLElement;
  const t = e.target as HTMLElement | null;
  if (e.button !== 0 || !opts.container || t?.closest("button, input, select, textarea")) return;
  const box = opts.container;
  const rows = () => [...box.querySelectorAll<HTMLElement>(opts.selector)];
  const from = rows().indexOf(row);
  if (from < 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let active = false;
  let to = from;
  let line: HTMLDivElement | null = null;
  const move = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      active = true;
      try {
        row.setPointerCapture(e.pointerId);
      } catch {
        /* yok say */
      }
      line = document.createElement("div");
      line.className = "dragsort-line";
      document.body.append(line);
      document.body.classList.add("ov-dragging");
      row.classList.add("dragsort-src");
    }
    ev.preventDefault();
    const rs = rows().map((el) => el.getBoundingClientRect());
    if (!rs.length || !line) return;
    to = 0;
    for (const r of rs) if (ev.clientY > r.top + r.height / 2) to++;
    const y = to < rs.length ? rs[to].top - 1 : rs[rs.length - 1].bottom + 1;
    line.style.cssText = `top:${y}px;left:${rs[0].left}px;width:${rs[0].width}px`;
  };
  const finish = (commit: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    line?.remove();
    document.body.classList.remove("ov-dragging");
    row.classList.remove("dragsort-src");
    if (!active) return;
    // Sürüklemeden hemen sonra gelen tıklama satırı seçmesin / çift tık sayılmasın
    const eat = (ev: MouseEvent) => (ev.stopPropagation(), ev.preventDefault());
    window.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", eat, true), 80);
    const dest = to > from ? to - 1 : to;
    if (commit && dest !== from) opts.onDrop(from, dest);
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (ev: KeyboardEvent) => ev.key === "Escape" && (ev.preventDefault(), ev.stopPropagation(), finish(false));
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}
