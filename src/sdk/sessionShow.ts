/** Tablonun gösterildiği oturumlar (Sıralama Tablosu ve Yakındakiler) */
export const SESSION_SHOW_OPTIONS = [
  { value: "test", label: "Test sürüşü" },
  { value: "practice", label: "Antrenman" },
  { value: "qualify", label: "Sıralama turları" },
  { value: "race", label: "Yarış" },
];
export const SESSION_SHOW_DEFAULT = ["practice", "qualify", "race"];

/** Sim'in oturum adından "Gösterildiği oturumlar" türü; bilinmeyen oturum null (tablo gösterilir) */
export function sessionShowKind(type: string | undefined): "test" | "practice" | "qualify" | "race" | null {
  const t = (type ?? "").toLowerCase();
  if (!t) return null;
  if (/offline testing|test drive/.test(t)) return "test";
  if (t.includes("race")) return "race";
  if (t.includes("qual")) return "qualify";
  if (t.includes("practice") || t.includes("warmup") || t.includes("warm up") || t.includes("test")) return "practice";
  return null;
}

/** Oturuma göre görünür mü. `showIn` yoksa (eski kayıt) eski "Test sürüşünde gizle" ayarına bakılır. */
export function sessionShown(opts: Record<string, any> | undefined, type: string | undefined): boolean {
  const k = sessionShowKind(type);
  if (!k) return true;
  const list = Array.isArray(opts?.showIn) ? (opts!.showIn as string[]) : opts?.hideInTest === false ? [...SESSION_SHOW_DEFAULT, "test"] : SESSION_SHOW_DEFAULT;
  return list.includes(k);
}
