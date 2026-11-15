"""นำเข้าทะเบียนพื้นที่และสัญญา (CSV ตามแม่แบบ templates/contracts.csv) → data/contracts.json
ใช้: python3 scripts/import_contracts.py <ไฟล์.csv>
- วันที่รับ YYYY-MM-DD หรือ DD/MM/YYYY ทั้ง ค.ศ. และ พ.ศ. (ปี ≥ 2400 ถือเป็น พ.ศ.) · ปี 2 หลักไม่รับ เพราะแยก พ.ศ./ค.ศ. ไม่ได้
- ช่องว่าง = ยังไม่มีข้อมูล (ไม่เติมค่า) · เลขสัญญา+ฉบับแก้ไขซ้ำในไฟล์ → ปฏิเสธทั้งไฟล์
- ไฟล์เดิม (sha256 เดิม) ไม่เพิ่มประวัติ · ไฟล์แก้ไขบันทึก revision ใหม่ใน data/contracts_history.json"""
import csv, sys, os, json, re, hashlib, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATES = ['start_date', 'end_date', 'notice_deadline', 'effective_date']
REQ = ['contract_no', 'area_code', 'party']

def parse_date(s):
    s = (s or '').strip()
    if not s: return None
    m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', s) or None
    if m: y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.fullmatch(r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', s)
        if not m: raise ValueError(f'รูปแบบวันที่ไม่รองรับ: {s!r} (ใช้ YYYY-MM-DD หรือ DD/MM/YYYY ปี 4 หลัก)')
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y >= 2400: y -= 543
    if not 1990 <= y <= 2100: raise ValueError(f'ปีอยู่นอกช่วงที่เป็นไปได้: {s!r}')
    return datetime.date(y, mo, d).isoformat()

def load(path):
    rows, errors, seen = [], [], set()
    with open(path, encoding='utf-8-sig', newline='') as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            r = {k.strip(): (v or '').strip() for k, v in r.items() if k}
            if not any(r.values()): continue
            for k in REQ:
                if not r.get(k): errors.append(f'แถว {i}: ไม่มี {k}')
            for k in DATES:
                try: r[k] = parse_date(r.get(k))
                except ValueError as e: errors.append(f'แถว {i} ({k}): {e}')
            key = (r.get('contract_no'), r.get('amendment', ''))
            if key in seen: errors.append(f'แถว {i}: เลขสัญญา+ฉบับแก้ไขซ้ำ {key}')
            seen.add(key)
            if r.get('start_date') and r.get('end_date') and r['start_date'] > r['end_date']: errors.append(f'แถว {i}: วันเริ่มหลังวันหมดอายุ')
            r['_row'] = i; rows.append({k: (v if v != '' else None) for k, v in r.items()})
    return rows, errors

def main():
    path = sys.argv[1]; sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    rows, errors = load(path)
    if errors: print('ไม่นำเข้า — พบข้อผิดพลาด:\n- ' + '\n- '.join(errors)); sys.exit(1)
    hp = os.path.join(ROOT, 'data', 'contracts_history.json')
    hist = json.load(open(hp, encoding='utf-8')) if os.path.exists(hp) else []
    if not any(h['sha256'] == sha for h in hist):
        hist.append({'file': os.path.basename(path), 'sha256': sha, 'rows': len(rows), 'revision': len(hist) + 1, 'imported_at': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')})
        json.dump(hist, open(hp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    h = next(x for x in hist if x['sha256'] == sha)
    json.dump({'source': h, 'rows': rows}, open(os.path.join(ROOT, 'data', 'contracts.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('นำเข้าทะเบียนสัญญา', len(rows), 'แถว · revision', h['revision'])
if __name__ == '__main__': main()
