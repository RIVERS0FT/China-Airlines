"""Apply reviewed UTF-8 edits from a pinned base, verify every file and final tree.
This one-time writer removes itself before committing; it cannot update main.
"""
import hashlib
import json
import subprocess
from pathlib import Path

BASE = '649aec4e822dbcbeb1d4025a42fb67a168f203fc'
EXPECTED = '46c813dfe1a7f3cd956dd680bd33883693e5edf4'
PARTS = ['scripts/energy-v05-' + n + '.json' for n in ['1a', '1b', '2', '3', '4']]

def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8')

records = []
for name in PARTS:
    records.extend(json.loads(Path(name).read_text(encoding='utf-8')))
assert len(records) == 33 and len({r['path'] for r in records}) == 33
prepared = {}
for r in records:
    path = Path(r['path'])
    assert not path.is_absolute() and '..' not in path.parts
    assert path.parts[0] in {'src', 'tests', 'e2e', 'docs', 'README.md', 'package.json', 'package-lock.json'}
    old = git('show', BASE + ':' + r['base']) if r['base'] else ''
    result = ''.join(p if isinstance(p, str) else old[p[0]:p[1]] for p in r['parts'])
    digest = hashlib.sha256(result.encode('utf-8')).hexdigest()
    assert digest == r['sha256'], (r['path'], digest, r['sha256'])
    prepared[path] = result
for path, result in prepared.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(result, encoding='utf-8')
    print('Verified', path)
git('add', '--', *[str(p) for p in prepared])
git('rm', '--', *PARTS, 'scripts/materialize-energy-v05.py', '.github/workflows/materialize-energy-v05.yml')
git('diff', '--cached', '--check')
actual = git('write-tree').strip()
assert actual == EXPECTED, (actual, EXPECTED)
print('Verified complete source tree:', actual)
