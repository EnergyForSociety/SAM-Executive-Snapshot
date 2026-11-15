/* SAM Executive Snapshot — ส่วนแสดงผล (อ่าน data/snapshot.json ที่สร้างจาก scripts/build_snapshot.py)
   ตัวเลขทุกตัวคำนวณจาก web/metrics.js ด้วยตัวกรองชุดเดียวกัน · ไม่มีการเรียกบริการภายนอก */
(function () {
  'use strict';
  const M = window.SAMM, $ = (s, r) => (r || document).querySelector(s);
  let S = null, st = { page: 'exec', ym: null, unit: '' }, DR = [], TB = [];
  const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const PAGES = [['exec', 'Executive Snapshot'], ['billing', 'ยอดเรียกเก็บและพื้นที่'], ['recv', 'ลูกหนี้และการรับชำระ'], ['pay', 'เจ้าหนี้และภาระจัดซื้อ'], ['ops', 'การเดินระบบ (OM)'], ['contract', 'สัญญาและความเสี่ยง'], ['data', 'สถานะข้อมูล']];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const B = s => nf(s / 100, 2);                                             // สตางค์ → บาท เต็มจำนวน
  const MB = s => Math.abs(s) >= 1e8 ? nf(s / 1e8, 2) + ' ล้านบาท' : nf(s / 100, 0) + ' บาท';
  const MBv = s => Math.abs(s) >= 1e8 ? [nf(s / 1e8, 2), 'ล้านบาท'] : [nf(s / 100, 0), 'บาท'];
  const thD = iso => iso ? +iso.slice(8, 10) + ' ' + TH[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(0, 4) + 543) : '–';
  const thDs = iso => iso ? +iso.slice(8, 10) + ' ' + TH[+iso.slice(5, 7) - 1] + ' ' + String(+iso.slice(0, 4) + 543).slice(2) : '–';
  const thM = ym => TH[+ym.slice(5, 7) - 1] + ' ' + (+ym.slice(0, 4) + 543);
  const thT = iso => iso ? thD(iso.slice(0, 10)) + ' ' + iso.slice(11, 16) + ' น.' : '–';
  const NA = t => `<span class="na">${t || 'ยังไม่มีข้อมูล'}</span>`;
  const pctTxt = (p, d) => p === null || !isFinite(p) ? NA('N/A') : (p > 0 ? '+' : p < 0 ? '−' : '') + nf(Math.abs(p), d == null ? 1 : d) + '%';
  const delta = (p, label) => p === null || !isFinite(p) ? `<span class="delta na">เทียบไม่ได้ (N/A) ${esc(label || '')}</span>` : `<span class="delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${nf(Math.abs(p), 1)}% ${esc(label || '')}</span>`;
  const drill = fn => { DR.push(fn); return `data-drill="${DR.length - 1}"`; };
  const tableSlot = spec => { TB.push(spec); return `<div data-table="${TB.length - 1}"></div>`; };
  const areas = () => M.areaIndex(S);
  const selTo = () => { const e = M.monthEnd(st.ym); return e > S.meta.asof ? S.meta.asof : e; };
  const F = extra => Object.assign({ unit: st.unit }, extra || {});
  const partialNote = ym => ym === S.meta.asof.slice(0, 7) ? ` (ข้อมูลบางเดือน ถึง ${thDs(S.meta.asof)})` : '';

  /* ---------- ตารางเอกสาร: ค้นหา เรียง แบ่งหน้า ส่งออก CSV ---------- */
  const csvCell = M.csvCell;
  function exportCsv(spec, rows) {
    const cols = spec.cols, out = [cols.map(c => csvCell(c.label)).join(',')];
    rows.forEach(r => out.push(cols.map(c => csvCell(c.csv ? c.csv(r) : c.money ? r[c.k] / 100 : r[c.k])).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = (spec.file || 'SAM_export') + '_' + S.meta.asof + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mountTable(el, spec) {
    const v = { q: '', sort: spec.sort || null, dir: spec.dir || -1, page: 0, size: spec.size || 15, filt: {} };
    const val = (r, c) => c.sortv ? c.sortv(r) : r[c.k];
    function rows() {
      let a = spec.rows;
      (spec.filters || []).forEach(f => { const x = v.filt[f.k]; if (x) a = a.filter(r => String(f.get ? f.get(r) : r[f.k]) === x); });
      if (v.q) { const q = v.q.toLowerCase(); a = a.filter(r => spec.cols.some(c => String(c.csv ? c.csv(r) : r[c.k] == null ? '' : r[c.k]).toLowerCase().indexOf(q) >= 0)); }
      if (v.sort) { const c = spec.cols.filter(x => x.k === v.sort)[0]; a = a.slice().sort((x, y) => { const p = val(x, c), q2 = val(y, c); return (p < q2 ? -1 : p > q2 ? 1 : 0) * v.dir; }); }
      return a;
    }
    function draw() {
      const a = rows(), pages = Math.max(1, Math.ceil(a.length / v.size)); if (v.page >= pages) v.page = pages - 1;
      const pg = a.slice(v.page * v.size, (v.page + 1) * v.size), tot = spec.total ? spec.total(a) : null;
      el.innerHTML = `<div class="tools no-print" style="margin-bottom:10px;justify-content:space-between">
        <div class="tools"><input type="search" placeholder="ค้นหาในตาราง" value="${esc(v.q)}" aria-label="ค้นหา">
        ${(spec.filters || []).map(f => `<select data-f="${f.k}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: ทั้งหมด</option>${[...new Set(spec.rows.map(r => String(f.get ? f.get(r) : r[f.k])))].sort().map(o => `<option ${v.filt[f.k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`).join('')}</div>
        <div class="tools"><span class="note">${nf(a.length)} รายการ</span><button class="btn" data-x="csv">ส่งออก CSV</button></div></div>
        <div class="tbl-wrap"><table><thead><tr>${spec.cols.map(c => `<th class="sortable ${c.r ? 'r' : ''}" data-s="${c.k}">${esc(c.label)}${v.sort === c.k ? (v.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${pg.length ? pg.map(r => `<tr>${spec.cols.map(c => `<td class="${c.r ? 'r num' : ''}">${c.fmt ? c.fmt(r) : c.money ? B(r[c.k]) : esc(r[c.k])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${spec.cols.length}"><div class="empty">ไม่พบรายการตามเงื่อนไข</div></td></tr>`}</tbody>
        ${tot ? `<tfoot><tr>${spec.cols.map((c, i) => `<td class="${c.r ? 'r num' : ''}">${i === 0 ? 'รวม ' + nf(a.length) + ' รายการ' : tot[c.k] != null ? B(tot[c.k]) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>
        <div class="pager no-print"><span>หน้า ${v.page + 1} / ${pages}</span><button class="btn" data-x="prev" ${v.page ? '' : 'disabled'}>ก่อนหน้า</button><button class="btn" data-x="next" ${v.page < pages - 1 ? '' : 'disabled'}>ถัดไป</button></div>`;
      const inp = $('input[type=search]', el);
      inp.oninput = () => { v.q = inp.value; v.page = 0; const p = inp.selectionStart; draw(); const n = $('input[type=search]', el); n.focus(); n.setSelectionRange(p, p); };
      el.querySelectorAll('select[data-f]').forEach(s => s.onchange = () => { v.filt[s.dataset.f] = s.value; v.page = 0; draw(); });
      el.querySelectorAll('th[data-s]').forEach(h => h.onclick = () => { if (v.sort === h.dataset.s) v.dir = -v.dir; else { v.sort = h.dataset.s; v.dir = 1; } draw(); });
      el.querySelectorAll('button[data-x]').forEach(b => b.onclick = () => { if (b.dataset.x === 'csv') exportCsv(spec, rows()); else { v.page += b.dataset.x === 'next' ? 1 : -1; draw(); } });
    }
    draw();
  }
  function openTable(spec) {
    const m = $('#modal'), box = $('#modal-box');
    box.innerHTML = `<div class="head"><div><h2 id="modal-title">${esc(spec.title)}</h2><p class="sub">${spec.sub || ''}</p></div><button class="btn" id="modal-x">ปิด</button></div><div id="modal-t"></div>`;
    m.hidden = false; mountTable($('#modal-t'), spec); $('#modal-x').onclick = closeModal; $('#modal-x').focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }

  /* ---------- นิยามคอลัมน์ ---------- */
  const unitName = l => M.unitLabel(M.unitOf(l, areas()), areas());
  const lineCols = () => [
    { k: 'date', label: 'วันที่ออก', fmt: r => thDs(r.date) }, { k: 'doc', label: 'เลขที่ BL' },
    { k: 'unit', label: 'พื้นที่/หน่วยวิเคราะห์', fmt: r => esc(unitName(r)), csv: unitName, sortv: unitName },
    { k: 'name', label: 'รายการ' }, { k: 'svc_to', label: 'ช่วงให้บริการ', fmt: r => r.svc_from ? thDs(r.svc_from) + ' – ' + thDs(r.svc_to) : NA('อ่านจากคำอธิบายไม่ได้'), csv: r => r.svc_from ? r.svc_from + '..' + r.svc_to : '' },
    { k: 'cat', label: 'หมวด', fmt: r => esc(M.CAT[r.cat].label), csv: r => M.CAT[r.cat].label },
    { k: 'qty', label: 'ปริมาณตามเอกสาร', r: 1, fmt: r => nf(+r.qty, 0), sortv: r => +r.qty }, { k: 'price', label: 'ราคา/หน่วย', r: 1, fmt: r => nf(+r.price, 2), sortv: r => +r.price },
    { k: 'amt', label: 'ยอดก่อน VAT (บาท)', r: 1, money: 1 }, { k: 'status', label: 'สถานะ BL', fmt: r => esc(stTh(r.status)), csv: r => stTh(r.status) }];
  const stTh = s => ({ Debtor: 'ยังไม่รับชำระ', Partial: 'ชำระบางส่วน', Paid: 'ออก IV ครบแล้ว', Cash: 'รับเงินแล้ว', 'Billing Note': 'วางบิลแล้ว' }[s] || s);
  const linesTable = (title, lines, sub) => ({ title, sub: (sub || '') + ' · ยอดเรียกเก็บใช้ BL เท่านั้น (ไม่บวก IV ซ้ำ)', cols: lineCols(), rows: lines, sort: 'date', dir: -1, file: 'SAM_BL_lines', total: a => ({ amt: M.sum(a, r => r.amt) }),
    filters: [{ k: 'cat', label: 'หมวด', get: r => M.CAT[r.cat].label }, { k: 'status', label: 'สถานะ', get: r => stTh(r.status) }] });
  const blDocCols = () => [{ k: 'doc', label: 'เลขที่ BL' }, { k: 'date', label: 'วันที่ออก', fmt: r => thDs(r.date) }, { k: 'due', label: 'ครบกำหนด', fmt: r => thDs(r.due) },
    { k: 'age', label: 'เกินกำหนด (วัน)', r: 1, fmt: r => { const d = M.daysBetween(r.due, S.meta.asof); return d > 0 ? nf(d) : d === 0 ? 'วันนี้' : '–'; }, sortv: r => M.daysBetween(r.due, S.meta.asof), csv: r => Math.max(0, M.daysBetween(r.due, S.meta.asof)) },
    { k: 'branch', label: 'ลูกค้า/สาขา', fmt: r => esc((r.org || '').replace(/^บริษัท\s*/, '') + (r.branch ? ' · ' + r.branch : '')), csv: r => r.org + ' ' + r.branch },
    { k: 'dept', label: 'พื้นที่', fmt: r => esc((areas()[r.dept] || {}).name || r.dept), csv: r => (areas()[r.dept] || {}).name || r.dept }, { k: 'note', label: 'รายละเอียด' },
    { k: 'grand', label: 'ยอดรวม VAT', r: 1, money: 1 }, { k: 'payment', label: 'ตัดชำระ/ออก IV แล้ว', r: 1, money: 1 }, { k: 'remaining', label: 'คงเหลือ', r: 1, money: 1 }, { k: 'status', label: 'สถานะ', fmt: r => esc(stTh(r.status)), csv: r => stTh(r.status) }];
  const blDocTable = (title, rows, sub) => ({ title, sub, cols: blDocCols(), rows, sort: 'due', dir: 1, file: 'SAM_BL_docs', total: a => ({ grand: M.sum(a, r => r.grand), payment: M.sum(a, r => r.payment), remaining: M.sum(a, r => r.remaining) }) });
  const recvTable = (title, rows, sub) => ({ title, sub, file: 'SAM_IV_open', sort: 'due', dir: 1, total: a => ({ amount: M.sum(a, r => r.amount) }), rows,
    cols: [{ k: 'doc', label: 'เลขที่ IV (RE)' }, { k: 'date', label: 'วันที่ IV', fmt: r => thDs(r.date) }, { k: 'due', label: 'ครบกำหนด', fmt: r => thDs(r.due) }, { k: 'overdue', label: 'เกินกำหนด (วัน)', r: 1, fmt: r => nf(Math.max(0, M.daysBetween(r.due, S.meta.asof))), sortv: r => M.daysBetween(r.due, S.meta.asof), csv: r => Math.max(0, M.daysBetween(r.due, S.meta.asof)) },
      { k: 'ref', label: 'เอกสารต้นทาง' }, { k: 'ref_kind', label: 'ประเภทต้นทาง', fmt: r => r.ref_kind === 'opening' ? 'ยอดยกมาปี 2568' : r.ref_kind === 'bl' ? 'BL ปี 2569' : 'หาไม่พบ', csv: r => r.ref_kind },
      { k: 'branch', label: 'สาขาลูกค้า' }, { k: 'amount', label: 'คงค้างหลังหัก WHT (บาท)', r: 1, money: 1 }, { k: 'state', label: 'สถานะตรวจสอบ', fmt: () => '<span class="tag wait">รอตรวจสอบการตัดชำระ</span>', csv: () => 'รอตรวจสอบการตัดชำระ' }] });
  const payTable = (title, rows, sub) => ({ title, sub, file: 'SAM_payables', sort: 'due', dir: 1, total: a => ({ amount: M.sum(a, r => r.amount) }), rows, filters: [{ k: 'conv', label: 'ประเภท' }],
    cols: [{ k: 'doc', label: 'เลขที่เอกสาร' }, { k: 'conv', label: 'ประเภท' }, { k: 'vendor', label: 'ผู้ขาย/เจ้าหนี้' }, { k: 'date', label: 'วันที่เอกสาร', fmt: r => thDs(r.date) + (r.future ? ' <span class="tag wait">ลงวันที่อนาคต</span>' : '') }, { k: 'due', label: 'ครบกำหนด', fmt: r => thDs(r.due) },
      { k: 'days', label: 'วันถึงกำหนด', r: 1, fmt: r => { const d = M.daysBetween(S.meta.asof, r.due); return d < 0 ? 'เกิน ' + nf(-d) : d === 0 ? 'วันนี้' : 'อีก ' + nf(d); }, sortv: r => M.daysBetween(S.meta.asof, r.due), csv: r => M.daysBetween(S.meta.asof, r.due) },
      { k: 'dept', label: 'หน่วยงาน/พื้นที่', fmt: r => esc(r.dept ? ((areas()[r.dept] || {}).name || r.dept) : '(ไม่ระบุ)'), csv: r => (areas()[r.dept] || {}).name || r.dept }, { k: 'ref', label: 'อ้างอิง' }, { k: 'amount', label: 'คงค้างหลังหัก WHT (บาท)', r: 1, money: 1 }, { k: 'status', label: 'สถานะ', fmt: r => esc(stTh(r.status)), csv: r => stTh(r.status) }] });
  const poTable = (title, rows) => ({ title, sub: 'PO ที่อนุมัติแล้วและยังตั้งเจ้าหนี้ไม่ครบ — เป็นภาระผูกพัน ไม่ใช่เจ้าหนี้ที่ตั้งบัญชีแล้ว · มูลค่าก่อน VAT ตามรายงาน PO3', file: 'SAM_PO_commitments', sort: 'backlog', dir: -1, total: a => ({ amt: M.sum(a, r => r.amt), backlog: M.sum(a, r => r.backlog) }), rows,
    cols: [{ k: 'doc', label: 'เลขที่ PO' }, { k: 'date', label: 'วันที่', fmt: r => thDs(r.date) }, { k: 'vendor', label: 'ผู้ขาย' }, { k: 'dept', label: 'พื้นที่', fmt: r => esc((areas()[r.dept] || {}).name || r.dept), csv: r => (areas()[r.dept] || {}).name || r.dept },
      { k: 'items', label: 'รายการ', fmt: r => esc(r.items.join(' · ')), csv: r => r.items.join(' | ') }, { k: 'status', label: 'สถานะ PO' }, { k: 'amt', label: 'มูลค่า PO', r: 1, money: 1 }, { k: 'backlog', label: 'ยังไม่ตั้งเจ้าหนี้', r: 1, money: 1 }] });

  /* ---------- กราฟ SVG ---------- */
  function monthlyChart(series, onClick) {
    const W = 760, H = 300, L = 46, R = 10, T = 26, Bm = 44, iw = W - L - R, ih = H - T - Bm;
    const mx = Math.max(1, ...series.map(s => s.gross)), step = niceStep(mx / 100 / 4), top = step * 4 * 100, bw = iw / series.length, y = v => T + ih - v / top * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = step * i * 100; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${nf(v / 1e8, step < 1e6 ? 1 : 0)}</text>`; }
    series.forEach((s, i) => {
      const x = L + i * bw + bw * .18, w = bw * .64, sel = s.ym === st.ym;
      g += `<g class="hit" ${drill(() => onClick(s))} tabindex="0" role="button" aria-label="${thM(s.ym)} ยอดสุทธิ ${MB(s.net)}"><rect class="bg" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih + 30}" style="fill:${sel ? 'var(--sel)' : 'transparent'}"/>
        <rect x="${x}" y="${y(s.gross)}" width="${w}" height="${Math.max(0, y(s.net) - y(s.gross))}" class="gy" style="fill:var(--barded);animation-delay:${(.25 + i * .04).toFixed(2)}s" rx="2"/><rect x="${x}" y="${y(Math.max(0, s.net))}" width="${w}" height="${Math.max(0, y(0) - y(Math.max(0, s.net)))}" class="gy" style="fill:${s.partial ? 'var(--bar3)' : 'var(--bar1)'};animation-delay:${(.2 + i * .04).toFixed(2)}s" rx="2"/>
        <text class="fade" x="${x + w / 2}" y="${y(s.gross) - 6}" text-anchor="middle" font-size="11.5" font-weight="600" style="fill:var(--navy)">${nf(s.net / 1e8, 2)}</text>
        <text x="${x + w / 2}" y="${H - Bm + 18}" text-anchor="middle" font-size="12" style="fill:${sel ? 'var(--navy)' : 'var(--muted)'}" font-weight="${sel ? 600 : 400}">${TH[+s.ym.slice(5) - 1]}${s.partial ? '*' : ''}</text></g>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดเรียกเก็บรายเดือน"><text x="${L - 40}" y="14" font-size="11" style="fill:var(--muted)">ล้านบาท</text>${g}</svg>
      <div class="legend"><span><i style="background:var(--bar1)"></i>ยอดเรียกเก็บสุทธิก่อน VAT</span><span><i style="background:var(--barded)"></i>รายการหัก Pre-Treatment (ส่วนที่ถูกหักจากค่าบริการ)</span><span><i style="background:var(--bar3)"></i>* เดือนปัจจุบัน ข้อมูลบางเดือน</span></div>`;
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function lineChart(labels, sets, unit, fmtY) {
    const W = 760, H = 280, L = 56, R = 12, T = 22, Bm = 30, iw = W - L - R, ih = H - T - Bm, all = [].concat(...sets.map(s => s.v.filter(x => x !== null)));
    if (!all.length) return `<div class="empty">ยังไม่มีข้อมูล</div>`;
    const step = niceStep(Math.max(...all) / 4), top = step * 4, x = i => L + (labels.length > 1 ? i * iw / (labels.length - 1) : iw / 2), y = v => T + ih - v / top * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) g += `<line x1="${L}" x2="${W - R}" y1="${y(step * i)}" y2="${y(step * i)}" style="stroke:var(--grid)"/><text x="${L - 6}" y="${y(step * i) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${fmtY(step * i)}</text>`;
    labels.forEach((l, i) => g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" style="fill:var(--muted)">${l}</text>`);
    sets.forEach(s => {
      let d = '', pen = false; s.v.forEach((v, i) => { if (v === null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
      g += s.dash ? `<path class="fade" d="${d}" fill="none" style="stroke:${s.c}" stroke-width="${s.w || 2.2}" stroke-dasharray="6 5"/>` : `<path class="draw" d="${d}" fill="none" style="stroke:${s.c}" stroke-width="${s.w || 2.2}"/>`;
      s.v.forEach((v, i) => { if (v !== null) g += `<circle class="fade" cx="${x(i)}" cy="${y(v)}" r="${s.dash ? 2 : 3}" style="fill:${s.c}"><title>${s.name} ${labels[i]}: ${fmtY(v)} ${unit}</title></circle>`; });
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><text x="4" y="12" font-size="11" style="fill:var(--muted)">${unit}</text>${g}</svg><div class="legend">${sets.map(s => `<span><i style="background:${s.c}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  const bars = (rows, max, cls) => rows.map(r => `<button class="bar-row" ${r.drill ? drill(r.drill) : ''}><span>${esc(r.label)}</span><span class="bar-track"><span class="bar-fill ${r.cls || cls || ''}" style="width:${max ? Math.max(0, r.v) / max * 100 : 0}%"></span></span><b class="num" style="text-align:right;font-weight:600">${r.txt}</b></button>`).join('');

  /* ราคาและปริมาณตามเอกสาร BL ล่าสุดของแต่ละหมวด — คำนวณจากข้อมูล ไม่ฝังตัวเลขในโค้ด */
  function facts() {
    const last = cat => S.bl_lines.filter(l => l.cat === cat).sort((a, b) => a.date < b.date ? 1 : -1)[0] || null;
    const med = cat => M.median(S.bl_lines.filter(l => l.cat === cat).map(l => +l.price));
    const p12 = last('svc_p12'), dd = last('ded_pretreat');
    return { p12, dd, p3price: med('svc_p3'), net12: p12 && dd ? p12.amt + dd.amt : null, codes: [...new Set(S.bl_lines.filter(l => l.cat === 'ded_pretreat').map(l => l.pid))] };
  }
  const omPhase = (kind, phase) => { const o = M.om(S); if (!o) return null; const lm = o.last('volume', 'actual', 2026) || 12; for (let m = lm; m >= 1; m--) { const v = o.total('volume', kind, 2026, m, phase); if (v !== null) return v; } return null; };
  /* ---------- Insight ตามกฎ (ตรวจสอบย้อนได้ ไม่ใช้โมเดลภายนอก) ---------- */
  function insights() {
    const fx = facts(), out = [], asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', o = M.om(S), ar = areas();
    const ytd = M.selectLines(S, { from: y0, to: asof }), yb = M.billing(ytd);
    // 1) เฟส 3: ยอดเรียกเก็บผันตามปริมาณ
    const mon = M.monthly(S, { unit: '' }).map(b => ({ ym: b.ym, p3: b.byCat.svc_p3 || 0, partial: b.partial })).filter(m => !m.partial);
    if (mon.length >= 4) {
      const last = mon[mon.length - 1], h1 = mon.slice(0, 6), avg = M.sum(h1, m => m.p3) / h1.length, ch = avg ? (last.p3 - avg) / avg * 100 : null;
      let vol = '';
      if (o) { const lm = o.last('volume', 'actual', 2026), a = o.total('volume', 'actual', 2026, lm, 'Phase 3'), c = o.total('volume', 'contract', 2026, lm, 'Phase 3'); if (a !== null && c) vol = ` ไฟล์ OM ระบุปริมาณน้ำรับจริงเฟส 3 เดือน ${TH[lm - 1]} ${nf(a)} ลบ.ม. เท่ากับ ${nf(a / c * 100, 0)}% ของปริมาณตามสัญญาที่ OM ระบุ (${nf(c)} ลบ.ม./เดือน)`; }
      if (ch !== null && ch < -15) out.push({ warn: 1, title: 'ยอดเรียกเก็บเฟส 3 ลดลงต่อเนื่องตั้งแต่ไตรมาส 3', find: `BL เฟส 3 ที่ออกใน ${thM(last.ym)} รวม ${MB(last.p3)} ต่ำกว่าค่าเฉลี่ย ม.ค.–มิ.ย. (${MB(avg)}/เดือน) ${nf(Math.abs(ch), 0)}%`,
        nums: `ช่วงวันที่ออกเอกสาร ${thM(mon[0].ym)} – ${thM(last.ym)} · เฟส 3 คิดตามปริมาณรายสัปดาห์${fx.p3price ? ' (ราคากลาง ' + nf(fx.p3price, 2) + ' บาท/หน่วยตามเอกสาร)' : ''}` + vol, impact: 'รายรับส่วนที่ผันตามปริมาณลดลง ขณะที่เฟส 1&2 เรียกเก็บรวมคงที่' + (fx.p12 ? ' ' + MB(fx.p12.amt) + '/เดือนก่อนรายการหัก' : ''),
        act: 'ให้ OM ยืนยันสาเหตุรายฟาร์ม (หยุดฟาร์ม/รับน้ำน้อย/เหตุฝั่งระบบ) และตรวจเงื่อนไขปริมาณขั้นต่ำของเฟส 3 ในสัญญา', caveat: 'ยังไม่มีหลักฐานสาเหตุของปริมาณที่ลดลง และยังไม่มีเอกสารสัญญายืนยันว่าเฟส 3 มีข้อผูกพันขั้นต่ำหรือไม่ — ระบบจึงไม่สรุปสาเหตุหรือค่าปรับ',
        ev: ['ดู BL เฟส 3 ทั้งปี', () => openTable(linesTable('BL เฟส 3 ปี ' + (+asof.slice(0, 4) + 543), M.selectLines(S, { from: y0, to: asof, cat: 'svc_p3' }), 'ตามวันที่ออกเอกสาร'))] });
    }
    // 2) การกระจุกตัวของลูกค้า
    const cc = M.concentration(ytd);
    if (cc.top && cc.top.share > 80) out.push({ title: 'ยอดเรียกเก็บเกือบทั้งหมดมาจากลูกค้ารายเดียว', find: `${nf(cc.top.share, 2)}% ของยอดเรียกเก็บสุทธิก่อน VAT สะสมปีอยู่ในชื่อ ${cc.top.name}`, nums: `${MB(cc.top.amt)} จาก ${MB(cc.total)} · BL วันที่ออก ${thDs(y0)} – ${thDs(asof)}`,
      impact: 'ผลประกอบการขึ้นกับสัญญาและแผนการเลี้ยงของคู่สัญญารายเดียว', act: 'ติดตามกำหนดสัญญา/การต่ออายุรายพื้นที่ (ยังไม่มีข้อมูลในระบบ — ดูหน้า "สัญญาและความเสี่ยง")', caveat: 'จัดกลุ่มจากชื่อลูกค้าในเอกสาร ยังไม่ได้ผูกกับเลขสัญญา',
      ev: ['ดูยอดแยกลูกค้า', () => openTable({ title: 'ยอดเรียกเก็บสะสมปีแยกลูกค้า', sub: 'BL ก่อน VAT', file: 'SAM_customers', sort: 'amt', dir: -1, rows: cc.rows, cols: [{ k: 'name', label: 'ลูกค้า' }, { k: 'amt', label: 'ยอดก่อน VAT (บาท)', r: 1, money: 1 }, { k: 'share', label: 'สัดส่วน', r: 1, fmt: r => nf(r.share, 2) + '%', csv: r => r.share.toFixed(4) }] })] });
    // 3) รายการหัก Pre-Treatment
    const ded = yb.byCat.ded_pretreat || 0, p12 = yb.byCat.svc_p12 || 0, pc = yb.byCat.pretreat_charge || 0, codes = [...new Set(ytd.filter(l => l.cat === 'ded_pretreat').map(l => l.pid))];
    if (ded) out.push({ warn: codes.length > 1, title: 'รายการหัก Pre-Treatment ลดยอดเรียกเก็บเฟส 1&2 ลงเกือบหนึ่งในห้า', find: `หัก Pre-Treatment สะสมปี ${MB(-ded)} = ${nf(-ded / p12 * 100, 1)}% ของค่าบริการเฟส 1&2 ก่อนหัก (${MB(p12)})`,
      nums: `${fx.dd ? 'BL ล่าสุดหัก ' + MB(-fx.dd.amt) + ' (' + nf(Math.abs(+fx.dd.price), 2) + ' บาท × ' + nf(+fx.dd.qty) + ' หน่วยตามเอกสาร) · ' : ''}มี BL "ค่า Pre Treament" เรียกเก็บแยกรายเดือนอีก ${MB(pc)} · รายการหักบันทึกใต้ ${codes.length} รหัส (${codes.join(', ')})`,
      impact: (fx.net12 !== null ? 'ยอดสุทธิเฟส 1&2 เหลือ ' + MB(fx.net12) + '/เดือนก่อน VAT · ' : '') + 'การใช้รหัสบัญชีต่างกันทำให้รายงานต้นทุน/รายได้ไม่สม่ำเสมอ', act: 'ให้ฝ่ายบัญชียืนยันลักษณะรายการ (ส่วนลดตามสัญญา / ต้นทุนที่ลูกค้ารับภาระ / อื่น) และใช้รหัสเดียว',
      caveat: 'ยังไม่มีหลักฐานว่ารายการนี้เป็นค่าปรับ — ระบบแสดงเป็น "รายการหัก" ตามชื่อในเอกสารเท่านั้น', ev: ['ดูบรรทัด Pre-Treatment', () => openTable(linesTable('บรรทัด Pre-Treatment ทั้งรายการหักและรายการเรียกเก็บ', ytd.filter(l => l.cat === 'ded_pretreat' || l.cat === 'pretreat_charge'), 'สะสมปี'))] });
    // 4) ลูกหนี้
    const rv = M.receivables(S);
    if (rv.iv.length || rv.open.length) {
      const od = rv.ivAging.buckets[5];
      out.push({ warn: 1, title: 'IV ค้างรับช่วงต้นปียังไม่ถูกตัดชำระในระบบ', find: `IV ${nf(rv.iv.length)} ฉบับ รวม ${MB(rv.ivAging.total)} (ออก ม.ค.–ก.พ. 2569) ยังสถานะค้างรับ โดย ${nf(od.count)} ฉบับเกินกำหนดมากกว่า 90 วัน ขณะที่ IV ตั้งแต่ มี.ค. เป็นสถานะรับเงินแล้วทั้งหมด`,
        nums: `แยกจาก BL ปี 2569 ที่ยังไม่รับชำระ ${nf(rv.open.length)} ฉบับ ${MB(rv.openAging.total)} (เกินกำหนด ${MB(rv.openAging.overdue)}) และยอดยกมาปี 2568 ที่ยังเปิด ${nf(rv.openOld.length)} ฉบับ ${MB(rv.openOldTotal)} · ณ ${thDs(asof)}`,
        impact: 'ถ้าเป็นหนี้ค้างจริงคือเงินสดที่ยังไม่ได้รับ ถ้ารับแล้วแต่ไม่ได้ตัดชำระ ยอดลูกหนี้ในระบบสูงเกินจริง', act: 'ให้ฝ่ายบัญชีกระทบยอด IV กลุ่มนี้กับเงินรับในบัญชีธนาคาร และปิดรายการยกยอดปี 2568',
        caveat: 'ชุด IV ค้างรับกับชุด BL ที่ยังไม่รับชำระตรวจแล้วไม่ซ้ำเอกสารกัน แต่ยังไม่รวมเป็นยอดลูกหนี้เดียวจนกว่าจะกระทบยอดเสร็จ', ev: ['ดู IV ค้างรับ', () => openTable(recvTable('IV ค้างรับที่รอตรวจสอบการตัดชำระ', rv.iv, 'จาก get_receivable_due · ยอดหลังหัก WHT'))] });
    }
    // 5) เจ้าหนี้ใกล้ครบกำหนด
    const pv = M.payables(S), soon = pv.groups.today.concat(pv.groups.d7, pv.groups.d30), big = soon.slice().sort((a, b) => b.amount - a.amount)[0];
    if (soon.length) out.push({ title: 'เจ้าหนี้ที่ครบกำหนดภายใน 30 วัน', find: `${nf(soon.length)} รายการ รวม ${MB(pv.totals.today + pv.totals.d7 + pv.totals.d30)}` + (big ? ` รายการใหญ่สุด ${big.vendor} ${MB(big.amount)} ครบกำหนด ${thDs(big.due)}` : ''),
      nums: `ครบกำหนดแล้ว ${nf(pv.groups.overdue.length)} รายการ ${MB(pv.totals.overdue)} · ณ ${thDs(asof)} · ยอดคงค้างหลังหัก WHT`, impact: 'ต้องเตรียมเงินจ่ายภายในสิ้นเดือน', act: 'ฝ่ายการเงินยืนยันแผนจ่ายและเอกสารประกอบของรายการใหญ่',
      caveat: pv.future.length ? `มีเอกสารลงวันที่อนาคต ${nf(pv.future.length)} รายการ (${MB(pv.totals.future)}) แยกไว้ไม่รวมในยอดนี้` : '', ev: ['ดูรายการ', () => openTable(payTable('เจ้าหนี้ครบกำหนดภายใน 30 วัน', soon, 'ณ ' + thD(asof)))] });
    return out.slice(0, 5);
  }
  const insightHtml = i => `<article class="insight ${i.warn ? 'warn' : ''}"><h3>${esc(i.title)}</h3><dl><dt>ข้อค้นพบ</dt><dd>${esc(i.find)}</dd><dt>ตัวเลขและช่วงเวลา</dt><dd>${esc(i.nums)}</dd><dt>ผลต่อการบริหาร</dt><dd>${esc(i.impact)}</dd><dt>สิ่งที่ควรดำเนินการ</dt><dd>${esc(i.act)}</dd><dt>ผู้รับผิดชอบ/กำหนด</dt><dd>${NA('ยังไม่มีข้อมูลผู้รับผิดชอบและกำหนดเวลา')}</dd>${i.caveat ? `<dt>ข้อจำกัด</dt><dd>${esc(i.caveat)}</dd>` : ''}<dt>หลักฐาน</dt><dd><button class="link" ${drill(i.ev[1])}>${esc(i.ev[0])}</button></dd></dl></article>`;

  /* ---------- หน้า 1: Executive Snapshot ---------- */
  function pExec() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', cm = M.compareMonth(S, st.ym, F()), to = selTo();
    const ytdL = M.selectLines(S, F({ from: y0, to })), ytd = M.billing(ytdL), monL = M.selectLines(S, F({ from: cm.from, to: cm.to }));
    const rv = M.receivables(S, { unit: st.unit }), pv = M.payables(S), cmt = M.commitments(S), o = M.om(S), ser = M.monthly(S, F());
    const k1 = MBv(cm.cur.net), k2 = MBv(ytd.net), k3 = MBv(rv.openAging.total), k4 = MBv(pv.totals.overdue);
    const cmpLabel = cm.prev ? `เทียบ ${thDs(cm.pfrom)}–${thDs(cm.pto)}` : 'ไม่มีเดือนก่อนในชุดข้อมูล';
    const units = M.byUnit(S, F({ from: cm.from, to: cm.to })), umax = Math.max(1, ...units.map(u => u.net));
    const lm = o ? Math.min(o.last('volume', 'actual', 2026), +st.ym.slice(5, 7)) : 0;
    const va = o && lm ? o.total('volume', 'actual', 2026, lm) : null, vp = o && lm ? o.total('volume', 'actual', 2025, lm) : null, a3 = o && lm ? o.total('volume', 'actual', 2026, lm, 'Phase 3') : null, c3 = o && lm ? o.total('volume', 'contract', 2026, lm, 'Phase 3') : null;
    const cc = M.concentration(ytdL), ins = insights();
    const follow = [
      { t: 'IV ค้างรับรอตรวจสอบการตัดชำระ', d: `${nf(rv.iv.length)} ฉบับ · เกิน 90 วัน ${nf(rv.ivAging.buckets[5].count)} ฉบับ`, v: rv.ivAging.total, f: () => openTable(recvTable('IV ค้างรับที่รอตรวจสอบการตัดชำระ', rv.iv, 'ยอดหลังหัก WHT')) },
      { t: 'BL ปี 2569 ที่ยังไม่รับชำระ', d: `${nf(rv.open.length)} ฉบับ · เกินกำหนด ${MB(rv.openAging.overdue)}`, v: rv.openAging.total, f: () => openTable(blDocTable('BL ปี 2569 ที่ยังไม่รับชำระ', rv.open, 'ยอดรวม VAT · ไม่รวมส่วนต่างภาษีหัก ณ ที่จ่าย')) },
      { t: 'เจ้าหนี้ครบกำหนดภายใน 30 วัน', d: `${nf(pv.groups.today.length + pv.groups.d7.length + pv.groups.d30.length)} รายการ`, v: pv.totals.today + pv.totals.d7 + pv.totals.d30, f: () => openTable(payTable('เจ้าหนี้ครบกำหนดภายใน 30 วัน', pv.groups.today.concat(pv.groups.d7, pv.groups.d30), 'ณ ' + thD(asof))) },
      { t: 'ยอดยกมาปี 2568 ที่ยังเปิดอยู่', d: `${nf(rv.openOld.length)} ฉบับ · เอกสารยกยอดลูกหนี้`, v: rv.openOldTotal, f: () => openTable(blDocTable('ยอดยกมาปี 2568 ที่ยังไม่ตัดชำระ', rv.openOld, 'เอกสารประเภท ยกยอด-ลูกหนี้1')) },
      { t: 'ภาระ PO ที่อนุมัติแล้วยังไม่ตั้งเจ้าหนี้', d: `${nf(cmt.rows.length)} ใบ · ก่อน VAT`, v: cmt.total, f: () => openTable(poTable('ภาระ PO ที่ยังไม่ตั้งเจ้าหนี้', cmt.rows)) },
      { t: 'เจ้าหนี้ครบกำหนดแล้ว', d: `${nf(pv.groups.overdue.length)} รายการ`, v: pv.totals.overdue, f: () => openTable(payTable('เจ้าหนี้ครบกำหนดแล้ว', pv.groups.overdue, 'ณ ' + thD(asof))) }
    ].filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    return `<div class="grid g4">
      <button class="card accent navy kpi" ${drill(() => openTable(linesTable('ยอดเรียกเก็บ ' + thM(st.ym), monL, `วันที่ออก ${thDs(cm.from)} – ${thDs(cm.to)}`)))}><span class="lab">ยอดเรียกเก็บสุทธิก่อน VAT · ${thM(st.ym)}</span><span class="val num">${k1[0]} <small>${k1[1]}</small></span><span class="full num">${B(cm.cur.net)} บาท${partialNote(st.ym)}</span>${delta(cm.pct, cmpLabel)}<span class="more">ดู BL ${nf(cm.cur.docs)} ฉบับ →</span></button>
      <button class="card accent kpi" ${drill(() => openTable(linesTable('ยอดเรียกเก็บสะสมปี', ytdL, `วันที่ออก ${thDs(y0)} – ${thDs(to)}`)))}><span class="lab">ยอดเรียกเก็บสะสมปี · ม.ค.–${TH[+st.ym.slice(5) - 1]} ${+asof.slice(0, 4) + 543}</span><span class="val num">${k2[0]} <small>${k2[1]}</small></span><span class="full num">${B(ytd.net)} บาท · ก่อนหัก ${MB(ytd.gross)} · หัก ${MB(-ytd.deduction)}</span><span class="delta na">เทียบปีก่อน: N/A (TRCLOUD ไม่มี BL ปี 2568)</span><span class="more">ดู BL ${nf(ytd.docs)} ฉบับ →</span></button>
      <button class="card accent warn kpi" ${drill(() => openTable(blDocTable('BL ปี 2569 ที่ยังไม่รับชำระ', rv.open, 'ยอดรวม VAT ณ ' + thD(asof) + ' · ไม่รวมส่วนต่างภาษีหัก ณ ที่จ่าย 3%')))}><span class="lab">BL ที่ยังชำระไม่ครบ · ณ ${thDs(asof)}</span><span class="val num">${nf(rv.open.length)} <small>ฉบับ · ${k3[0]} ${k3[1]}</small></span><span class="full num">${B(rv.openAging.total)} บาท (รวม VAT) · เกินกำหนด ${MB(rv.openAging.overdue)}</span><span class="full">ไม่นับส่วนต่าง WHT 3% ${nf(rv.wht.length)} ฉบับ และแยกจาก IV ค้างรับ</span><span class="more">ดูเอกสาร →</span></button>
      <button class="card accent sky kpi" ${drill(() => openTable(payTable('เจ้าหนี้ครบกำหนดแล้ว', pv.groups.overdue, 'ณ ' + thD(asof))))}><span class="lab">เจ้าหนี้ครบกำหนดแล้ว · ณ ${thDs(asof)}</span><span class="val num">${k4[0]} <small>${k4[1]}</small></span><span class="full num">${B(pv.totals.overdue)} บาท · ${nf(pv.groups.overdue.length)} รายการ</span><span class="full">ครบใน 30 วันอีก ${MB(pv.totals.today + pv.totals.d7 + pv.totals.d30)}</span><span class="more">ดูเอกสาร →</span></button></div>
    <div class="pill3">
      <div class="card accent navy mini"><h3>ธุรกิจและการเงิน</h3>
        <div class="row"><span>ค่าบริการก่อนรายการหัก (${thM(st.ym)})</span><b class="num">${MB(cm.cur.gross)}</b></div><div class="row"><span>รายการหัก Pre-Treatment</span><b class="num">${cm.cur.deduction ? '−' + MB(-cm.cur.deduction) : '0 บาท'}</b></div>
        <div class="row"><span>IV ค้างรับรอตรวจสอบ</span><b class="num">${MB(rv.ivAging.total)}</b></div><div class="row"><span>กำไร / เงินสด</span><b>${NA('ยังไม่มีข้อมูลเพียงพอ')}</b></div></div>
      <div class="card accent mini"><h3>การเดินระบบ <span class="sub">(ไฟล์ OM ${lm ? '· ' + TH[lm - 1] + ' 2569' : ''})</span></h3>
        <div class="row"><span>ปริมาณน้ำรับจริงรวม</span><b class="num">${va !== null ? nf(va) + ' ลบ.ม.' : NA()}</b></div><div class="row"><span>เทียบเดือนเดียวกันปี 2568</span><b>${va !== null ? pctTxt(M.pct(va, vp)) : NA()}</b></div>
        <div class="row"><span>เฟส 3 เทียบปริมาณตามสัญญา (OM ระบุ)</span><b>${a3 !== null && c3 ? nf(a3 / c3 * 100, 0) + '%' : NA()}</b></div><div class="row"><span>คุณภาพน้ำ / Downtime</span><b>${NA()}</b></div></div>
      <div class="card accent warn mini"><h3>ความเสี่ยง</h3>
        <div class="row"><span>สัดส่วนลูกค้ารายใหญ่สุด (สะสมปี)</span><b class="num">${cc.top ? nf(cc.top.share, 2) + '%' : NA()}</b></div><div class="row"><span>สัญญาใกล้ถึงกำหนด</span><b>${S.contracts && S.contracts.rows.length ? nf(S.contracts.rows.length) + ' สัญญาในทะเบียน' : NA('ยังไม่มีทะเบียนสัญญา')}</b></div>
        <div class="row"><span>มูลค่าค่าปรับ/ข้อเรียกร้อง</span><b>${NA('ยังประเมินไม่ได้')}</b></div><div class="row"><span>เหตุส่งมอบขาด</span><b>${NA()}</b></div></div></div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>ค่าบริการ รายการหัก และยอดสุทธิรายเดือน</h2><p class="sub">BL ตามวันที่ออกเอกสาร ปี ${+asof.slice(0, 4) + 543} · ก่อน VAT · กดแท่งเพื่อดูเอกสาร${st.unit ? ' · ' + esc(M.unitLabel(st.unit, areas())) : ''}</p></div></div>
        ${monthlyChart(ser, s => openTable(linesTable('ยอดเรียกเก็บ ' + thM(s.ym), M.selectLines(S, F({ from: s.ym + '-01', to: M.monthEnd(s.ym) })), 'ตามวันที่ออกเอกสาร')))}</section>
      <section class="card"><div class="head"><div><h2>อันดับพื้นที่ตามยอดเรียกเก็บ · ${thM(st.ym)}</h2><p class="sub">สุทธิก่อน VAT${partialNote(st.ym)} · เฟส 1&2 ออกบิลรวมที่สำนักงานใหญ่ จึงแยกรายฟาร์มจาก TRCLOUD ไม่ได้</p></div></div>
        ${units.length ? bars(units.map((u, i) => ({ label: u.label, v: u.net, txt: MB(u.net), cls: u.unit === 'P12' ? '' : u.unit === 'OTHER' ? 'b3' : 'b2', drill: () => openTable(linesTable(u.label + ' · ' + thM(st.ym), M.selectLines(S, { from: cm.from, to: cm.to, unit: u.unit }), 'ตามวันที่ออกเอกสาร')) })), umax) : '<div class="empty">ไม่มี BL ในช่วงที่เลือก</div>'}</section></div>
    <section class="card"><div class="head"><div><h2>CEO Insights</h2><p class="sub">สร้างจากกฎและตัวเลขที่ตรวจย้อนได้ · ข้อมูล ณ ${thD(asof)}</p></div></div><div class="grid g2">${ins.map(insightHtml).join('')}</div></section>
    <section class="card"><div class="head"><div><h2>รายการต้องติดตาม</h2><p class="sub">เรียงตามมูลค่า · แต่ละชุดแยกกัน ไม่ได้รวมเป็นยอดเดียว</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>เรื่อง</th><th>รายละเอียด</th><th class="r">มูลค่า (บาท)</th></tr></thead><tbody>${follow.map(x => `<tr class="rowlink" ${drill(x.f)} tabindex="0"><td><b style="font-weight:600;color:var(--navy)">${esc(x.t)}</b></td><td>${esc(x.d)}</td><td class="r num">${B(x.v)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ---------- หน้า 2: ยอดเรียกเก็บและพื้นที่ ---------- */
  function pBilling() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', cm = M.compareMonth(S, st.ym, F()), to = selTo();
    const mu = M.byUnit(S, F({ from: cm.from, to: cm.to })), yu = M.byUnit(S, F({ from: y0, to })), ym = {}; mu.forEach(u => ym[u.unit] = u);
    const ytd = M.billing(M.selectLines(S, F({ from: y0, to }))), ar = areas();
    const row = u => { const m = ym[u.unit]; return `<tr class="rowlink" ${drill(() => openTable(linesTable(u.label + ' · สะสมปี', M.selectLines(S, { from: y0, to, unit: u.unit }), 'ตามวันที่ออกเอกสาร')))} tabindex="0"><td>${esc(u.label)}</td><td class="r num">${m ? B(m.net) : '–'}</td><td class="r num">${B(u.gross)}</td><td class="r num">${u.deduction ? B(u.deduction) : '–'}</td><td class="r num"><b>${B(u.net)}</b></td><td class="r num">${ytd.net ? nf(u.net / ytd.net * 100, 1) + '%' : '–'}</td><td class="r num">${u.qty !== null ? nf(u.qty) : '–'}</td><td class="r num">${u.qty ? nf(u.gross / 100 / u.qty, 2) : '–'}</td></tr>`; };
    const ops = yu.filter(u => u.unit !== 'OTHER'), adm = yu.filter(u => u.unit === 'OTHER');
    const cats = Object.keys(M.CAT).filter(c => ytd.byCat[c]), mcat = cm.cur.byCat;
    const noBill = S.areas.filter(a => a.kind === 'site' && !S.bl_lines.some(l => l.dept === a.code && l.cat === 'svc_p3'));
    const all = M.selectLines(S, F({ from: y0, to }));
    return `<section class="card"><div class="head"><div><h2>ผลงานรายพื้นที่</h2><p class="sub">BL ตามวันที่ออกเอกสาร · ${thM(st.ym)}${partialNote(st.ym)} และสะสม ม.ค.–${TH[+st.ym.slice(5) - 1]} · บาท ก่อน VAT · กดแถวเพื่อดูเอกสาร</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>พื้นที่ปฏิบัติการ</th><th class="r">${thM(st.ym)}</th><th class="r">ก่อนรายการหัก (สะสม)</th><th class="r">รายการหัก (สะสม)</th><th class="r">สุทธิ (สะสม)</th><th class="r">สัดส่วน</th><th class="r">ปริมาณตามเอกสาร</th><th class="r">ราคาเฉลี่ย/หน่วย</th></tr></thead><tbody>${ops.map(row).join('') || '<tr><td colspan="8"><div class="empty">ไม่มีรายการ</div></td></tr>'}</tbody>
      ${adm.length ? `<thead><tr><th colspan="8" style="padding-top:16px">ส่วนงานบริหาร / รายการอื่น (แยกจากพื้นที่ปฏิบัติการ)</th></tr></thead><tbody>${adm.map(row).join('')}</tbody>` : ''}
      <tfoot><tr><td>รวม</td><td class="r num">${B(cm.cur.net)}</td><td class="r num">${B(ytd.gross)}</td><td class="r num">${B(ytd.deduction)}</td><td class="r num">${B(ytd.net)}</td><td class="r num">100%</td><td></td><td></td></tr></tfoot></table></div>
      <p class="note" style="margin-top:10px">ปริมาณและราคาเฉลี่ยแสดงเฉพาะเฟส 3 ซึ่งคิดตามปริมาณรายสัปดาห์ · ช่องหน่วยใน TRCLOUD ว่าง จึงไม่ติดหน่วย (ไฟล์ OM ใช้ ลบ.ม.) · เฟส 1&2 เรียกเก็บรวม${facts().p12 ? ' ' + nf(+facts().p12.qty) + ' หน่วย/เดือนตามเอกสาร' : ''} ไม่แยกฟาร์ม${noBill.length ? ' · พื้นที่ในทะเบียนที่ไม่มี BL เฟส 3 ปีนี้: ' + esc(noBill.map(a => a.name).join(', ')) : ''}</p></section>
    <section class="card"><div class="head"><div><h2>ประเภทบริการ รายการหัก และผลต่อยอดสุทธิ</h2><p class="sub">จัดหมวดจากชื่อรายการและรหัสสินค้า/บัญชี — ไม่ใช้เครื่องหมายลบตัดสินอย่างเดียว</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>หมวด</th><th>รหัสที่พบ</th><th class="r">${thM(st.ym)}</th><th class="r">สะสมปี</th><th class="r">% ของก่อนหัก</th></tr></thead><tbody>
      ${cats.map(c => `<tr class="rowlink" ${drill(() => openTable(linesTable(M.CAT[c].label, all.filter(l => l.cat === c), 'สะสมปี')))} tabindex="0"><td>${M.CAT[c].group === 'deduction' ? '<span class="tag wait">รายการหัก</span> ' : ''}${esc(M.CAT[c].label)}</td><td>${esc([...new Set(all.filter(l => l.cat === c).map(l => l.pid))].join(', '))}</td><td class="r num">${mcat[c] ? B(mcat[c]) : '–'}</td><td class="r num">${B(ytd.byCat[c])}</td><td class="r num">${nf(ytd.byCat[c] / ytd.gross * 100, 1)}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">ค่าบริการก่อนรายการหัก</td><td class="r num">${B(cm.cur.gross)}</td><td class="r num">${B(ytd.gross)}</td><td class="r num">100%</td></tr><tr><td colspan="2">รายการหัก</td><td class="r num">${B(cm.cur.deduction)}</td><td class="r num">${B(ytd.deduction)}</td><td class="r num">${nf(ytd.deduction / ytd.gross * 100, 1)}%</td></tr><tr><td colspan="2">ยอดเรียกเก็บสุทธิก่อน VAT</td><td class="r num">${B(cm.cur.net)}</td><td class="r num">${B(ytd.net)}</td><td class="r num">${nf(ytd.net / ytd.gross * 100, 1)}%</td></tr></tfoot></table></div></section>
    <section class="card"><div class="head"><div><h2>เอกสาร BL รายบรรทัด</h2><p class="sub">สะสม ม.ค.–${TH[+st.ym.slice(5) - 1]} ตามตัวกรองด้านบน · ค้นหา กรอง เรียง และส่งออก CSV ได้</p></div></div>${tableSlot(Object.assign(linesTable('', all, ''), { size: 12 }))}</section>`;
  }

  /* ---------- หน้า 3: ลูกหนี้และการรับชำระ ---------- */
  function pRecv() {
    const asof = S.meta.asof, rv = M.receivables(S, { unit: st.unit }), col = M.collection(S), mxA = Math.max(1, ...rv.openAging.buckets.map(b => b.amount), ...rv.ivAging.buckets.map(b => b.amount));
    const agRows = (ag, rows, amt, mk) => ag.buckets.map((b, i) => ({ label: b.name + ' (' + nf(b.count) + ')', v: b.amount, txt: MB(b.amount), cls: i >= 2 ? 'w' : 'b2', drill: () => openTable(mk(b.name, rows.filter(r => M.bucket(r.due, asof) === i))) }));
    const byBr = {}; rv.open.forEach(d => { const k = (d.branch || '(ไม่ระบุ)') + '|' + ((areas()[d.dept] || {}).name || d.dept); const x = byBr[k] = byBr[k] || { k, n: 0, amt: 0, od: 0, rows: [] }; x.n++; x.amt += d.remaining; if (M.daysBetween(d.due, asof) > 0) x.od += d.remaining; x.rows.push(d); });
    const k = (lab, v, sub, f, cls) => `<button class="card accent ${cls || ''} kpi" ${drill(f)}><span class="lab">${lab}</span><span class="val num">${MBv(v)[0]} <small>${MBv(v)[1]}</small></span><span class="full num">${B(v)} บาท</span><span class="full">${sub}</span><span class="more">ดูเอกสาร →</span></button>`;
    return `<div class="empty" style="border-style:solid">ลูกหนี้แสดงเป็น 3 ชุดแยกกัน ซึ่งตรวจแล้วว่าไม่ซ้ำเอกสารกัน (${nf(rv.open.length + rv.openOld.length)} BL ที่ยังเปิด และ ${nf(rv.iv.length)} IV ที่อ้างอิง BL ซึ่งออก IV ครบแล้ว) แต่<b>ยังไม่รวมเป็นยอดลูกหนี้เดียว</b>จนกว่าฝ่ายบัญชีจะกระทบยอด IV ค้างรับช่วงต้นปี · วันที่อ้างอิง ${thD(asof)}${st.unit ? ' · กรองพื้นที่: ' + esc(M.unitLabel(st.unit, areas())) : ''}</div>
    <div class="grid g4">
      ${k('① BL ปี 2569 ที่ยังไม่รับชำระ', rv.openAging.total, `${nf(rv.open.length)} ฉบับ · เกินกำหนด ${MB(rv.openAging.overdue)} · รวม VAT`, () => openTable(blDocTable('BL ปี 2569 ที่ยังไม่รับชำระ', rv.open, 'ยอดรวม VAT')), 'navy')}
      ${k('② IV ค้างรับ (รอตรวจสอบการตัดชำระ)', rv.ivAging.total, `${nf(rv.iv.length)} ฉบับ · ออก ม.ค.–ก.พ. 2569 · หลังหัก WHT`, () => openTable(recvTable('IV ค้างรับที่รอตรวจสอบการตัดชำระ', rv.iv, 'จาก get_receivable_due')), 'warn')}
      ${k('③ ยอดยกมาปี 2568 ที่ยังเปิด', rv.openOldTotal, `${nf(rv.openOld.length)} ฉบับ · เอกสารยกยอดลูกหนี้`, () => openTable(blDocTable('ยอดยกมาปี 2568 ที่ยังไม่ตัดชำระ', rv.openOld, 'ประเภท ยกยอด-ลูกหนี้1')), 'sky')}
      ${k('ส่วนต่างภาษีหัก ณ ที่จ่าย (ไม่ใช่ยอดค้าง)', rv.whtTotal, `${nf(rv.wht.length)} ฉบับสถานะ "ชำระบางส่วน" คงเหลือ 3% พอดี`, () => openTable(blDocTable('BL ที่คงเหลือเท่ากับภาษีหัก ณ ที่จ่าย 3%', rv.wht, 'อนุมานจากส่วนต่าง = 3% ของยอดก่อน VAT — รอฝ่ายบัญชียืนยัน')), '')}</div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>อายุหนี้ ① BL ที่ยังไม่รับชำระ</h2><p class="sub">ตามวันครบกำหนด เทียบ ${thDs(asof)} · กดแถบเพื่อดูเอกสาร</p></div></div>${bars(agRows(rv.openAging, rv.open, d => d.remaining, (n, r) => blDocTable('BL ที่ยังไม่รับชำระ · ' + n, r, 'ยอดรวม VAT')), mxA)}${rv.openAging.invalid.length ? `<p class="note">วันครบกำหนดหาย/ผิด ${nf(rv.openAging.invalid.length)} ฉบับ — แยกตรวจสอบ</p>` : ''}</section>
      <section class="card"><div class="head"><div><h2>อายุหนี้ ② IV ค้างรับ</h2><p class="sub">ตามวันครบกำหนดของ IV เทียบ ${thDs(asof)}</p></div></div>${bars(agRows(rv.ivAging, rv.iv, r => r.amount, (n, r) => recvTable('IV ค้างรับ · ' + n, r, 'ยอดหลังหัก WHT')), mxA)}</section></div>
    <section class="card"><div class="head"><div><h2>สาขาลูกค้า/พื้นที่ที่ต้องติดตาม (ชุด ①)</h2><p class="sub">เรียงตามยอดคงเหลือ · กดแถวเพื่อดูเอกสาร</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>สาขาลูกค้า</th><th>พื้นที่</th><th class="r">จำนวน BL</th><th class="r">คงเหลือ (บาท)</th><th class="r">เกินกำหนด (บาท)</th></tr></thead><tbody>${Object.values(byBr).sort((a, b) => b.amt - a.amt).map(x => `<tr class="rowlink" ${drill(() => openTable(blDocTable('BL ที่ยังไม่รับชำระ · ' + x.k.replace('|', ' · '), x.rows, 'ยอดรวม VAT')))} tabindex="0"><td>${esc(x.k.split('|')[0])}</td><td>${esc(x.k.split('|')[1])}</td><td class="r num">${nf(x.n)}</td><td class="r num">${B(x.amt)}</td><td class="r num">${x.od ? B(x.od) : '–'}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">ไม่มี BL ค้างชำระตามตัวกรอง</div></td></tr>'}</tbody></table></div></section>
    <section class="card"><div class="head"><div><h2>ความสัมพันธ์เอกสาร BL → IV → การรับชำระ</h2><p class="sub">ตามหลักฐานที่มีใน TRCLOUD</p></div><button class="btn" ${drill(() => openTable({ title: 'ระยะเวลาจากออก BL ถึงวันที่ IV รับเงิน', sub: 'IV สถานะรับเงินแล้ว (ประเภท TTB(RV)-BL) · ใช้วันที่ IV เป็นวันที่รับเงินตามเอกสาร รอฝ่ายบัญชียืนยัน', file: 'SAM_collection', sort: 'days', dir: -1, rows: col.rows, total: a => ({ amt: M.sum(a, r => r.amt) }),
        cols: [{ k: 'bl', label: 'BL' }, { k: 'bl_date', label: 'วันที่ BL', fmt: r => thDs(r.bl_date) }, { k: 'due', label: 'ครบกำหนด', fmt: r => thDs(r.due) }, { k: 'iv', label: 'IV (RE)' }, { k: 'iv_date', label: 'วันที่ IV รับเงิน', fmt: r => thDs(r.iv_date) }, { k: 'days', label: 'วันจาก BL', r: 1 }, { k: 'late', label: 'ช้ากว่ากำหนด (วัน)', r: 1, fmt: r => r.late > 0 ? nf(r.late) : '–' }, { k: 'amt', label: 'ยอดรวม VAT', r: 1, money: 1 }] }))}>ดูรายเอกสาร</button></div>
      <div class="cols"><div class="mini" style="flex:1 1 300px"><div class="row"><span>BL ปี 2569 ทั้งหมด</span><b class="num">${nf(S.bl_docs.filter(d => !d.opening).length)} ฉบับ</b></div><div class="row"><span>ออก IV แล้ว (1 BL : 1 IV ทุกฉบับ)</span><b class="num">${nf(S.bl_docs.filter(d => !d.opening && d.iv.length).length)} ฉบับ</b></div><div class="row"><span>IV สถานะรับเงินแล้ว</span><b class="num">${nf(S.iv.filter(x => x.status === 'Cash').length)} ฉบับ</b></div><div class="row"><span>IV สถานะค้างรับ</span><b class="num">${nf(S.iv.filter(x => x.status === 'Debtor').length)} ฉบับ</b></div></div>
      <div class="mini" style="flex:1 1 300px"><div class="row"><span>ค่ากลางจำนวนวันจากออก BL ถึง IV รับเงิน</span><b class="num">${col.median !== null ? nf(col.median) + ' วัน' : NA()}</b></div><div class="row"><span>IV รับเงินหลังวันครบกำหนดของ BL</span><b class="num">${nf(col.lateCount)} จาก ${nf(col.rows.length)} ฉบับ</b></div><div class="row"><span>ใบเสร็จรับเงิน (RV)</span><b>${NA('ค้นไม่พบเอกสาร RV')}</b></div><div class="row"><span>ใบลดหนี้ (CN)</span><b>ไม่พบในช่วงที่ดึง</b></div></div></div>
      <p class="note" style="margin-top:10px">ยอดเรียกเก็บใช้ BL เป็นฐาน และ IV ทุกฉบับอ้างอิง BL จึงไม่นำ IV มาบวกซ้ำ · สถานะ "ออก IV ครบแล้ว" ของ BL ไม่ได้แปลว่ารับเงินแล้ว ต้องดูสถานะของ IV</p></section>`;
  }

  /* ---------- หน้า 4: เจ้าหนี้และภาระจัดซื้อ ---------- */
  function pPay() {
    const asof = S.meta.asof, pv = M.payables(S), cmt = M.commitments(S), g = pv.groups;
    const k = (lab, rows, v, sub, cls) => `<button class="card accent ${cls || ''} kpi" ${drill(() => openTable(payTable(lab, rows, 'ณ ' + thD(asof) + ' · ยอดคงค้างหลังหัก WHT')))}><span class="lab">${lab}</span><span class="val num">${MBv(v)[0]} <small>${MBv(v)[1]}</small></span><span class="full num">${B(v)} บาท · ${nf(rows.length)} รายการ</span><span class="full">${sub}</span><span class="more">ดูเอกสาร →</span></button>`;
    const grp = (key, name) => { const m = {}; pv.rows.forEach(p => { const kk = key(p); const x = m[kk] = m[kk] || { k: kk, n: 0, amt: 0, od: 0, rows: [] }; x.n++; x.amt += p.amount; if (M.daysBetween(asof, p.due) < 0) x.od += p.amount; x.rows.push(p); });
      return `<div class="tbl-wrap"><table><thead><tr><th>${name}</th><th class="r">รายการ</th><th class="r">คงค้าง (บาท)</th><th class="r">ครบกำหนดแล้ว</th></tr></thead><tbody>${Object.values(m).sort((a, b) => b.amt - a.amt).map(x => `<tr class="rowlink" ${drill(() => openTable(payTable('เจ้าหนี้ · ' + x.k, x.rows, 'ณ ' + thD(asof))))} tabindex="0"><td>${esc(x.k)}</td><td class="r num">${nf(x.n)}</td><td class="r num">${B(x.amt)}</td><td class="r num">${x.od ? B(x.od) : '–'}</td></tr>`).join('')}</tbody></table></div>`; };
    return `<div class="grid g4">${k('ครบกำหนดแล้ว', g.overdue, pv.totals.overdue, 'ก่อนวันที่ ' + thDs(asof), 'warn')}${k('ครบกำหนดใน 7 วัน', g.today.concat(g.d7), pv.totals.today + pv.totals.d7, 'ถึง ' + thDs(M.addDays(asof, 7)), 'navy')}${k('ครบกำหนดใน 8–30 วัน', g.d30, pv.totals.d30, 'ถึง ' + thDs(M.addDays(asof, 30)), '')}${k('ครบกำหนดหลัง 30 วัน', g.later, pv.totals.later, 'หลัง ' + thDs(M.addDays(asof, 30)), 'sky')}</div>
    ${pv.future.length ? `<div class="empty" style="border-style:solid">มีเอกสารลงวันที่อนาคต ${nf(pv.future.length)} รายการ รวม ${B(pv.totals.future)} บาท (วันที่เอกสารหลัง ${thDs(asof)}) — แยกไว้ ไม่รวมในยอดด้านบน <button class="link" ${drill(() => openTable(payTable('เอกสารเจ้าหนี้ลงวันที่อนาคต', pv.future, 'แยกจากยอดเจ้าหนี้ปัจจุบัน')))}>ดูรายการ</button></div>` : ''}
    <div class="grid g2"><section class="card"><div class="head"><div><h2>เจ้าหนี้ตามผู้ขาย</h2><p class="sub">รวม ${B(pv.totals.all)} บาท · ${nf(pv.rows.length)} เอกสาร (AP และ EXP ไม่นับซ้ำ)</p></div></div>${grp(p => p.vendor || '(ไม่ระบุ)', 'ผู้ขาย/เจ้าหนี้')}</section>
      <section class="card"><div class="head"><div><h2>เจ้าหนี้ตามหน่วยงาน/พื้นที่ และประเภท</h2><p class="sub">ตาม department ของเอกสาร</p></div></div>${grp(p => p.dept ? ((areas()[p.dept] || {}).name || p.dept) : '(ไม่ระบุหน่วยงาน)', 'หน่วยงาน/พื้นที่')}<div style="height:12px"></div>${grp(p => p.conv === 'AP' ? 'AP — ซื้อสินค้า/บริการผ่านใบสั่งซื้อ' : p.conv === 'EXP' ? 'EXP — ค่าใช้จ่ายอื่น' : p.conv, 'ประเภทเอกสาร')}</section></div>
    <section class="card"><div class="head"><div><h2>ภาระ PO ที่อนุมัติแล้วและยังไม่ตั้งเจ้าหนี้ครบ</h2><p class="sub">แสดงแยกจากเจ้าหนี้ — PO ที่อนุมัติยังไม่ใช่เจ้าหนี้ที่ตั้งบัญชี · ${nf(cmt.rows.length)} ใบ รวม ${B(cmt.total)} บาท (ก่อน VAT ตามรายงาน PO3)</p></div></div>${tableSlot(Object.assign(poTable('', cmt.rows), { size: 10 }))}</section>
    <section class="card"><div class="head"><div><h2>รายการเจ้าหนี้ทั้งหมด</h2><p class="sub">จาก get_payable_due (ครบกำหนดถึง 31 ธ.ค. 2570) · ไม่รวมเอกสารลงวันที่อนาคต</p></div></div>${tableSlot(Object.assign(payTable('', pv.rows, ''), { size: 12 }))}</section>`;
  }

  /* ---------- หน้า 5: การเดินระบบ (OM) ---------- */
  function pOps() {
    const o = M.om(S); if (!o) return `<div class="state">ยังไม่มีข้อมูล OM — นำเข้าด้วย <code>python3 scripts/import_om.py om/&lt;ไฟล์&gt;.xlsx</code></div>`;
    const last = o.last('volume', 'actual', 2026), m = Math.min(last, +st.ym.slice(5, 7)), lab = TH.slice(0, last), mm = lab.map((_, i) => i + 1);
    const tv = (k, y, ph) => mm.map(i => o.total('volume', k, y, i, ph));
    const sites = o.sites.map(s => { const a = o.get('volume', 'actual', 2026, m, s.code), c = o.get('volume', 'contract', 2026, m, s.code), p = o.get('volume', 'cp_plan', 2026, m, s.code), b = o.get('volume', 'budget', 2026, m, s.code), y = o.get('volume', 'actual', 2025, m, s.code), x = o.get('volume', 'max_capacity', 2026, m, s.code);
      const ya = M.sum(mm.filter(i => i <= m), i => o.get('volume', 'actual', 2026, i, s.code) || 0), yc = M.sum(mm.filter(i => i <= m), i => o.get('volume', 'contract', 2026, i, s.code) || 0);
      return { site: s.code, phase: s.phase, a, c, p, b, y, x, rc: M.ratio(a, c), rp: M.ratio(a, p), yoy: M.pct(a, y), ya, yc, ryc: M.ratio(ya, yc) }; });
    const rr = (v, d) => v === null ? NA('N/A') : nf(v, d || 0) + '%';
    const tA = o.total('volume', 'actual', 2026, m), tC = o.total('volume', 'contract', 2026, m), tY = o.total('volume', 'actual', 2025, m), rA = o.total('revenue', 'actual', 2026, m), rY = o.total('revenue', 'actual', 2025, m), rB = o.total('revenue', 'budget', 2026, m);
    const ytdA = M.sum(mm.filter(i => i <= m), i => o.total('volume', 'actual', 2026, i) || 0), ytdY = M.sum(mm.filter(i => i <= m), i => o.total('volume', 'actual', 2025, i) || 0);
    // เทียบรายได้ OM กับ BL ตามเดือนให้บริการ (เฟส 3)
    const x3 = mm.map(i => { const ym = '2026-' + String(i).padStart(2, '0'); const bl = M.billing(M.selectLines(S, { from: ym + '-01', to: M.monthEnd(ym), basis: 'service', cat: 'svc_p3' })).net; const om3 = o.total('revenue', 'actual', 2026, i, 'Phase 3'); return { i, bl, om: om3 === null ? null : Math.round(om3 * 100) }; });
    const sc = { title: 'ปริมาณน้ำรายพื้นที่ · ' + TH[m - 1] + ' 2569', sub: 'ที่มา: ไฟล์ OM · ลบ.ม.', file: 'SAM_OM_sites', sort: 'rc', dir: 1, rows: sites, cols: [{ k: 'site', label: 'พื้นที่' }, { k: 'phase', label: 'เฟส' }, { k: 'a', label: 'รับจริง', r: 1, fmt: r => r.a === null ? NA() : nf(r.a) }, { k: 'c', label: 'ตามสัญญา (OM ระบุ)', r: 1, fmt: r => r.c === null ? NA() : nf(r.c) }, { k: 'rc', label: 'จริง/สัญญา', r: 1, fmt: r => rr(r.rc), sortv: r => r.rc === null ? 1e9 : r.rc },
      { k: 'p', label: 'แผนรับน้ำ CP', r: 1, fmt: r => r.p === null ? NA() : nf(r.p) }, { k: 'rp', label: 'จริง/แผน CP', r: 1, fmt: r => rr(r.rp), sortv: r => r.rp === null ? 1e9 : r.rp }, { k: 'b', label: 'แผนธุรกิจ', r: 1, fmt: r => r.b === null ? NA() : nf(r.b) }, { k: 'y', label: 'เดือนเดียวกันปี 2568', r: 1, fmt: r => r.y === null ? NA() : nf(r.y) }, { k: 'yoy', label: 'YoY', r: 1, fmt: r => pctTxt(r.yoy, 0), sortv: r => r.yoy === null ? 1e9 : r.yoy },
      { k: 'ryc', label: 'สะสม จริง/สัญญา', r: 1, fmt: r => rr(r.ryc), sortv: r => r.ryc === null ? 1e9 : r.ryc }] };
    return `<div class="empty" style="border-style:solid">ที่มา: ไฟล์ Excel ของ OM "${esc(o.source.file)}" (นำเข้า ${thT(o.source.imported_at)} · revision ${o.source.revision}) ข้อมูลถึง ${TH[last - 1]} 2569 · ตัวเลข "ตามสัญญา" และ "Max capacity" เป็นค่าที่ OM ระบุในไฟล์ ยังไม่ได้ตรวจกับเอกสารสัญญา · ปริมาณน้ำ ยอดเรียกเก็บ และเงินรับ วิเคราะห์แยกกัน${+st.ym.slice(5, 7) > last ? ` · เดือนที่เลือกยังไม่มีข้อมูล OM จึงแสดง ${TH[last - 1]}` : ''}</div>
    <div class="grid g4">
      <div class="card accent navy"><div class="kpi" style="cursor:default"><span class="lab">ปริมาณน้ำรับจริงรวม · ${TH[m - 1]} 2569</span><span class="val num">${nf(tA)} <small>ลบ.ม.</small></span>${delta(M.pct(tA, tY), 'เทียบ ' + TH[m - 1] + ' 2568 (' + nf(tY) + ')')}<span class="full">สะสม ม.ค.–${TH[m - 1]}: ${nf(ytdA)} · ${pctTxt(M.pct(ytdA, ytdY))} เทียบปีก่อน</span></div></div>
      <div class="card accent"><div class="kpi" style="cursor:default"><span class="lab">รับจริงเทียบปริมาณตามสัญญา (OM ระบุ)</span><span class="val num">${rr(M.ratio(tA, tC))}</span><span class="full num">${nf(tA)} จาก ${nf(tC)} ลบ.ม.</span><span class="full">เฟส 1&2 ${rr(M.ratio(o.total('volume', 'actual', 2026, m, 'Phase 1&2'), o.total('volume', 'contract', 2026, m, 'Phase 1&2')))} · เฟส 3 ${rr(M.ratio(o.total('volume', 'actual', 2026, m, 'Phase 3'), o.total('volume', 'contract', 2026, m, 'Phase 3')))}</span></div></div>
      <div class="card accent sky"><div class="kpi" style="cursor:default"><span class="lab">รายได้จริงตามไฟล์ OM · ${TH[m - 1]} 2569</span><span class="val num">${nf(rA / 1e6, 2)} <small>ล้านบาท</small></span>${delta(M.pct(rA, rY), 'เทียบ ' + TH[m - 1] + ' 2568')}<span class="full">เทียบแผนธุรกิจ ${rr(M.ratio(rA, rB))} · ตัวเลขของ OM ไม่ใช่ยอด BL</span></div></div>
      <div class="card accent warn"><div class="kpi" style="cursor:default"><span class="lab">คุณภาพน้ำ · Downtime · เหตุส่งมอบขาด</span><span class="val" style="font-size:20px">${NA('ยังไม่มีข้อมูล')}</span><span class="full">รอไฟล์ผลตรวจคุณภาพน้ำ บันทึกหยุดระบบ และเหตุผลรายวันจาก OM (แม่แบบใน templates/)</span></div></div></div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>ปริมาณน้ำรับจริงรวม ปี 2569 เทียบ 2568</h2><p class="sub">ลบ.ม./เดือน · ทุกพื้นที่ · ไฟล์ OM</p></div></div>${lineChart(lab, [{ name: 'รับจริง 2569', c: 'var(--bar1)', v: tv('actual', 2026), w: 2.8 }, { name: 'รับจริง 2568', c: 'var(--bar3)', v: tv('actual', 2025) }, { name: 'แผนรับน้ำ CP 2569', c: 'var(--blue)', v: tv('cp_plan', 2026), dash: 1 }, { name: 'แผนธุรกิจ 2569', c: 'var(--warn)', v: tv('budget', 2026), dash: 1 }], 'ลบ.ม.', v => nf(v / 1e6, 2) + 'M')}</section>
      <section class="card"><div class="head"><div><h2>เฟส 3: รับจริงเทียบปริมาณตามสัญญาที่ OM ระบุ</h2><p class="sub">ลบ.ม./เดือน · 6 พื้นที่ · ยังไม่ใช่การประเมินค่าปรับ</p></div></div>${lineChart(lab, [{ name: 'รับจริง เฟส 3', c: 'var(--bar1)', v: tv('actual', 2026, 'Phase 3'), w: 2.8 }, { name: 'ตามสัญญา (OM ระบุ)', c: 'var(--warn)', v: tv('contract', 2026, 'Phase 3'), dash: 1 }, { name: 'แผนรับน้ำ CP', c: 'var(--blue)', v: tv('cp_plan', 2026, 'Phase 3'), dash: 1 }, { name: 'รับจริง เฟส 1&2', c: 'var(--bar3)', v: tv('actual', 2026, 'Phase 1&2') }], 'ลบ.ม.', v => nf(v / 1e6, 2) + 'M')}</section></div>
    <section class="card"><div class="head"><div><h2>รายพื้นที่ · ${TH[m - 1]} 2569</h2><p class="sub">แยกตัวเลขแต่ละชนิด: รับจริง / ตามสัญญา / แผนรับน้ำของ CP / แผนธุรกิจ / กำลังการผลิตสูงสุด ไม่ใช้แทนกัน · จุดวัด: ${NA('ยังไม่ระบุในไฟล์')}</p></div></div>${tableSlot(Object.assign(sc, { size: 13 }))}</section>
    <section class="card"><div class="head"><div><h2>ตรวจเทียบ: รายได้เฟส 3 ตามไฟล์ OM กับ BL ตามเดือนให้บริการ</h2><p class="sub">BL จัดเดือนตามวันสิ้นสุดช่วงให้บริการที่อ่านจากคำอธิบาย · ใช้ดูความสอดคล้องของสองแหล่ง ไม่ใช่การปรับยอด</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>เดือนให้บริการ</th><th class="r">รายได้เฟส 3 ตาม OM (บาท)</th><th class="r">BL เฟส 3 ก่อน VAT (บาท)</th><th class="r">ผลต่าง (บาท)</th><th class="r">ผลต่าง %</th></tr></thead><tbody>${x3.map(x => `<tr><td>${TH[x.i - 1]} 2569</td><td class="r num">${x.om === null ? NA() : B(x.om)}</td><td class="r num">${B(x.bl)}</td><td class="r num">${x.om === null ? '–' : B(x.bl - x.om)}</td><td class="r num">${x.om ? pctTxt((x.bl - x.om) / x.om * 100) : NA('N/A')}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin-top:8px">รอบบิลเฟส 3 เป็นรายสัปดาห์และคร่อมเดือน จึงคาดว่ามีผลต่างระหว่างเดือนได้ · เดือนล่าสุดอาจยังออก BL ไม่ครบ</p></section>`;
  }

  /* ---------- หน้า 6: สัญญาและความเสี่ยง ---------- */
  function pContract() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', ytd = M.selectLines(S, { from: y0, to: asof }), yb = M.billing(ytd), cc = M.concentration(ytd), rv = M.receivables(S), o = M.om(S), C = S.contracts;
    const lm = o ? o.last('volume', 'actual', 2026) : 0, a3 = o ? o.total('volume', 'actual', 2026, lm, 'Phase 3') : null, c3 = o ? o.total('volume', 'contract', 2026, lm, 'Phase 3') : null;
    const p12 = (yb.byCat.svc_p12 || 0) + (yb.byCat.ded_pretreat || 0) + (yb.byCat.pretreat_charge || 0), p3 = yb.byCat.svc_p3 || 0;
    const reg = C && C.rows.length ? tableSlot({ title: '', file: 'SAM_contracts', sort: 'days', dir: 1, rows: C.rows.map(r => Object.assign({ days: r.end_date ? M.daysBetween(asof, r.end_date) : null, ndays: r.notice_deadline ? M.daysBetween(asof, r.notice_deadline) : null }, r)),
      cols: [{ k: 'contract_no', label: 'เลขสัญญา' }, { k: 'area', label: 'พื้นที่' }, { k: 'party', label: 'คู่สัญญา' }, { k: 'start_date', label: 'เริ่ม', fmt: r => thDs(r.start_date) }, { k: 'end_date', label: 'หมดอายุ', fmt: r => thDs(r.end_date) }, { k: 'days', label: 'วันคงเหลือ', r: 1, fmt: r => r.days === null ? NA() : nf(r.days) }, { k: 'notice_deadline', label: 'วันสุดท้ายที่ต้องแจ้ง', fmt: r => r.notice_deadline ? thDs(r.notice_deadline) + ' (อีก ' + nf(r.ndays) + ' วัน)' : NA() }, { k: 'alert', label: 'เกณฑ์เตือนภายใน', fmt: r => { const th = ((S.meta.settings || {}).contract_alert_days || []).filter(d => r.days !== null && r.days <= d); return th.length ? '<span class="tag wait">ภายใน ' + Math.min(...th) + ' วัน</span>' : '–'; }, csv: r => r.days }, { k: 'negotiation_status', label: 'สถานะเจรจา' }, { k: 'owner', label: 'ผู้รับผิดชอบ' }, { k: 'reference', label: 'เอกสารอ้างอิง' }] })
      : `<div class="empty"><b>ยังไม่มีทะเบียนสัญญา</b> — ระบบจึงยังไม่แสดงวันหมดอายุ วันสุดท้ายที่ต้องแจ้ง วันคงเหลือ สถานะเจรจา หรือสัดส่วนยอดเรียกเก็บของสัญญาใกล้หมดอายุ<br>กรอกแม่แบบ <code>templates/contracts.csv</code> (รองรับวันที่ พ.ศ./ค.ศ.) แล้วรัน <code>python3 scripts/import_contracts.py &lt;ไฟล์&gt;</code> และ <code>python3 scripts/build_snapshot.py</code></div>`;
    const risks = [
      ['การกระจุกตัวของลูกค้า', 'fact', `${cc.top ? nf(cc.top.share, 2) : '–'}% ของยอดเรียกเก็บสะสมปีมาจากลูกค้ารายเดียว (${MB(cc.total)})`, 'BL ปี 2569 (TRCLOUD)', () => openTable(linesTable('BL สะสมปี', ytd, 'ทั้งหมด'))],
      ['ปริมาณรับน้ำเฟส 3 ต่ำกว่าปริมาณตามสัญญาที่ OM ระบุ', 'fact', a3 !== null && c3 ? `${TH[lm - 1]} 2569 รับจริง ${nf(a3)} ลบ.ม. = ${nf(a3 / c3 * 100, 0)}% ของ ${nf(c3)} ลบ.ม./เดือน` : 'ยังไม่มีข้อมูล', 'ไฟล์ OM (ปริมาณน้ำ)', () => { st.page = 'ops'; location.hash = '#/ops'; }],
      ['ข้อผูกพันส่งมอบและค่าปรับตามสัญญา', 'none', 'ยังประเมินไม่ได้ — ไม่มีเงื่อนไขสัญญา (รอบประเมิน จุดวัด ช่วงผ่อนผัน เพดาน ข้อยกเว้น) จึงไม่แปลงปริมาณที่ต่ำกว่าเป็นมูลค่า', 'รอเอกสารสัญญา', null],
      ['รายการหัก Pre-Treatment', 'wait', `หักสะสมปี ${MB(-(yb.byCat.ded_pretreat || 0))} ภายใต้ ${facts().codes.length} รหัส — ยังไม่ยืนยันลักษณะรายการ และไม่ถือเป็นค่าปรับ`, 'BL ปี 2569 (TRCLOUD)', () => openTable(linesTable('บรรทัด Pre-Treatment', ytd.filter(l => l.cat === 'ded_pretreat' || l.cat === 'pretreat_charge'), 'สะสมปี'))],
      ['IV ค้างรับช่วงต้นปียังไม่ตัดชำระ', 'wait', `${nf(rv.iv.length)} ฉบับ ${MB(rv.ivAging.total)} — รอกระทบยอดกับเงินรับ`, 'get_receivable_due (TRCLOUD)', () => openTable(recvTable('IV ค้างรับ', rv.iv, 'ยอดหลังหัก WHT'))],
      ['กำหนดสัญญาและการต่ออายุ', 'none', 'ยังไม่มีทะเบียนสัญญา — ไม่สรุปโอกาสต่ออายุหรือรายได้ที่อาจสูญเสีย', 'รอทะเบียนสัญญา', null],
      ['คุณภาพน้ำและเหตุหยุดระบบ', 'none', 'ยังไม่มีข้อมูลผลตรวจคุณภาพน้ำ Downtime และ PM', 'รอไฟล์ OM', null]];
    const tg = { fact: ['fact', 'ข้อเท็จจริงจากข้อมูล'], wait: ['wait', 'รอยืนยัน'], none: ['none', 'ยังไม่มีข้อมูล'] };
    return `<section class="card"><div class="head"><div><h2>ทะเบียนสัญญาและการต่ออายุ</h2><p class="sub">แยกตามพื้นที่และคู่สัญญา · เกณฑ์เตือนภายในตั้งค่าใน config/settings.json แยกจากกำหนดตามสัญญา</p></div></div>${reg}</section>
    <div class="grid g3">
      <div class="card accent navy mini"><h3>ยอดเรียกเก็บย้อนหลังแยกเฟส <span class="sub">(สะสมปี 2569 · ก่อน VAT)</span></h3><div class="row"><span>เฟส 1&2 (สุทธิหลังรายการหัก)</span><b class="num">${MB(p12)}</b></div><div class="row"><span>เฟส 3</span><b class="num">${MB(p3)}</b></div><div class="row"><span>สัดส่วนเฟส 1&2 : เฟส 3</span><b class="num">${nf(p12 / (p12 + p3) * 100, 0)} : ${nf(p3 / (p12 + p3) * 100, 0)}</b></div><p class="note">ยอดย้อนหลังไม่ใช่มูลค่างานคงเหลือหรือรายได้ที่จะสูญเสีย · ยังผูกกับเลขสัญญาไม่ได้จนกว่าจะมีทะเบียนสัญญา</p></div>
      <div class="card accent mini"><h3>ปริมาณตามสัญญาที่ OM ระบุ <span class="sub">(ไฟล์ OM เดือนล่าสุด)</span></h3><div class="row"><span>เฟส 1&2</span><b class="num">${omPhase('contract', 'Phase 1&2') !== null ? nf(omPhase('contract', 'Phase 1&2')) + ' ลบ.ม./เดือน' : NA()}</b></div><div class="row"><span>เฟส 3</span><b class="num">${omPhase('contract', 'Phase 3') !== null ? nf(omPhase('contract', 'Phase 3')) + ' ลบ.ม./เดือน' : NA()}</b></div><div class="row"><span>Max capacity เฟส 1&2 / เฟส 3</span><b class="num">${omPhase('max_capacity', 'Phase 1&2') !== null ? nf(omPhase('max_capacity', 'Phase 1&2')) : '–'} / ${omPhase('max_capacity', 'Phase 3') !== null ? nf(omPhase('max_capacity', 'Phase 3')) : '–'}</b></div><p class="note">ค่าจากตารางในไฟล์ OM — ค่าเปลี่ยนได้ระหว่างปี ต้องตรวจกับสัญญาและฉบับแก้ไขก่อนใช้เป็นฐานข้อผูกพัน</p></div>
      <div class="card accent warn mini"><h3>ความเสี่ยงส่งมอบและค่าปรับ</h3><div class="row"><span>① ต่ำกว่าเป้าภายใน OM</span><b>${NA('ยังไม่มีเป้าภายใน')}</b></div><div class="row"><span>② อาจไม่เป็นไปตามข้อผูกพันในสัญญา</span><b>${NA('รอเงื่อนไขสัญญา')}</b></div><div class="row"><span>③ มูลค่าความเสี่ยงที่ประเมินตามกฎ</span><b>${NA('ยังประเมินไม่ได้')}</b></div><div class="row"><span>④ ค่าปรับ/ยอดหักที่ยืนยันแล้ว</span><b>${NA('ยังไม่มีข้อมูล')}</b></div></div></div>
    <section class="card"><div class="head"><div><h2>Risk Register</h2><p class="sub">แยกข้อเท็จจริง ข้อมูลที่รอยืนยัน และส่วนที่ยังไม่มีข้อมูล · ไม่ให้คะแนนหรือสีระดับความเสี่ยงเพราะยังไม่มีนิยามรองรับ</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>ประเด็น</th><th>ประเภท</th><th>สิ่งที่ทราบ</th><th>แหล่งที่มา</th><th>ผู้รับผิดชอบ/กำหนด</th></tr></thead><tbody>${risks.map(r => `<tr><td><b style="font-weight:600;color:var(--navy)">${esc(r[0])}</b></td><td><span class="tag ${tg[r[1]][0]}">${tg[r[1]][1]}</span></td><td>${esc(r[2])}</td><td>${r[4] ? `<button class="link" ${drill(r[4])}>${esc(r[3])}</button>` : esc(r[3])}</td><td>${NA()}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ---------- หน้า 7: สถานะข้อมูล ---------- */
  function pData() {
    const m = S.meta, bad = m.checks.filter(c => !c.ok), o = S.om, ar = S.areas.filter(a => a.kind === 'site' || S.bl_lines.some(l => l.dept === a.code));
    const defs = [['ยอดเรียกเก็บสุทธิก่อน VAT', 'ผลรวม before_vat ของทุกบรรทัด BL (รายงาน B3) ตามวันที่ออกเอกสาร รวมรายการหักที่ติดลบ · ไม่บวก IV'], ['ค่าบริการก่อนรายการหัก', 'ผลรวมบรรทัด BL ทุกหมวดที่ไม่ใช่รายการหัก'], ['รายการหัก', 'บรรทัดที่ชื่อระบุ Pre-Treatment และยอดติดลบ (รหัส 5111002 / 5131000)'],
      ['BL ที่ยังชำระไม่ครบ', 'BL ปี 2569 สถานะ Debtor · คงเหลือ = grand_total − payment (รวม VAT) · BL สถานะ Partial ที่คงเหลือ = 3% ของยอดก่อน VAT จัดเป็นส่วนต่าง WHT ไม่นับเป็นค้างชำระ'], ['IV ค้างรับ', 'รายการจาก get_receivable_due (amount = คงค้างหลังหัก WHT) แสดงแยก สถานะ "รอตรวจสอบการตัดชำระ"'],
      ['อายุหนี้', 'วันที่อ้างอิง − วันครบกำหนด: ยังไม่ครบ / วันนี้ / 1–30 / 31–60 / 61–90 / >90 วัน'], ['เจ้าหนี้ครบกำหนด', 'get_payable_due (amount = คงค้างหลังหัก WHT) จัดกลุ่มตามวันครบกำหนดเทียบวันที่อ้างอิง · เอกสารลงวันที่อนาคตแยกออก · AP/EXP ไม่นับซ้ำด้วยประเภท+เลขที่'],
      ['ภาระ PO', 'PO อนุมัติแล้ว สถานะ New/Partial และ backlog_ap > 0 (ก่อน VAT) — แยกจากเจ้าหนี้'], ['เทียบเดือน', 'เดือนเต็มเทียบเดือนเต็ม · เดือนปัจจุบันเทียบช่วงวันเท่ากันของเดือนก่อน · ฐานเป็นศูนย์หรือไม่มีข้อมูลแสดง N/A'], ['การปัดเศษ', 'คำนวณด้วย Decimal ปัดครึ่งขึ้นเป็นสตางค์ต่อบรรทัด แล้วรวมเป็นจำนวนเต็ม']];
    return `<div class="grid g3">
      <div class="card accent navy mini"><h3>แหล่งข้อมูลและช่วงที่ดึง</h3><div class="row"><span>โหมด</span><b>Snapshot (ไม่ได้เชื่อมต่อสด)</b></div><div class="row"><span>แหล่ง</span><b style="white-space:normal;text-align:right">${esc(m.source)}</b></div><div class="row"><span>ดึงข้อมูล</span><b>${thT(m.fetched_from)} – ${m.fetched_to.slice(11, 16)} น.</b></div><div class="row"><span>ช่วงวันที่เอกสาร</span><b>${thDs(m.period_from)} – ${thDs(m.period_to)}</b></div><div class="row"><span>วันที่อ้างอิง (อายุหนี้)</span><b>${thD(m.asof)}</b></div></div>
      <div class="card accent ${bad.length ? 'warn' : ''} mini"><h3>ผลการตรวจและกระทบยอด</h3><div class="row"><span>ผ่าน</span><b class="num">${nf(m.checks.length - bad.length)} จาก ${nf(m.checks.length)} ข้อ</b></div>${bad.map(c => `<div class="row"><span>${esc(c.name)}</span><b style="white-space:normal;text-align:right;color:var(--warn)">${esc(c.detail)}</b></div>`).join('')}</div>
      <div class="card accent mini"><h3>ไฟล์ OM</h3>${o ? `<div class="row"><span>ไฟล์</span><b style="white-space:normal;text-align:right">${esc(o.source.file)}</b></div><div class="row"><span>นำเข้า</span><b>${thT(o.source.imported_at)} · rev ${o.source.revision}</b></div><div class="row"><span>จำนวนค่า / ตาราง</span><b class="num">${nf(o.series.length)} / ${nf(o.blocks.length)}</b></div><div class="row"><span>ข้อมูลถึง</span><b>${TH[M.om(S).last('volume', 'actual', 2026) - 1]} 2569</b></div><div class="row"><span>sha256</span><b>${esc(o.source.sha256.slice(0, 16))}…</b></div>` : NA()}</div></div>
    <section class="card"><div class="head"><div><h2>ชุดข้อมูล</h2><p class="sub">จำนวนแถว/เอกสาร วันที่เอกสารล่าสุด และความครบถ้วนของแต่ละชุด</p></div></div><div class="tbl-wrap"><table><thead><tr><th>ชุดข้อมูล</th><th>เครื่องมือ (อ่านอย่างเดียว)</th><th class="r">คำขอ</th><th class="r">แถว</th><th class="r">เอกสาร</th><th>เอกสารล่าสุด</th><th>ดึงเมื่อ</th><th>ครบถ้วน</th><th>หมายเหตุ</th></tr></thead><tbody>
      ${m.datasets.map(d => `<tr><td>${esc(d.label)}</td><td>${esc(d.tools.join(', '))}</td><td class="r num">${d.calls}</td><td class="r num">${nf(d.rows)}</td><td class="r num">${d.docs == null ? '–' : nf(d.docs)}</td><td>${d.last_doc_date ? thDs(d.last_doc_date) : '–'}</td><td>${d.fetched_at ? d.fetched_at.slice(11, 16) + ' น.' : '–'}</td><td>${d.complete ? 'ครบ' : '<span class="tag wait">ตรวจสอบ</span>'}</td><td>${esc(d.note)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><div class="head"><div><h2>ผลการตรวจทั้งหมด</h2></div></div><div class="tbl-wrap"><table><thead><tr><th>การตรวจ</th><th>ผล</th><th>รายละเอียด</th></tr></thead><tbody>${m.checks.map(c => `<tr><td>${esc(c.name)}</td><td>${c.ok ? 'ผ่าน' : '<span class="tag wait">ต้องตรวจสอบ</span>'}</td><td>${esc(c.detail)}</td></tr>`).join('')}</tbody></table></div></section>
    <div class="grid g2"><section class="card"><div class="head"><div><h2>ข้อมูลที่ขาดและข้อจำกัดสิทธิ์</h2></div></div><div class="tbl-wrap"><table><tbody>${m.limits.map(l => `<tr><td style="white-space:nowrap"><b style="font-weight:600;color:var(--navy)">${esc(l.topic)}</b></td><td>${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><div class="head"><div><h2>Mapping พื้นที่</h2><p class="sub">department (TRCLOUD) ↔ รหัสพื้นที่ในไฟล์ OM · อนุมานจากชื่อ รอ OM ยืนยัน</p></div></div><div class="tbl-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อใน TRCLOUD</th><th>ประเภท</th><th>รหัส OM</th><th>เฟส</th><th>สถานะ</th></tr></thead><tbody>${ar.map(a => `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td>${a.kind === 'site' ? 'พื้นที่ปฏิบัติการ' : 'ส่วนงานบริหาร'}</td><td>${a.om_site ? esc(a.om_site) : a.kind === 'site' ? '<span class="tag wait">map ไม่ได้</span>' : '–'}</td><td>${esc(a.phase || '–')}</td><td>${a.kind !== 'site' ? '–' : a.confirmed ? 'ยืนยันแล้ว' : '<span class="tag wait">รอยืนยัน</span>'}</td></tr>`).join('')}</tbody></table></div></section></div>
    <section class="card"><div class="head"><div><h2>นิยามและสูตร KPI</h2></div></div><div class="tbl-wrap"><table><tbody>${defs.map(d => `<tr><td style="white-space:nowrap"><b style="font-weight:600;color:var(--navy)">${d[0]}</b></td><td>${d[1]}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ---------- โครงหน้า ---------- */
  function header() {
    const m = S.meta, ms = M.months(S), lastBl = S.bl_lines.reduce((a, l) => l.date > a ? l.date : a, '');
    const asofTxt = thD(m.asof), cmp = M.compareMonth(S, st.ym, F());
    $('#filters').innerHTML = `<label>ปี<select id="f-y" aria-label="ปี"><option>${+m.asof.slice(0, 4) + 543}</option></select></label>
      <label>เดือน<select id="f-m">${ms.map(x => `<option value="${x}" ${x === st.ym ? 'selected' : ''}>${TH[+x.slice(5) - 1]}${x === m.asof.slice(0, 7) ? ' (บางเดือน)' : ''}</option>`).join('')}</select></label>
      <label class="grow">พื้นที่<select id="f-u"><option value="">ทุกพื้นที่</option>${M.unitOptions(S).map(u => `<option value="${u[0]}" ${u[0] === st.unit ? 'selected' : ''}>${esc(u[1])}</option>`).join('')}</select></label>
      <button class="btn no-print" id="f-r" ${st.unit || st.ym !== m.asof.slice(0, 7) ? '' : 'disabled'}>ล้างตัวกรอง</button>
      <button class="btn primary no-print" id="f-p">พิมพ์ / บันทึก PDF</button>
      <div class="hint">ช่วงที่เลือก ${thDs(cmp.from)} – ${thDs(cmp.to)}${cmp.partial ? ' (ข้อมูลบางเดือน)' : ''} · ${cmp.prev ? 'เทียบกับ ' + thDs(cmp.pfrom) + ' – ' + thDs(cmp.pto) + (cmp.partial ? ' (ช่วงวันเท่ากันของเดือนก่อน)' : '') : 'ไม่มีเดือนก่อนในชุดข้อมูล'} · พื้นที่: ${esc(st.unit ? M.unitLabel(st.unit, areas()) : 'ทุกพื้นที่')} · วันที่อ้างอิงลูกหนี้/เจ้าหนี้ ${asofTxt}</div>`;
    $('#f-m').onchange = e => { st.ym = e.target.value; render(false); }; $('#f-u').onchange = e => { st.unit = e.target.value; render(false); }; $('#f-p').onclick = () => window.print();
    $('#f-r').onclick = () => { st.unit = ''; st.ym = m.asof.slice(0, 7); render(false); };
    const pg = (PAGES.filter(p => p[0] === st.page)[0] || PAGES[0])[1];
    $('#ptitle').textContent = pg + (['exec', 'billing'].indexOf(st.page) >= 0 ? ' · ' + thM(st.ym) : '');
    $('#psub').textContent = 'SAM WATER SUPPLY · ' + (st.page === 'ops' ? 'ข้อมูลการเดินระบบจากไฟล์ OM' : st.page === 'data' ? 'สำหรับผู้ตรวจสอบข้อมูล' : 'ข้อมูลเอกสารบัญชีจาก TRCLOUD');
    $('#status').innerHTML = `<span class="chip"><span class="dot"></span>Snapshot — ไม่ใช่ข้อมูลสด</span><span class="chip plain">ดึงจาก TRCLOUD ${thT(m.fetched_to)}</span><span class="chip plain">BL ล่าสุด ${thDs(lastBl)}</span><span class="chip plain">วันที่อ้างอิง ${thDs(m.asof)}</span>${S.om ? `<span class="chip plain">ไฟล์ OM ถึง ${TH[M.om(S).last('volume', 'actual', 2026) - 1]} ${String(2569).slice(2)}</span>` : ''}<span class="chip warn">ข้อมูลบางส่วน: ยังไม่มีงบการเงิน สัญญา และคุณภาพน้ำ</span>`;
    $('#tabs').innerHTML = PAGES.map(p => `<a href="#/${p[0]}" ${p[0] === st.page ? 'aria-current="page"' : ''}>${p[1]}</a>`).join('');
    $('#foot').innerHTML = `ใช้ภายในเพื่อการตรวจรับ · ข้อมูลการเงินของบริษัท ห้ามเผยแพร่ · สร้าง snapshot ${thT(m.built_at)} · ไม่มีปุ่มรีเฟรชเพราะระบบอ่านจาก snapshot — อัปเดตข้อมูลตาม README`;
  }
  function render(anim) {
    document.body.classList.toggle('no-anim', anim === false);
    DR = []; TB = []; try { sessionStorage.setItem('sam-st', JSON.stringify(st)); } catch (e) { /* ไม่มี storage ก็ใช้งานได้ */ }
    header();
    const fn = { exec: pExec, billing: pBilling, recv: pRecv, pay: pPay, ops: pOps, contract: pContract, data: pData }[st.page] || pExec, main = $('#main');
    try { main.innerHTML = fn(); } catch (e) { console.error(e); main.innerHTML = `<div class="state err">แสดงหน้านี้ไม่สำเร็จ: ${esc(e.message)}</div>`; return; }
    main.querySelectorAll('[data-table]').forEach(el => mountTable(el, TB[+el.dataset.table]));
    document.title = 'SAM Executive Snapshot · ' + (PAGES.filter(p => p[0] === st.page)[0] || PAGES[0])[1];
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-drill]'); if (t) { e.preventDefault(); DR[+t.dataset.drill](); } else if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-drill], g[data-drill]')) { e.preventDefault(); DR[+e.target.dataset.drill](); } });
  window.addEventListener('hashchange', () => { const p = location.hash.replace('#/', ''); if (PAGES.some(x => x[0] === p) && p !== st.page) { st.page = p; render(true); window.scrollTo(0, 0); } });
  /* ---------- ธีม: อัตโนมัติ (ตามระบบ) / สว่าง / มืด ---------- */
  function setTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('sam-theme', t); } catch (e) { /* ใช้ค่าในหน้านี้อย่างเดียว */ }
    document.querySelectorAll('#theme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  }
  let theme = 'auto'; try { theme = localStorage.getItem('sam-theme') || 'auto'; } catch (e) { /* ค่าเริ่มต้น */ }
  setTheme(theme);
  document.querySelectorAll('#theme button').forEach(b => b.onclick = () => setTheme(b.dataset.t));

  /* ---------- เริ่มทำงาน: เว็บจริงรับข้อมูลที่ถอดรหัสแล้วจาก gate.js (เข้าสู่ระบบ M365) · ในเครื่องอ่าน data/snapshot.json ---------- */
  function start(d) {
    S = d; if (!S || !S.bl_lines || !S.bl_lines.length) { $('#main').innerHTML = '<div class="state">snapshot ไม่มีข้อมูล BL — ตรวจการนำเข้าข้อมูล</div>'; return; }
    try { Object.assign(st, JSON.parse(sessionStorage.getItem('sam-st') || '{}')); } catch (e) { /* ใช้ค่าเริ่มต้น */ }
    const hp = location.hash.replace('#/', ''); if (PAGES.some(x => x[0] === hp)) st.page = hp;
    if (!st.ym || M.months(S).indexOf(st.ym) < 0) st.ym = S.meta.asof.slice(0, 7);
    window.SAM = { snap: S, state: st }; render(true);
  }
  window.DASHApp = { start: start };
  if (!window.DASH_STATIC) {
    fetch('../data/snapshot.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(start)
      .catch(e => { $('#main').innerHTML = `<div class="state err">โหลด data/snapshot.json ไม่สำเร็จ (${esc(e.message)}) — โหมดทดสอบในเครื่อง: รัน <code>node scripts/serve.js</code> แล้วเปิด http://127.0.0.1:8090/web/ · เว็บใช้งานจริงอยู่บน GitHub Pages (เข้าสู่ระบบด้วย Microsoft 365)</div>`; });
  }
})();
