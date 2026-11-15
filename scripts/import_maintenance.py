"""นำเข้าไฟล์ Excel ใบงานแจ้งซ่อม (ระบบแจ้งซ่อม) → data/maintenance.json พร้อมที่มา (ไฟล์ ชีท เวลานำเข้า sha256)
ใช้: python3 scripts/import_maintenance.py om/<ไฟล์>.xlsx
- ไม่เก็บชื่อบุคคล (ผู้แจ้ง/ผู้รับผิดชอบ) ลงชุดข้อมูล
- ช่องว่าง = ไม่มีข้อมูล (ไม่แปลงเป็นศูนย์)
- พื้นที่ (site) อ่านจากรหัส QR ที่ขึ้นต้นด้วยรหัสพื้นที่ หรือชื่อโครงการในคำอธิบายอาการเสีย — อ่านไม่ได้ = ว่าง
- SLA อ่านจากข้อความระดับความด่วน เช่น "ด่วน SLA 3 วัน" · ระดับที่ไม่ระบุ SLA = ว่าง (ไม่นับในการวัด SLA)"""
import sys, os, json, hashlib, datetime, re
import openpyxl
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
COLS = {'wo': 'เลขที่ใบงาน', 'status': 'สถานะ', 'reported': 'วันที่แจ้งซ่อม', 'type': 'ประเภทใบงาน', 'machine_stop': 'สถานะเครื่องจักรหยุด', 'line': 'สถานะไลน์ผลิต',
        'urgency': 'ระดับความด่วน', 'safety': 'ความปลอดภัย', 'mdept': 'แผนกของเครื่องจักร', 'qr': 'QR Code', 'machine': 'ชื่อเครื่องจักร', 'mtype': 'ประเภทเครื่องจักร',
        'symptom': 'อาการเสีย', 'fcode': 'รหัสอาการเสีย', 'fdesc': 'รายละเอียดรหัสอาการเสีย', 'rcode': 'รหัสอาการซ่อม', 'rdesc': 'รายละเอียดรหัสอาการซ่อม',
        'cause': 'สาเหตุอาการเสีย', 'fix': 'วิธีการแก้ไข', 'assigned': 'วันเวลาที่มอบงาน', 'min_assign': 'ระยะเวลาตั้งแต่แจ้งซ่อมถึงมอบหมาย (นาที)',
        'min_done': 'ระยะเวลาตั้งแต่แจ้งซ่อมถึงซ่อมเสร็จ (นาที)', 'min_work': 'ระยะเวลาเริ่มซ่อมถึงซ่อมเสร็จ (นาที)', 'done_at': 'วันเวลาที่ซ่อมเสร็จ', 'score': 'คะแนนการประเมิน'}
DONE = ('ปิดงาน', 'ซ่อมแล้ว รอประเมิน')
REJECT = ('ถูกปฏิเสธ',)
# รหัสพื้นที่ตามไฟล์ OM ← รูปแบบในรหัส QR / ข้อความ
SITE_TEXT = [('BSK-P1', r'(บางสระเก้า|BSK)\s*(อาคาร\s*)?P\s*1'), ('BSK-P2', r'(บางสระเก้า|BSK)\s*(อาคาร\s*)?P\s*2'), ('BT-P1', r'(บ่อทอง|\bBT)\s*(อาคาร\s*)?P\s*1'), ('BT-P2', r'(บ่อทอง|\bBT)\s*(อาคาร\s*)?P\s*2'),
             ('RP1-A', r'(ร้อยเพชร|RP1?)\s*(อาคาร\s*)?A(?![a-z])'), ('RP1-C', r'(ร้อยเพชร|RP1?)\s*(อาคาร\s*)?C(?![a-z])'), ('RP1-D', r'(ร้อยเพชร|RP1?)\s*(อาคาร\s*)?D(?![a-z])'),
             ('LK1-P1', r'(ลักกี้|LK)\s*1?\s*(อาคาร\s*)?P\s*1'), ('LK1-P2', r'(ลักกี้|LK)\s*1?\s*(อาคาร\s*)?P\s*2'), ('MK1', r'แม่กลอง|MK\s*1'), ('YS', r'ยี่สาร|\bYS\b'),
             ('PR5-P1', r'(เพชรบุรี|PR5)\s*5?\s*(อาคาร\s*)?P\s*1'), ('PR5-P2', r'(เพชรบุรี|PR5)\s*5?\s*(อาคาร\s*)?P\s*2')]
SITE_QR = [('BSKP1', 'BSK-P1'), ('BSKP2', 'BSK-P2'), ('BTP1', 'BT-P1'), ('BTP2', 'BT-P2'), ('RP1A', 'RP1-A'), ('RP1C', 'RP1-C'), ('RP1D', 'RP1-D'), ('PR5P1', 'PR5-P1'), ('PR5P2', 'PR5-P2'), ('MK1', 'MK1'), ('YS', 'YS'), ('LK1P1', 'LK1-P1'), ('LK1P2', 'LK1-P2')]

def iso(v):
    if isinstance(v, datetime.datetime): return v.isoformat(timespec='minutes')
    if isinstance(v, datetime.date): return v.isoformat()
    return None

def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def txt(v, n=None):
    s = re.sub(r'\s+', ' ', str(v)).strip() if v not in (None, '') else ''
    return s[:n] if n else s

def sla_hours(label):
    m = re.search(r'SLA\s*(\d+)\s*(ชั่วโมง|วัน)', label or '')
    return None if not m else int(m.group(1)) * (1 if m.group(2) == 'ชั่วโมง' else 24)

def site_of(qr, text):
    q = re.sub(r'[^A-Z0-9]', '', (qr or '').upper())
    for p, s in SITE_QR:
        if q.startswith(p): return s, 'qr'
    if 'LK1P2' in q: return 'LK1-P2', 'qr'
    hit = [s for s, p in SITE_TEXT if re.search(p, text or '', re.I)]
    return (hit[0], 'text') if len(set(hit)) == 1 else (None, 'multi' if hit else None)

def parse(path):
    wb = openpyxl.load_workbook(path, data_only=True); ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True)); head = [txt(h) for h in rows[0]]
    idx = {k: head.index(v) for k, v in COLS.items() if v in head}
    miss = [v for k, v in COLS.items() if k not in idx]
    if 'wo' not in idx or 'reported' not in idx: raise SystemExit('ไม่พบคอลัมน์ เลขที่ใบงาน/วันที่แจ้งซ่อม — ไฟล์ไม่ใช่รูปแบบรายงานใบงาน')
    out, issues = [], []
    for n, r in enumerate(rows[1:], start=2):
        g = lambda k: r[idx[k]] if k in idx else None
        if not g('wo'): continue
        rep = iso(g('reported'))
        if not rep: issues.append(f'แถว {n}: อ่านวันที่แจ้งซ่อมไม่ได้'); continue
        st = txt(g('status')); site, how = site_of(txt(g('qr')), ' '.join(txt(g(k)) for k in ('machine', 'symptom', 'cause', 'fix')))
        out.append({'wo': txt(g('wo')), 'row': n, 'status': st, 'state': 'done' if st in DONE else 'rejected' if st in REJECT else 'open',
                    'reported': rep, 'type': txt(g('type')), 'urgency': txt(g('urgency')), 'sla_h': sla_hours(txt(g('urgency'))), 'urgent': 'ด่วนมาก' in txt(g('urgency')),
                    'safety': txt(g('safety')).startswith('เกี่ยวข้อง'), 'machine_stop': txt(g('machine_stop')), 'line': txt(g('line')), 'mdept': txt(g('mdept')),
                    'qr': txt(g('qr')), 'machine': txt(g('machine'), 120), 'mtype': txt(g('mtype')) or '(ไม่ระบุ)', 'symptom': txt(g('symptom'), 400),
                    'fcode': txt(g('fcode')).rstrip(','), 'fdesc': txt(g('fdesc')), 'rcode': txt(g('rcode')).rstrip(','), 'rdesc': txt(g('rdesc')),
                    'cause': txt(g('cause'), 300), 'fix': txt(g('fix'), 300), 'assigned': iso(g('assigned')),
                    'min_assign': num(g('min_assign')), 'min_done': num(g('min_done')) if st in DONE else None, 'min_work': num(g('min_work')) if st in DONE else None,
                    'done_at': iso(g('done_at')) if st in DONE else None, 'score': num(g('score')), 'site': site, 'site_from': how})
    return out, miss, issues, ws.title

def main(path):
    raw = open(path, 'rb').read(); sha = hashlib.sha256(raw).hexdigest()
    rows, miss, issues, sheet = parse(path)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')
    dates = sorted(r['reported'] for r in rows)
    d = {'source': {'file': os.path.basename(path), 'sheet': sheet, 'sha256': sha, 'imported_at': now, 'rows': len(rows),
                    'reported_from': dates[0][:10] if dates else None, 'reported_to': dates[-1][:10] if dates else None, 'missing_cols': miss, 'issues': issues[:50]},
         'rows': rows}
    os.makedirs(DATA, exist_ok=True)
    json.dump(d, open(os.path.join(DATA, 'maintenance.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    hp = os.path.join(DATA, 'maintenance_history.json')
    h = json.load(open(hp, encoding='utf-8')) if os.path.exists(hp) else []
    if not any(x['sha256'] == sha for x in h): h.append({k: d['source'][k] for k in ('file', 'sha256', 'imported_at', 'rows', 'reported_from', 'reported_to')})
    json.dump(h, open(hp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    known = sum(1 for r in rows if r['site'])
    print(f'นำเข้าใบงาน {len(rows)} รายการ ({d["source"]["reported_from"]} ถึง {d["source"]["reported_to"]}) · ระบุพื้นที่ได้ {known} รายการ · sha256 {sha[:12]}…')
    if miss: print('  คอลัมน์ที่ไม่พบ:', ', '.join(miss))
    for i in issues[:10]: print('  !', i)

if __name__ == '__main__':
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    main(sys.argv[1])
