// Yönetim › Tüm mesajlar (c80): tüm sohbetler tarihe göre — arkadaş (özel mesaj), takım, grup ve ekip odası.
// Sohbet listesi (en yeni üstte) → tıklayınca salt okunur döküm; metin aranırsa eşleşen mesajların düz listesi de var.
// Sunucu her ilk sayfayı moderasyon kaydına yazar (aynı süzgeç 10 dakikada bir kez).
// c80 sunucuda henüz yoksa eski görünüme (yalnızca özel mesajlar, admin_messages) düşer.
import { $, $$, esc, fmtDate, sb } from "./core.js";

const T_PAGE = 60;
const M_PAGE = 100;
const KINDS = { dm: "Arkadaş", team: "Takım", group: "Grup", crew: "Ekip" };
const st = { kind: "", text: "", from: "", to: "", member: null, view: "threads", thread: null, hit: null };

const CSS = `
.amx-th{display:flex;flex-direction:column;gap:3px;width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font:inherit;text-align:left;cursor:pointer}
.amx-th:hover{border-color:var(--accent)}
.amx-th .top{display:flex;gap:8px;align-items:baseline}.amx-th .top b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.amx-th .sub{display:flex;gap:8px;align-items:center;min-width:0}.amx-th .sub .prev{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.amx-day{text-align:center;font-size:12px;opacity:.75;margin:8px 0 2px}
.amx-del{font-style:italic;opacity:.6}
.amx-hit{border-color:var(--accent)!important}
.amx-pick{position:relative}.amx-pop{position:absolute;z-index:5;left:0;right:0;top:100%;max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--bg-2,var(--bg));padding:4px}
.amx-pop button{display:block;width:100%;padding:6px 8px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:6px}
.amx-pop button:hover{background:rgba(127,127,127,.18)}`;

const notDeployed = (e) => /could not find|PGRST202|does not exist|404/i.test(String(e?.message || e));
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data || [];
}
const dayIso = (v, next = false) => {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (next) d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const META = { bg: "Sohbet arka planını değiştirdi", join: "gruba eklendi", leave: "gruptan ayrıldı", kick: "gruptan çıkarıldı", owner: "artık grubun sahibi", rename: "Grubun adı değişti:" };
function bodyText(m) {
  if (m.deleted) return "Bu mesaj silindi";
  const x = m.meta;
  if (x?.poll && !m.body) return "📊 Anket";
  if (x?.t === "bg") return META.bg;
  if (x?.t === "rename") return `${META.rename} ${x.name ?? "?"}`;
  if (x?.t && META[x.t]) return `${x.name ?? "?"} ${META[x.t]}`;
  return m.body;
}
const title = (t) => (t.kind === "dm" ? `${t.a_name} ↔ ${t.b_name ?? "?"}` : t.kind === "crew" ? `${t.a_name} — ekip odası` : t.a_name);
function threadOf(m) {
  if (m.kind !== "dm") return { kind: m.kind, a: m.peer, a_name: m.peer_name, b: null, b_name: null };
  const s = { id: m.sender || "", name: m.sender_name };
  const r = { id: m.peer, name: m.peer_name };
  const [x, y] = s.id < r.id ? [s, r] : [r, s];
  return { kind: "dm", a: x.id, a_name: x.name, b: y.id, b_name: y.name };
}
const filter = () => ({ p_kind: st.kind || null, p_user: st.member?.id || null, p_query: st.text || null, p_from: dayIso(st.from), p_to: dayIso(st.to, true) });

/** @param el içerik alanı  @param fallback c80 yoksa çağrılacak eski görünüm */
export async function sohbetler(el, fallback) {
  if (!$("#amx-css")) document.head.insertAdjacentHTML("beforeend", `<style id="amx-css">${CSS}</style>`);
  if (st.thread) return transcript(el, fallback);
  el.innerHTML = `<h2>Tüm mesajlar</h2>
    <p class="muted small">Üyelerin tüm sohbetleri tarihe göre: arkadaş mesajları, takım ve grup sohbetleri, açık ekip odaları. Burası salt okunurdur.
      Her açılış ve arama moderasyon kayıtlarına yazılır. Ekip odası mesajları yarış bitince silindiği için yalnızca o an açık odalar görünür.</p>
    <div class="seg" id="amx-kind" style="margin-bottom:10px">${[["", "Tümü"], ...Object.entries(KINDS)].map(([k, l]) => `<button data-k="${k}" class="${k === st.kind ? "on" : ""}">${l}</button>`).join("")}</div>
    <form id="amx-f" class="am-filters card">
      <div class="field"><label>Ad ya da mesaj metni ara</label><input name="text" value="${esc(st.text)}"></div>
      <div class="field amx-pick"><label>Üye</label>${
        st.member
          ? `<div class="row" style="gap:8px"><b>${esc(st.member.display_name)}</b><button type="button" class="btn btn-sm" id="amx-unpick">Kaldır</button></div>`
          : `<input id="amx-mq" placeholder="Üye seç: ad ya da iRacing adı" autocomplete="off"><div class="amx-pop" id="amx-pop" hidden></div>`
      }</div>
      <div class="field date"><label>Başlangıç</label><input type="date" name="from" value="${esc(st.from)}"></div>
      <div class="field date"><label>Bitiş</label><input type="date" name="to" value="${esc(st.to)}"></div>
      <button class="btn btn-accent">Ara</button>
    </form>
    ${st.text ? `<div class="seg" id="amx-view" style="margin-bottom:10px">${[["threads", "Sohbetler"], ["hits", "Eşleşen mesajlar"]].map(([k, l]) => `<button data-v="${k}" class="${k === st.view ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}
    <div id="amx-res" class="stack"><p class="muted">Yükleniyor…</p></div>`;
  const again = () => sohbetler(el, fallback);
  $$("#amx-kind button", el).forEach((b) =>
    b.addEventListener("click", () => {
      st.kind = b.dataset.k;
      again();
    }),
  );
  $$("#amx-view button", el).forEach((b) =>
    b.addEventListener("click", () => {
      st.view = b.dataset.v;
      again();
    }),
  );
  $("#amx-f", el).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    st.text = String(f.get("text") || "").trim();
    st.from = String(f.get("from") || "");
    st.to = String(f.get("to") || "");
    if (!st.text) st.view = "threads";
    again();
  });
  $("#amx-unpick", el)?.addEventListener("click", () => {
    st.member = null;
    again();
  });
  const mq = $("#amx-mq", el);
  let timer;
  let seq = 0;
  mq?.addEventListener("input", () => {
    clearTimeout(timer);
    const q = mq.value.trim();
    const pop = $("#amx-pop", el);
    if (q.length < 2) return void (pop.hidden = true);
    const my = ++seq;
    timer = setTimeout(async () => {
      let rows = [];
      try {
        rows = await rpc("admin_chat_users", { p_q: q, p_limit: 12 });
      } catch {
        /* liste zaten hatayı gösterir */
      }
      if (my !== seq) return;
      pop.hidden = false;
      pop.innerHTML = rows.length
        ? rows.map((u, i) => `<button type="button" data-i="${i}">${esc(u.display_name)}${u.iracing_name && u.iracing_name !== u.display_name ? ` <span class="muted small">(${esc(u.iracing_name)})</span>` : ""}</button>`).join("")
        : `<p class="muted small" style="margin:6px 8px">Üye bulunamadı.</p>`;
      $$("button", pop).forEach((b) =>
        b.addEventListener("click", () => {
          st.member = rows[+b.dataset.i];
          again();
        }),
      );
    }, 300);
  });

  const res = $("#amx-res", el);
  const hits = st.text && st.view === "hits";
  let rows = [];
  const more = async (first) => {
    const last = rows[rows.length - 1];
    let page;
    try {
      page = hits
        ? await rpc("admin_chat_messages", { ...filter(), p_before: first ? null : last.created_at, p_before_id: first ? null : last.id, p_limit: M_PAGE })
        : await rpc("admin_chat_threads", { ...filter(), p_before: first ? null : last.last_at, p_limit: T_PAGE });
    } catch (e) {
      if (first && notDeployed(e) && fallback) return fallback(el);
      res.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
      return;
    }
    if (!res.isConnected) return;
    rows = rows.concat(page);
    const full = page.length >= (hits ? M_PAGE : T_PAGE);
    res.innerHTML =
      (rows.length
        ? rows
            .map((r, i) =>
              hits
                ? `<div class="am-msg"><div class="head"><span class="badge">${KINDS[r.kind] || esc(r.kind)}</span><b>${esc(r.sender_name)}</b><span class="muted">→</span><b>${esc(r.peer_name)}</b><span class="muted small">${fmtDate(r.created_at, true)}</span></div>
                    <p class="${r.deleted ? "amx-del" : ""}">${esc(bodyText(r))}</p><button type="button" class="linkbtn" data-i="${i}">Sohbete git</button></div>`
                : `<button type="button" class="amx-th" data-i="${i}"><span class="top"><b>${esc(title(r))}</b><span class="muted small">${fmtDate(r.last_at, true)}</span></span>
                    <span class="sub"><span class="badge">${KINDS[r.kind] || esc(r.kind)}</span><span class="muted small prev">${esc(r.last_sender_name)}: ${esc(r.last_body ? bodyText({ body: r.last_body }) : "…")}</span><span class="muted small">${r.msg_count} mesaj</span></span></button>`,
            )
            .join("")
        : `<div class="card muted">${hits ? "Mesaj bulunamadı." : "Sohbet bulunamadı."}</div>`) + (full ? `<button type="button" class="btn btn-sm" id="amx-more">${hits ? "Daha eski" : "Daha eski sohbetler"}</button>` : "");
    $$("[data-i]", res).forEach((b) =>
      b.addEventListener("click", () => {
        const r = rows[+b.dataset.i];
        st.thread = hits ? threadOf(r) : r;
        st.hit = hits ? r : null;
        again();
      }),
    );
    $("#amx-more", res)?.addEventListener("click", () => more(false));
  };
  await more(true);
}

async function transcript(el, fallback) {
  const th = st.thread;
  const hit = st.hit;
  el.innerHTML = `<h2>Tüm mesajlar</h2>
    <div class="row" style="gap:10px;margin-bottom:10px"><button class="btn btn-sm" id="amx-back">${hit ? "← Sonuçlara dön" : "← Sohbetler"}</button>
      <b>${esc(title(th))}</b><span class="badge">${KINDS[th.kind] || esc(th.kind)}</span><span class="muted small" style="margin-left:auto">Salt okunur</span></div>
    <div id="amx-res" class="stack"><p class="muted">Yükleniyor…</p></div>`;
  $("#amx-back", el).addEventListener("click", () => {
    st.thread = null;
    st.hit = null;
    sohbetler(el, fallback);
  });
  const res = $("#amx-res", el);
  let rows = []; // eskiden yeniye
  const more = async (first) => {
    let page;
    try {
      page = await rpc("admin_chat_messages", {
        p_kind: th.kind,
        p_user: th.kind === "dm" ? th.a : null,
        p_other: th.kind === "dm" ? th.b : null,
        p_room: th.kind === "dm" ? null : th.a,
        p_to: first && hit ? new Date(new Date(hit.created_at).getTime() + 1).toISOString() : null,
        p_before: first ? null : rows[0].created_at,
        p_before_id: first ? null : rows[0].id,
        p_limit: M_PAGE,
      });
    } catch (e) {
      res.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`;
      return;
    }
    if (!res.isConnected) return;
    rows = [...page].reverse().concat(rows);
    let day = "";
    res.innerHTML =
      (page.length >= M_PAGE ? `<button type="button" class="btn btn-sm" id="amx-more">Daha eski</button>` : "") +
      (rows.length
        ? rows
            .map((m) => {
              const d = new Date(m.created_at).toDateString();
              const sep = d !== day ? `<div class="amx-day">${fmtDate(m.created_at)}</div>` : "";
              day = d;
              return `${sep}<div class="am-msg ${hit && hit.id === m.id ? "amx-hit" : ""}"><div class="head"><b>${esc(m.sender_name)}</b>${m.deleted ? `<span class="badge">Silindi</span>` : ""}<span class="muted small">${fmtDate(m.created_at, true)}</span></div>
                <p class="${m.deleted ? "amx-del" : ""}" style="margin-bottom:0">${esc(bodyText(m))}</p></div>`;
            })
            .join("")
        : `<div class="card muted">Bu sohbette mesaj yok.</div>`) +
      (hit && rows.length ? `<button type="button" class="btn btn-sm" id="amx-new">En yeni mesajlara git</button>` : "");
    $("#amx-more", res)?.addEventListener("click", () => more(false));
    $("#amx-new", res)?.addEventListener("click", () => {
      st.hit = null;
      sohbetler(el, fallback);
    });
    if (first) (hit ? $(".amx-hit", res) : res.lastElementChild)?.scrollIntoView({ block: "center" });
  };
  await more(true);
}
