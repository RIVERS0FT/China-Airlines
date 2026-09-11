"""Apply reviewed UTF-8 edits from a pinned base, verify every file and final tree.
This one-time writer removes itself before committing; it cannot update main.
"""
import hashlib
import json
import subprocess
from pathlib import Path

BASE = '649aec4e822dbcbeb1d4025a42fb67a168f203fc'
EXPECTED = 'b97227ac63049d0d6bca4f465005e05ab898da57'
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
# Reviewed follow-up: preserve integer reservations without subtractive float error.
p = Path('src/core/game.ts')
before = 'p.energy.reservedSeconds !== p.flight.arriveAt - p.flight.departAt'
assert prepared[p].count(before) == 1
prepared[p] = prepared[p].replace(before, 'p.flight.arriveAt !== p.flight.departAt + p.energy.reservedSeconds')
p = Path('src/core/save-v4.ts')
prepared[p] = prepared[p].rstrip() + '\n'
p = Path('tests/energy.test.ts')
before = "  it('allows exactly enough energy"
assert prepared[p].count(before) == 1
prepared[p] = prepared[p].replace(before, "  it.each([51.003, 90.247, 1000.123])('preserves exact reservations at fractional simulation time %s', seconds => {\n    const c=prepared();c.execute({type:'dispatch',planeId:ID,to:'PVG',auto:false},NOW+seconds*1000);\n    const s=c.snapshot();expect(()=>validateSave(s)).not.toThrow();expect(s.fleet[0]!.energy.reservedSeconds).toBe(amount());\n  });\n  it('allows exactly enough energy")
for path, result in prepared.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(result, encoding='utf-8')
    print('Verified', path)
git('add', '--', *[str(p) for p in prepared])
git('rm', '--', *PARTS, 'scripts/materialize-energy-v05.py', '.github/workflows/materialize-energy-v05.yml')
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
actual = git('write-tree').strip()
assert actual == EXPECTED, (actual, EXPECTED)
print('Verified complete source tree:', actual)
