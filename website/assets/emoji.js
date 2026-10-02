// Hafif ifade (emoji) seçici: metin kutusunun yanına düğme ekler; kategorili açılır kutudan seçilen ifade
// imlecin yerine eklenir. Destek yazışmalarında (hesap ve yönetim sayfaları) kullanılır.

const CATS = [
  ["😀", "😀😃😄😁😆😅😂🤣😊🙂🙃😉😍🥰😘😋😛😜🤪😎🤓🥳🤔🤨😐😑😶🙄😏😬😮😯😲😳🥺😢😭😤😠😡🤯😱😨😰😓🤗🤭🤫😴🤤😵🤐🥴🤢🤧😷🤒🤕😇🤠🙁😕😟"],
  ["👍", "👍👎👌✌️🤞🤟🤘🤙👈👉👆👇☝️✋🤚👋👏🙌👐🤲🤝🙏✍️💪🫡🫶👀🧠"],
  ["❤️", "❤️🧡💛💚💙💜🖤🤍💔💯🔥✨⭐🌟⚡💥✅❌⚠️❓❗💡🔔📌📎🔒🔓⏱️⏳🆗🆕🆘"],
  ["🏁", "🏁🏎️🚗🚙🏆🥇🥈🥉🎖️🚦🚥🛞⛽🔧🔩🛠️🧯🚩🟢🟡🔴⚫⚪🔵🌧️☀️🌙🎮🕹️🎧🖥️📈"],
  ["🎉", "🎉🎊🎁🎂☕🍕🍔🍺📷📸🎥📺💻⌨️🖱️📱💬📧📝📅💰💳🧾🐛🔍🔗📦🚀🙈🙉🙊🤖"],
];

/** Dizgeyi görünen karakterlere (grafem) böl */
function split(s) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((x) => x.segment);
  return s.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*|./gu) || [];
}

/** Metin kutusunda imlecin yerine ekle */
export function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.setSelectionRange(s + text.length, s + text.length);
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

let openPop = null;
document.addEventListener("mousedown", (e) => {
  if (openPop && !openPop.wrap.contains(e.target)) openPop.close();
});
document.addEventListener("keydown", (e) => {
  if (openPop && e.key === "Escape") openPop.close();
});

/**
 * Metin kutusuna ifade düğmesi bağlar. Düğme `host` içine (verilmezse metin kutusunun hemen arkasına) eklenir.
 * title: düğmenin ipucu (çeviriyle verilir).
 */
export function attachEmoji(textarea, { host = null, title = "Emoji", up = true } = {}) {
  if (!textarea) return null;
  const wrap = document.createElement("span");
  wrap.className = "emo-wrap";
  wrap.innerHTML = `<button type="button" class="btn btn-sm emo-btn" title="${title.replace(/"/g, "&quot;")}" aria-label="${title.replace(/"/g, "&quot;")}">😊</button>`;
  const btn = wrap.firstElementChild;
  let pop = null;
  let cat = 0;
  const render = () => {
    pop.innerHTML =
      `<div class="emo-tabs">${CATS.map((c, i) => `<button type="button" data-c="${i}" class="${i === cat ? "on" : ""}">${c[0]}</button>`).join("")}</div>` +
      `<div class="emo-grid">${split(CATS[cat][1])
        .map((e) => `<button type="button" data-e="${e}">${e}</button>`)
        .join("")}</div>`;
  };
  const close = () => {
    pop?.remove();
    pop = null;
    btn.classList.remove("on");
    if (openPop?.wrap === wrap) openPop = null;
  };
  btn.addEventListener("click", () => {
    if (pop) return close();
    openPop?.close();
    pop = document.createElement("div");
    pop.className = "emo-pop" + (up ? " up" : "");
    pop.setAttribute("role", "dialog");
    render();
    // Tıklama metin kutusunun seçimini bozmasın
    pop.addEventListener("mousedown", (e) => e.preventDefault());
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.c != null) {
        cat = +b.dataset.c;
        render();
      } else if (b.dataset.e) insertAtCursor(textarea, b.dataset.e);
    });
    wrap.appendChild(pop);
    btn.classList.add("on");
    openPop = { wrap, close };
  });
  if (host) host.prepend(wrap);
  else textarea.insertAdjacentElement("afterend", wrap);
  return wrap;
}
