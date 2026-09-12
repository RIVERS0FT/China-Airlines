"""Package the current reviewed workspace, including uncommitted art (not just HEAD)."""
from pathlib import Path
import hashlib
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'artifacts/delivery'
DEST.mkdir(parents=True, exist_ok=True)


def package(name, entries):
    path = DEST / name
    with ZipFile(path, 'w', ZIP_DEFLATED) as archive:
        for file, arcname in entries:
            archive.write(file, arcname)
    with ZipFile(path) as archive:
        assert archive.testzip() is None
    return path


files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().split('\0')
source = [(ROOT / file, 'China-Airlines/' + file) for file in sorted(set(files)) if file and (ROOT / file).is_file()]
assert not any('/node_modules/' in name or '/.git/' in name or '/.env' in name for _, name in source)
archives = [package('china-airlines-source-v5.zip', source)]
archives.append(package('china-airlines-art-v5.zip', [(path, path.relative_to(ROOT).as_posix())
    for folder in ['art', 'public/art'] for path in sorted((ROOT / folder).rglob('*')) if path.is_file()]
    + [(ROOT / 'scripts/prepare-art.py', 'scripts/prepare-art.py'), (ROOT / 'scripts/prepare-platform.py', 'scripts/prepare-platform.py'), (ROOT / 'docs/ART-ASSETS.md', 'docs/ART-ASSETS.md')]))
for name, folder in [('china-airlines-web-v5.zip', 'artifacts/root-build-v5'), ('china-airlines-pages-v5.zip', 'dist')]:
    base = ROOT / folder
    assert (base / 'index.html').is_file(), base
    archives.append(package(name, [(path, path.relative_to(base).as_posix()) for path in sorted(base.rglob('*')) if path.is_file()]))
(DEST / 'SHA256SUMS-v5.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in archives))
for path in archives:
    print(f'{path.name}: {path.stat().st_size} bytes')
