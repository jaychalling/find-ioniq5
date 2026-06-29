from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageChops

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "cars" / "gpt"
NORMAL_SHEET = Path(r"C:\Users\PC\AppData\Local\hermes\cache\images\openai_codex_gpt-image-2-low_20260629_130829_9194916e.png")
EV_SHEET = Path(r"C:\Users\PC\AppData\Local\hermes\cache\images\openai_codex_gpt-image-2-low_20260629_131121_9a0b6788.png")

NORMAL_NAMES = [
    *[f"car-gpt-{i:02d}.png" for i in range(1, 14)],
    "taxi-gpt-01.png", "taxi-gpt-02.png",
    "bus-gpt-01.png", "bus-gpt-02.png",
    "truck-gpt-01.png", "truck-gpt-02.png", "truck-gpt-03.png",
]
EV_NAMES = [f"ev-distractor-gpt-{i:02d}.png" for i in range(1, 17)]


def keep_main_components(rgba: Image.Image) -> Image.Image:
    alpha = rgba.getchannel("A")
    pix = alpha.load()
    w, h = alpha.size
    seen = bytearray(w * h)
    comps: list[tuple[int, list[tuple[int, int]], tuple[int, int, int, int]]] = []
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if seen[idx] or pix[x, y] <= 18:
                continue
            stack = [(x, y)]
            seen[idx] = 1
            pts: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not seen[nidx] and pix[nx, ny] > 18:
                            seen[nidx] = 1
                            stack.append((nx, ny))
            if pts:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                comps.append((len(pts), pts, (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    if not comps:
        return rgba
    comps.sort(reverse=True, key=lambda item: item[0])
    keep = Image.new("L", (w, h), 0)
    keep_pix = keep.load()
    largest = comps[0][0]
    for area, pts, bbox in comps:
        x0, y0, x1, y1 = bbox
        bw = x1 - x0
        bh = y1 - y0
        bottom_stray = y1 > h * 0.82 and bw < w * 0.46 and bh < h * 0.24 and area < largest * 0.18
        side_stray = (x0 < w * 0.04 or x1 > w * 0.96) and bw < w * 0.16 and area < largest * 0.08
        if bottom_stray or side_stray:
            continue
        if area >= max(90, largest * 0.015):
            for x, y in pts:
                keep_pix[x, y] = 255
    cleaned = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    cleaned.alpha_composite(rgba)
    cleaned.putalpha(ImageChops.multiply(rgba.getchannel("A"), keep))
    return cleaned


def remove_white_and_fit(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pix = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if r > 242 and g > 242 and b > 242:
                pix[x, y] = (255, 255, 255, 0)
            elif r > 232 and g > 232 and b > 232:
                pix[x, y] = (r, g, b, int(a * 0.22))
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rgba = keep_main_components(rgba)
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rgba.thumbnail((286, 190), Image.Resampling.LANCZOS)
    pad_x, pad_y = 10, 8
    canvas = Image.new("RGBA", (rgba.width + pad_x * 2, rgba.height + pad_y * 2), (255, 255, 255, 0))
    canvas.alpha_composite(rgba, (pad_x, pad_y))
    return canvas


def crop_sheet(sheet: Path, cols: int, rows: int, names: list[str], kind: str) -> list[dict]:
    img = Image.open(sheet).convert("RGB")
    cell_w = img.width // cols
    cell_h = img.height // rows
    results = []
    for idx, name in enumerate(names):
        col = idx % cols
        row = idx // cols
        crop = img.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        out = OUT_DIR / name
        remove_white_and_fit(crop).save(out, optimize=True)
        results.append({"file": name, "type": kind, "source": sheet.name})
    return results


def normalize_existing_targets() -> None:
    for target in [OUT_DIR / "target-ioniq5-gpt-01.png", OUT_DIR / "target-ioniq5-gpt-02.png"]:
        if not target.exists():
            continue
        im = Image.open(target).convert("RGBA")
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        im.thumbnail((300, 200), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (im.width + 20, im.height + 16), (255, 255, 255, 0))
        canvas.alpha_composite(im, (10, 8))
        canvas.save(target, optimize=True)


def manual_cleanup() -> None:
    # Sheet generation occasionally leaves a small white navigation/marker triangle
    # in this cell. Remove only pale pixels near the bottom so the vehicle remains.
    target = OUT_DIR / "car-gpt-12.png"
    if not target.exists():
        return
    im = Image.open(target).convert("RGBA")
    pix = im.load()
    for y in range(188, im.height):
        for x in range(im.width):
            r, g, b, a = pix[x, y]
            if a and r > 140 and g > 140 and b > 140:
                pix[x, y] = (r, g, b, 0)
    for y in range(145, im.height):
        for x in range(210, im.width):
            r, g, b, a = pix[x, y]
            if a and r > 70 and g > 70 and b > 70:
                pix[x, y] = (r, g, b, 0)
    im.save(target, optimize=True)


def build_preview(files: list[str]) -> None:
    thumbs = []
    for name in files:
        path = OUT_DIR / name
        if not path.exists():
            continue
        im = Image.open(path).convert("RGBA")
        im.thumbnail((136, 102), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (154, 122), (15, 23, 42, 255))
        tile.alpha_composite(im, ((154 - im.width) // 2, 8))
        thumbs.append(tile)
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    preview = Image.new("RGBA", (cols * 154, rows * 122), (2, 6, 23, 255))
    for i, tile in enumerate(thumbs):
        preview.alpha_composite(tile, ((i % cols) * 154, (i // cols) * 122))
    preview.save(OUT_DIR / "sprite-preview-gpt.png", optimize=True)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    # Keep separately generated target cars if present.
    for target in ["target-ioniq5-gpt-01.png", "target-ioniq5-gpt-02.png"]:
        if (OUT_DIR / target).exists():
            results.append({"file": target, "type": "target", "source": "single-generation"})
    results += crop_sheet(EV_SHEET, 4, 4, EV_NAMES, "distractor")
    results += crop_sheet(NORMAL_SHEET, 5, 4, NORMAL_NAMES, "normal")
    normalize_existing_targets()
    manual_cleanup()
    (OUT_DIR / "manifest-gpt.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    build_preview([r["file"] for r in results])
    print(f"wrote {len(results)} sprites to {OUT_DIR}")


if __name__ == "__main__":
    main()
