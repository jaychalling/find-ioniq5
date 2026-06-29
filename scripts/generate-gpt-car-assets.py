from __future__ import annotations

import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
HERMES_SRC = Path.home() / "AppData" / "Local" / "hermes" / "hermes-agent"
OUT_DIR = ROOT / "public" / "assets" / "cars" / "gpt"
CACHE_DIR = Path.home() / "AppData" / "Local" / "hermes" / "cache" / "images"

sys.path.insert(0, str(HERMES_SRC))
os.environ.setdefault("OPENAI_IMAGE_MODEL", "gpt-image-2-low")

import importlib.util  # noqa: E402

PLUGIN_PATH = HERMES_SRC / "plugins" / "image_gen" / "openai-codex" / "__init__.py"
spec_module = importlib.util.spec_from_file_location("hermes_openai_codex_image_gen", PLUGIN_PATH)
if spec_module is None or spec_module.loader is None:
    raise RuntimeError(f"Could not load image-gen plugin from {PLUGIN_PATH}")
openai_codex = importlib.util.module_from_spec(spec_module)
spec_module.loader.exec_module(openai_codex)
OpenAICodexImageGenProvider = openai_codex.OpenAICodexImageGenProvider


@dataclass(frozen=True)
class Spec:
    file: str
    kind: str
    prompt: str


STYLE = (
    "Game asset sprite, one single vehicle only, 3/4 top-down isometric view, "
    "cohesive polished toy-like 3D style, crisp silhouette, thick clean outline, "
    "simple studio lighting, no logo, no readable brand mark, no text except where explicitly requested, "
    "centered with generous padding, pure flat white background (#ffffff), no road, no scenery, no people."
)

TARGET_DETAIL = (
    "Hyundai IONIQ 5 inspired electric hatchback proportions without logo: pixel-like rectangular headlights, "
    "angular side creases, short hood, boxy futuristic hatchback silhouette, cyber silver/white body. "
    "Add a tiny non-branded badge-like label 'IONIQ 5' on the side so the target is identifiable."
)

SPECS: list[Spec] = [
    Spec("target-ioniq5-gpt-01.png", "target", f"{STYLE} {TARGET_DETAIL} Premium cyber silver body, teal pixel lights."),
    Spec("target-ioniq5-gpt-02.png", "target", f"{STYLE} {TARGET_DETAIL} Pearl white body, blue pixel lights."),
]

DISTRACTOR_COLORS = ["silver", "white", "champagne", "light gray", "blue gray", "pale mint", "soft beige", "ice blue"]
for i, color in enumerate(DISTRACTOR_COLORS, start=1):
    SPECS.append(
        Spec(
            f"ev-distractor-gpt-{i:02d}.png",
            "distractor",
            f"{STYLE} Futuristic compact electric hatchback, target-like but NOT an IONIQ 5, no labels, no text, rounded lamps instead of pixel lamps, {color} body, similar EV silhouette but different front fascia.",
        )
    )

NORMALS = [
    ("car-gpt-01.png", "normal", "red compact sedan"),
    ("car-gpt-02.png", "normal", "yellow city hatchback"),
    ("car-gpt-03.png", "normal", "blue family SUV"),
    ("car-gpt-04.png", "normal", "green small van"),
    ("car-gpt-05.png", "normal", "black luxury sedan"),
    ("car-gpt-06.png", "normal", "orange micro car"),
    ("car-gpt-07.png", "normal", "purple sporty coupe"),
    ("car-gpt-08.png", "normal", "teal wagon"),
    ("car-gpt-09.png", "normal", "pink kei car"),
    ("car-gpt-10.png", "normal", "navy police-like sedan without text"),
    ("car-gpt-11.png", "normal", "brown delivery van without text"),
    ("car-gpt-12.png", "normal", "lime mini SUV"),
    ("taxi-gpt-01.png", "taxi", "yellow taxi cab with roof light but no readable text"),
    ("taxi-gpt-02.png", "taxi", "green taxi cab with roof light but no readable text"),
    ("bus-gpt-01.png", "bus", "small red city bus, compact sprite"),
    ("bus-gpt-02.png", "bus", "blue shuttle bus, compact sprite"),
    ("truck-gpt-01.png", "truck", "white box truck, compact sprite"),
    ("truck-gpt-02.png", "truck", "orange pickup truck, compact sprite"),
    ("truck-gpt-03.png", "truck", "gray utility truck, compact sprite"),
    ("car-gpt-13.png", "normal", "cream retro compact car"),
]
for file, kind, desc in NORMALS:
    SPECS.append(Spec(file, kind, f"{STYLE} {desc}. Distinct color and silhouette, not an electric IONIQ-like hatchback."))


def whiteness_alpha(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pix = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            # Remove near-white studio background while preserving colored vehicle pixels.
            if r > 238 and g > 238 and b > 238:
                pix[x, y] = (r, g, b, 0)
            elif r > 228 and g > 228 and b > 228:
                pix[x, y] = (r, g, b, int(a * 0.18))
    bbox = rgba.getbbox()
    if not bbox:
        return rgba
    cropped = rgba.crop(bbox)
    canvas = Image.new("RGBA", (320, 240), (255, 255, 255, 0))
    cropped.thumbnail((280, 190), Image.Resampling.LANCZOS)
    canvas.alpha_composite(cropped, ((320 - cropped.width) // 2, (240 - cropped.height) // 2))
    return canvas


def generate_one(provider: OpenAICodexImageGenProvider, spec: Spec) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / spec.file
    if out.exists() and out.stat().st_size > 10_000:
        return {"file": spec.file, "kind": spec.kind, "status": "skipped"}
    result = provider.generate(spec.prompt, aspect_ratio="square")
    if not result.get("success"):
        return {"file": spec.file, "kind": spec.kind, "status": "failed", "error": result.get("error")}
    src = Path(result["image"])
    img = Image.open(src)
    processed = whiteness_alpha(img)
    processed.save(out, optimize=True)
    return {"file": spec.file, "kind": spec.kind, "status": "generated", "source": str(src)}


def build_preview(items: Iterable[dict]) -> None:
    files = [OUT_DIR / item["file"] for item in items if (OUT_DIR / item["file"]).exists()]
    if not files:
        return
    thumbs = []
    for f in files:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((140, 105), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (160, 125), (15, 23, 42, 255))
        tile.alpha_composite(im, ((160 - im.width) // 2, 8))
        thumbs.append(tile)
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    preview = Image.new("RGBA", (cols * 160, rows * 125), (2, 6, 23, 255))
    for idx, tile in enumerate(thumbs):
        preview.alpha_composite(tile, ((idx % cols) * 160, (idx // cols) * 125))
    preview.save(OUT_DIR / "sprite-preview-gpt.png", optimize=True)


def main() -> int:
    provider = OpenAICodexImageGenProvider()
    results = []
    for idx, spec in enumerate(SPECS, start=1):
        print(f"[{idx}/{len(SPECS)}] {spec.file} ...", flush=True)
        item = generate_one(provider, spec)
        print(json.dumps(item, ensure_ascii=False), flush=True)
        results.append(item)
    (OUT_DIR / "manifest-gpt.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    build_preview(results)
    ok = sum(1 for r in results if r["status"] in {"generated", "skipped"})
    print(f"DONE {ok}/{len(results)} assets ready in {OUT_DIR}", flush=True)
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
