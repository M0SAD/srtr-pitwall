// Sürülen aracın ailesini (formula, GT, prototip, stock car, ralli...) araç adı / yolu / sınıfından tahmin eder.
// Pedallar overlay'indeki direksiyon tasarımı ve Direksiyon Ekranı'nın araca göre görünümü bunu kullanır.

import type { Status } from "./types";

export type CarFamily =
  | "classic" // tarihi araçlar
  | "formula" // F1 ve üst seviye tek kişilikler (F2, Indy, Super Formula...)
  | "formulaJr" // F3 / F4 / Formula Renault / Vee / USF...
  | "gtDe" // GT: Alman markaları (ve bilinmeyen GT'ler)
  | "gtIt" // GT: İtalyan markaları
  | "gtUk" // GT: İngiliz / Japon markaları
  | "touring" // TCR, Supercars, BTCC, Stock Car Brasil
  | "proto" // LMP / LMDh / LMH / GTP / DPi
  | "stock" // NASCAR, late model, oval araçlar
  | "rally" // Ralli / Rallycross
  | "road"; // diğer her şey (yol arabaları)

export type CarInfo = Pick<Status, "carName" | "carPath" | "className" | "category">;

const CLASSIC = /lotus ?49|lotus ?79|historic|vintage|model ?t\b/;
// Brezilya Stock Car aslında tur arabası: oval kuralına düşmesin
const TOURING =
  /stock ?car (brasil|pro)|stockcar ?brasil|scb ?\d|tcr|\btcx?\b|touring|supercars?|btcc/;
const PROTO =
  /\blm ?p ?\d?\b|lmp\d|\blmh\b|lmdh|hypercar|\bgtp\b|\bdpi\b|prototype|p217|ligier|radical|oreca|499p|porsche ?96[3]|porsche ?919|\b919\b|audi ?r18|\br18\b|arx-?0\d|hpd ?arx|acura ?arx|v-?series\.?r|cadillac ?v-?series|bmw ?m ?hybrid|bmwlmdh|glickenhaus|9x8|gr010|ts0[45]0|vanwall|alpine ?a42|valkyrie|riley ?dp|group ?c\b|groupc|\bp[1-4]\b/;
const FORMULA =
  /formula|\bf-?(1|2|3|4|v8|v10|v12|x|ultimate|reiza|trainer|inter|usa|classic|retro|vintage|hitech|vee|renault)\b|\bfr ?(2\.0|3\.5|20|35)\b|fr20|fr35|indy|\bir-?\d\d\b|ir18|ir01|dw12|dallara ?f3|f317|super ?formula|\bsf\d\d\b|fia ?f[234]|tatuus|skip ?barber|pro ?mazda|star ?mazda|\busf\b|usf ?\d|pm-?18|ff1600|mercedes ?w1\d|\bw1[0-9]\b|mp4|williams ?fw|open ?wheel|openwheel|single ?seater/;
/** Alt formula sınıfları (FORMULA'nın alt kümesi olmalı) */
const FORMULA_JR =
  /\bf-?(3|4|renault|vee|trainer|inter|usa)\b|\bfr ?(2\.0|3\.5|20|35)\b|fr20|fr35|dallara ?f3|f317|fia ?f[34]|tatuus|skip ?barber|pro ?mazda|star ?mazda|\busf\b|usf ?\d|pm-?18|ff1600|formula ?f?[34]\b|formula ?(renault|ford|vee|trainer|regional|inter|usa|junior|lights|star|abarth|bmw)/;
const RALLY = /rally|\bwrc\b|\bgrc\b|\bwrx\b|lites ?rx|rx ?lites|\brx ?2\b|dirt ?road|dirtroad/;
const STOCK =
  /nascar|stock ?car|stockcar|late ?model|latemodel|sprint ?car|sprintcar|midget|legends?\b|modified|silver ?crate|street ?stock|super ?truck|truck ?series|trucks?\b|silverado|tundra|f-?150|\barca\b|xfinity|cup ?series|next ?gen|nextgen|outlaw|\bsk\b|oval/;
const GT =
  /\bgt ?[1-4]\b|gt[1-4]|gte|gtd|gtlm|gt500|gt300|gt ?sprint|\bcup\b|carrera ?cup|992 ?cup|cup ?car|tcr|\btcx?\b|touring|supercars?|btcc|\bdtm\b|super ?trofeo|trofeo|ferrari ?challenge|\bchl\b|\bst\b|r8 ?lms|huracan|amg ?gt|m4 ?gt|720s|488|296|nsx ?gt|c[5-8]\.?r\b/;
const GT_IT = /ferrari|lamborghini|lambo|huracan|maserati|alfa|\b(458|488|296)\b|mc20|trofeo|challenge|\bchl\b/;
const GT_UK =
  /mclaren|\b(720|570|650)s\b|aston|vantage|bentley|jaguar|lotus|ginetta|honda|acura|nsx|nissan|gt-?r\b|lexus|\brc ?f\b|toyota|supra|gr ?86|mazda|mx-?5|subaru|brz/;

/** Araç bilgisini tek bir küçük harf metne çevirir */
function carText(st: CarInfo) {
  return `${st.carName ?? ""} ${(st.carPath ?? "").replace(/[_\\/]+/g, " ")} ${st.className ?? ""}`.toLowerCase();
}

/** Sürülen aracın ailesi; araç bilgisi yoksa undefined */
export function carFamily(st: CarInfo | undefined): CarFamily | undefined {
  if (!st || !(st.carName || st.carPath || st.className || st.category)) return undefined;
  const text = carText(st);
  if (CLASSIC.test(text)) return "classic";
  if (/stock ?car (brasil|pro)|stockcar ?brasil|scb ?\d/.test(text)) return "touring";
  if (PROTO.test(text)) return "proto";
  if (FORMULA.test(text)) return FORMULA_JR.test(text) ? "formulaJr" : "formula";
  if (RALLY.test(text)) return "rally";
  if (STOCK.test(text)) return "stock";
  if (GT.test(text)) {
    if (TOURING.test(text)) return "touring";
    if (GT_IT.test(text)) return "gtIt";
    if (GT_UK.test(text)) return "gtUk";
    return "gtDe";
  }
  // Pist türüne göre son tahmin (iRacing: Road / Oval / DirtRoad / DirtOval)
  const cat = (st.category ?? "").toLowerCase();
  if (cat.includes("oval")) return "stock";
  if (cat === "dirtroad" || cat === "dirt_road") return "rally";
  return "road";
}
