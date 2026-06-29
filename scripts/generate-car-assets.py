from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math, json

out = Path('public/assets/cars')
out.mkdir(parents=True, exist_ok=True)
W, H = 180, 104

def hex_to_rgba(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)

def lighten(rgb, amt=35):
    return tuple(min(255, c + amt) for c in rgb[:3]) + (rgb[3],)

def draw_car(path, body='#e5e7eb', roof='#94a3b8', target=False, taxi=False, bus=False, truck=False, compact=False):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.ellipse((25, 66, 154, 92), fill=(0, 0, 0, 48))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)))
    d = ImageDraw.Draw(img)
    col = hex_to_rgba(body)
    roofc = hex_to_rgba(roof)
    outline = (15, 23, 42, 255)

    if bus:
        body_poly = [(16, 28), (28, 17), (146, 17), (162, 28), (164, 70), (153, 82), (25, 83), (15, 70)]
        win = [(29, 25), (143, 25), (148, 48), (28, 49)]
        wheels = [(38, 76, 62, 98), (119, 76, 143, 98)]
    elif truck:
        body_poly = [(16, 52), (35, 24), (95, 24), (105, 42), (142, 42), (162, 68), (151, 82), (27, 82)]
        win = [(40, 30), (88, 30), (96, 45), (31, 47)]
        wheels = [(40, 76, 64, 99), (116, 76, 140, 99)]
    elif compact:
        body_poly = [(24, 58), (42, 29), (73, 20), (127, 31), (148, 58), (139, 76), (35, 78)]
        win = [(50, 32), (80, 25), (119, 34), (130, 52), (42, 53)]
        wheels = [(43, 72, 64, 94), (112, 72, 133, 94)]
    elif target:
        body_poly = [(13, 59), (38, 24), (86, 13), (139, 21), (166, 57), (156, 78), (27, 81)]
        win = [(47, 28), (86, 18), (128, 27), (143, 51), (36, 52)]
        wheels = [(43, 75, 68, 101), (119, 75, 144, 101)]
    else:
        body_poly = [(17, 58), (40, 27), (78, 17), (132, 27), (154, 57), (145, 77), (30, 79)]
        win = [(48, 31), (80, 23), (122, 32), (136, 52), (38, 53)]
        wheels = [(43, 73, 67, 97), (114, 73, 138, 97)]

    d.polygon(body_poly, fill=outline)
    inner = [(x + (2 if x < W / 2 else -2), y + (2 if y < 50 else -2)) for x, y in body_poly]
    d.polygon(inner, fill=col)
    d.line([(31, 59), (84, 40), (144, 52)], fill=lighten(col, 45), width=4)
    d.line([(30, 66), (147, 64)], fill=(15, 23, 42, 88), width=2)
    d.polygon(win, fill=outline)
    win_inner = [(x + (2 if x < W / 2 else -2), y + (2 if y < 45 else -2)) for x, y in win]
    d.polygon(win_inner, fill=roofc)
    d.line([(86, 20), (86, 52)], fill=(15, 23, 42, 120), width=2)

    if target:
        for x in (21, 30, 148, 157):
            d.rectangle((x, 55, x + 7, 62), fill=(254, 243, 199, 255), outline=(15, 23, 42, 100))
        for x in (68, 77, 86, 95):
            d.rectangle((x, 68, x + 4, 72), fill=(17, 24, 39, 210))
        d.text((104, 59), '5', fill=(15, 23, 42, 255))
    else:
        d.rectangle((20, 55, 30, 62), fill=(253, 230, 138, 255))
        d.rectangle((144, 55, 154, 62), fill=(252, 165, 165, 255))
        if 'ev-distractor' in str(path):
            for x in (24, 31, 146, 153):
                d.rectangle((x, 55, x + 5, 61), fill=(254, 243, 199, 255))
    if taxi:
        d.rounded_rectangle((74, 12, 108, 24), radius=5, fill=(250, 204, 21, 255), outline=outline, width=2)

    for box in wheels:
        d.ellipse(box, fill=outline)
        x0, y0, x1, y1 = box
        d.ellipse((x0 + 7, y0 + 7, x1 - 7, y1 - 7), fill=(226, 232, 240, 255))
        d.ellipse((x0 + 8, y0 + 8, x1 - 8, y1 - 8), fill=(71, 85, 105, 255))
    img.save(out / path)

assets = []
for name, color in [('target-ioniq5-white.png', '#f8fafc'), ('target-ioniq5-silver.png', '#d6d3d1')]:
    draw_car(name, color, '#94a3b8', target=True)
    assets.append({'file': name, 'type': 'target'})
for i, color in enumerate(['#e5e7eb', '#cbd5e1', '#d8c9a5', '#f1f5f9', '#d1d5db', '#e7e5e4'], 1):
    name = f'ev-distractor-{i:02d}.png'
    draw_car(name, color, ['#64748b', '#94a3b8', '#475569'][i % 3])
    assets.append({'file': name, 'type': 'distractor'})
for i, color in enumerate(['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#111827'], 1):
    name = f'car-{i:02d}.png'
    draw_car(name, color, ['#0f172a', '#1f2937', '#e2e8f0', '#93c5fd'][i % 4], compact=(i % 5 == 0))
    assets.append({'file': name, 'type': 'normal'})
for i, color in enumerate(['#facc15', '#fde047', '#f59e0b'], 1):
    name = f'taxi-{i:02d}.png'
    draw_car(name, color, '#0f172a', taxi=True)
    assets.append({'file': name, 'type': 'taxi'})
for i, color in enumerate(['#38bdf8', '#fb7185'], 1):
    name = f'bus-{i:02d}.png'
    draw_car(name, color, '#e2e8f0', bus=True)
    assets.append({'file': name, 'type': 'bus'})
for i, color in enumerate(['#94a3b8', '#a16207'], 1):
    name = f'truck-{i:02d}.png'
    draw_car(name, color, '#475569', truck=True)
    assets.append({'file': name, 'type': 'truck'})

(out / 'manifest.json').write_text(json.dumps(assets, indent=2), encoding='utf-8')
cols = 5
rows = math.ceil(len(assets) / cols)
sheet = Image.new('RGBA', (cols * 160, rows * 112), (15, 23, 42, 255))
sd = ImageDraw.Draw(sheet)
for idx, a in enumerate(assets):
    im = Image.open(out / a['file']).resize((135, 78), Image.Resampling.LANCZOS)
    x = (idx % cols) * 160 + 12
    y = (idx // cols) * 112 + 8
    sd.rounded_rectangle((x - 4, y - 4, x + 140, y + 88), radius=12, fill=(30, 41, 59, 255))
    sheet.alpha_composite(im, (x, y))
    sd.text((x, y + 80), a['file'][:21], fill=(226, 232, 240, 255))
sheet.save(out / 'sprite-preview.png')
print(f'created {len(assets)} assets in {out}')
