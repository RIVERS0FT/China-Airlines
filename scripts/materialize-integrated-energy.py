"""One-time checked reconstruction of a reviewed merge; never writes main."""
import hashlib
import json
import subprocess
from pathlib import Path

def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8')

allowed = {'abc4d17a2cb5b20efe391b088371f02400421961', 'c736d3b36ad373cea254748a3f7e86a15334630e'}
recipes = ['scripts/integrate-energy-0.json', 'scripts/integrate-energy-1.json']
records = [r for f in recipes for r in json.loads(Path(f).read_text(encoding='utf-8'))]
assert len(records) == 19 and len({r['path'] for r in records}) == 19
prepared = {}
for r in records:
    path = Path(r['path'])
    assert not path.is_absolute() and '..' not in path.parts
    assert path.parts[0] in {'src', 'tests', 'e2e', 'docs', 'README.md'}
    assert r['commit'] in allowed
    old = git('show', r['commit'] + ':' + r['base'])
    text = ''.join(p if isinstance(p, str) else old[p[0]:p[1]] for p in r['parts'])
    assert hashlib.sha256(text.encode('utf-8')).hexdigest() == r['sha256'], r['path']
    prepared[path] = text
for path, text in prepared.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    print('Verified', path)
git('add', '--', *map(str, prepared))
git('rm', '--', *recipes, 'scripts/materialize-integrated-energy.py', '.github/workflows/materialize-integrated-energy.yml')
git('diff', '--cached', '--check')
tree = git('write-tree').strip()
assert tree == '509497cf5d31dd29fdf085bc17e1d4db448c8f4e', tree
print('Verified integrated source tree', tree)
