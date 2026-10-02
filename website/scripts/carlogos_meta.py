#!/usr/bin/env python3
"""src/assets/carlogos/*.png dosyalarını inceler ve meta.json üretir.

Koyu zeminli overlay'lerde okunmayan logoları bulur:
  dark: ortalama parlaklığı düşük ya da zemine değen kenarı koyu olan logo -> arkasına açık renkli çip konur
  mono: logo tamamen koyu ve renksiz (düz siyah) -> çip yerine beyaza çevrilir (CSS filter)
Yeni PNG ekledikten sonra çalıştırın:  python3 scripts/carlogos_meta.py
"""
import glob, json, os
from PIL import Image

DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "carlogos")
DARK_V = 90      # max(r,g,b) bunun altındaysa piksel "koyu"
EDGE = 2        # kenar kalınlığı (px)

MONO_FRAC = 0.97  # neredeyse tamamı koyu ve renksizse tek renk

def analyse(im):
    """Zemine değen (saydam piksele <=2px uzak) piksellerin ne kadarı koyu? İçi koyu ama
    kenarı parlak logolar (BMW, Lamborghini…) koyu zeminde zaten okunur; asıl sorun kenarı koyu olanlar."""
    w, h = im.size
    px = im.load()
    op = [[px[x, y][3] > 40 for x in range(w)] for y in range(h)]
    n = edge = edge_dark = dark = grey_dark = 0
    lum = val = 0.0
    for y in range(h):
        for x in range(w):
            if not op[y][x]:
                continue
            r, g, b, _ = px[x, y]
            n += 1
            lum += 0.2126 * r + 0.7152 * g + 0.0722 * b
            val += max(r, g, b)
            is_dark = max(r, g, b) < DARK_V
            dark += is_dark
            grey_dark += is_dark and max(r, g, b) - min(r, g, b) < 30
            near = False
            for dy in range(-EDGE, EDGE + 1):
                for dx in range(-EDGE, EDGE + 1):
                    yy, xx = y + dy, x + dx
                    if yy < 0 or xx < 0 or yy >= h or xx >= w or not op[yy][xx]:
                        near = True
            if near:
                edge += 1
                edge_dark += is_dark
    return n, lum / max(n, 1), val / max(n, 1), dark / max(n, 1), grey_dark / max(n, 1), edge_dark / max(edge, 1)


out = {}
for f in sorted(glob.glob(os.path.join(DIR, "*.png"))):
    im = Image.open(f).convert("RGBA")
    n, lum, val, dark, grey_dark, edge_dark = analyse(im)
    if not n:
        continue
    # 1) genel olarak koyu ve soluk (kırmızı gibi canlı renkler hariç: Kia)
    # 2) kenarı da içi de koyu ve genel parlaklığı düşük (Buick yazısı, Peugeot kalkanı, Ford ovali)
    is_dark = (lum < 70 and val < 160) or (edge_dark >= 0.55 and dark >= 0.4 and lum < 100)
    e = {"w": im.width, "h": im.height, "lum": round(lum), "darkFrac": round(dark, 2), "edgeDark": round(edge_dark, 2), "dark": is_dark}
    if grey_dark >= MONO_FRAC:
        e["mono"] = True
    out[os.path.basename(f)[:-4]] = e

with open(os.path.join(DIR, "meta.json"), "w") as fh:
    json.dump(out, fh, indent=1, sort_keys=True)
    fh.write("\n")
print("dark:", [k for k, v in out.items() if v["dark"]])
print("mono:", [k for k, v in out.items() if v.get("mono")])
