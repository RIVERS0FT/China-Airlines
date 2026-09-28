"""Explicit offline delivery only: package the reviewed workspace and relative build.
Run one production build and the complete browser suite before invoking this.
Never includes the reference APK or user saves; normal deployment does not call it.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'artifacts/delivery'
DEST.mkdir(parents=True,exist_ok=True)
report=json.loads((ROOT/'artifacts/browser.json').read_text(encoding='utf-8'))
stats=report['stats']
assert stats['expected']>=101 and stats['unexpected']==0 and stats['flaky']==0 and stats['skipped']==0 and not report['errors'],stats
units=json.loads((ROOT/'artifacts/unit-tests.json').read_text(encoding='utf-8'))
assert units['numFailedTests']==0 and units['numPassedTests']>=332

def package(name,entries):
    path=DEST/name
    with ZipFile(path,'w',ZIP_DEFLATED) as archive:
        for file,arcname in entries:archive.write(file,arcname)
    with ZipFile(path) as archive:assert archive.testzip() is None
    return path

files=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT).decode().split('\0')
source=[(ROOT/file,'China-Airlines/'+file) for file in sorted(set(files)) if file and (ROOT/file).is_file()]
assert not any('/node_modules/' in name or '/.git/' in name or '/.env' in name or '/artifacts/' in name or Path(name).suffix in ['.apk','.so','.dex','.keystore','.jks'] for _,name in source)
archives=[package('china-airlines-source.zip',source)]
base=ROOT/'dist'
assert (base/'index.html').is_file() and (base/'sw.js').is_file()
archives.append(package('china-airlines-web.zip',[(path,path.relative_to(base).as_posix()) for path in sorted(base.rglob('*')) if path.is_file()]))
(DEST/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in archives),encoding='utf-8')
source_digest=hashlib.sha256()
for path,name in source:
    source_digest.update(name.encode('utf-8')+b'\0'+hashlib.sha256(path.read_bytes()).digest())
def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT).decode().strip()
metadata={
    'version':json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version'],
    'save_version':int(re.search(r'export const SAVE_VERSION = (\d+);',(ROOT/'src/core/game.ts').read_text(encoding='utf-8'))[1]),
    'database_schema_version':1,
    'created_at_utc':datetime.now(timezone.utc).isoformat(),
    'branch':git('branch','--show-current'),
    'base_commit':git('rev-parse','HEAD'),
    'includes_uncommitted_workspace':bool(git('status','--porcelain')),
    'source_files':len(source),
    'source_tree_sha256':source_digest.hexdigest(),
    'tests':{
        'unit':units['numPassedTests'],
        'browser':stats['expected'],
    },
    'asset_base':'./',
    'deployment_performed':False,
    'archives':{path.name:{'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in archives},
}
(DEST/'BUILD.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for path in archives:print(f'{path.name}: {path.stat().st_size} bytes')
