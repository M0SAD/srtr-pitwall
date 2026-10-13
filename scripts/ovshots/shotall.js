const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2];
const ids = fs.readFileSync(process.argv[3], "utf8").split("\n").filter(Boolean);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
  const p = await b.newPage({ viewport: { width: 1900, height: 1300 }, deviceScaleFactor: 2, locale: "tr-TR" });
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));
  await p.route(/supabase\.co|api\.github/, (r) => r.fulfill({ json: [] }));
  const measure = () =>
    p.evaluate(() => {
      const root = document.querySelector("#stage .ovview");
      if (!root) return null;
      let r = 0, btm = 0, l = Infinity, t = Infinity, n = 0;
      for (const e of [...root.querySelectorAll("*")]) {
        const b = e.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        n++;
        l = Math.min(l, b.left); t = Math.min(t, b.top); r = Math.max(r, b.right); btm = Math.max(btm, b.bottom);
      }
      return n ? { x: Math.floor(l), y: Math.floor(t), width: Math.ceil(r - l), height: Math.ceil(btm - t), n } : null;
    });
  const res = {};
  // Canlı veriyle boş / sönük kalanlar: örnek görünüm ya da veri yaması
  const CFG = {
    friendalert: { edits: ["1"] },
    blindspot: { edits: ["1"], o: { gap: 300, size: 110 }, w: 520, h: 140 },
    spotterbar: { edits: ["1"] },
    corners: { edits: ["0"], patch: { corners: {"bestLap": 4, "lapPct": 0.62, "corners": [{"n": 1, "pct": 0.08, "best": 24.1, "last": 23.6, "current": 24.4}, {"n": 2, "pct": 0.19, "best": 31.5, "last": 31.9, "current": 31.2}, {"n": 3, "pct": 0.31, "best": 18.2, "last": 18.0, "current": 18.6}, {"n": 4, "pct": 0.44, "best": 27.4, "last": 27.9, "current": 0}, {"n": 5, "pct": 0.57, "best": 35.8, "last": 35.1, "current": 0}, {"n": 6, "pct": 0.71, "best": 22.6, "last": 22.9, "current": 0}, {"n": 7, "pct": 0.86, "best": 29.3, "last": 28.8, "current": 0}]} } },
    livechat: { edits: ["1"], o: { height: 230 } },
    startlights: { edits: ["0"], patch: { status: { demo: false }, session: { state: 2, startLights: 2, startTotal: 5, startLit: 5 } } },
    digiflags: { edits: ["0"], patch: { session: { flags: ["yellow"] } } },
  };
  for (const id of ids) {
    let mode = "live";
    let bb = null;
    const c = CFG[id] || {};
    for (const edit of c.edits || ["0", "1"]) {
      const pq = (c.patch ? `&patch=${encodeURIComponent(JSON.stringify(c.patch))}` : "") + (c.o ? `&o=${encodeURIComponent(JSON.stringify(c.o))}` : "") + (c.w ? `&w=${c.w}&h=${c.h}` : "");
      await p.goto(`http://localhost:5182/scripts/ovshots/shots.html?id=${id}&edit=${edit}${pq}`);
      await p.waitForSelector("body[data-ready]", { timeout: 20000, state: "attached" }).catch(() => {});
      await p.waitForTimeout(1200);
      bb = await measure();
      if (bb && bb.width >= 60 && bb.height >= 30 && bb.n >= 3) { mode = edit === "1" ? "sample" : "live"; break; }
    }
    if (!bb) { console.log(id, "BOŞ"); res[id] = "empty"; continue; }
    await p.screenshot({ path: `${out}/raw_${id}.png`, clip: { x: bb.x, y: bb.y, width: Math.min(bb.width, 1840), height: Math.min(bb.height, 1240) } });
    res[id] = mode;
    console.log(id, mode, bb.width + "x" + bb.height);
  }
  fs.writeFileSync(`${out}/shots.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
