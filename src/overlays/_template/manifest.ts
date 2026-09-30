import { defineOverlay } from "@/sdk/overlay";

// Yeni overlay için: bu klasörü kopyala, adındaki "_" işaretini kaldır (ör. "laptimer"),
// aşağıdaki id'yi klasör adıyla aynı yap. Uygulama onu otomatik bulur.
export default defineOverlay({
  id: "_template",
  name: "Şablon",
  description: "Yeni overlay'ler için başlangıç noktası.",
  category: "info",
  // Hangi veriye, saniyede kaç kez ihtiyaç var? (status, inputs, delta, radar,
  // relative, standings, fuel, session)
  topics: [{ name: "inputs", hz: 10 }],
  size: { w: 200, h: 60 },
  defaultPosition: { x: 100, y: 100 },
  settings: [
    { key: "label", label: "Etiket göster", type: "boolean", default: true },
    { key: "color", label: "Renk", type: "color", default: "#ff8a2a" },
  ],
});
