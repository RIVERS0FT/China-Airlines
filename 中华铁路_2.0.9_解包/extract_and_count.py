"""Extract the supplied APK and count vehicle IDs without executing APK code."""
from pathlib import Path, PurePosixPath
from collections import Counter, defaultdict
import csv
import hashlib
import json
import stat
import struct
import zipfile

ROOT = Path(__file__).resolve().parent
APK = ROOT.parent / '中华铁路.apk'
RAW = ROOT / '原始解包'
TABLES = ROOT / '配置表'

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')

def save_csv(path, fields, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

def manifest_metadata(data):
    u16 = lambda p: struct.unpack_from('<H', data, p)[0]
    u32 = lambda p: struct.unpack_from('<I', data, p)[0]
    strings, result, pos = [], {}, 8
    while pos < len(data):
        kind, header_size, size = struct.unpack_from('<HHI', data, pos)
        assert size >= header_size and size > 0 and pos + size <= len(data)
        if kind == 1:
            count, flags, base = u32(pos + 8), u32(pos + 16), pos + u32(pos + 20)
            for index in range(count):
                p = base + u32(pos + header_size + index * 4)
                if flags & 256:
                    for _ in range(2):
                        length = data[p]; p += 1
                        if length & 128:
                            length = ((length & 127) << 8) | data[p]; p += 1
                    strings.append(data[p:p + length].decode('utf-8'))
                else:
                    length = u16(p); p += 2
                    if length & 32768:
                        length = ((length & 32767) << 16) | u16(p); p += 2
                    strings.append(data[p:p + length * 2].decode('utf-16le'))
        elif kind == 0x102:
            ext = pos + header_size
            name = strings[u32(ext + 4)]
            start, step, count = u16(ext + 8), u16(ext + 10), u16(ext + 12)
            if name in ('manifest', 'uses-sdk'):
                attributes = {}
                for index in range(count):
                    p = ext + start + index * step
                    key, raw, value_kind, value = strings[u32(p + 4)], u32(p + 8), data[p + 15], u32(p + 16)
                    attributes[key] = strings[raw] if raw != 0xffffffff else strings[value] if value_kind == 3 else value
                result[name] = attributes
        pos += size
    return result

def main():
    # A fresh destination prevents accidental mixing with an earlier extraction.
    RAW.mkdir(exist_ok=False)
    inventory, table_summary = [], []
    with zipfile.ZipFile(APK) as archive:
        seen = set()
        for member in archive.infolist():
            relative = PurePosixPath(member.filename)
            if relative.is_absolute() or any(part in ('', '..') or ':' in part or '\\' in part for part in relative.parts):
                raise ValueError(f'Unsafe archive path: {member.filename}')
            if stat.S_ISLNK(member.external_attr >> 16):
                raise ValueError(f'Unexpected symlink: {member.filename}')
            target = RAW.joinpath(*relative.parts).resolve()
            if not target.is_relative_to(RAW.resolve()):
                raise ValueError(f'Escaping archive path: {member.filename}')
            key = str(target).casefold()
            if key in seen:
                raise ValueError(f'Duplicate archive path: {member.filename}')
            seen.add(key)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            data = archive.read(member)  # ZIP CRC is checked during the read.
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            assert target.stat().st_size == member.file_size
            digest = hashlib.sha256(data).hexdigest()
            assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
            inventory.append({'path': member.filename, 'bytes': len(data), 'sha256': digest})
            if member.filename.startswith('assets/static_data/') and member.filename.endswith('.js'):
                rows = json.loads(data, strict=False)
                table_path = PurePosixPath(member.filename).relative_to('assets/static_data').with_suffix('.json')
                destination = TABLES.joinpath(*table_path.parts)
                save_json(destination, rows)
                assert json.loads(destination.read_text('utf-8')) == rows
                with destination.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as handle:
                    writer = csv.writer(handle)
                    writer.writerow([f'col_{n}' for n in range(max(map(len, rows), default=0))])
                    writer.writerows(rows)
                table_summary.append({'source': member.filename, 'rows': len(rows), 'sha256': digest})
        metadata = manifest_metadata(archive.read('AndroidManifest.xml'))
        trains = json.loads(archive.read('assets/static_data/StaticTrain.js'), strict=False)

    vehicles, groups, names = [], defaultdict(list), defaultdict(list)
    for row in trains:
        kind = '客运型' if row[14] > 0 and row[15] == 0 else '货运型' if row[15] > 0 and row[14] == 0 else '客货混合型' if row[14] > 0 and row[15] > 0 else '无客货位'
        item = {'载具ID': row[0], '名称': row[1], '运输类型': kind, '分组字段原值': row[3], '机头图片': row[16], '车厢图片': row[17], '客位编码原值': row[14], '货位编码原值': row[15]}
        vehicles.append(item)
        groups[row[3]].append(item)
        names[row[1]].append(row[0])
    ids = [v['载具ID'] for v in vehicles]
    assert len(ids) == len(set(ids))
    counts = dict(Counter(v['运输类型'] for v in vehicles))
    assert sum(counts.values()) == len(vehicles)
    save_json(ROOT / '载具清单.json', vehicles)
    save_csv(ROOT / '载具清单.csv', list(vehicles[0]), vehicles)
    group_rows = [{'分组字段原值': key, '配置数量': len(items), '载具ID': ','.join(str(v['载具ID']) for v in items), '载具名称': ' / '.join(v['名称'] for v in items)} for key, items in groups.items()]
    save_json(ROOT / '载具分组.json', group_rows)
    save_csv(ROOT / '载具分组.csv', list(group_rows[0]), group_rows)
    sprite_names = {item['机头图片'] for item in vehicles}
    included_sprites = {item['path'].split('/')[-1] for item in inventory if item['path'].startswith('assets/pic/train/') and item['path'].endswith('.png')}
    duplicate_names = {name: rows for name, rows in names.items() if len(rows) > 1}
    summary = {
        'apk_path': str(APK), 'apk_bytes': APK.stat().st_size,
        'apk_sha256': hashlib.sha256(APK.read_bytes()).hexdigest(),
        'metadata': metadata, 'extracted_files': len(inventory),
        'extracted_bytes': sum(item['bytes'] for item in inventory),
        'parsed_tables': len(table_summary), 'vehicle_records': len(vehicles),
        'unique_vehicle_ids': len(set(ids)), 'unique_names': len(names),
        'transport_types': counts, 'raw_groups': len(groups),
        'head_image_references': len(sprite_names), 'head_image_files_in_apk': len(included_sprites),
        'missing_referenced_head_images': sorted(sprite_names - included_sprites),
        'unreferenced_head_images': sorted(included_sprites - sprite_names),
        'duplicate_names': duplicate_names,
        'grouping_caveat': 'col_3 is preserved as a raw group field, not a verified real-world model family. Group 303 contains both EMDE8 and KihaE200.',
        'verification': 'All extracted files match ZIP sizes and SHA-256; all JSON exports match APK arrays; vehicle IDs are unique.'
    }
    save_json(ROOT / '统计结果.json', summary)
    save_json(ROOT / '文件清单及哈希.json', inventory)
    save_json(ROOT / '配置表索引.json', table_summary)
    with (ROOT / '载具清单.csv').open(encoding='utf-8-sig', newline='') as handle:
        csv_rows = list(csv.DictReader(handle))
    assert len(csv_rows) == len(vehicles) and [int(row['载具ID']) for row in csv_rows] == ids
    report = f'''# 中华铁路 APK 载具统计

本次直接读取用户提供的 APK，未安装或执行 APK。包名 `{metadata['manifest']['package']}`，版本 `{metadata['manifest']['versionName']}`，versionCode `{metadata['manifest']['versionCode']}`。

**按 StaticTrain.js 中唯一载具 ID 统计，共 {len(vehicles)} 款配置。**

| 运输类型 | 配置数量 |
|---|---:|
| 客运型 | {counts['客运型']} |
| 货运型 | {counts['货运型']} |
| 客货混合型 | {counts['客货混合型']} |
| 合计 | {len(vehicles)} |

类型按客位/货位编码是否大于零判断，不依赖名称后缀。

## 统计口径

- 759 个独立 ID 包含客货变体和活动款，不代表 759 种现实机车，也不代表这些配置当前全部可购买或已开放。
- 原始分组字段 col_3 有 {len(groups)} 个不同值；不能直接当作准确的基础车系数量。例如分组 303 同时包含 EMDE8 和 KihaE200。
- 名称去重为 {len(names)} 个。存在两对名称重复而 ID 不同的记录：神24电力机车客运型（904、906），台铁emu3000城际列车客运型（907、909）；不能按名称删除它们。
- 载具表引用 {len(sprite_names)} 个不同机头图片文件名。APK 内实际有 {len(included_sprites)} 张机头 PNG，其中 {len(included_sprites - sprite_names)} 张未被本表引用；另有 {len(sprite_names - included_sprites)} 个引用文件不在 APK 中，详见统计结果.json。图片数量不能作为载具款数。

## 文件入口

- `原始解包/`：APK 全部 {len(inventory)} 个文件，保留包内目录结构；载具原表为 `原始解包/assets/static_data/StaticTrain.js`。
- `载具清单.csv` / `载具清单.json`：759 款的 ID、名称、运输类型、分组及图片路径。CSV 使用 UTF-8 BOM，便于 Excel 打开。
- `载具分组.csv` / `载具分组.json`：按原始字段分组，保留上述分组局限。
- `配置表/`：全部 {len(table_summary)} 张静态配置与文案数组的 JSON、CSV 导出。未知字段保留 col_0 起的原列号。
- `统计结果.json`、`配置表索引.json`、`文件清单及哈希.json`：统计和校验依据。
- `extract_and_count.py`：本次提取脚本；重新运行需使用新的目标文件夹，避免覆盖已有解包数据。

APK SHA-256：`{summary['apk_sha256']}`。

已核验完整 ZIP 读取、逐文件大小与哈希、全部配置数组导出一致性、载具 ID 唯一性，以及 CSV/JSON 条目一致性。所有解包内容仅存放在本独立文件夹，未加入中华航空代码仓库。
'''
    (ROOT / 'README-载具统计.md').write_text(report, encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
