#!/usr/bin/env python3
"""Renderiza somente os ícones Android do S.O.S. Valêncio; não altera a interface web."""
from pathlib import Path
from io import BytesIO
import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "sos-valencio-android-icon.svg"
RES = ROOT / "capacitor-android" / "android" / "app" / "src" / "main" / "res"

assert SOURCE.is_file(), "Ícone fonte não encontrado"

def render(size):
    raw = cairosvg.svg2png(url=str(SOURCE), output_width=size, output_height=size)
    return Image.open(BytesIO(raw)).convert("RGBA")

sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, size in sizes.items():
    folder = RES / ("mipmap-" + density)
    folder.mkdir(parents=True, exist_ok=True)
    icon = render(size)
    icon.save(folder / "ic_launcher.png", optimize=True)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)
    round_icon = icon.copy()
    round_icon.putalpha(mask)
    round_icon.save(folder / "ic_launcher_round.png", optimize=True)

    # Fundo sólido preenche a máscara adaptativa; o desenho permanece inteiro.
    foreground_size = round(size * 2.25)
    foreground = Image.new("RGBA", (foreground_size, foreground_size), (4, 23, 43, 255))
    inner_size = round(foreground_size * 0.72)
    inner = render(inner_size)
    offset = (foreground_size-inner_size)//2
    foreground.alpha_composite(inner, (offset, offset))
    foreground.save(folder / "ic_launcher_foreground.png", optimize=True)

    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        dest = folder / name
        assert dest.is_file() and dest.stat().st_size > 0, str(dest)

print("Ícones Android gerados: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi.")
