"""นำเข้าไฟล์ Excel ของ OM (ปริมาณน้ำ / รายได้ รายพื้นที่รายเดือน) → data/om.json พร้อมที่มา (ไฟล์ ชีท เซลล์ เวลานำเข้า sha256)
ใช้: python3 scripts/import_om.py om/<ไฟล์>.xlsx
- เซลล์ว่าง = ไม่มีข้อมูล (ไม่แปลงเป็นศูนย์) · ค่าศูนย์ในไฟล์ = ศูนย์จริงตามที่ OM กรอก
- นำเข้าไฟล์เดิมซ้ำ (sha256 เดิม) จะไม่เพิ่มประวัติใหม่ · ไฟล์แก้ไขจะบันทึกเป็น revision ใหม่ใน data/om_history.json"""
import sys, os, json, hashlib, datetime, re
import openpyxl
from openpyxl.utils import get_column_letter as L
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
KINDS = [('Actual', 'actual'), ('Budget', 'budget'), ("CP's Plan", 'cp_plan'), ('Contract', 'contract'), ('Max capacity', 'max_capacity')]
SHEETS = {'ปริมาณน้ำ': ('volume', 'ลบ.ม.'), 'รายได้': ('revenue', 'บาท')}

def parse(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    series, sites, blocks, issues = [], {}, [], []
    for ws in wb:
        if ws.title not in SHEETS: issues.append(f'ข้ามชีทที่ไม่รู้จัก: {ws.title}'); continue
        metric, unit = SHEETS[ws.title]
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if not isinstance(v, str) or 'เปรียบเทียบ' in v or ' Vs ' in v: continue
                kind = next((k for label, k in KINDS if label.lower() in v.lower()), None)
                if not kind: continue
                r, col = c.row, c.column
                mcol = col                                                    # คอลัมน์เดือนอยู่ใต้หัวตาราง · ปีและรหัสพื้นที่เริ่มคอลัมน์ถัดไป
                col = mcol + 1; year = ws.cell(r + 2, col).value
                if ws.cell(r + 2, mcol).value != 'Month' or not isinstance(year, (int, float)): continue   # ตารางเปรียบเทียบ/ไม่ใช่ตารางข้อมูล
                year = int(year); codes = []; cc = col
                while isinstance(ws.cell(r + 4, cc).value, str) and ws.cell(r + 4, cc).value.strip():
                    codes.append((cc, ws.cell(r + 4, cc).value.strip())); cc += 1
                phase = None
                for cc2, code in codes:
                    p = ws.cell(r + 3, cc2).value
                    if isinstance(p, str) and p.strip(): phase = re.sub(r'\s*\(.*', '', p.strip())
                    sites.setdefault(code, phase)
                n = 0; rr = r + 5
                while ws.cell(rr, mcol).value in MON:
                    m = MON.index(ws.cell(rr, mcol).value) + 1
                    for cc2, code in codes:
                        x = ws.cell(rr, cc2).value
                        if x is None or x == '': continue                      # ว่าง = ไม่มีข้อมูล
                        if not isinstance(x, (int, float)): issues.append(f'{ws.title}!{L(cc2)}{rr}: ไม่ใช่ตัวเลข ({x!r})'); continue
                        series.append({'metric': metric, 'kind': kind, 'year': year, 'month': m, 'site': code, 'value': round(float(x), 2), 'cell': f'{ws.title}!{L(cc2)}{rr}'}); n += 1
                    rr += 1
                if codes and codes[-1][1].lower() == 'total': pass
                blocks.append({'sheet': ws.title, 'title': v.strip(), 'metric': metric, 'kind': kind, 'year': year, 'unit': unit, 'range': f'{L(col)}{r + 5}:{L(col + len(codes) - 1)}{rr - 1}', 'values': n})
    return series, sites, blocks, issues

def main():
    path = sys.argv[1]; raw = open(path, 'rb').read(); sha = hashlib.sha256(raw).hexdigest()
    series, sites, blocks, issues = parse(path)
    keys = [(s['metric'], s['kind'], s['year'], s['month'], s['site']) for s in series]
    if len(keys) != len(set(keys)): raise SystemExit('พบข้อมูลซ้ำ (metric/kind/ปี/เดือน/พื้นที่) ในไฟล์เดียวกัน — ตรวจไฟล์ก่อนนำเข้า')
    if not series: raise SystemExit('ไม่พบตารางข้อมูลที่รู้จักในไฟล์')
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')
    hp = os.path.join(ROOT, 'data', 'om_history.json')
    hist = json.load(open(hp, encoding='utf-8')) if os.path.exists(hp) else []
    dup = any(h['sha256'] == sha for h in hist)
    if not dup: hist.append({'file': os.path.basename(path), 'sha256': sha, 'imported_at': now, 'values': len(series), 'revision': len(hist) + 1})
    json.dump(hist, open(hp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    last = {}
    for s in series:
        k = (s['metric'], s['kind'], s['year']); last[k] = max(last.get(k, 0), s['month'])
    out = {'source': {'file': os.path.basename(path), 'sha256': sha, 'imported_at': next(h['imported_at'] for h in hist if h['sha256'] == sha), 'revision': next(h['revision'] for h in hist if h['sha256'] == sha), 'provided_by': 'ฝ่าย OM (ไฟล์ Excel)'},
           'sites': [{'code': c, 'phase': p} for c, p in sites.items()], 'blocks': blocks, 'series': series, 'issues': issues,
           'coverage': [{'metric': k[0], 'kind': k[1], 'year': k[2], 'last_month': v} for k, v in sorted(last.items())]}
    json.dump(out, open(os.path.join(ROOT, 'data', 'om.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(('ไฟล์เดิม (sha256 ซ้ำ) — ไม่เพิ่มประวัติ' if dup else 'นำเข้าใหม่ revision ' + str(len(hist))), '·', len(series), 'ค่า', len(blocks), 'ตาราง', len(sites), 'พื้นที่')
    for b in blocks: print(' ', b['sheet'], b['kind'], b['year'], b['range'], b['values'])
    for i in issues: print('  !', i)
if __name__ == '__main__': main()
