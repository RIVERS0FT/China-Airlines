"""Package the reviewed workspace and both tested static build roots.
Run after root verification, copy dist to artifacts/root-build-v7, then build and
verify BASE_PATH=/China-Airlines/. Never includes the reference APK or user saves.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import subprocess
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'artifacts/delivery'
DEST.mkdir(parents=True,exist_ok=True)
for report in ['browser-root.json','browser-subpath.json']:
    stats=json.loads((ROOT/'artifacts'/report).read_text(encoding='utf-8'))['stats']
    assert stats['expected']>=101 and stats['unexpected']==0 and stats['flaky']==0 and stats['skipped']==0,(report,stats)
units=json.loads((ROOT/'artifacts/career-unit-results.json').read_text(encoding='utf-8'))
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
archives=[package('china-airlines-source-v7.zip',source)]
for name,folder in [('china-airlines-web-v7.zip','artifacts/root-build-v7'),('china-airlines-pages-v7.zip','dist')]:
    base=ROOT/folder
    assert (base/'index.html').is_file() and (base/'sw.js').is_file()
    archives.append(package(name,[(path,path.relative_to(base).as_posix()) for path in sorted(base.rglob('*')) if path.is_file()]))
(DEST/'SHA256SUMS-v7.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in archives),encoding='utf-8')
source_digest=hashlib.sha256()
for path,name in source:
    source_digest.update(name.encode('utf-8')+b'\0'+hashlib.sha256(path.read_bytes()).digest())
def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT).decode().strip()
metadata={
    'version':'0.7.0',
    'save_version':7,
    'database_schema_version':1,
    'created_at_utc':datetime.now(timezone.utc).isoformat(),
    'branch':git('branch','--show-current'),
    'base_commit':git('rev-parse','HEAD'),
    'includes_uncommitted_workspace':bool(git('status','--porcelain')),
    'source_files':len(source),
    'source_tree_sha256':source_digest.hexdigest(),
    'tests':{'unit':units['numPassedTests'],'root_browser':101,'pages_browser':101},
    'pages_base_path':'/China-Airlines/',
    'deployment_performed':False,
    'archives':{path.name:{'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in archives},
}
(DEST/'BUILD-v7.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for path in archives:print(f'{path.name}: {path.stat().st_size} bytes')
