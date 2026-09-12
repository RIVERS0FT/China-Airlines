"""Rebuild the art pack from retained green sources. Requires Python + Pillow 12.2.

Run: python scripts/prepare-art.py
The green-only palette is intentional: do not use this keyer for green subjects.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/source'
OUTPUT = ROOT / 'public/art'
REVIEW = ROOT / 'art/review'
for directory in (OUTPUT, REVIEW):
    directory.mkdir(parents=True, exist_ok=True)


def key_green(image):
    result = image.convert('RGBA')
    pixels = []
    for r, g, b, _ in result.get_flattened_data():
        excess = g - max(r, b)
        # Preserve blues, skin and yellow; feather only chroma-green fringes.
        alpha = round(255 * (1 - max(0, min(1, (excess - 20) / 160))))
        if alpha == 0:
            pixels.append((0, 0, 0, 0))
        elif alpha < 255:
            pixels.append((r, min(g, max(r, b)), b, alpha))
        else:
            pixels.append((r, g, b, 255))
    result.putdata(pixels)
    return result


def prepare_green(name):
    original = Image.open(SOURCE / f'{name}-green.png').convert('RGB')
    for point in [(0, 0), (original.width - 1, 0), (0, original.height - 1), (original.width - 1, original.height - 1)]:
        r, g, b = original.getpixel(point)
        if g - max(r, b) < 150:
            raise ValueError(f'{name}: source background is not chroma green at {point}')
    normalized = original.copy()
    normalized.putdata([(0, 255, 0) if g - max(r, b) >= 180 else (r, g, b)
                        for r, g, b in original.get_flattened_data()])
    normalized.save(SOURCE / f'{name}-green-solid.png', optimize=True)
    return key_green(normalized)


def fit_sprite(image, size, centered=False):
    bounds = image.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not bounds:
        raise ValueError('Empty sprite')
    content = image.crop(bounds)
    content.thumbnail((size[0] - 16, size[1] - 16), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', size)
    canvas.paste(content, ((size[0] - content.width) // 2,
                           (size[1] - content.height) // 2 if centered else size[1] - content.height - 8))
    return canvas


background = Image.open(SOURCE / 'background.png').convert('RGB')
background.save(OUTPUT / 'airport-day-v1.jpg', quality=90, optimize=True)
atlas = prepare_green('passengers')
atlas.save(SOURCE / 'passengers-keyed.png', optimize=True)
for i in range(6):
    col, row = i % 3, i // 3
    cell = atlas.crop((col * atlas.width // 3, row * atlas.height // 2,
                       (col + 1) * atlas.width // 3, (row + 1) * atlas.height // 2))
    fit_sprite(cell, (256, 320)).save(OUTPUT / f'passenger-{i + 1:02}-v1.png', optimize=True)
for name, size in [('cargo', (256, 256)), ('aircraft', (1408, 640)), ('aircraft-flight', (1408, 640))]:
    if not (SOURCE / f'{name}-green.png').exists():
        continue
    keyed = prepare_green(name)
    keyed.save(SOURCE / f'{name}-keyed.png', optimize=True)
    fit_sprite(keyed, size).save(OUTPUT / f'{name}-v1.png', optimize=True)

# Second batch: fixed grid cells are recorded here so every icon is reproducible.
icon_names = {
    'navigation-icons': ['airport', 'map', 'directory', 'plane', 'shop', 'task'],
    'utility-icons': ['coin', 'trophy', 'save', 'help', 'maintenance', 'energy'],
}
for name, names in icon_names.items():
    if not (SOURCE / f'{name}-green.png').exists():
        continue
    atlas = prepare_green(name)
    atlas.save(SOURCE / f'{name}-keyed.png', optimize=True)
    for i, icon in enumerate(names):
        col, row = i % 3, i // 3
        cell = atlas.crop((col * atlas.width // 3, row * atlas.height // 2,
                           (col + 1) * atlas.width // 3, (row + 1) * atlas.height // 2))
        fit_sprite(cell, (256, 256), centered=True).save(OUTPUT / f'icon-{icon}-v1.png', optimize=True)
if (SOURCE / 'ground-props-green.png').exists():
    atlas = prepare_green('ground-props')
    atlas.save(SOURCE / 'ground-props-keyed.png', optimize=True)
    for i, name in enumerate(['tug', 'baggage-trailer', 'ground-crew', 'cones']):
        col, row = i % 2, i // 2
        # The worker's helmet crosses the mathematical half-height. The empty
        # horizontal gutter is at y=440/1024 in this retained source image.
        split_y = round(atlas.height * 440 / 1024)
        cell = atlas.crop((col * atlas.width // 2, 0 if row == 0 else split_y,
                           (col + 1) * atlas.width // 2, split_y if row == 0 else atlas.height))
        fit_sprite(cell, (384, 320)).save(OUTPUT / f'{name}-v1.png', optimize=True)
if (SOURCE / 'pilot-avatar-green.png').exists():
    keyed = prepare_green('pilot-avatar')
    keyed.save(SOURCE / 'pilot-avatar-keyed.png', optimize=True)
    fit_sprite(keyed, (320, 320)).save(OUTPUT / 'pilot-avatar-v1.png', optimize=True)

# Review the same transparent pixels on light and dark backgrounds.
sprites = sorted(OUTPUT.glob('*.png'))
sheet = Image.new('RGB', (1280, ((len(sprites) + 3) // 4) * 320), '#eaf3f8')
draw = ImageDraw.Draw(sheet)
for i, path in enumerate(sprites):
    x, y = (i % 4) * 320, (i // 4) * 320
    sprite = Image.open(path)
    for offset, color in [(0, '#f6f4ed'), (160, '#243850')]:
        draw.rectangle((x + offset, y, x + offset + 159, y + 289), fill=color)
        preview = ImageOps.contain(sprite, (150, 250))
        sheet.paste(preview, (x + offset + (160 - preview.width) // 2, y + 280 - preview.height), preview)
    draw.text((x + 8, y + 299), path.name, fill='#243850')
sheet.save(REVIEW / 'sprites-light-dark.jpg', quality=94)

manifest = []
for path in sorted(OUTPUT.iterdir()):
    with Image.open(path) as im:
        record = {'file': path.name, 'width': im.width, 'height': im.height, 'bytes': path.stat().st_size, 'mode': im.mode}
        if im.mode == 'RGBA':
            alpha = im.getchannel('A')
            record['alphaRange'] = alpha.getextrema()
            record['transparentPixels'] = alpha.histogram()[0]
            assert record['alphaRange'] == (0, 255), path
            assert all(im.getpixel(point)[3] == 0 for point in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]), path
        manifest.append(record)
(ROOT / 'art/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
