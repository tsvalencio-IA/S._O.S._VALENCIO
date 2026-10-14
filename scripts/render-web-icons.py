#!/usr/bin/env python3
"""Rasteriza o SVG OFICIAL, sem redesenho, nos tamanhos exigidos pelo Chrome PWA."""
from pathlib import Path
from io import BytesIO
import cairosvg
from PIL import Image
root = Path(__file__).resolve().parent.parent
svg = root / 'assets' / 'sos-valencio-android-icon.svg'
assert svg.is_file(), 'SVG oficial não encontrado'
for size in (192, 512):
    path = root / 'assets' / ('icon-' + str(size) + '.png')
    path.write_bytes(cairosvg.svg2png(url=str(svg), output_width=size, output_height=size))
    with Image.open(path) as im:
        assert im.size == (size, size)
    print('Ícone Chrome validado:', path.name, path.stat().st_size, 'bytes')
