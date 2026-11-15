/* SAM Executive Snapshot — ชั้นคำนวณตัวชี้วัด (ไม่มี DOM) ใช้ได้ทั้งในเบราว์เซอร์และ node (tests)
   จำนวนเงินทุกค่าเป็น "สตางค์" (จำนวนเต็ม) · วันที่เป็น ISO YYYY-MM-DD ตามเวลา Asia/Bangkok */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SAMM = factory(); })(this, function () {
  'use strict';
  var CAT = {
    svc_p12: { label: 'ค่าบริการปรับปรุงคุณภาพน้ำ เฟส 1&2 (บิลรวมรายเดือน)', group: 'gross' },
    svc_p3: { label: 'ค่าบริการปรับปรุงคุณภาพน้ำ เฟส 3 (รายสัปดาห์ตามพื้นที่)', group: 'gross' },
    pretreat_charge: { label: 'ค่า Pre-Treatment ที่เรียกเก็บรายเดือน', group: 'gross' },
    lab: { label: 'ค่าตรวจการปนเปื้อนเชื้อโรคในน้ำ', group: 'gross' },
    other: { label: 'รายการเรียกเก็บอื่น (ค่าไฟฟ้าสำนักงานส่วนภูมิภาค)', group: 'gross' },
    ded_pretreat: { label: 'รายการหัก Pre-Treatment', group: 'deduction' },
    blank: { label: 'บรรทัดว่าง (ยอดศูนย์)', group: 'gross' },
    unclassified: { label: 'ยังไม่จัดหมวด', group: 'gross' }, unclassified_negative: { label: 'ยอดติดลบที่ยังไม่จัดหมวด', group: 'deduction' }
  };
  var dayMs = 864e5;
  function dnum(iso) { return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / dayMs); }
  function addDays(iso, n) { return new Date((dnum(iso) + n) * dayMs).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return dnum(b) - dnum(a); }
  function monthEnd(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
  function prevMonth(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; if (!m) { y--; m = 12; } return y + '-' + String(m).padStart(2, '0'); }
  function sum(a, f) { var t = 0; for (var i = 0; i < a.length; i++) t += f(a[i]); return t; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }

  /* หน่วยวิเคราะห์พื้นที่: เฟส 1&2 ออกบิลรวมที่ department 0000 จึงแยกรายฟาร์มจาก TRCLOUD ไม่ได้ */
  function unitOf(l, areas) {
    if (l.cat === 'svc_p12' || l.cat === 'ded_pretreat' || l.cat === 'pretreat_charge') return 'P12';
    var a = areas[l.dept];
    if (a && a.kind === 'site' && l.cat === 'svc_p3') return l.dept;
    return 'OTHER';
  }
  function areaIndex(snap) { var o = {}; snap.areas.forEach(function (a) { o[a.code] = a; }); return o; }
  function unitLabel(u, areas) { if (u === 'P12') return 'เฟส 1&2 (บิลรวม)'; if (u === 'OTHER') return 'รายการอื่น / ส่วนงานบริหาร'; var a = areas[u]; return a ? a.name + (a.om_site ? ' · ' + a.om_site : '') : u; }

  /* เลือกบรรทัด BL ตามตัวกรอง — ทุก KPI/กราฟ/รายละเอียดเรียกผ่านฟังก์ชันนี้เพื่อให้ตัวเลขตรงกัน
     f = { from, to (วันที่ออกเอกสาร รวมปลายทาง), unit ('' = ทั้งหมด), cat, basis: 'issue' | 'service' } */
  function selectLines(snap, f) {
    var areas = areaIndex(snap);
    return snap.bl_lines.filter(function (l) {
      var d = f.basis === 'service' ? l.svc_to : l.date;
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.unit && unitOf(l, areas) !== f.unit) return false;
      if (f.cat && l.cat !== f.cat) return false;
      return true;
    });
  }
  function billing(lines) {
    var by = {}, gross = 0, ded = 0;
    lines.forEach(function (l) { by[l.cat] = (by[l.cat] || 0) + l.amt; if ((CAT[l.cat] || CAT.unclassified).group === 'deduction') ded += l.amt; else gross += l.amt; });
    return { gross: gross, deduction: ded, net: gross + ded, byCat: by, docs: new Set(lines.map(function (l) { return l.doc; })).size, lines: lines.length };
  }
  function months(snap) { var a = [], y = snap.meta.asof.slice(0, 4), last = +snap.meta.asof.slice(5, 7); for (var m = 1; m <= last; m++) a.push(y + '-' + String(m).padStart(2, '0')); return a; }
  function monthly(snap, f) {
    return months(snap).map(function (ym) {
      var b = billing(selectLines(snap, Object.assign({}, f, { from: ym + '-01', to: monthEnd(ym) })));
      b.ym = ym; b.partial = ym === snap.meta.asof.slice(0, 7); return b;
    });
  }
  /* เดือนที่เลือกเทียบเดือนก่อน: ถ้าเป็นเดือนปัจจุบัน (ข้อมูลบางเดือน) เทียบช่วงวันเท่ากัน */
  function compareMonth(snap, ym, f) {
    var asof = snap.meta.asof, partial = ym === asof.slice(0, 7), pm = prevMonth(ym);
    var to = partial ? asof : monthEnd(ym), pto = partial ? pm + '-' + asof.slice(8, 10) : monthEnd(pm);
    if (pto > monthEnd(pm)) pto = monthEnd(pm);
    var cur = billing(selectLines(snap, Object.assign({}, f, { from: ym + '-01', to: to })));
    var hasPrev = pm.slice(0, 4) === ym.slice(0, 4);           // TRCLOUD ไม่มี BL รายบรรทัดของปีก่อน
    var prev = hasPrev ? billing(selectLines(snap, Object.assign({}, f, { from: pm + '-01', to: pto }))) : null;
    return { cur: cur, prev: prev, partial: partial, from: ym + '-01', to: to, pfrom: pm + '-01', pto: pto,
      pct: prev && prev.net > 0 ? (cur.net - prev.net) / prev.net * 100 : null };
  }
  function byUnit(snap, f) {
    var areas = areaIndex(snap), m = {};
    selectLines(snap, f).forEach(function (l) { var u = unitOf(l, areas); (m[u] = m[u] || []).push(l); });
    return Object.keys(m).map(function (u) { var b = billing(m[u]); b.unit = u; b.label = unitLabel(u, areas); b.qty = u !== 'P12' && u !== 'OTHER' ? sum(m[u], function (l) { return +l.qty || 0; }) : null; return b; })
      .sort(function (a, b) { return b.net - a.net; });
  }
  function unitOptions(snap) { var areas = areaIndex(snap), s = {}; snap.bl_lines.forEach(function (l) { s[unitOf(l, areas)] = 1; }); return Object.keys(s).sort(function (a, b) { return (a === 'P12' ? -1 : b === 'P12' ? 1 : a === 'OTHER' ? 1 : b === 'OTHER' ? -1 : a < b ? -1 : 1); }).map(function (u) { return [u, unitLabel(u, areas)]; }); }

  /* อายุหนี้เทียบวันที่อ้างอิง */
  var BUCKETS = ['ยังไม่ครบกำหนด', 'ครบกำหนดวันนี้', 'เกิน 1–30 วัน', 'เกิน 31–60 วัน', 'เกิน 61–90 วัน', 'เกินมากกว่า 90 วัน'];
  function bucket(due, asof) { if (!due || !/^\d{4}-\d\d-\d\d$/.test(due)) return -1; var d = daysBetween(due, asof); return d < 0 ? 0 : d === 0 ? 1 : d <= 30 ? 2 : d <= 60 ? 3 : d <= 90 ? 4 : 5; }
  function aging(rows, amt, asof) {
    var b = BUCKETS.map(function (n) { return { name: n, amount: 0, count: 0 }; }), bad = [];
    rows.forEach(function (r) { var i = bucket(r.due, asof); if (i < 0) bad.push(r); else { b[i].amount += amt(r); b[i].count++; } });
    return { buckets: b, invalid: bad, overdue: sum(b.slice(2), function (x) { return x.amount; }), total: sum(b, function (x) { return x.amount; }) };
  }
  /* ลูกหนี้: แยก 3 ชุดที่ตรวจแล้วว่าไม่ซ้ำเอกสารกัน — ไม่รวมเป็นยอดเดียว */
  function receivables(snap, f) {
    f = f || {}; var asof = snap.meta.asof, areas = areaIndex(snap);
    var inUnit = function (d) { if (!f.unit) return true; var ls = snap.bl_lines.filter(function (l) { return l.doc === d.doc; }); return ls.some(function (l) { return unitOf(l, areas) === f.unit; }); };
    var docs = snap.bl_docs;
    var open = docs.filter(function (d) { return !d.opening && (d.cls === 'open' || d.cls === 'partial_open') && inUnit(d); });
    var wht = docs.filter(function (d) { return d.cls === 'wht_diff' && (f.unit ? !d.opening && inUnit(d) : true); });
    var openOld = f.unit ? [] : docs.filter(function (d) { return d.opening && (d.cls === 'open' || d.cls === 'partial_open'); });
    var refDoc = {}; docs.forEach(function (d) { refDoc[d.doc] = d; });
    var iv = snap.recv.filter(function (r) { if (!f.unit) return true; var d = refDoc[r.ref]; return d && !d.opening && inUnit(d); });
    return { open: open, openAging: aging(open, function (d) { return d.remaining; }, asof), openOld: openOld, openOldTotal: sum(openOld, function (d) { return d.remaining; }),
      wht: wht, whtTotal: sum(wht, function (d) { return d.remaining; }), iv: iv, ivAging: aging(iv, function (r) { return r.amount; }, asof) };
  }
  /* เจ้าหนี้: ครบกำหนดแล้ว / ครบใน 7 / 8–30 / หลัง 30 วัน · เอกสารลงวันที่อนาคตแยกออก */
  function payables(snap, f) {
    f = f || {}; var asof = snap.meta.asof;
    var rows = snap.pay.filter(function (p) { return (!f.dept || p.dept === f.dept); });
    var cur = rows.filter(function (p) { return !p.future; }), fut = rows.filter(function (p) { return p.future; });
    var g = { overdue: [], today: [], d7: [], d30: [], later: [] };
    cur.forEach(function (p) { var d = daysBetween(asof, p.due); (d < 0 ? g.overdue : d === 0 ? g.today : d <= 7 ? g.d7 : d <= 30 ? g.d30 : g.later).push(p); });
    var tot = function (a) { return sum(a, function (p) { return p.amount; }); };
    return { rows: cur, future: fut, groups: g, totals: { overdue: tot(g.overdue), today: tot(g.today), d7: tot(g.d7), d30: tot(g.d30), later: tot(g.later), all: tot(cur), future: tot(fut) } };
  }
  function commitments(snap) { var a = snap.po.filter(function (p) { return p.commit; }); return { rows: a, total: sum(a, function (p) { return p.backlog; }) }; }
  /* วันที่รับเงินตามเอกสาร = วันที่ IV สถานะ Cash (ประเภท TTB(RV)-BL) — รอฝ่ายบัญชียืนยัน */
  function collection(snap) {
    var bl = {}; snap.bl_docs.forEach(function (d) { bl[d.doc] = d; });
    var rows = snap.iv.filter(function (x) { return x.status === 'Cash' && bl[x.bl]; }).map(function (x) { return { iv: x.doc, bl: x.bl, bl_date: bl[x.bl].date, due: bl[x.bl].due, iv_date: x.date, days: daysBetween(bl[x.bl].date, x.date), late: daysBetween(bl[x.bl].due, x.date), amt: x.after }; });
    return { rows: rows, median: median(rows.map(function (r) { return r.days; })), lateCount: rows.filter(function (r) { return r.late > 0; }).length };
  }
  function concentration(lines) {
    var m = {}, lab = {}, tot = 0; lines.forEach(function (l) { var o = l.org || '(ไม่ระบุ)', k = o.replace(/^บริษัท\s*/, '').replace(/\s+/g, ''); if (!lab[k]) lab[k] = o; m[k] = (m[k] || 0) + l.amt; tot += l.amt; });
    var a = Object.keys(m).map(function (k) { return { name: lab[k] + ' — ทุกสาขา', amt: m[k], share: tot ? m[k] / tot * 100 : null }; }).sort(function (x, y) { return y.amt - x.amt; });
    return { rows: a, total: tot, top: a[0] || null };
  }
  /* ---------- ข้อมูล OM (ไฟล์ Excel) ---------- */
  function om(snap) {
    var o = snap.om; if (!o) return null;
    var idx = {}; o.series.forEach(function (s) { idx[s.metric + '|' + s.kind + '|' + s.year + '|' + s.month + '|' + s.site] = s.value; });
    var api = { sites: o.sites, source: o.source, coverage: o.coverage,
      get: function (metric, kind, year, month, site) { var v = idx[metric + '|' + kind + '|' + year + '|' + month + '|' + site]; return v === undefined ? null : v; },
      last: function (metric, kind, year) { var c = o.coverage.filter(function (x) { return x.metric === metric && x.kind === kind && x.year === year; })[0]; return c ? c.last_month : 0; },
      total: function (metric, kind, year, month, phase) { var t = 0, n = 0; o.sites.forEach(function (s) { if (phase && s.phase !== phase) return; var v = api.get(metric, kind, year, month, s.code); if (v !== null) { t += v; n++; } }); return n ? t : null; } };
    return api;
  }
  /* ป้องกัน spreadsheet formula injection: ข้อความที่ขึ้นต้นด้วย = + - @ tab CR จะเติม ' นำหน้า (ตัวเลขจริงไม่แตะ) */
  function csvCell(v) { if (v == null) return ''; if (typeof v === 'number') return isFinite(v) ? String(v) : ''; var s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function pct(a, b) { return a === null || b === null || !b ? null : (a - b) / b * 100; }
  function ratio(a, b) { return a === null || b === null || !b ? null : a / b * 100; }

  return { CAT: CAT, BUCKETS: BUCKETS, dnum: dnum, addDays: addDays, daysBetween: daysBetween, monthEnd: monthEnd, prevMonth: prevMonth, sum: sum, median: median, areaIndex: areaIndex, unitOf: unitOf, unitLabel: unitLabel, unitOptions: unitOptions,
    selectLines: selectLines, billing: billing, months: months, monthly: monthly, compareMonth: compareMonth, byUnit: byUnit, bucket: bucket, aging: aging, receivables: receivables, payables: payables, commitments: commitments,
    collection: collection, concentration: concentration, csvCell: csvCell, om: om, pct: pct, ratio: ratio };
});
