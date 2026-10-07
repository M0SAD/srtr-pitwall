import { defineOverlay } from "@/sdk/overlay";

const G_DIST = "Mesafe";
const G_LOOK = "Görünüm";

export default defineOverlay({
  id: "blindspot",
  name: "Kör Nokta Uyarısı",
  description:
    "Gerçek arabaların aynalarındaki kör nokta ışığı gibi: arkadan bir araç ayarladığın mesafeye girince ya da yanına gelince solda / sağda uyarı ışığı yanar.",
  category: "driving",
  noBgOpacity: true,
  topics: [
    { name: "radar", hz: 30 },
    { name: "inputs", hz: 10 },
  ],
  size: { w: 1040, h: 70 },
  defaultPosition: { x: 440, y: 300 },
  defaultCenter: true,
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "mirror",
      options: [
        { value: "mirror", label: "Ayna camı ve simge" },
        { value: "icon", label: "Yalnızca simge" },
        { value: "dot", label: "LED nokta" },
        { value: "bar", label: "Dikey ışık şeridi" },
        { value: "triangle", label: "Uyarı üçgeni", pro: true },
        { value: "trisign", label: "Çerçeveli üçgen ve ünlem", pro: true },
        { value: "arrow", label: "Ok üçgeni (aracın olduğu yana bakar)", pro: true },
        { value: "chevrons", label: "Üçlü ok", pro: true },
        { value: "ring", label: "Halka nokta", pro: true },
        { value: "pulse", label: "Yayılan nokta", pro: true },
        { value: "diamond", label: "Elmas", pro: true },
      ],
      proHint: "Uyarı üçgeni, ok üçgeni, üçlü ok, halka nokta, yayılan nokta ve elmas tasarımları PRO üyelere özel.",
    },
    { key: "size", label: "Boyut", type: "number", default: 70, min: 24, max: 300, step: 2, unit: "px" },
    { key: "gap", label: "İki ışık arası mesafe", type: "number", default: 900, min: 40, max: 3800, step: 10, unit: "px", hint: "Işıkları yan aynalarının üstüne ya da ekranın iki kenarına denk getir." },
    { key: "far", label: "En uzak mesafe", type: "number", default: 20, min: 3, max: 80, step: 1, unit: "m", group: G_DIST, hint: "Arkadaki araç bu mesafeden daha yakına girince uyarı başlar." },
    { key: "near", label: "En yakın mesafe", type: "number", default: 0, min: 0, max: 20, step: 1, unit: "m", group: G_DIST, hint: "Arkandaki araç bundan daha yakınsa (ör. dibinde rüzgâr gölgesi alırken) uyarı vermez. 0 = sınır yok. Yanına gelen araç için her zaman uyarır." },
    { key: "alongside", label: "Yan yanayken de uyar", type: "boolean", default: true, group: G_DIST },
    {
      key: "unknownSide",
      label: "Taraf bilinmiyorken",
      type: "select",
      default: "both",
      group: G_DIST,
      options: [
        { value: "both", label: "İki ışığı da soluk yak" },
        { value: "none", label: "Uyarma (yalnızca yanına gelince)" },
      ],
      hint: "iRacing, arkadan yaklaşan aracın hangi tarafta olduğunu ancak yanına geldiğinde bildirir. O ana kadar taraf bilinmez; diğer simlerde taraf daha erken bilinebilir.",
    },
    { key: "onlyOnTrack", label: "Yalnızca pistteyken", type: "boolean", default: true, group: G_DIST },
    { key: "minSpeed", label: "En düşük hız", type: "number", default: 30, min: 0, max: 200, step: 5, unit: "km/h", group: G_DIST, hint: "Bu hızın altında (pit, grid) uyarı vermez. 0 = kapalı." },
    { key: "color", label: "Uyarı rengi", type: "color", default: "#ffb300", group: G_LOOK },
    { key: "alongOn", label: "Yan yanayken farklı renk", type: "boolean", default: false, group: G_LOOK },
    { key: "alongColor", label: "Yan yana rengi", type: "color", default: "#ff3b30", group: G_LOOK, showIf: { key: "alongOn", is: [true] } },
    { key: "soft", label: "Yaklaşırken soluk, yan yanayken parlak", type: "boolean", default: true, group: G_LOOK },
    { key: "blinkSteer", label: "O tarafa yönelince yanıp sön", type: "boolean", default: false, group: G_LOOK, hint: "Işık yanarken direksiyonu o tarafa kırarsan hızlı yanıp söner (gerçek arabalardaki sinyal uyarısı gibi)." },
    { key: "idle", label: "Boşken soluk göster", type: "boolean", default: false, group: G_LOOK, hint: "Uyarı yokken ışıkların yeri çok soluk görünür." },
  ],
});
