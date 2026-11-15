"""ทดสอบชั้น normalization (python3 -m unittest discover tests)"""
import os, sys, json, unittest, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import build_snapshot as B
import import_contracts as C

class Normalize(unittest.TestCase):
    def test_satang_half_up(self):
        self.assertEqual(B.st('1234.56'), 123456)
        self.assertEqual(B.st('0.005'), 1)                      # ปัดครึ่งขึ้น ไม่ใช่ banker's rounding
        self.assertEqual(B.st('2110.3599999999997'), 211036)
        self.assertEqual(B.st('-1000'), -100000)
        self.assertEqual(B.st(None), 0)
    def test_service_period(self):
        sp = B.service_period
        self.assertEqual(sp('ค่าบริการปรับปรุงคุณภาพน้ำวันที่ 19-25/01/69 (RP-MD)'), ('2026-01-19', '2026-01-25'))
        self.assertEqual(sp('ค่าบริการปรับปรุงคุณภาพน้ำวันที่ 26/02-04/03/69 (BT-P1)'), ('2026-02-26', '2026-03-04'))
        self.assertEqual(sp('บริการปรับปรุงคุณภาพน้ำ วันที่ 25-31/12/68 (RP-MD)'), ('2025-12-25', '2025-12-31'))
        self.assertEqual(sp('ค่าบริการปรับปรุงคุณภาพน้ำวันที่ 29/12/68-04/01/69 (RP-MA)'), ('2025-12-29', '2026-01-04'))   # คร่อมปี
        self.assertEqual(sp('ค่าบริการปรับปรุงคุณภาพน้ำ(01-28/02/69-เฟส1,2)'), ('2026-02-01', '2026-02-28'))
        self.assertEqual(sp('ค่า Pre Treament เดือน ธ.ค. 68'), ('2025-12-01', '2025-12-31'))
        self.assertEqual(sp('ต้นทุนบริการ Pre-Treatment'), (None, None))                                              # อ่านไม่ได้ → ไม่เดา
    def test_classify_not_by_sign_only(self):
        self.assertEqual(B.classify('5111002', 'ต้นทุนบริการ Pre-Treatment', -100000), 'ded_pretreat')
        self.assertEqual(B.classify('4001000', 'ค่า Pre Treament เดือน มี.ค. 69', 100000), 'pretreat_charge')       # ชื่อเดียวกันแต่เป็นรายการเรียกเก็บ
        self.assertEqual(B.classify('4101000', 'ค่าบริการปรับปรุงคุณภาพน้ำ(01-31/01/69-เฟส1,2)', 100000), 'svc_p12')
        self.assertEqual(B.classify('4101000', 'ค่าบริการปรับปรุงคุณภาพน้ำวันที่ 19-25/01/69 (RP-MD)', 100), 'svc_p3')
        self.assertEqual(B.classify('9999999', 'ส่วนลดพิเศษ', -100), 'unclassified_negative')                         # ยอดลบที่ไม่รู้จัก ไม่ถูกเหมาเป็นรายการหัก
        self.assertEqual(B.classify('', '', 0), 'blank')
    def test_cancel_excluded(self):
        self.assertTrue(B.is_cancel('Cancel')); self.assertTrue(B.is_cancel('ยกเลิก')); self.assertFalse(B.is_cancel('Paid'))
    def test_dedupe_pagination_and_ap_exp(self):
        rows, dup = B.dedupe([{'id': '1'}, {'id': '2'}, {'id': '1'}], lambda r: r['id'])
        self.assertEqual((len(rows), dup), (2, 1))
        pay = [{'conversion': 'EXP', 'document': 'RR1'}, {'conversion': 'EXP', 'document': 'RR1'}, {'conversion': 'AP', 'document': 'AP1'}]
        rows, dup = B.dedupe(pay, lambda r: (r['conversion'], r['document']))
        self.assertEqual((len(rows), dup), (2, 1))                                                                    # เอกสารเดียวกันจาก AP/EXP ไม่ถูกนับสองครั้ง
    def test_wht_is_not_outstanding(self):
        self.assertTrue(B.wht_like('Partial', '100000', '107000', '104000'))          # คงเหลือ 3,000 = 3% ของยอดก่อน VAT
        self.assertTrue(B.wht_like('Partial', '1000', '1000', '970'))                # ยอดยกมา: 3% ของฐานก่อน VAT ที่รวมอยู่ในยอด
        self.assertFalse(B.wht_like('Partial', '100000', '107000', '50000'))      # ชำระบางส่วนจริง
        self.assertFalse(B.wht_like('Debtor', '100', '107', '0'))

@unittest.skipUnless(os.path.exists(os.path.join(B.DATA, 'snapshot.json')), 'ไม่มีข้อมูลจริง (ไม่อยู่ใน Git)')
class RealSnapshot(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = json.load(open(os.path.join(B.DATA, 'snapshot.json'), encoding='utf-8'))
    def test_no_duplicate_lines_or_docs(self):
        s = self.s
        self.assertEqual(len({l['item'] for l in s['bl_lines']}), len(s['bl_lines']))
        self.assertEqual(len({d['doc'] for d in s['bl_docs']}), len(s['bl_docs']))
        self.assertEqual(len({(p['conv'], p['doc']) for p in s['pay']}), len(s['pay']))
    def test_header_equals_lines(self):
        s = self.s; by = {}
        for l in s['bl_lines']: by[l['doc']] = by.get(l['doc'], 0) + l['amt']
        hd = {d['doc']: d for d in s['bl_docs']}
        for doc, amt in by.items(): self.assertLessEqual(abs(hd[doc]['total'] - amt), 2, doc)
    def test_every_iv_links_one_bl(self):
        hd = {d['doc'] for d in self.s['bl_docs']}
        for x in self.s['iv']: self.assertIn(x['bl'], hd)
    def test_open_iv_and_open_bl_disjoint(self):
        s = self.s; open_bl = {d['doc'] for d in s['bl_docs'] if d['cls'] in ('open', 'partial_open')}
        self.assertFalse([r['doc'] for r in s['recv'] if r['ref'] in open_bl])
    def test_critical_checks_pass(self):
        self.assertFalse([c['name'] for c in self.s['meta']['checks'] if c['critical'] and not c['ok']])

class Contracts(unittest.TestCase):
    def test_dates_be_ce(self):
        self.assertEqual(C.parse_date('31/12/2570'), '2027-12-31')       # พ.ศ.
        self.assertEqual(C.parse_date('31/12/2027'), '2027-12-31')       # ค.ศ.
        self.assertEqual(C.parse_date('2569-01-01'), '2026-01-01')
        self.assertIsNone(C.parse_date(''))                              # ว่าง = ไม่มีข้อมูล
        with self.assertRaises(ValueError): C.parse_date('31/12/70')     # ปี 2 หลัก แยก พ.ศ./ค.ศ. ไม่ได้
    def test_duplicate_and_bad_rows_rejected(self):
        with tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, encoding='utf-8') as f:
            f.write('contract_no,amendment,area_code,party,start_date,end_date\nC1,,0008,CPF,01/01/2568,31/12/2570\nC1,,0008,CPF,01/01/2568,31/12/2570\nC2,,0009,CPF,01/01/2571,31/12/2570\n')
        rows, errors = C.load(f.name); os.unlink(f.name)
        self.assertEqual(len(rows), 3)
        self.assertTrue(any('ซ้ำ' in e for e in errors)); self.assertTrue(any('วันเริ่มหลัง' in e for e in errors))

if __name__ == '__main__': unittest.main()
