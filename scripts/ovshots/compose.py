import sys, os
from PIL import Image, ImageDraw, ImageFilter
S=sys.argv[1]
ids=[l.strip() for l in open(f'{S}/ids2.txt') if l.strip()]
W,H=960,600
for i in ids:
    p=f'{S}/raw_{i}.png'
    if not os.path.exists(p): continue
    im=Image.open(p).convert('RGBA')
    bg=Image.new('RGBA',(W,H),(11,13,18,255))
    glow=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(glow)
    d.ellipse((W*0.15,H*0.05,W*0.85,H*0.95),fill=(255,138,42,18))
    glow=glow.filter(ImageFilter.GaussianBlur(90)); bg=Image.alpha_composite(bg,glow)
    k=min((W-80)/im.width, (H-80)/im.height, 1.0)
    nw,nh=max(1,int(im.width*k)),max(1,int(im.height*k))
    im2=im.resize((nw,nh),Image.LANCZOS)
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); sd=ImageDraw.Draw(sh)
    x,y=(W-nw)//2,(H-nh)//2
    sd.rounded_rectangle((x+4,y+10,x+nw-4,y+nh+6),radius=14,fill=(0,0,0,150))
    sh=sh.filter(ImageFilter.GaussianBlur(18)); bg=Image.alpha_composite(bg,sh)
    bg.alpha_composite(im2,(x,y))
    os.makedirs(f'{S}/ovout',exist_ok=True)
    bg.convert('RGB').save(f'{S}/ovout/{i}.webp','WEBP',quality=88,method=6)
files=[f for f in ids if os.path.exists(f'{S}/ovout/{f}.webp')]
tw,th=320,200; cols=6; rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*tw,rows*(th+18)),(30,30,30)); dd=ImageDraw.Draw(sheet)
for n,f in enumerate(files):
    t=Image.open(f'{S}/ovout/{f}.webp').resize((tw,th))
    cx,cy=(n%cols)*tw,(n//cols)*(th+18)
    sheet.paste(t,(cx,cy+18)); dd.text((cx+4,cy+3),f,fill=(255,255,255))
sheet.save(f'{S}/contact.png'); print(len(files))
