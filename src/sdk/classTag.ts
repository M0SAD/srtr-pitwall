// Sınıf adı etiketi (Yakındakiler, Yakın Takip): çok sınıflı yarışta diğer sınıfların satırında kısa sınıf adı
/** Sınıf adının kısa hali (etiket): "GT3 Class" → "GT3", "Porsche 911 Cup" → "PORSCHE" (en çok 8 harf) */
export function shortClass(name: string): string {
  const n = (name || "").replace(/\b(class|cup|series)\b/gi, "").trim();
  const w = n.split(/\s+/).filter(Boolean);
  const pick = w.find((x) => /\d/.test(x)) ?? w[0] ?? "";
  return pick.slice(0, 8).toUpperCase();
}
