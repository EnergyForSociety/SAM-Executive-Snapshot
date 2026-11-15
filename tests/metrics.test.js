// ทดสอบชั้นคำนวณตัวชี้วัด: node --test tests/
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const M = require('../web/metrics.js'), fs = require('fs');
const REAL = path.join(__dirname, '..', 'data', 'snapshot.json'), real = fs.existsSync(REAL) ? require(REAL) : null;   // ข้อมูลจริงไม่อยู่ใน Git — ข้ามถ้าไม่มี
const L = (o) => Object.assign({ doc: 'BL1', date: '2026-10-05', due: '2026-11-20', dept: '0008', org: 'บริษัท ลูกค้าตัวอย่าง จำกัด', pid: '4101000', name: 'x', qty: '1', price: '1', amt: 100, cat: 'svc_p3', svc_from: null, svc_to: null, status: 'Paid', item: Math.random() }, o);
const snap = (o) => Object.assign({ meta: { asof: '2026-11-14' }, areas: [{ code: '0000', name: 'HQ', kind: 'admin' }, { code: '0008', name: 'พื้นที่ ก', kind: 'site', om_site: 'RP1-D' }], bl_lines: [], bl_docs: [], iv: [], recv: [], pay: [], po: [], om: null }, o);

test('BL กับ IV ไม่ถูกบวกซ้ำ: ยอดเรียกเก็บมาจาก BL เท่านั้น', () => {
  const s = snap({ bl_lines: [L({ amt: 10000 })], iv: [{ doc: 'RE1', bl: 'BL1', amt: 10000, after: 10700, status: 'Cash', date: '2026-11-01' }] });
  assert.equal(M.billing(M.selectLines(s, {})).net, 10000);
  s.iv.push({ doc: 'RE2', bl: 'BL1', amt: 5000, after: 5350, status: 'Cash', date: '2026-11-02' });   // 1 BL หลาย IV ก็ไม่เปลี่ยนยอด
  assert.equal(M.billing(M.selectLines(s, {})).net, 10000);
});
test('รายการหักรวมกลับได้ตรงยอดสุทธิ', () => {
  const s = snap({ bl_lines: [L({ dept: '0000', cat: 'svc_p12', amt: 500000 }), L({ dept: '0000', cat: 'ded_pretreat', amt: -90000 }), L({ dept: '0000', cat: 'pretreat_charge', amt: 100 })] });
  const b = M.billing(M.selectLines(s, {}));
  assert.equal(b.gross, 500100); assert.equal(b.deduction, -90000); assert.equal(b.gross + b.deduction, b.net); assert.equal(b.net, 410100);
});
test('อายุหนี้ตรงวันที่อ้างอิง (ขอบช่วง)', () => {
  const a = '2026-11-14';
  assert.equal(M.bucket('2026-11-15', a), 0); assert.equal(M.bucket('2026-11-14', a), 1); assert.equal(M.bucket('2026-11-13', a), 2); assert.equal(M.bucket('2026-10-15', a), 2);
  assert.equal(M.bucket('2026-10-14', a), 3); assert.equal(M.bucket('2026-09-15', a), 3); assert.equal(M.bucket('2026-09-14', a), 4); assert.equal(M.bucket('2026-08-16', a), 4); assert.equal(M.bucket('2026-08-15', a), 5);
  assert.equal(M.bucket('', a), -1); assert.equal(M.bucket('0000-00-00x', a), -1);                       // วันครบกำหนดหาย/ผิด → แยกตรวจสอบ ไม่เดา
  const ag = M.aging([{ due: '2026-11-01', v: 5 }, { due: null, v: 7 }], r => r.v, a);
  assert.equal(ag.total, 5); assert.equal(ag.invalid.length, 1);
});
test('WHT และการชำระบางส่วนไม่ทำให้ยอดค้างผิด', () => {
  const d = (o) => Object.assign({ doc: 'BL1', due: '2026-11-20', dept: '0008', opening: false, remaining: 0, cls: 'converted', iv: [] }, o);
  const s = snap({ bl_lines: [L({ doc: 'A' }), L({ doc: 'B' }), L({ doc: 'C' })], bl_docs: [d({ doc: 'A', cls: 'open', remaining: 10700 }), d({ doc: 'B', cls: 'wht_diff', remaining: 300 }), d({ doc: 'C', cls: 'partial_open', remaining: 5000 })] });
  const r = M.receivables(s);
  assert.equal(r.openAging.total, 15700);          // open + ชำระบางส่วนจริง
  assert.equal(r.whtTotal, 300);                   // ส่วนต่าง WHT แยกไว้ ไม่อยู่ในยอดค้าง
  assert.equal(r.open.length, 2);
});
test('เดือนบางส่วนเทียบช่วงวันเท่ากันของเดือนก่อน', () => {
  const s = snap({ bl_lines: [L({ date: '2026-11-03', amt: 100 }), L({ date: '2026-10-03', amt: 50 }), L({ date: '2026-10-20', amt: 999 })] });
  const c = M.compareMonth(s, '2026-11', {});
  assert.equal(c.partial, true); assert.equal(c.pto, '2026-10-14'); assert.equal(c.prev.net, 50); assert.equal(c.pct, 100);
  const full = M.compareMonth(s, '2026-10', {});
  assert.equal(full.partial, false); assert.equal(full.cur.net, 1049); assert.equal(full.pto, '2026-09-30');
  assert.equal(full.pct, null);                                             // ฐานเป็นศูนย์ → ไม่หารเป็นเปอร์เซ็นต์
  assert.equal(M.compareMonth(s, '2026-01', {}).prev, null);               // ไม่มีข้อมูลปีก่อน → N/A
});
test('ข้อมูลขาดไม่ถูกแสดงเป็นศูนย์', () => {
  const s = snap({ om: { sites: [{ code: 'A', phase: 'Phase 3' }], coverage: [{ metric: 'volume', kind: 'actual', year: 2026, last_month: 1 }], series: [{ metric: 'volume', kind: 'actual', year: 2026, month: 1, site: 'A', value: 0 }] } });
  const o = M.om(s);
  assert.equal(o.get('volume', 'actual', 2026, 1, 'A'), 0);       // ศูนย์จริงตามไฟล์
  assert.equal(o.get('volume', 'actual', 2026, 2, 'A'), null);    // ไม่มีข้อมูล
  assert.equal(o.total('volume', 'actual', 2026, 2), null);
  assert.equal(M.pct(5, 0), null); assert.equal(M.pct(null, 5), null); assert.equal(M.ratio(5, null), null);
  assert.equal(M.om(snap({})), null);
});
test('เจ้าหนี้: แยกครบกำหนดแล้ว/กำลังจะครบ และเอกสารลงวันที่อนาคต', () => {
  const p = (o) => Object.assign({ doc: 'X', conv: 'AP', amount: 100, future: false, dept: '' }, o);
  const s = snap({ pay: [p({ due: '2026-11-13' }), p({ due: '2026-11-14' }), p({ due: '2026-11-21' }), p({ due: '2026-11-22' }), p({ due: '2026-12-14' }), p({ due: '2026-12-15' }), p({ due: '2026-12-30', future: true, amount: 7 })] });
  const t = M.payables(s).totals;
  assert.deepEqual([t.overdue, t.today, t.d7, t.d30, t.later, t.future, t.all], [100, 100, 100, 200, 100, 7, 600]);
});
test('ภาระ PO แยกจากเจ้าหนี้ และนับเฉพาะที่อนุมัติและยังไม่ตั้งเจ้าหนี้', () => {
  const s = snap({ po: [{ doc: 'P1', commit: true, backlog: 500 }, { doc: 'P2', commit: false, backlog: 900 }], pay: [] });
  assert.equal(M.commitments(s).total, 500); assert.equal(M.payables(s).totals.all, 0);
});
test('CSV ป้องกัน formula injection', () => {
  assert.equal(M.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.equal(M.csvCell('+66'), "'+66"); assert.equal(M.csvCell('-1+2'), "'-1+2"); assert.equal(M.csvCell('@cmd'), "'@cmd");
  assert.equal(M.csvCell(-1234.5), '-1234.5');      // ตัวเลขจริงไม่แตะ
  assert.equal(M.csvCell('a,b'), '"a,b"'); assert.equal(M.csvCell(null), '');
});
test('ข้อมูลจริง: ตัวกรองของ KPI กราฟ และรายละเอียดสอดคล้องกัน', { skip: !real }, () => {
  const s = real, asof = s.meta.asof, y0 = asof.slice(0, 4) + '-01-01';
  const ytd = M.billing(M.selectLines(s, { from: y0, to: asof }));
  assert.equal(M.sum(M.monthly(s, {}), b => b.net), ytd.net);                                  // กราฟรายเดือนรวมกัน = KPI สะสมปี
  assert.equal(M.sum(M.byUnit(s, { from: y0, to: asof }), u => u.net), ytd.net);                // อันดับพื้นที่รวมกัน = KPI
  assert.equal(M.sum(s.bl_lines, l => l.amt), ytd.net);                                         // รายละเอียด = KPI
  for (const [u] of M.unitOptions(s)) { const f = { from: y0, to: asof, unit: u }; assert.equal(M.sum(M.selectLines(s, f), l => l.amt), M.billing(M.selectLines(s, f)).net); assert.equal(M.sum(M.monthly(s, { unit: u }), b => b.net), M.billing(M.selectLines(s, f)).net); }
  assert.equal(ytd.gross + ytd.deduction, ytd.net);
});
test('ข้อมูลจริง: ลูกหนี้สามชุดไม่ซ้ำเอกสาร และยอด IV ค้างรับตรงกับรายงาน', { skip: !real }, () => {
  const r = M.receivables(real), a = new Set(r.open.concat(r.openOld).map(d => d.doc));
  assert.equal(r.iv.filter(x => a.has(x.ref)).length, 0);
  assert.equal(r.ivAging.total, M.sum(real.recv, x => x.amount));                              // ยอด IV ค้างรับเท่ากับรายงานที่ดึง
  const pv = M.payables(real).totals; assert.equal(pv.overdue + pv.today + pv.d7 + pv.d30 + pv.later, M.sum(real.pay.filter(x => !x.future), x => x.amount));
});
