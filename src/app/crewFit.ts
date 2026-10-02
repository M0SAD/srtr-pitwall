// Ekip sayfası: "Ekrana sığdır" ölçeklemesi.
// outer: ölçeklenmeyen sarmalayıcı (görünen yükseklik buradan ölçülür), inner: CSS zoom uygulanan içerik.
// İçerik ya da pencere değiştikçe yeniden hesaplanır; kapatılınca zoom kaldırılır.
export function crewFit(outer: HTMLElement, inner: HTMLElement, on: () => boolean, bottomPad = 16) {
  let z = 1;
  let raf = 0;
  const run = () => {
    raf = 0;
    if (!outer.isConnected) return;
    if (!on()) {
      z = 1;
      inner.style.removeProperty("zoom");
      outer.classList.remove("cols2");
      return;
    }
    outer.classList.toggle("cols2", outer.clientWidth >= 900);
    const avail = Math.max(240, window.innerHeight - outer.getBoundingClientRect().top - bottomPad);
    for (let i = 0; i < 8; i++) {
      inner.style.zoom = String(z);
      const h = outer.getBoundingClientRect().height;
      if (h < 1) break;
      const nz = Math.max(0.4, Math.min(1, (z * avail) / h));
      // Küçük farklarda dokunma (titreme olmasın); büyütürken biraz pay bırak
      if (Math.abs(nz - z) < 0.012 || (nz > z && nz - z < 0.03)) break;
      z = nz;
    }
    inner.style.zoom = String(z);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(run);
  };
  const ro = new ResizeObserver(kick);
  ro.observe(inner);
  ro.observe(outer);
  window.addEventListener("resize", kick);
  kick();
  return {
    update: kick,
    destroy() {
      ro.disconnect();
      window.removeEventListener("resize", kick);
      if (raf) cancelAnimationFrame(raf);
      inner.style.removeProperty("zoom");
    },
  };
}
