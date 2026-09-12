"""Encode the original generated platform as a local runtime JPEG and refresh its manifest entry."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
target = root / 'public/art/apron-platform-v1.jpg'
with Image.open(root / 'art/source/apron-platform-v1.png') as source:
    source.convert('RGB').save(target, quality=90, optimize=True)
with Image.open(target) as image:
    entry = dict(file=target.name, width=image.width, height=image.height,
                 bytes=target.stat().st_size, mode=image.mode)
manifest_path = root / 'art/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest = [record for record in manifest if record['file'] != target.name] + [entry]
manifest_path.write_text(json.dumps(sorted(manifest, key=lambda record: record['file']), indent=2) + '\n', encoding='utf-8')
print(entry)
