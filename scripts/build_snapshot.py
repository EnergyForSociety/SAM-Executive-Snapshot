"""Normalization + ความสัมพันธ์เอกสาร → data/snapshot.json (ชุดข้อมูลที่หน้าเว็บใช้)
Input : raw/_manifest.json + raw/*.json (scripts/ingest_session.py) · config/area_mapping.json · data/om.json · data/contracts.json (ถ้ามี)
กติกา : จำนวนเงินคำนวณด้วย Decimal แล้วเก็บเป็น "สตางค์" (จำนวนเต็ม) ปัดครึ่งขึ้นต่อบรรทัด · ไม่บวก BL กับ IV · ข้อมูลที่ขาดไม่ใส่ศูนย์
ถ้าชุดข้อมูลหลักไม่ครบหรือการตรวจสำคัญไม่ผ่าน จะไม่เขียนทับ snapshot เดิม (exit 1)"""
import json, os, re, sys, datetime, collections
from decimal import Decimal as D, ROUND_HALF_UP

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, DATA = os.path.join(ROOT, 'raw'), os.path.join(ROOT, 'data')
BKK = datetime.timezone(datetime.timedelta(hours=7))
THM = {'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12}

def st(x):
    """บาท (string/Decimal) → สตางค์ (int) ปัดครึ่งขึ้น"""
    return int((D(str(x or 0)) * 100).quantize(D('1'), rounding=ROUND_HALF_UP))

def clean(s):
    return (s or '').replace('ฺ', '').replace('\xa0', ' ').strip()

def ce(yy):
    """ปี พ.ศ. 2 หลัก (68/69) → ค.ศ."""
    return 2500 + int(yy) - 543

def service_period(name):
    """อ่านช่วงให้บริการจากคำอธิบายบรรทัด BL → (from, to) ISO หรือ (None, None) ถ้าอ่านไม่ได้
    รองรับ 19-25/01/69 · 26/02-04/03/69 · 29/10/68-04/11/68 · (01-31/01/69-เฟส1,2) · เดือน มี.ค. 69"""
    n = clean(name)
    m = re.search(r'เดือน\s*([ก-๙.]+)\s*(\d\d)\b', n)
    if m and m.group(1) in THM:
        y, mo = ce(m.group(2)), THM[m.group(1)]
        last = (datetime.date(y + (mo == 12), mo % 12 + 1, 1) - datetime.timedelta(days=1)).day
        return f'{y}-{mo:02d}-01', f'{y}-{mo:02d}-{last:02d}'
    m = re.search(r'(\d{1,2})(?:/(\d{1,2}))?(?:/(\d\d))?\s*-\s*(\d{1,2})/(\d{1,2})/(\d\d)', n)
    if not m: return None, None
    d1, m1, y1, d2, m2, y2 = m.groups()
    y2 = ce(y2); m2 = int(m2); m1 = int(m1) if m1 else m2
    y1 = ce(y1) if y1 else (y2 - 1 if m1 > m2 else y2)
    try:
        a, b = datetime.date(y1, m1, int(d1)), datetime.date(y2, m2, int(d2))
    except ValueError:
        return None, None
    if a > b or (b - a).days > 62: return None, None
    return a.isoformat(), b.isoformat()

def classify(pid, name, amt):
    """จัดหมวดบรรทัด BL จากชื่อรายการ + รหัสสินค้า/บัญชี (ไม่ใช้เครื่องหมายลบตัดสินอย่างเดียว)"""
    n = clean(name); low = n.lower().replace(' ', '')
    if not n and amt == 0: return 'blank'
    if 'pre-treat' in low or 'pretreat' in low or 'pre-tream' in low or 'pretream' in low:
        return 'ded_pretreat' if amt < 0 else 'pretreat_charge'
    if amt < 0: return 'unclassified_negative'
    if 'เฟส' in n and 'ปรับปรุงคุณภาพน้ำ' in n: return 'svc_p12'
    if 'ปรับปรุงคุณภาพน้ำ' in n: return 'svc_p3'
    if pid == '4201006' or 'ตรวจการปนเปื้อน' in n: return 'lab'
    if pid == '5312005' or 'ค่าไฟฟ้า' in n: return 'other'
    return 'unclassified'

COST_GROUPS = {'chem': 'สารเคมี', 'maint': 'ซ่อมบำรุง-เครื่องจักรและอะไหล่', 'capex': 'สินทรัพย์ (เครื่องจักร/อาคาร/อุปกรณ์)', 'service': 'บริการ/ตรวจวิเคราะห์/สอบเทียบ',
               'facility': 'ซ่อมแซมอาคาร/สำนักงาน/ยานพาหนะ', 'other': 'อื่น ๆ'}

def cost_group(pid, pcat):
    """กลุ่มต้นทุนของบรรทัด PO จากรหัสบัญชี (product_id) หรือหมวดสินค้า RM/SU — ใช้รหัสตามระบบ ไม่ตีความจากชื่อ"""
    pid = (pid or '').strip(); pcat = (pcat or '').strip()
    if pcat == 'RM' or pid.startswith('RM-') or pid == '5101004': return 'chem'
    if pcat == 'SU' or pid.startswith('SU-') or pid[:4] == '5131' or pid == '5111001': return 'maint'
    if pid[:4] == '1701': return 'capex'
    if pid in ('5111000', '5111002', '5141000', '5306002'): return 'service'
    if pid[:4] == '5308': return 'facility'
    return 'other'

def is_cancel(status):
    """เอกสารยกเลิกไม่นับในทุกยอด"""
    return (status or '').strip().lower() in ('cancel', 'cancelled', 'canceled', 'ยกเลิก')

def dedupe(rows, key):
    """ตัดแถวซ้ำตาม key (ใช้กับ pagination และ AP/EXP) → (แถวไม่ซ้ำ, จำนวนที่ซ้ำ)"""
    seen, out, dup = set(), [], 0
    for r in rows:
        k = key(r)
        if k in seen: dup += 1; continue
        seen.add(k); out.append(r)
    return out, dup

def wht_like(status, total, grand, payment):
    """BL สถานะ Partial ที่คงเหลือ = 3% ของฐานก่อน VAT → ส่วนต่างภาษีหัก ณ ที่จ่าย ไม่ใช่ยอดค้าง"""
    total, grand, payment = D(str(total)), D(str(grand)), D(str(payment)); rem = grand - payment
    return status == 'Partial' and rem > 0 and (abs(rem - total * D('0.03')) <= D('0.02') or abs(rem - grand / D('1.07') * D('0.03')) <= D('0.02'))

def load_raw():
    man = json.load(open(os.path.join(RAW, '_manifest.json'), encoding='utf-8'))['calls']
    def get(tool, pred=lambda p: True):
        rows, calls = [], []
        for c in man:
            if c['tool'] == tool and pred(c['params']):
                calls.append(c)
                if c['ok']: rows += json.load(open(os.path.join(RAW, c['file']), encoding='utf-8'))['result']
        return rows, calls
    return man, get

def build():
    man, get = load_raw()
    cfg = json.load(open(os.path.join(ROOT, 'config', 'area_mapping.json'), encoding='utf-8'))
    checks, datasets, problems = [], [], []
    def check(name, ok, detail, critical=False):
        checks.append({'name': name, 'ok': bool(ok), 'detail': detail, 'critical': critical})
        if critical and not ok: problems.append(name + ': ' + detail)
    fetched = sorted(c['fetched_at'] for c in man if c['fetched_at'])
    to_bkk = lambda t: datetime.datetime.fromisoformat(t.replace('Z', '+00:00')).astimezone(BKK)
    asof = to_bkk(fetched[-1]).date().isoformat()
    def dataset(key, label, calls, rows, docs=None, last=None, note='', page_limit=None):
        ok = bool(calls) and all(c['ok'] for c in calls)
        full = ok and (page_limit is None or all((c['rows'] or 0) < page_limit for c in calls[-1:]))
        datasets.append({'key': key, 'label': label, 'tools': sorted({c['tool'] for c in calls}), 'calls': len(calls), 'rows': rows, 'docs': docs, 'last_doc_date': last,
                         'fetched_at': to_bkk(max(c['fetched_at'] for c in calls)).isoformat(timespec='seconds') if calls else None, 'complete': full, 'note': note})
        return full

    # ---------- พื้นที่ ----------
    deps, c = get('search_department')
    areas = []
    for d in deps:
        m = cfg['departments'].get(d['code'], {})
        areas.append({'code': d['code'], 'name': clean(d['description']), 'kind': m.get('kind', cfg['default_kind']), 'om_site': m.get('om_site'), 'phase': m.get('phase'),
                      'confirmed': m.get('confirmed', False), 'active': d.get('is_active') == '1'})
    dataset('departments', 'หน่วยงาน/พื้นที่ (department)', c, len(deps), note='ใช้ทำ mapping พื้นที่ · project ใน BL/IV ว่าง จึงใช้ department')
    acode = {a['code'] for a in areas}

    # ---------- BL รายบรรทัด (B3) ----------
    b3, c = get('get_b3_service_bill_report', lambda p: p['date-from'] >= '2026')
    lines, raw_total, cancelled = [], D(0), [r for r in b3 if is_cancel(r['status'])]
    for r in b3:
        if is_cancel(r['status']): continue
        amt = st(r['before_vat']); raw_total += D(r['before_vat'])
        a, b = service_period(r['product_name'])
        tag = re.search(r'\(([^()]*)\)\s*$', clean(r['product_name']))
        lines.append({'doc': r['document'], 'date': r['issue_date'], 'due': r['due_date'], 'dept': r['department'], 'code': r['code'], 'org': clean(r['organization'] or r['vendor']), 'branch': clean(r['branch']),
                      'pid': r['product_id'], 'name': clean(r['product_name']), 'qty': r['quantity'], 'unit': clean(r['unit']), 'price': r['price'], 'amt': amt, 'vat': st(r['vat']),
                      'status': r['status'], 'cat': classify(r['product_id'], r['product_name'], amt), 'svc_from': a, 'svc_to': b, 'tag': tag.group(1) if tag and 'เฟส' not in tag.group(1) else None, 'item': r['item_id']})
    ok = dataset('bl_lines', 'BL รายบรรทัด (รายงาน B3) ปี 2569', c, len(lines), len({l['doc'] for l in lines}), max((l['date'] for l in lines), default=None), page_limit=5000)
    check('ตัดเอกสารยกเลิกออกจากยอด', True, f'พบบรรทัด BL สถานะยกเลิก {len(cancelled)} บรรทัด (ไม่นับ)')
    check('BL รายบรรทัดดึงครบ (ไม่ชนเพดาน 5,000 แถว)', ok, f'{len(lines)} บรรทัด', critical=True)
    check('ไม่มีบรรทัด BL ซ้ำ (item_id)', len({l['item'] for l in lines}) == len(lines), f'{len(lines)} บรรทัด / {len({l["item"] for l in lines})} item_id', critical=True)
    diff = abs(sum(l['amt'] for l in lines) - st(raw_total))
    check('ผลรวมบรรทัดหลังปัดสตางค์ตรงกับผลรวมดิบ', diff <= len(lines), f'ต่างกัน {diff} สตางค์ จาก {len(lines)} บรรทัด (ยอดดิบ {raw_total.quantize(D("0.01"))} บาท)')
    unc = [l for l in lines if l['cat'].startswith('unclassified')]
    check('จัดหมวดบรรทัด BL ได้ทุกบรรทัด', not unc, f'จัดไม่ได้ {len(unc)} บรรทัด' + (': ' + ', '.join(sorted({l["doc"] for l in unc})[:5]) if unc else ''))
    nosvc = [l for l in lines if l['cat'] in ('svc_p12', 'svc_p3', 'pretreat_charge') and not l['svc_from']]
    check('อ่านช่วงให้บริการจากคำอธิบายได้', not nosvc, f'อ่านไม่ได้ {len(nosvc)} บรรทัด' + (': ' + ', '.join(sorted({l["doc"] for l in nosvc})[:6]) if nosvc else ''))
    acc = collections.Counter(l['pid'] for l in lines if l['cat'] == 'ded_pretreat')
    check('รายการหัก Pre-Treatment ใช้รหัสเดียว', len(acc) <= 1, 'พบรหัส ' + ', '.join(f'{k} ({v} บรรทัด)' for k, v in acc.items()))
    check('department ของ BL อยู่ในทะเบียนพื้นที่', all(l['dept'] in acode for l in lines), 'map ไม่ได้: ' + (', '.join(sorted({l['dept'] or '(ว่าง)' for l in lines if l['dept'] not in acode})) or 'ไม่มี'))

    # ---------- BL หัวเอกสาร (search_bl) ----------
    hd, c = get('search_bl', lambda p: str(p.get('limit')) == '100')
    by_page = collections.Counter()
    docs = []
    hd, by_page['dup'] = dedupe(hd, lambda r: r['bill_id'])
    for r in hd:
        if is_cancel(r['status']): continue
        total, grand, pay = D(r['total']), D(r['grand_total']), D(r['payment'])
        rem = grand - pay
        is_wht = wht_like(r['status'], total, grand, pay)
        opening = r['type'].startswith('ยกยอด')
        cls = {'Debtor': 'open', 'Paid': 'converted'}.get(r['status']) or ('wht_diff' if is_wht else 'partial_open')
        docs.append({'doc': r['ref_no'], 'date': r['issue_date'], 'due': r['due_date'], 'dept': r['department'], 'code': clean(r['title']), 'org': clean(r['organization'] or r['name']), 'branch': clean(r['branch']),
                     'total': st(total), 'vat': st(r['tax']), 'grand': st(grand), 'payment': st(pay), 'remaining': st(rem), 'status': r['status'], 'cls': cls, 'opening': opening,
                     'note': clean(r['invoice_note'])[:140], 'wht_field': r['wht'], 'updated': r['update_dt'], 'iv': []})
    hc = [x for x in c]
    ok = dataset('bl_docs', 'BL หัวเอกสาร (search_bl) 2568–2569', hc, len(docs), len(docs), max(d['date'] for d in docs), note='รวมเอกสารยกยอดลูกหนี้ปี 2568 (ประเภท ยกยอด-ลูกหนี้1)', page_limit=100)
    check('pagination ของ BL หัวเอกสารไม่ซ้ำ', by_page['dup'] == 0, f'ซ้ำ {by_page["dup"]} เอกสาร', critical=True)
    check('BL หัวเอกสารดึงครบทุกหน้า', ok, f'{len(docs)} เอกสาร ใน {len(hc)} คำขอ', critical=True)
    D26 = {d['doc']: d for d in docs}
    ldocs = {l['doc'] for l in lines}
    h26 = {d['doc'] for d in docs if not d['opening'] and d['date'] >= '2026'}
    check('เอกสารในรายงานบรรทัดตรงกับหัวเอกสาร', ldocs == h26, f'บรรทัด {len(ldocs)} เอกสาร / หัว {len(h26)} เอกสาร · ต่างกัน {len(ldocs ^ h26)}', critical=True)
    bad = [d['doc'] for d in docs if d['doc'] in ldocs and abs(sum(l['amt'] for l in lines if l['doc'] == d['doc']) - d['total']) > 2]
    check('ยอดก่อน VAT ของหัวเอกสารเท่ากับผลรวมบรรทัด', not bad, f'ไม่ตรง {len(bad)} เอกสาร' + (': ' + ', '.join(bad[:5]) if bad else ''))
    check('ช่อง wht ในหัว BL', True, 'ทุกเอกสารเป็น ' + ', '.join(sorted({d['wht_field'] for d in docs})) + ' — ส่วนต่าง 3% ของเอกสารสถานะ Partial จึงอนุมานว่าเป็นภาษีหัก ณ ที่จ่าย (รอบัญชียืนยัน)')
    po_cls = [d['doc'] for d in docs if d['cls'] == 'partial_open']
    check('เอกสาร Partial ทุกใบอธิบายได้ด้วยส่วนต่าง 3%', not po_cls, f'อธิบายไม่ได้ {len(po_cls)} เอกสาร' + (': ' + ', '.join(po_cls[:5]) if po_cls else ''))

    # ---------- IV (IV3) และความสัมพันธ์ BL → IV ----------
    ivl, c = get('get_iv3_sales_report', lambda p: p['date-from'] >= '2026')
    ivd = {}
    for r in ivl:
        x = ivd.setdefault(r['document'], {'doc': r['document'], 'date': r['issue_date'], 'due': r['due_date'], 'bl': clean(r['bl']), 'status': r['status'], 'dept': r['department'], 'amt': 0, 'after': 0, 'doc_type': r['doc_type'], 'lines': 0, 'cost_zero': True})
        x['amt'] += st(r['before_vat']); x['after'] += st(r['after_vat']); x['lines'] += 1
        if D(r['cost'] or 0) != 0: x['cost_zero'] = False
    ivs = sorted(ivd.values(), key=lambda x: x['doc'])
    ok = dataset('iv', 'IV ใบกำกับภาษี/ใบเสร็จ (รายงาน IV3) ปี 2569', c, len(ivl), len(ivs), max((x['date'] for x in ivs), default=None), note='เอกสารเลขที่ RE… · ต้นทุนในรายงานเป็นศูนย์ทุกบรรทัด จึงไม่ใช้คำนวณกำไร', page_limit=5000)
    check('IV ดึงครบ', ok, f'{len(ivl)} บรรทัด {len(ivs)} เอกสาร', critical=True)
    nobl = [x['doc'] for x in ivs if x['bl'] not in D26]
    check('IV ทุกฉบับอ้างอิง BL ที่มีในชุดข้อมูล', not nobl, f'ไม่พบ BL ต้นทาง {len(nobl)} ฉบับ' + (': ' + ', '.join(nobl[:5]) if nobl else ''))
    for x in ivs:
        if x['bl'] in D26: D26[x['bl']]['iv'].append(x['doc'])
    multi = [d['doc'] for d in docs if len(d['iv']) > 1]
    check('ความสัมพันธ์ BL → IV', True, f'BL ที่มี IV {sum(1 for d in docs if d["iv"])} ฉบับ · BL ที่แตกเป็นหลาย IV {len(multi)} ฉบับ · ยอดเรียกเก็บใช้ BL เท่านั้น ไม่บวก IV ซ้ำ')
    conv_no_iv = [d['doc'] for d in docs if d['cls'] in ('converted', 'wht_diff') and not d['iv'] and not d['opening']]
    check('BL สถานะ Paid/Partial มี IV รองรับ', not conv_no_iv, f'ไม่มี IV {len(conv_no_iv)} ฉบับ' + (': ' + ', '.join(conv_no_iv[:6]) if conv_no_iv else ''))
    check('ต้นทุนในรายงาน IV', True, ('ต้นทุนเป็นศูนย์ทุกบรรทัด' if all(x['cost_zero'] for x in ivs) else 'มีบางบรรทัดที่มีต้นทุน') + ' — ไม่แสดงกำไรจนกว่าจะมีฐานต้นทุนครบ')

    # ---------- IV/CN ค้างรับ (get_receivable_due) ----------
    rc, c = get('get_receivable_due')
    recv = []
    for r in rc:
        ref = clean(r['reference']); src = D26.get(ref)
        recv.append({'doc': r['document'], 'date': r['issue_date'], 'due': r['due_date'], 'ref': ref, 'ref_kind': 'opening' if src and src['opening'] else ('bl' if src else 'unknown'),
                     'amount': st(r['amount']), 'code': r['code'], 'org': clean(r['vendor'] or r.get('organization')), 'branch': clean(r['branch']), 'dept': r['department'], 'status': r['status'], 'conv': r['conversion'], 'overdue_api': int(r['overdue'] or 0),
                     'ref_status': src['status'] if src else None, 'ref_dept': src['dept'] if src else None})
    dataset('receivable_due', 'IV/CN ค้างรับ (get_receivable_due ถึง 31/12/2570)', c, len(recv), len({r['doc'] for r in recv}), max((r['date'] for r in recv), default=None), note='ครอบคลุมเฉพาะ IV/CN — ไม่รวม BL ที่ยังไม่ออก IV', page_limit=5000)
    check('ไม่มีเอกสารค้างรับซ้ำ', len({r['doc'] for r in recv}) == len(recv), f'{len(recv)} รายการ', critical=True)
    open_bl = {d['doc'] for d in docs if d['cls'] in ('open', 'partial_open')}
    overlap = [r['doc'] for r in recv if r['ref'] in open_bl]
    check('IV ค้างรับไม่ซ้อนกับ BL ที่ยังชำระไม่ครบ', not overlap, f'ซ้อนกัน {len(overlap)} รายการ — IV ค้างรับทุกใบอ้างอิง BL/ยอดยกมาที่สถานะ Paid (ออก IV แล้ว)' if not overlap else 'ซ้อน: ' + ', '.join(overlap[:5]))
    check('IV ค้างรับอ้างอิงเอกสารต้นทางได้', all(r['ref_kind'] != 'unknown' for r in recv), f'หาเอกสารต้นทางไม่พบ {sum(1 for r in recv if r["ref_kind"] == "unknown")} รายการ')
    cn, c2 = get('get_cn3_credit_note_report')
    dataset('cn', 'ใบลดหนี้ขาย CN (รายงาน CN3) 2568–2569', c2, len(cn), 0, None, note='ไม่พบใบลดหนี้ในช่วงที่ดึง' if not cn else '')

    # ---------- เจ้าหนี้ครบกำหนด (get_payable_due) ----------
    pv, c = get('get_payable_due')
    pay = []
    pvu, _dup = dedupe(pv, lambda r: (r['conversion'], r['document']))
    for r in pvu:
        pay.append({'doc': r['document'], 'conv': r['conversion'], 'date': r['issue_date'], 'due': r['due_date'], 'vendor': clean(r['organization'] or r['vendor']), 'ctype': r['contact_type'], 'dept': r['department'],
                    'amount': st(r['amount']), 'bn_amount': st(r['bn_amount']), 'status': r['status'], 'doc_type': r['doc_type'], 'ref': clean(r['reference']), 'future': r['issue_date'] > asof, 'approve': r['approve_status']})
    dataset('payable_due', 'เจ้าหนี้ AP/EXP/CNR ค้างจ่าย (get_payable_due ถึง 31/12/2570)', c, len(pv), len(pay), max((r['date'] for r in pay), default=None), page_limit=5000)
    check('AP/EXP ไม่นับซ้ำ (ประเภท + เลขที่เอกสาร)', len(pay) == len(pv), f'{len(pv)} แถว → {len(pay)} เอกสาร')
    x3, c = get('get_x3_expense_report')
    x3docs = {r['document'] for r in x3}
    dataset('expense', 'ค่าใช้จ่ายอื่น EXP (รายงาน X3) ปี 2569', c, len(x3), len(x3docs), max((r['issue_date'] for r in x3), default=None), note='ใช้ตรวจความซ้ำกับเจ้าหนี้ · ยังไม่ใช้เป็นต้นทุน', page_limit=5000)
    exp_in = [p['doc'] for p in pay if p['conv'] == 'EXP' and p['date'] <= asof]
    check('เจ้าหนี้ประเภท EXP พบในรายงาน X3 ด้วยเลขที่เดียวกัน', all(d in x3docs for d in exp_in), f'{sum(1 for d in exp_in if d in x3docs)}/{len(exp_in)} เอกสาร (ไม่รวมเอกสารลงวันที่อนาคต) — เป็นเอกสารเดียวกัน จึงไม่บวก X3 เข้าเจ้าหนี้ซ้ำ')

    # ---------- ภาระ PO (PO3) ----------
    po3, c = get('get_po3_purchase_order_report')
    pod = {}
    for r in po3:
        x = pod.setdefault(r['document'], {'doc': r['document'], 'date': r['issue_date'], 'delivery': r['delivery_due'], 'vendor': clean(r['organization'] or r['vendor']), 'dept': r['department'], 'status': r['status'], 'approve': r['approve_status'], 'amt': 0, 'backlog': 0, 'items': []})
        x['amt'] += st(r['before_vat']); x['backlog'] += st(r['backlog_ap'])
        if len(x['items']) < 3: x['items'].append(clean(r['product_name']).split('\n')[0][:60])
    pos = sorted(pod.values(), key=lambda x: x['doc'])
    for x in pos: x['commit'] = x['approve'] == 'Approved' and x['status'] in ('New', 'Partial', 'Sent', 'Email', 'Confirmed') and x['backlog'] > 0
    dataset('po', 'ใบสั่งซื้อ PO (รายงาน PO3) ปี 2569', c, len(po3), len(pos), max((x['date'] for x in pos), default=None), note='backlog_ap = มูลค่าที่ยังไม่ตั้งเจ้าหนี้ (ก่อน VAT) ตามรายงาน', page_limit=5000)
    # บรรทัด PO แยกกลุ่มต้นทุนตามรหัสบัญชี/หมวดสินค้า (มูลค่าสั่งซื้อ ไม่ใช่ค่าใช้จ่ายที่รับรู้)
    coa = {}
    for r in get('search_coa')[0]:
        if r.get('acc_code'): coa[r['acc_code']] = r.get('acc_th') or ''
    po_lines = []
    for r in po3:
        if is_cancel(r['status']): continue
        pid = (r['product_id'] or '').strip()
        po_lines.append({'doc': r['document'], 'date': r['issue_date'], 'dept': r['department'], 'vendor': clean(r['organization'] or r['vendor']), 'pid': pid,
                         'acc': pid if re.fullmatch(r'\d{7}', pid) else ('5101004' if r['product_category'] == 'RM' else ''), 'pcat': r['product_category'] or '',
                         'name': clean(r['product_name']).split('\n')[0][:120], 'qty': r['quantity'], 'unit': r['unit'], 'amt': st(r['before_vat']), 'backlog': st(r['backlog_ap']),
                         'status': r['status'], 'ref': r['reference'] or '', 'grp': cost_group(pid, r['product_category'])})
    total_lines = sum(1 for r in po3 if not is_cancel(r['status']))
    check('บรรทัด PO ทุกบรรทัด (ไม่รวมยกเลิก) ถูกจัดกลุ่มต้นทุน', len(po_lines) == total_lines and all(l['grp'] for l in po_lines), f'{len(po_lines)} บรรทัด · สารเคมี {sum(1 for l in po_lines if l["grp"] == "chem")} · ซ่อมบำรุง {sum(1 for l in po_lines if l["grp"] == "maint")} · สินทรัพย์ {sum(1 for l in po_lines if l["grp"] == "capex")}')
    check('ยอด PO รายบรรทัดรวมเท่ากับยอดรายเอกสาร (ไม่รวมยกเลิก)', sum(l['amt'] for l in po_lines) == sum(x['amt'] for x in pos if not is_cancel(x['status'])), 'ตรวจด้วยหน่วยสตางค์')

    # ---------- Management P&L จาก Ledger ----------
    led_rows, c = get('get_ledger')
    pl = None
    if led_rows:
        plcfg = json.load(open(os.path.join(ROOT, 'config', 'pl_mapping.json'), encoding='utf-8'))
        # บรรทัดเดียวกันอาจมาจากหลายหน้า (pagination) — ตัดซ้ำด้วยคีย์ที่ระบุบรรทัดบัญชีได้จริง
        led, dup = dedupe(led_rows, lambda r: (r['transaction_id'], r['acc_code'], r['costcenter'], r['dr'], r['cr'], r['acc_note'], r['date']))
        # ครบเมื่อ "หน้าสุดท้ายของแต่ละบัญชี" ได้ไม่เต็มเพดาน (หน้าแรกของบัญชีที่มีรายการมากย่อมเต็ม 100 เป็นปกติ)
        pages = collections.defaultdict(list)
        for x in c:
            if x['ok']: pages[x['params']['acc_code']].append((int(x['params'].get('start') or 0), x['rows'] or 0))
        full = all(max(p)[1] < 100 for p in pages.values())
        dataset('ledger', 'สมุดรายวันแยกประเภท (get_ledger) บัญชีรายได้/ต้นทุน/ค่าใช้จ่าย ปี 2569', c, len(led),
                len({r['transaction_id'] for r in led}), max((r['date'] for r in led), default=None),
                note='ดึงทุกบัญชีใน COA หมวด 4/5/6 แล้วเก็บเฉพาะบัญชีที่มีรายการ · ดึงครบทุกหน้าด้วยพารามิเตอร์ start')
        check('Ledger ดึงครบทุกหน้า (ทุกคำขอได้ไม่เต็มเพดาน 100 แถว)', full, f'{len(c)} คำขอ · {len(led)} บรรทัด', critical=True)
        check('ไม่มีบรรทัด Ledger ซ้ำจากการแบ่งหน้า', True, f'ตัดซ้ำ {dup} บรรทัด จาก {len(led_rows)} แถวที่ดึงมา')

        def head_of(code):
            """หาหัวบัญชีที่ยาวที่สุดที่ตรงกับรหัสบัญชี — ให้ 5301..5312 ชนะ 530"""
            best = None
            for g in plcfg['groups']:
                for h in g['heads']:
                    if code.startswith(h) and (best is None or len(h) > len(best[1])): best = (g, h)
            return best[0] if best else None

        SIGN = {'revenue': -1}      # รายได้: เครดิตเป็นบวก · อื่น ๆ: เดบิตเป็นบวก
        accs, months, excluded = {}, set(), {}
        gm = collections.defaultdict(lambda: collections.defaultdict(int))
        gm_ex = collections.defaultdict(lambda: collections.defaultdict(int))     # ไม่รวมบรรทัดรายการปรับสัญญาเช่า
        mstat = collections.defaultdict(lambda: {'rows': 0, 'adjust_rows': 0, 'adjust_abs': 0, 'estimate_rows': 0})
        cc = collections.defaultdict(lambda: collections.defaultdict(int))
        cc_missing = collections.defaultdict(int)
        kw_adj, kw_est = plcfg['adjust_keywords'], plcfg['estimate_keywords']
        kw_lease = [k.lower() for k in plcfg['lease_keywords']]
        lease_docs, lease_abs = set(), 0
        for r in led:
            code = (r['acc_code'] or '').strip()
            if not re.fullmatch(r'[456]\d{6}', code):     # กันบัญชีงบดุลหลุดเข้า P&L
                excluded[code] = excluded.get(code, 0) + 1; continue
            g = head_of(code)
            if g is None:
                excluded[code] = excluded.get(code, 0) + 1; continue
            mo = r['date'][:7]; months.add(mo)
            amt = st(r['dr']) - st(r['cr'])
            amt *= SIGN.get(g['kind'], 1)
            a = accs.setdefault(code, {'code': code, 'name': clean(r['acc_th']) or clean(r['acc_en']), 'group': g['key'], 'kind': g['kind'], 'by_month': {}, 'total': 0, 'rows': 0})
            a['by_month'][mo] = a['by_month'].get(mo, 0) + amt; a['total'] += amt; a['rows'] += 1
            gm[g['key']][mo] += amt
            txt = (clean(r['note1']) + ' ' + clean(r['acc_note'])).lower()
            s = mstat[mo]; s['rows'] += 1
            if any(k.lower() in txt for k in kw_adj): s['adjust_rows'] += 1; s['adjust_abs'] += abs(amt)
            if any(k.lower() in txt for k in kw_est): s['estimate_rows'] += 1
            if any(k in txt for k in kw_lease):
                s['lease_rows'] = s.get('lease_rows', 0) + 1
                lease_docs.add(r['ref_no']); lease_abs += abs(amt)
            else:
                gm_ex[g['key']][mo] += amt
            if g['kind'] in ('cost', 'revenue'):
                k = (r['costcenter'] or '').strip()
                if k: cc[g['key']][k] += amt
                else: cc_missing[g['key']] += 1
        months = sorted(months)
        gtot = {g['key']: {'label': g['label'], 'kind': g['kind'], 'management': g.get('management', True), 'caveat': g.get('caveat'),
                           'by_month': {m: gm[g['key']].get(m, 0) for m in months}, 'total': sum(gm[g['key']].values()),
                           'by_month_ex_lease': {m: gm_ex[g['key']].get(m, 0) for m in months}, 'total_ex_lease': sum(gm_ex[g['key']].values())} for g in plcfg['groups']}

        def line_values():
            vals, out = {}, []
            for ln in plcfg['lines']:
                if 'add' in ln:
                    v = {m: sum(gtot[k]['by_month'].get(m, 0) for k in ln['add']) for m in months}
                else:
                    expr = ln['formula']
                    v = {}
                    for m in months:
                        e = expr
                        for k in sorted(vals, key=len, reverse=True): e = e.replace(k, str(vals[k].get(m, 0)))
                        v[m] = eval(e, {'__builtins__': {}})      # มีแต่ชื่อบรรทัดจาก config และเครื่องหมาย + -
                vals[ln['key']] = v
                out.append({'key': ln['key'], 'label': ln['label'], 'by_month': v, 'total': sum(v.values()), 'derived': 'formula' in ln})
            return out, vals

        lines_pl, vals = line_values()
        # ตรวจสมการงบ: กำไรขั้นต้น + รายได้อื่น - ค่าใช้จ่าย = EBITDA ฯลฯ
        eq = all(vals['gp'][m] == vals['rev_service'][m] - vals['cos'][m] and
                 vals['ebitda'][m] == vals['gp'][m] + vals['rev_other'][m] - vals['opex'][m] and
                 vals['ebt'][m] == vals['ebitda'][m] - vals['dep_admin'][m] - vals['finance'][m] and
                 vals['np'][m] == vals['ebt'][m] - vals['tax'][m] for m in months)
        check('สมการ Management P&L ถูกต้องทุกเดือน', eq, f'{len(months)} เดือน ({months[0]} – {months[-1]})', critical=True)
        sum_acc = {m: sum(a['by_month'].get(m, 0) for a in accs.values()) for m in months}
        sum_grp = {m: sum(gtot[k]['by_month'][m] for k in gtot) for m in months}
        check('ยอดรวมรายบัญชีเท่ากับยอดรวมรายกลุ่ม', sum_acc == sum_grp, 'ตรวจด้วยหน่วยสตางค์ทุกเดือน', critical=True)
        check('ไม่มีบัญชีงบดุลหรือบัญชีนอกผังในงบ', not excluded, 'ไม่พบ' if not excluded else 'ไม่รวม: ' + ', '.join(f'{k} ({v} บรรทัด)' for k, v in sorted(excluded.items())))
        # ค่าใช้จ่ายดำเนินงานที่ใช้วัดผลได้ (กลุ่มที่ไม่ถูกรายการปรับสัญญาเช่าครอบ และไม่ใช่ภาษี)
        usable = [k for k, g in gtot.items() if g['management'] and g['kind'] in ('cost', 'expense')]
        cost_usable = {m: sum(gtot[k]['by_month_ex_lease'][m] for k in usable) for m in months}
        check('แยกกลุ่มที่ใช้วัดผลได้ออกจากกลุ่มที่ถูกรายการปรับสัญญาเช่าครอบ', bool(usable) and any(not g['management'] for g in gtot.values()),
              'ใช้วัดผลได้: ' + ', '.join(gtot[k]['label'] for k in usable) + ' · ติดคำเตือน: ' + ', '.join(g['label'] for g in gtot.values() if not g['management']))
        pl = {'months': months, 'accounts': sorted(accs.values(), key=lambda a: a['code']), 'groups': gtot, 'lines': lines_pl,
              'headline': plcfg['headline_profit'], 'profit_usable': plcfg['profit_usable'], 'profit_blocked_reason': plcfg['profit_blocked_reason'],
              'cost_usable': cost_usable, 'cost_usable_groups': usable, 'excluded': excluded,
              'lease_adjust': {'docs': sorted(lease_docs), 'rows': sum(mstat[m].get('lease_rows', 0) for m in months), 'abs': lease_abs},
              'month_status': {m: dict(mstat[m], preliminary=True) for m in months},
              'by_costcenter': {k: dict(v) for k, v in cc.items()}, 'costcenter_missing': dict(cc_missing),
              'maint_accounts': plcfg['maintenance_accounts'],
              'note': 'ยังไม่มี API สถานะปิดบัญชี — ทุกเดือนถือเป็นผลเบื้องต้น · บัญชีรายได้บางบัญชีมีรายการปรับเป็นวิธีลูกหนี้สัญญาเช่า (TFRS) และกลับรายการรายไตรมาส ยอดสะสมรายบัญชีจึงอ่านแยกบัญชีไม่ได้ ต้องดูทั้งกลุ่ม'}
        q = [m for m in months if mstat[m]['adjust_rows']]
        check('ติดธงเดือนที่มีรายการปรับ/กลับรายการ', bool(q), 'เดือนที่มีรายการปรับ: ' + (', '.join(q) if q else 'ไม่มี'))

    # ---------- ชุดที่ยังไม่มี/ติดสิทธิ์ ----------
    limits = [
        {'topic': 'งบกำไรขาดทุน / งบดุล / งบทดลอง (API สำเร็จรูป)', 'detail': 'API ตอบ 402 Payment Required (ต้องใช้แพ็กเกจ Datawarehouse หรือ ERP) — ตรวจเมื่อ 15 พ.ย. 2569 · จึงประกอบ Management P&L เองจาก Ledger (get_ledger) ซึ่งเป็น API ที่ใช้ได้'},
        {'topic': 'สถานะปิดบัญชีรายเดือน', 'detail': 'ไม่มี API บอกว่าเดือนใดปิดแล้ว — ทุกเดือนในงบจึงกำกับว่า "ผลเบื้องต้น (ยังไม่ปิดบัญชี)"'},
        {'topic': 'รายการปรับวิธีลูกหนี้สัญญาเช่า (TFRS)', 'detail': 'บัญชี 4101000 / 4211000 / 4211001 / 5151000 / 5151002 มี JV ปรับและกลับรายการรายไตรมาส ทำให้ยอดสะสมของบัญชีเดี่ยวติดลบ/ผิดด้าน — งบจึงแสดงเป็นกลุ่มและติดธงเดือนที่มีรายการปรับ ไม่แยกอ่านรายบัญชี'},
        {'topic': 'ใบเสร็จรับเงิน RV', 'detail': 'ค้น RV ในช่วงที่ตรวจไม่พบเอกสาร ขณะที่ IV มีสถานะ Cash — ใช้วันที่ IV (ประเภท TTB(RV)-BL) เป็นวันที่รับเงินตามเอกสาร รอฝ่ายบัญชียืนยัน'},
        {'topic': 'ยอดเรียกเก็บปี 2568 ใน TRCLOUD', 'detail': 'ปี 2568 มีเฉพาะเอกสารยกยอดลูกหนี้ (ไม่มี BL รายบรรทัด) — การเทียบปีก่อนจึงใช้ข้อมูลรายได้/ปริมาณจากไฟล์ OM'},
        {'topic': 'รายงานซื้อ AP (P5) / ใบสำคัญจ่าย PV / GL / ธนาคาร', 'detail': 'ยังไม่ได้นำเข้าในรุ่นนี้ — เงินจ่ายจริงและยอดเงินสดจึงยังไม่แสดง'},
        {'topic': 'หน่วยปริมาณใน BL', 'detail': 'ช่อง unit ว่างทุกบรรทัด — แสดงปริมาณตามเอกสารโดยไม่ติดหน่วย และเทียบกับปริมาณจากไฟล์ OM แยกต่างหาก'},
        {'topic': 'สัญญา คุณภาพน้ำ Downtime ค่าปรับ', 'detail': 'ยังไม่มีข้อมูล — ซ่อนหน้าสัญญาและความเสี่ยงไว้ก่อนจนกว่าจะเข้าถึงข้อมูลได้ (แม่แบบอยู่ใน templates/)'},
        {'topic': 'ค่าซ่อมบำรุงและสารเคมี', 'detail': 'ใช้มูลค่าใบสั่งซื้อ PO ตามวันที่ออก PO (ก่อน VAT) — เป็นภาระสั่งซื้อ ไม่ใช่ค่าใช้จ่ายที่รับรู้ตามงวดบัญชี เพราะ GL / งบกำไรขาดทุนยังเข้าถึงไม่ได้'},
        {'topic': 'ใบงานแจ้งซ่อม ↔ PO', 'detail': 'ใบงานไม่มีเลขที่ PR/PO และ PO ไม่มีเลขที่ใบงาน — การจับคู่ในหน้า Maintenance เป็นการจับคู่ที่เป็นไปได้จากพื้นที่ ช่วงวันที่ และคำสำคัญ ต้องยืนยันก่อนใช้'},
    ]
    om = json.load(open(os.path.join(DATA, 'om.json'), encoding='utf-8')) if os.path.exists(os.path.join(DATA, 'om.json')) else None
    mp = os.path.join(DATA, 'maintenance.json')
    maint = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else None
    if maint:
        known = {a['om_site'] for a in areas if a.get('om_site')}
        bad = sorted({r['site'] for r in maint['rows'] if r['site'] and r['site'] not in known})
        check('รหัสพื้นที่ในใบงานแจ้งซ่อมตรงกับรหัสพื้นที่ OM ใน area_mapping', not bad, 'ไม่พบรหัสที่ไม่รู้จัก' if not bad else 'ไม่รู้จัก: ' + ', '.join(bad))
    cp = os.path.join(DATA, 'contracts.json')
    contracts = json.load(open(cp, encoding='utf-8')) if os.path.exists(cp) else None
    if problems:
        print('ไม่เขียน snapshot — การตรวจสำคัญไม่ผ่าน:\n- ' + '\n- '.join(problems)); sys.exit(1)
    snap = {'meta': {'company': 'SAM WATER SUPPLY', 'mode': 'snapshot', 'asof': asof, 'tz': 'Asia/Bangkok',
                     'fetched_from': to_bkk(fetched[0]).isoformat(timespec='seconds'), 'fetched_to': to_bkk(fetched[-1]).isoformat(timespec='seconds'),
                     'period_from': '2026-01-01', 'period_to': asof, 'source': 'TRCLOUD MCP (บริษัท SAM) — อ่านอย่างเดียว ผ่าน session ของผู้ช่วย', 'built_at': datetime.datetime.now(BKK).isoformat(timespec='seconds'),
                     'datasets': datasets, 'checks': checks, 'limits': limits, 'settings': json.load(open(os.path.join(ROOT, 'config', 'settings.json'), encoding='utf-8')), 'money_unit': 'satang'},
            'areas': areas, 'bl_lines': lines, 'bl_docs': docs, 'iv': ivs, 'recv': recv, 'pay': pay, 'po': pos, 'po_lines': po_lines, 'pl': pl, 'cost_groups': COST_GROUPS, 'coa': {k: v for k, v in coa.items() if any(l['acc'] == k for l in po_lines)}, 'om': om, 'maint': maint, 'contracts': contracts}
    json.dump(snap, open(os.path.join(DATA, 'snapshot.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return snap

if __name__ == '__main__':
    s = build()
    print('snapshot ณ', s['meta']['asof'], '· BL', len(s['bl_docs']), 'เอกสาร', len(s['bl_lines']), 'บรรทัด · IV', len(s['iv']), '· ค้างรับ', len(s['recv']), '· เจ้าหนี้', len(s['pay']), '· PO', len(s['po']))
    for c in s['meta']['checks']: print(('  ✓ ' if c['ok'] else '  ✗ ') + c['name'] + ' — ' + c['detail'])
