"""Read the user-supplied APK as data; never install it or execute extracted code.

Usage: python scripts/inspect-reference-apk.py path/to/file.apk
Prints provenance, table counts, and verifies the numeric level observations used
in this project. Does not copy APK artwork, sound, bytecode or native libraries.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

apk=Path(sys.argv[1])
with ZipFile(apk) as archive:
    tables={name:json.loads(archive.read(name),strict=False) for name in archive.namelist()
            if name.startswith('assets/static_data/') and name.endswith('.js')}
levels=tables['assets/static_data/StaticTrainLevel.js']
observed=[row[:6] for row in levels]
source=(Path(__file__).resolve().parents[1]/'src/core/railway-observations.ts').read_text(encoding='utf-8')
literal=re.search(r'=\s*(\[[\s\S]*\])\s*as const',source).group(1)
assert json.loads(literal)==observed,'Committed level observations differ from this APK'
result={'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'bytes':apk.stat().st_size,
        'tables':len(tables),'rows':sum(map(len,tables.values())),
        'selected':{name:len(tables['assets/static_data/'+name+'.js']) for name in
                    ['StaticTrain','StaticTrainLevel','StaticGoods','StaticStation','StaticQuest','StaticPart','StaticCommodity']},
        'numeric_level_rows_verified':len(observed),'first_level':observed[0],'last_level':observed[-1]}
print(json.dumps(result,ensure_ascii=False,indent=2))
