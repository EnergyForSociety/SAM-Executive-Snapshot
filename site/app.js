/* SAM Executive Snapshot — ส่วนแสดงผล (อ่าน data/snapshot.json ที่สร้างจาก scripts/build_snapshot.py)
   ตัวเลขทุกตัวคำนวณจาก web/metrics.js ด้วยตัวกรองชุดเดียวกัน · ไม่มีการเรียกบริการภายนอก */
(function () {
  'use strict';
  const M = window.SAMM, $ = (s, r) => (r || document).querySelector(s);
  let S = null, st = { page: 'exec', ym: null, unit: '' }, DR = [], TB = [];
  const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const PAGES = [['exec', 'Executive Snapshot'], ['billing', 'ยอดเรียกเก็บและพื้นที่'], ['recv', 'ลูกหนี้และการรับชำระ'], ['pay', 'เจ้าหนี้และภาระจัดซื้อ'], ['ops', 'การผลิตและสารเคมี'], ['maint', 'Maintenance Snapshot'], ['data', 'สถานะข้อมูล']];
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
        <div class="tbl-wrap"><table ${spec.minw ? `style="min-width:${spec.minw}px"` : ''}><thead><tr>${spec.cols.map(c => `<th class="sortable ${c.r ? 'r' : ''}" data-s="${c.k}">${esc(c.label)}${v.sort === c.k ? (v.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
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

  /* ---------- ต้นทุนจาก PO และใบงานแจ้งซ่อม ---------- */
  const GC = { chem: 'var(--chem)', maint: 'var(--bar1)', capex: 'var(--bar2)', facility: 'var(--bar3)', service: 'var(--sky)', other: 'var(--na)' };
  const gName = g => (S.cost_groups || {})[g] || g;
  const accName = a => a ? a + ' ' + ((S.coa || {})[a] || '') : '(หมวดสินค้า)';
  const poNote = 'มูลค่า PO ก่อน VAT ตามวันที่ออก PO (ไม่รวม PO ยกเลิก) — เป็นมูลค่าสั่งซื้อ ไม่ใช่ค่าใช้จ่ายที่รับรู้ตามงวดบัญชี';
  const poLineTable = (title, rows, sub) => ({ title, sub: (sub ? sub + ' · ' : '') + poNote, file: 'SAM_PO_lines', sort: 'date', dir: -1, rows, minw: 1300, total: a => ({ amt: M.sum(a, r => r.amt) }),
    filters: [{ k: 'grp', label: 'กลุ่มต้นทุน', get: r => gName(r.grp) }, { k: 'dept', label: 'พื้นที่', get: r => (areas()[r.dept] || {}).name || r.dept || '(ไม่ระบุ)' }],
    cols: [{ k: 'date', label: 'วันที่ PO', fmt: r => thDs(r.date) }, { k: 'doc', label: 'เลขที่ PO' }, { k: 'dept', label: 'พื้นที่/หน่วยงาน', fmt: r => esc((areas()[r.dept] || {}).name || r.dept || '(ไม่ระบุ)'), csv: r => (areas()[r.dept] || {}).name || r.dept },
      { k: 'grp', label: 'กลุ่มต้นทุน', fmt: r => esc(gName(r.grp)), csv: r => gName(r.grp) }, { k: 'acc', label: 'บัญชี/รหัสสินค้า', fmt: r => esc(r.acc ? accName(r.acc) : r.pid), csv: r => r.acc || r.pid },
      { k: 'name', label: 'รายการ' }, { k: 'vendor', label: 'ผู้ขาย' }, { k: 'qty', label: 'จำนวน', r: 1, fmt: r => nf(+r.qty, +r.qty % 1 ? 2 : 0) + ' ' + esc(r.unit || ''), sortv: r => +r.qty }, { k: 'amt', label: 'มูลค่าก่อน VAT (บาท)', r: 1, money: 1 }, { k: 'status', label: 'สถานะ PO' }] });
  const woState = r => r.state === 'done' ? 'ปิดงานแล้ว' : r.state === 'rejected' ? 'ถูกปฏิเสธ' : 'ค้าง';
  const slaTxt = r => !r.sla_h ? NA('ไม่ระบุ SLA') : r.state === 'done' ? (r.min_done <= r.sla_h * 60 ? 'ทัน' : '<span class="tag wait">เกิน SLA</span>') : r.state === 'open' ? (M.woAgeDays(r, S.meta.asof) * 24 > r.sla_h ? '<span class="tag sev">เกิน SLA</span>' : 'ยังอยู่ใน SLA') : '–';
  const siteName = r => r.site ? ((areas()[M.siteDept(r.site, areas())] || {}).name || r.site) + ' · ' + r.site : '(ระบุพื้นที่ไม่ได้)';
  const woTable = (title, rows, sub) => ({ title, sub: (sub ? sub + ' · ' : '') + 'ที่มา: ไฟล์ใบงานแจ้งซ่อม ' + (S.maint ? S.maint.source.file : ''), file: 'SAM_work_orders', sort: 'reported', dir: -1, rows, minw: 1500,
    filters: [{ k: 'state', label: 'สถานะ', get: woState }, { k: 'mtype', label: 'ประเภทเครื่องจักร' }],
    cols: [{ k: 'wo', label: 'เลขที่ใบงาน' }, { k: 'reported', label: 'วันที่แจ้ง', fmt: r => thDs(r.reported.slice(0, 10)) }, { k: 'site', label: 'พื้นที่', fmt: r => esc(siteName(r)), csv: siteName },
      { k: 'machine', label: 'เครื่องจักร', fmt: r => esc(r.machine) + (r.qr ? '<br><span class="note">' + esc(r.qr) + '</span>' : ''), csv: r => r.machine + ' [' + r.qr + ']' }, { k: 'mtype', label: 'ประเภท' },
      { k: 'symptom', label: 'อาการเสีย', fmt: r => esc(r.symptom.length > 110 ? r.symptom.slice(0, 110) + '…' : r.symptom), csv: r => r.symptom }, { k: 'fdesc', label: 'รหัสอาการเสีย', fmt: r => esc(r.fcode ? r.fcode + ' ' + r.fdesc : '–'), csv: r => r.fcode + ' ' + r.fdesc },
      { k: 'rdesc', label: 'การซ่อม', fmt: r => esc(r.rcode ? r.rcode + ' ' + r.rdesc : '–'), csv: r => r.rcode + ' ' + r.rdesc }, { k: 'urgency', label: 'ความด่วน' },
      { k: 'state', label: 'สถานะ', fmt: r => esc(r.status), csv: r => r.status }, { k: 'age', label: 'วันนับจากแจ้ง', r: 1, fmt: r => r.state === 'open' ? nf(M.woAgeDays(r, S.meta.asof)) : r.min_done !== null ? nf(r.min_done / 1440, 1) + ' (เสร็จ)' : '–', sortv: r => r.state === 'open' ? M.woAgeDays(r, S.meta.asof) : r.min_done !== null ? r.min_done / 1440 : -1, csv: r => r.state === 'open' ? M.woAgeDays(r, S.meta.asof) : r.min_done !== null ? (r.min_done / 1440).toFixed(2) : '' },
      { k: 'sla', label: 'SLA', fmt: slaTxt, csv: r => r.sla_h ? r.sla_h + ' ชม.' : '' }] });
  /* ปริมาณน้ำรับจริงจากไฟล์ OM ตามตัวกรองพื้นที่ (null = ไม่มีข้อมูลหรือพื้นที่ไม่มีปริมาณน้ำ) */
  function omVol(y, m, unit) {
    const o = M.om(S); if (!o) return null;
    if (!unit) return o.total('volume', 'actual', y, m); if (unit === 'P12') return o.total('volume', 'actual', y, m, 'Phase 1&2'); if (unit === 'OTHER') return null;
    const a = areas()[unit]; return a && a.om_site ? o.get('volume', 'actual', y, m, a.om_site) : null;
  }
  /* สารเคมีต่อปริมาณน้ำ: PO สารเคมีสะสม ÷ ปริมาณน้ำรับจริงสะสม ในเดือนที่มีข้อมูล OM ครบทั้งสองฝั่ง */
  function chemPerM3(unit, toM) {
    const o = M.om(S); if (!o) return null; const last = Math.min(o.last('volume', 'actual', 2026), toM); if (!last) return null;
    let c = 0, v = 0; for (let i = 1; i <= last; i++) { const ym = '2026-' + String(i).padStart(2, '0'), vol = omVol(2026, i, unit); if (vol === null) continue; v += vol; c += M.sum(M.poSelect(S, { from: ym + '-01', to: M.monthEnd(ym), grp: 'chem', unit }), l => l.amt); }
    return v ? { chem: c, vol: v, rate: c / 100 / v, last } : null;
  }
  function stackChart(series, keys, onClick, title) {
    const W = 760, H = 290, L = 46, R = 10, T = 24, Bm = 40, iw = W - L - R, ih = H - T - Bm;
    const tot = s => M.sum(keys, k => Math.max(0, s.g[k.k] || 0)), mx = Math.max(1, ...series.map(tot)), step = niceStep(mx / 100 / 4), top = step * 4 * 100, bw = iw / Math.max(1, series.length), y = v => T + ih - v / top * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = step * i * 100; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${nf(v / 1e8, step * 4 < 1e6 ? 2 : 1)}</text>`; }
    series.forEach((s, i) => {
      const x = L + i * bw + bw * .18, w = bw * .64, sel = s.ym === st.ym; let base = 0, rects = '';
      keys.forEach((k, j) => { const v = Math.max(0, s.g[k.k] || 0); if (!v) return; rects += `<rect x="${x}" y="${y(base + v)}" width="${w}" height="${Math.max(0, y(base) - y(base + v))}" class="gy" style="fill:${k.c};animation-delay:${(.2 + i * .04 + j * .02).toFixed(2)}s"><title>${esc(k.label)} ${thM(s.ym)}: ${B(v)} บาท</title></rect>`; base += v; });
      g += `<g class="hit" ${drill(() => onClick(s))} tabindex="0" role="button" aria-label="${thM(s.ym)} รวม ${MB(base)}"><rect class="bg" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih + 30}" style="fill:${sel ? 'var(--sel)' : 'transparent'}"/>${rects}
        ${base ? `<text class="fade" x="${x + w / 2}" y="${y(base) - 6}" text-anchor="middle" font-size="11" font-weight="600" style="fill:var(--navy)">${nf(base / 1e8, 2)}</text>` : ''}
        <text x="${x + w / 2}" y="${H - Bm + 18}" text-anchor="middle" font-size="12" style="fill:${sel ? 'var(--navy)' : 'var(--muted)'}" font-weight="${sel ? 600 : 400}">${TH[+s.ym.slice(5) - 1]}</text></g>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '')}"><text x="${L - 40}" y="13" font-size="11" style="fill:var(--muted)">ล้านบาท</text>${g}</svg><div class="legend">${keys.map(k => `<span><i style="background:${k.c}"></i>${esc(k.label)}</span>`).join('')}</div>`;
  }
  const goPage = p => () => { location.hash = '#/' + p; };
  /* ราคาและปริมาณตามเอกสาร BL ล่าสุดของแต่ละหมวด — คำนวณจากข้อมูล ไม่ฝังตัวเลขในโค้ด */
  function facts() {
    const last = cat => S.bl_lines.filter(l => l.cat === cat).sort((a, b) => a.date < b.date ? 1 : -1)[0] || null;
    const med = cat => M.median(S.bl_lines.filter(l => l.cat === cat).map(l => +l.price));
    const p12 = last('svc_p12'), dd = last('ded_pretreat');
    return { p12, dd, p3price: med('svc_p3'), net12: p12 && dd ? p12.amt + dd.amt : null, codes: [...new Set(S.bl_lines.filter(l => l.cat === 'ded_pretreat').map(l => l.pid))] };
  }
  /* สารเคมีต่อปริมาณน้ำรายพื้นที่: PO สารเคมีตาม department ÷ ปริมาณน้ำรับจริงตามรหัสพื้นที่ OM (เดือน ม.ค. ถึงเดือนล่าสุดของไฟล์ OM) */
  function chemSites() {
    const o = M.om(S); if (!o) return { rows: [], last: 0, total: null }; const last = o.last('volume', 'actual', 2026);
    const rows = S.areas.filter(a => a.om_site).map(a => { let c = 0, v = 0; for (let i = 1; i <= last; i++) { const ym = '2026-' + String(i).padStart(2, '0'), vol = o.get('volume', 'actual', 2026, i, a.om_site); if (vol === null) continue; v += vol; c += M.sum(M.poSelect(S, { from: ym + '-01', to: M.monthEnd(ym), grp: 'chem' }).filter(l => l.dept === a.code), l => l.amt); }
      return { code: a.code, name: a.name, site: a.om_site, phase: a.phase, chem: c, vol: v, rate: v && c ? c / 100 / v : null }; }).filter(r => r.rate !== null).sort((a, b) => b.rate - a.rate);
    return { rows, last, total: chemPerM3('', last) };
  }
  const chemSiteTable = cs => ({ title: 'สารเคมีต่อปริมาณน้ำรายพื้นที่ · ม.ค.–' + TH[cs.last - 1] + ' 2569', sub: 'PO สารเคมี (หมวด RM) ก่อน VAT ตาม department ÷ ปริมาณน้ำรับจริงตามไฟล์ OM · PO คือการสั่งซื้อ ไม่ใช่ปริมาณที่ใช้จริง', file: 'SAM_chem_per_m3', sort: 'rate', dir: -1, rows: cs.rows,
    cols: [{ k: 'name', label: 'พื้นที่' }, { k: 'site', label: 'รหัส OM' }, { k: 'phase', label: 'เฟส' }, { k: 'chem', label: 'PO สารเคมี (บาท)', r: 1, money: 1 }, { k: 'vol', label: 'ปริมาณน้ำรับจริง (ลบ.ม.)', r: 1, fmt: r => nf(r.vol) }, { k: 'rate', label: 'บาท/ลบ.ม.', r: 1, fmt: r => nf(r.rate, 3), csv: r => r.rate.toFixed(4) }] });
  /* Insight งานซ่อมบำรุงจากใบงาน + PO */
  function maintInsights() {
    if (!S.maint) return []; const asof = S.meta.asof, all = M.woSelect(S, {}), y0 = asof.slice(0, 4) + '-01-01', ytd = M.woSelect(S, { from: y0, to: asof }), stt = M.woStats(ytd, asof), out = [];
    const rep = M.countBy(all.filter(r => r.qr && r.state !== 'rejected'), r => r.qr).filter(x => x.n >= 3), repRows = all.filter(r => rep.some(x => x.k === r.qr));
    const mt = M.countBy(ytd.filter(r => r.state !== 'rejected'), r => r.mtype), top3 = mt.slice(0, 3), t3n = M.sum(top3, x => x.n), base = ytd.filter(r => r.state !== 'rejected').length;
    if (top3.length) out.push({ warn: rep.length > 0, title: `งานซ่อม ${nf(t3n / base * 100, 0)}% อยู่ใน ${top3.length} ประเภทเครื่องจักร` + (rep.length ? ` และมี ${nf(rep.length)} เครื่องที่เสียซ้ำ` : ''), find: `ใบงานปี 2569 ${nf(base)} รายการ (ไม่นับที่ถูกปฏิเสธ) เป็น ${top3.map(x => x.k + ' ' + nf(x.n)).join(' · ')} รวม ${nf(t3n / base * 100, 0)}% · เครื่องจักร (QR) ที่แจ้งซ่อม ≥ 3 ครั้งในไฟล์ ${nf(rep.length)} เครื่อง`,
      nums: `อาการเสียที่พบบ่อย: ${M.countBy(ytd, r => r.fdesc).slice(0, 3).map(x => x.k + ' ' + nf(x.n)).join(' · ')} · วิธีซ่อม: ${M.countBy(ytd, r => r.rdesc).slice(0, 2).map(x => x.k + ' ' + nf(x.n)).join(' · ')}`,
      impact: 'การเสียซ้ำของเครื่องเดิมหมายถึงค่าอะไหล่และเวลาซ่อมที่เกิดซ้ำ และเสี่ยงต่อการผลิตน้ำไม่ได้ตามแผน', act: 'ทำ Root cause และแผน PM สำหรับเครื่องที่เสียซ้ำ — พิจารณาเปลี่ยนวัสดุ/สเปกวาล์วและข้อต่อที่รั่วซึมบ่อย',
      caveat: 'ทุกใบงานบันทึกสถานะเครื่องจักร "ยังใช้งานได้" และไลน์ "ผลิตอยู่" จึงยังวัด Downtime จากไฟล์นี้ไม่ได้', ev: ['ดูใบงานของเครื่องที่เสียซ้ำ', () => openTable(woTable('ใบงานของเครื่องจักรที่แจ้งซ่อม ≥ 3 ครั้ง', repRows, 'ทุกช่วงในไฟล์'))] });
    if (stt.slaN) out.push({ warn: stt.openOver.length > 0, title: (stt.slaPct < 50 ? 'ปิดงานทัน SLA ได้น้อยกว่าครึ่ง' : `ปิดงานทัน SLA ${nf(stt.slaPct, 0)}%`) + (stt.openOver.length ? ' และมีใบงานค้างเกิน SLA ' + nf(stt.openOver.length) + ' รายการ' : ''), find: `ใบงานปี 2569 ที่ปิดแล้วและมี SLA ${nf(stt.slaN)} รายการ ทัน SLA ${nf(stt.slaOk)} รายการ (${nf(stt.slaPct, 0)}%) · ค้างอยู่ ${nf(stt.open)} รายการ เกิน SLA แล้ว ${nf(stt.openOver.length)} รายการ`,
      nums: `ค่ากลางเวลาแจ้ง→มอบหมาย ${stt.medAssignH !== null ? nf(stt.medAssignH, 1) + ' ชม.' : '–'} · แจ้ง→ซ่อมเสร็จ ${stt.medDoneD !== null ? nf(stt.medDoneD, 1) + ' วัน' : '–'} · ใบงานที่ไม่ระบุ SLA ${nf(stt.noSla)} รายการไม่นับ`,
      impact: 'งานที่ค้างนานเพิ่มความเสี่ยงต่อคุณภาพน้ำและปริมาณส่งมอบ', act: 'ทบทวนใบงานค้างเกิน SLA รายสัปดาห์ และแยกสาเหตุ (รออะไหล่/รอจัดซื้อ/รอผู้รับเหมา) ในระบบแจ้งซ่อม',
      caveat: 'เวลา "แจ้ง→ซ่อมเสร็จ" รวมเวลารออะไหล่และจัดซื้อ · SLA อ่านจากข้อความระดับความด่วนในใบงาน', ev: ['ดูใบงานค้าง', () => openTable(woTable('ใบงานที่ยังค้าง', M.woStats(all, asof).openRows, 'ณ ' + thD(asof)))] });
    const mx = M.woMatches(S, ytd), po = M.poSelect(S, { from: y0, to: asof, grp: ['maint', 'capex'] });
    out.push({ title: 'ค่าซ่อมจาก PO ยังผูกกับใบงานแจ้งซ่อมไม่ได้', find: `PO ซ่อมบำรุงและสินทรัพย์ปี 2569 ${nf(po.length)} บรรทัด ${MB(M.sum(po, l => l.amt))} ไม่มีเลขที่ใบงาน และใบงานไม่มีเลขที่ PR/PO — จับคู่ที่เป็นไปได้ (พื้นที่ + ช่วงวันที่ + คำสำคัญอุปกรณ์) ได้ ${nf(mx.length)} ใบงาน`,
      nums: `ใบงานปี 2569 ที่ระบุพื้นที่ได้ ${nf(ytd.filter(r => r.site).length)} จาก ${nf(ytd.length)} รายการ · ใบงานที่ "เปลี่ยนอะไหล่" ${nf(ytd.filter(r => r.rcode === 'RC01').length)} รายการ`,
      impact: 'ยังตอบไม่ได้ว่าค่าซ่อมแต่ละบาทเกิดจากเครื่องจักรใด ทำให้วัดต้นทุนซ่อมต่อเครื่องและตัดสินใจซ่อม/เปลี่ยนไม่ได้', act: 'เพิ่มช่องเลขที่ PR/PO ในระบบแจ้งซ่อม และให้ผู้ขอซื้อใส่เลขที่ใบงานในหมายเหตุ PR (invoice_note) ทุกครั้ง',
      caveat: 'ผลการจับคู่ในหน้านี้เป็น "จับคู่ที่เป็นไปได้ (รอยืนยัน)" เท่านั้น ห้ามใช้เป็นต้นทุนจริงของใบงาน', ev: ['ดูคู่ที่เป็นไปได้', () => openTable(matchTable(mx))] });
    return out;
  }
  const matchTable = mx => ({ title: 'ใบงาน ↔ PO: จับคู่ที่เป็นไปได้ (รอยืนยัน)', sub: 'เกณฑ์: พื้นที่เดียวกัน · PO ออกภายใน 7 วันก่อนถึง 60 วันหลังวันแจ้ง · มีคำสำคัญอุปกรณ์ร่วมกัน · แสดงสูงสุด 3 PO ต่อใบงาน — ไม่ใช่การยืนยันต้นทุนจริง', file: 'SAM_wo_po_candidates', sort: 'reported', dir: -1, minw: 1600,
    rows: [].concat(...mx.map(x => x.cands.map((c, i) => ({ wo: x.wo.wo, reported: x.wo.reported.slice(0, 10), site: x.wo.site, machine: x.wo.machine, symptom: x.wo.symptom, rank: i + 1, po: c.l.doc, po_date: c.l.date, item: c.l.name, grp: c.l.grp, amt: c.l.amt, hit: c.hit.join(', '), gap: c.gap })))),
    cols: [{ k: 'wo', label: 'เลขที่ใบงาน' }, { k: 'reported', label: 'วันที่แจ้ง', fmt: r => thDs(r.reported) }, { k: 'site', label: 'พื้นที่' }, { k: 'machine', label: 'เครื่องจักร' }, { k: 'symptom', label: 'อาการเสีย', fmt: r => esc(r.symptom.slice(0, 90) + (r.symptom.length > 90 ? '…' : '')), csv: r => r.symptom },
      { k: 'rank', label: 'ลำดับ', r: 1 }, { k: 'po', label: 'เลขที่ PO' }, { k: 'po_date', label: 'วันที่ PO', fmt: r => thDs(r.po_date) + ' (' + (r.gap >= 0 ? '+' : '') + r.gap + ' วัน)', csv: r => r.po_date }, { k: 'item', label: 'รายการใน PO' }, { k: 'grp', label: 'กลุ่ม', fmt: r => esc(gName(r.grp)), csv: r => gName(r.grp) },
      { k: 'amt', label: 'มูลค่าก่อน VAT (บาท)', r: 1, money: 1 }, { k: 'hit', label: 'คำสำคัญที่ตรงกัน' }, { k: 'state', label: 'สถานะ', fmt: () => '<span class="tag wait">รอยืนยัน</span>', csv: () => 'รอยืนยัน' }] });
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
      if (ch !== null && ch < -15) out.push({ id: 'p3', warn: 1, title: 'ยอดเรียกเก็บเฟส 3 ลดลงต่อเนื่องตั้งแต่ไตรมาส 3', find: `BL เฟส 3 ที่ออกใน ${thM(last.ym)} รวม ${MB(last.p3)} ต่ำกว่าค่าเฉลี่ย ม.ค.–มิ.ย. (${MB(avg)}/เดือน) ${nf(Math.abs(ch), 0)}%`,
        nums: `ช่วงวันที่ออกเอกสาร ${thM(mon[0].ym)} – ${thM(last.ym)} · เฟส 3 คิดตามปริมาณรายสัปดาห์${fx.p3price ? ' (ราคากลาง ' + nf(fx.p3price, 2) + ' บาท/หน่วยตามเอกสาร)' : ''}` + vol, impact: 'รายรับส่วนที่ผันตามปริมาณลดลง ขณะที่เฟส 1&2 เรียกเก็บรวมคงที่' + (fx.p12 ? ' ' + MB(fx.p12.amt) + '/เดือนก่อนรายการหัก' : ''),
        act: 'ให้ OM ยืนยันสาเหตุรายฟาร์ม (หยุดฟาร์ม/รับน้ำน้อย/เหตุฝั่งระบบ) และตรวจเงื่อนไขปริมาณขั้นต่ำของเฟส 3 ในสัญญา', caveat: 'ยังไม่มีหลักฐานสาเหตุของปริมาณที่ลดลง และยังไม่มีเอกสารสัญญายืนยันว่าเฟส 3 มีข้อผูกพันขั้นต่ำหรือไม่ — ระบบจึงไม่สรุปสาเหตุหรือค่าปรับ',
        ev: ['ดู BL เฟส 3 ทั้งปี', () => openTable(linesTable('BL เฟส 3 ปี ' + (+asof.slice(0, 4) + 543), M.selectLines(S, { from: y0, to: asof, cat: 'svc_p3' }), 'ตามวันที่ออกเอกสาร'))] });
    }
    // 2) การกระจุกตัวของลูกค้า
    const cc = M.concentration(ytd);
    if (cc.top && cc.top.share > 80) out.push({ id: 'conc', title: 'ยอดเรียกเก็บเกือบทั้งหมดมาจากลูกค้ารายเดียว', find: `${nf(cc.top.share, 2)}% ของยอดเรียกเก็บสุทธิก่อน VAT สะสมปีอยู่ในชื่อ ${cc.top.name}`, nums: `${MB(cc.top.amt)} จาก ${MB(cc.total)} · BL วันที่ออก ${thDs(y0)} – ${thDs(asof)}`,
      impact: 'ผลประกอบการขึ้นกับสัญญาและแผนการเลี้ยงของคู่สัญญารายเดียว', act: 'ติดตามกำหนดสัญญา/การต่ออายุรายพื้นที่ (ยังไม่มีทะเบียนสัญญาในระบบ)', caveat: 'จัดกลุ่มจากชื่อลูกค้าในเอกสาร ยังไม่ได้ผูกกับเลขสัญญา',
      ev: ['ดูยอดแยกลูกค้า', () => openTable({ title: 'ยอดเรียกเก็บสะสมปีแยกลูกค้า', sub: 'BL ก่อน VAT', file: 'SAM_customers', sort: 'amt', dir: -1, rows: cc.rows, cols: [{ k: 'name', label: 'ลูกค้า' }, { k: 'amt', label: 'ยอดก่อน VAT (บาท)', r: 1, money: 1 }, { k: 'share', label: 'สัดส่วน', r: 1, fmt: r => nf(r.share, 2) + '%', csv: r => r.share.toFixed(4) }] })] });
    // 3) รายการหัก Pre-Treatment
    const ded = yb.byCat.ded_pretreat || 0, p12 = yb.byCat.svc_p12 || 0, pc = yb.byCat.pretreat_charge || 0, codes = [...new Set(ytd.filter(l => l.cat === 'ded_pretreat').map(l => l.pid))];
    if (ded) out.push({ id: 'pre', warn: codes.length > 1, title: 'รายการหัก Pre-Treatment ลดยอดเรียกเก็บเฟส 1&2 ลงเกือบหนึ่งในห้า', find: `หัก Pre-Treatment สะสมปี ${MB(-ded)} = ${nf(-ded / p12 * 100, 1)}% ของค่าบริการเฟส 1&2 ก่อนหัก (${MB(p12)})`,
      nums: `${fx.dd ? 'BL ล่าสุดหัก ' + MB(-fx.dd.amt) + ' (' + nf(Math.abs(+fx.dd.price), 2) + ' บาท × ' + nf(+fx.dd.qty) + ' หน่วยตามเอกสาร) · ' : ''}มี BL "ค่า Pre Treament" เรียกเก็บแยกรายเดือนอีก ${MB(pc)} · รายการหักบันทึกใต้ ${codes.length} รหัส (${codes.join(', ')})`,
      impact: (fx.net12 !== null ? 'ยอดสุทธิเฟส 1&2 เหลือ ' + MB(fx.net12) + '/เดือนก่อน VAT · ' : '') + 'การใช้รหัสบัญชีต่างกันทำให้รายงานต้นทุน/รายได้ไม่สม่ำเสมอ', act: 'ให้ฝ่ายบัญชียืนยันลักษณะรายการ (ส่วนลดตามสัญญา / ต้นทุนที่ลูกค้ารับภาระ / อื่น) และใช้รหัสเดียว',
      caveat: 'ยังไม่มีหลักฐานว่ารายการนี้เป็นค่าปรับ — ระบบแสดงเป็น "รายการหัก" ตามชื่อในเอกสารเท่านั้น', ev: ['ดูบรรทัด Pre-Treatment', () => openTable(linesTable('บรรทัด Pre-Treatment ทั้งรายการหักและรายการเรียกเก็บ', ytd.filter(l => l.cat === 'ded_pretreat' || l.cat === 'pretreat_charge'), 'สะสมปี'))] });
    // 4) ลูกหนี้
    const rv = M.receivables(S);
    if (rv.iv.length || rv.open.length) {
      const od = rv.ivAging.buckets[5];
      out.push({ id: 'ar', warn: 1, title: 'IV ค้างรับช่วงต้นปียังไม่ถูกตัดชำระในระบบ', find: `IV ${nf(rv.iv.length)} ฉบับ รวม ${MB(rv.ivAging.total)} (ออก ม.ค.–ก.พ. 2569) ยังสถานะค้างรับ โดย ${nf(od.count)} ฉบับเกินกำหนดมากกว่า 90 วัน ขณะที่ IV ตั้งแต่ มี.ค. เป็นสถานะรับเงินแล้วทั้งหมด`,
        nums: `แยกจาก BL ปี 2569 ที่ยังไม่รับชำระ ${nf(rv.open.length)} ฉบับ ${MB(rv.openAging.total)} (เกินกำหนด ${MB(rv.openAging.overdue)}) และยอดยกมาปี 2568 ที่ยังเปิด ${nf(rv.openOld.length)} ฉบับ ${MB(rv.openOldTotal)} · ณ ${thDs(asof)}`,
        impact: 'ถ้าเป็นหนี้ค้างจริงคือเงินสดที่ยังไม่ได้รับ ถ้ารับแล้วแต่ไม่ได้ตัดชำระ ยอดลูกหนี้ในระบบสูงเกินจริง', act: 'ให้ฝ่ายบัญชีกระทบยอด IV กลุ่มนี้กับเงินรับในบัญชีธนาคาร และปิดรายการยกยอดปี 2568',
        caveat: 'ชุด IV ค้างรับกับชุด BL ที่ยังไม่รับชำระตรวจแล้วไม่ซ้ำเอกสารกัน แต่ยังไม่รวมเป็นยอดลูกหนี้เดียวจนกว่าจะกระทบยอดเสร็จ', ev: ['ดู IV ค้างรับ', () => openTable(recvTable('IV ค้างรับที่รอตรวจสอบการตัดชำระ', rv.iv, 'จาก get_receivable_due · ยอดหลังหัก WHT'))] });
    }
    // 5) เจ้าหนี้ใกล้ครบกำหนด
    const pv = M.payables(S), soon = pv.groups.today.concat(pv.groups.d7, pv.groups.d30), big = soon.slice().sort((a, b) => b.amount - a.amount)[0];
    if (soon.length) out.push({ id: 'pay', title: 'เจ้าหนี้ที่ครบกำหนดภายใน 30 วัน', find: `${nf(soon.length)} รายการ รวม ${MB(pv.totals.today + pv.totals.d7 + pv.totals.d30)}` + (big ? ` รายการใหญ่สุด ${big.vendor} ${MB(big.amount)} ครบกำหนด ${thDs(big.due)}` : ''),
      nums: `ครบกำหนดแล้ว ${nf(pv.groups.overdue.length)} รายการ ${MB(pv.totals.overdue)} · ณ ${thDs(asof)} · ยอดคงค้างหลังหัก WHT`, impact: 'ต้องเตรียมเงินจ่ายภายในสิ้นเดือน', act: 'ฝ่ายการเงินยืนยันแผนจ่ายและเอกสารประกอบของรายการใหญ่',
      caveat: pv.future.length ? `มีเอกสารลงวันที่อนาคต ${nf(pv.future.length)} รายการ (${MB(pv.totals.future)}) แยกไว้ไม่รวมในยอดนี้` : '', ev: ['ดูรายการ', () => openTable(payTable('เจ้าหนี้ครบกำหนดภายใน 30 วัน', soon, 'ณ ' + thD(asof)))] });
    // 6) สารเคมีต่อปริมาณน้ำรายพื้นที่ (PO ÷ OM)
    const cs = chemSites();
    if (cs.rows.length >= 3) {
      const hi = cs.rows[0], lo = cs.rows[cs.rows.length - 1], med = M.median(cs.rows.map(r => r.rate));
      out.push({ id: 'chem', title: 'ต้นทุนสารเคมีต่อปริมาณน้ำต่างกันมากระหว่างพื้นที่', find: `PO สารเคมีสะสม ม.ค.–${TH[cs.last - 1]} ÷ ปริมาณน้ำรับจริงตามไฟล์ OM: ${hi.name} ${nf(hi.rate, 3)} บาท/ลบ.ม. สูงสุด เทียบ ${lo.name} ${nf(lo.rate, 3)} และค่ากลาง ${nf(med, 3)} บาท/ลบ.ม.`,
        nums: `ทั้งบริษัท ${cs.total ? nf(cs.total.rate, 3) + ' บาท/ลบ.ม. (PO สารเคมี ' + MB(cs.total.chem) + ' ÷ ' + nf(cs.total.vol) + ' ลบ.ม.)' : NA()} · ${nf(cs.rows.length)} พื้นที่ที่มีทั้ง PO และปริมาณน้ำ`,
        impact: 'สารเคมีเป็นต้นทุนผันแปรหลักของการผลิตน้ำ — พื้นที่ที่ใช้สูงกว่าค่ากลางมากอาจมีปัญหาคุณภาพน้ำดิบ การตั้งค่าเครื่องจ่าย หรือการสต็อก', act: 'ให้ OM ตรวจอัตราการจ่ายสารเคมีจริงและสต็อกคงเหลือของพื้นที่ที่สูงสุด 3 อันดับ เทียบกับค่ามาตรฐานการเดินระบบ',
        caveat: 'ใช้มูลค่า PO ตามวันที่สั่งซื้อ ไม่ใช่ปริมาณที่ใช้จริง — การซื้อเข้าสต็อกล่วงหน้าทำให้ค่ารายพื้นที่คลาดได้ · ยังไม่มีข้อมูลการเบิกใช้/สต็อก', ev: ['ดูสารเคมีรายพื้นที่', () => openTable(chemSiteTable(cs))] });
    }
    // 7) งานซ่อมบำรุง
    const mi = maintInsights(); if (mi.length) out.push(Object.assign({ id: 'maint' }, mi[0]));
    return out;
  }
  const insightHtml = i => `<article class="insight ${i.warn ? 'warn' : ''}"><h3>${esc(i.title)}</h3><dl><dt>ข้อค้นพบ</dt><dd>${esc(i.find)}</dd><dt>ตัวเลขและช่วงเวลา</dt><dd>${esc(i.nums)}</dd><dt>ผลต่อการบริหาร</dt><dd>${esc(i.impact)}</dd><dt>สิ่งที่ควรดำเนินการ</dt><dd>${esc(i.act)}</dd><dt>ผู้รับผิดชอบ/กำหนด</dt><dd>${NA('ยังไม่มีข้อมูลผู้รับผิดชอบและกำหนดเวลา')}</dd>${i.caveat ? `<dt>ข้อจำกัด</dt><dd>${esc(i.caveat)}</dd>` : ''}<dt>หลักฐาน</dt><dd><button class="link" ${drill(i.ev[1])}>${esc(i.ev[0])}</button></dd></dl></article>`;

  /* ---------- หน้า 1: Executive Snapshot ---------- */
  function pExec() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', cm = M.compareMonth(S, st.ym, F()), to = selTo(), mo = +st.ym.slice(5, 7);
    const ytdL = M.selectLines(S, F({ from: y0, to })), ytd = M.billing(ytdL), monL = M.selectLines(S, F({ from: cm.from, to: cm.to }));
    const rv = M.receivables(S, { unit: st.unit }), pv = M.payables(S), cmt = M.commitments(S), o = M.om(S), ser = M.monthly(S, F());
    const k1 = MBv(cm.cur.net), cmpLabel = cm.prev ? `เทียบ ${thDs(cm.pfrom)}–${thDs(cm.pto)}` : 'ไม่มีเดือนก่อนในชุดข้อมูล';
    const units = M.byUnit(S, F({ from: cm.from, to: cm.to })), umax = Math.max(1, ...units.map(u => u.net));
    // การผลิต (ไฟล์ OM) — ใช้เดือนที่เลือก หรือเดือนล่าสุดที่มีข้อมูล
    const lm = o ? Math.min(o.last('volume', 'actual', 2026), mo) : 0, va = lm ? omVol(2026, lm, st.unit) : null, vp = lm ? omVol(2025, lm, st.unit) : null;
    let vy = null; if (lm) { vy = 0; for (let i = 1; i <= lm; i++) { const v = omVol(2026, i, st.unit); if (v !== null) vy += v; } }
    // ต้นทุนจาก PO ตามตัวกรองพื้นที่
    const pm = M.poSelect(S, { from: cm.from, to: cm.to, unit: st.unit }), py = M.poSelect(S, { from: y0, to, unit: st.unit });
    const gm = M.costByGroup(pm), gy = M.costByGroup(py), cpm = chemPerM3(st.unit, mo);
    const mwo = M.woSelect(S, { from: cm.from, to: cm.to, unit: st.unit }), wst = M.woStats(M.woSelect(S, { unit: st.unit }), asof);
    const k3 = MBv(gm.chem || 0), k4 = MBv(gm.maint || 0);
    const cser = M.costMonthly(S, { unit: st.unit }, +asof.slice(0, 4)), ckeys = [{ k: 'chem', label: 'สารเคมี', c: GC.chem }, { k: 'maint', label: 'ซ่อมบำรุง-เครื่องจักรและอะไหล่', c: GC.maint }, { k: 'capex', label: 'สินทรัพย์ (เครื่องจักร/อาคาร/อุปกรณ์)', c: GC.capex }];
    const all = insights(), ins = ['p3', 'chem', 'maint', 'pre', 'ar'].map(id => all.filter(i => i.id === id)[0]).filter(Boolean);
    const follow = [
      { t: 'IV ค้างรับรอตรวจสอบการตัดชำระ', d: `${nf(rv.iv.length)} ฉบับ · เกิน 90 วัน ${nf(rv.ivAging.buckets[5].count)} ฉบับ`, v: rv.ivAging.total, f: () => openTable(recvTable('IV ค้างรับที่รอตรวจสอบการตัดชำระ', rv.iv, 'ยอดหลังหัก WHT')) },
      { t: 'BL ปี 2569 ที่ยังไม่รับชำระ', d: `${nf(rv.open.length)} ฉบับ · เกินกำหนด ${MB(rv.openAging.overdue)}`, v: rv.openAging.total, f: () => openTable(blDocTable('BL ปี 2569 ที่ยังไม่รับชำระ', rv.open, 'ยอดรวม VAT · ไม่รวมส่วนต่างภาษีหัก ณ ที่จ่าย')) },
      { t: 'เจ้าหนี้ครบกำหนดภายใน 30 วัน', d: `${nf(pv.groups.today.length + pv.groups.d7.length + pv.groups.d30.length)} รายการ · ครบกำหนดแล้วอีก ${MB(pv.totals.overdue)}`, v: pv.totals.today + pv.totals.d7 + pv.totals.d30, f: () => openTable(payTable('เจ้าหนี้ครบกำหนดภายใน 30 วัน', pv.groups.today.concat(pv.groups.d7, pv.groups.d30), 'ณ ' + thD(asof))) },
      { t: 'ภาระ PO ที่อนุมัติแล้วยังไม่ตั้งเจ้าหนี้', d: `${nf(cmt.rows.length)} ใบ · ก่อน VAT`, v: cmt.total, f: () => openTable(poTable('ภาระ PO ที่ยังไม่ตั้งเจ้าหนี้', cmt.rows)) }
    ].filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    return `<div class="grid g4">
      <button class="card accent navy kpi" ${drill(() => openTable(linesTable('ยอดเรียกเก็บ ' + thM(st.ym), monL, `วันที่ออก ${thDs(cm.from)} – ${thDs(cm.to)}`)))}><span class="lab">การขาย · ยอดเรียกเก็บสุทธิก่อน VAT · ${thM(st.ym)}</span><span class="val num">${k1[0]} <small>${k1[1]}</small></span>${delta(cm.pct, cmpLabel)}<span class="full num">${B(cm.cur.net)} บาท${partialNote(st.ym)}</span><span class="full num">สะสมปี ${MB(ytd.net)} · หัก Pre-Treatment ${MB(-ytd.deduction)}</span><span class="more">ดู BL ${nf(cm.cur.docs)} ฉบับ →</span></button>
      <button class="card accent kpi" ${drill(goPage('ops'))}><span class="lab">การผลิต · ปริมาณน้ำรับจริง${lm ? ' · ' + TH[lm - 1] + ' 2569' : ''}</span><span class="val num">${va !== null ? nf(va) + ' <small>ลบ.ม.</small>' : NA()}</span>${va !== null ? delta(M.pct(va, vp), 'เทียบ ' + (lm ? TH[lm - 1] : '') + ' 2568') : ''}<span class="full num">${vy !== null && va !== null ? 'สะสม ม.ค.–' + TH[lm - 1] + ' ' + nf(vy) + ' ลบ.ม.' : 'ไฟล์ OM ไม่มีปริมาณน้ำของพื้นที่ที่เลือก'}${lm && lm < mo ? ' · ไฟล์ OM ถึง ' + TH[lm - 1] : ''}</span><span class="more">ดูการผลิตและสารเคมี →</span></button>
      <button class="card accent sky kpi" ${drill(() => openTable(poLineTable('PO สารเคมี · ' + thM(st.ym), M.poSelect(S, { from: cm.from, to: cm.to, unit: st.unit, grp: 'chem' }))))}><span class="lab">ต้นทุนผลิต · PO สารเคมี · ${thM(st.ym)}</span><span class="val num">${k3[0]} <small>${k3[1]}</small></span><span class="full num">สะสมปี ${MB(gy.chem || 0)}${cpm ? ' · ' + nf(cpm.rate, 3) + ' บาท/ลบ.ม. (ม.ค.–' + TH[cpm.last - 1] + ')' : ''}</span><span class="full">มูลค่าสั่งซื้อตามวันที่ PO ไม่ใช่ปริมาณที่ใช้จริง</span><span class="more">ดูรายการ PO →</span></button>
      <button class="card accent warn kpi" ${drill(goPage('maint'))}><span class="lab">ซ่อมบำรุง · PO เครื่องจักรและอะไหล่ · ${thM(st.ym)}</span><span class="val num">${k4[0]} <small>${k4[1]}</small></span><span class="full num">สะสมปี ${MB(gy.maint || 0)} · สินทรัพย์ ${MB(gy.capex || 0)}</span><span class="full">${S.maint ? `ใบงานแจ้งซ่อมเดือนนี้ ${nf(mwo.length)} · ค้าง ${nf(wst.open)} (เกิน SLA ${nf(wst.openOver.length)})` : 'ยังไม่มีไฟล์ใบงานแจ้งซ่อม'}</span><span class="more">ดู Maintenance Snapshot →</span></button></div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>การขาย: ค่าบริการ รายการหัก และยอดสุทธิรายเดือน</h2><p class="sub">BL ตามวันที่ออกเอกสาร ปี ${+asof.slice(0, 4) + 543} · ก่อน VAT · กดแท่งเพื่อดูเอกสาร${st.unit ? ' · ' + esc(M.unitLabel(st.unit, areas())) : ''}</p></div></div>
        ${monthlyChart(ser, s => openTable(linesTable('ยอดเรียกเก็บ ' + thM(s.ym), M.selectLines(S, F({ from: s.ym + '-01', to: M.monthEnd(s.ym) })), 'ตามวันที่ออกเอกสาร')))}</section>
      <section class="card"><div class="head"><div><h2>ต้นทุนผลิตจาก PO รายเดือน</h2><p class="sub">สารเคมี · ซ่อมบำรุง · สินทรัพย์ — มูลค่า PO ก่อน VAT ตามวันที่ออก PO · กดแท่งเพื่อดูรายการ${st.unit ? ' · ' + esc(M.unitLabel(st.unit, areas())) : ''}</p></div></div>
        ${stackChart(cser, ckeys, s => openTable(poLineTable('PO ต้นทุนผลิต · ' + thM(s.ym), M.poSelect(S, { from: s.ym + '-01', to: M.monthEnd(s.ym), unit: st.unit, grp: ['chem', 'maint', 'capex'] }))), 'ต้นทุนผลิตจาก PO รายเดือน')}</section></div>
    <section class="card"><div class="head"><div><h2>อันดับพื้นที่ตามยอดเรียกเก็บ · ${thM(st.ym)}</h2><p class="sub">สุทธิก่อน VAT${partialNote(st.ym)} · เฟส 1&2 ออกบิลรวมที่สำนักงานใหญ่ จึงแยกรายฟาร์มจาก TRCLOUD ไม่ได้</p></div></div>
      ${units.length ? bars(units.map(u => ({ label: u.label, v: u.net, txt: MB(u.net), cls: u.unit === 'P12' ? '' : u.unit === 'OTHER' ? 'b3' : 'b2', drill: () => openTable(linesTable(u.label + ' · ' + thM(st.ym), M.selectLines(S, { from: cm.from, to: cm.to, unit: u.unit }), 'ตามวันที่ออกเอกสาร')) })), umax) : '<div class="empty">ไม่มี BL ในช่วงที่เลือก</div>'}</section>
    <section class="card"><div class="head"><div><h2>CEO Insights</h2><p class="sub">การขาย · การผลิต · สารเคมี · ซ่อมบำรุง · การรับชำระ — สร้างจากกฎและตัวเลขที่ตรวจย้อนได้ · ข้อมูล ณ ${thD(asof)}</p></div></div><div class="grid g2">${ins.map(insightHtml).join('')}</div></section>
    <section class="card"><div class="head"><div><h2>รายการต้องติดตาม (การเงิน)</h2><p class="sub">เรียงตามมูลค่า · แต่ละชุดแยกกัน ไม่ได้รวมเป็นยอดเดียว · รายละเอียดอยู่ในหน้าลูกหนี้และเจ้าหนี้</p></div></div>
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
      <p class="note" style="margin-top:8px">รอบบิลเฟส 3 เป็นรายสัปดาห์และคร่อมเดือน จึงคาดว่ามีผลต่างระหว่างเดือนได้ · เดือนล่าสุดอาจยังออก BL ไม่ครบ</p></section>
    ${chemSection()}`;
  }
  function chemSection() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', cs = chemSites(), ser = M.costMonthly(S, {}, +asof.slice(0, 4)), py = M.poSelect(S, { from: y0, to: asof, grp: 'chem' });
    const items = {}; py.forEach(l => { const k = l.pid || '(ไม่ระบุ)'; const x = items[k] = items[k] || { k, names: {}, amt: 0, n: 0 }; x.amt += l.amt; x.n++; x.names[l.name] = 1; });
    const it = Object.values(items).sort((a, b) => b.amt - a.amt), imax = Math.max(1, ...it.map(x => x.amt)), rmax = Math.max(0.0001, ...cs.rows.map(r => r.rate));
    return `<div class="section-title">ต้นทุนการผลิต: สารเคมี</div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>PO สารเคมีรายเดือน ปี ${+asof.slice(0, 4) + 543}</h2><p class="sub">สะสม ${MB(M.sum(py, l => l.amt))} · ${nf(py.length)} บรรทัด · กดแท่งเพื่อดูรายการ · ${esc(poNote)}</p></div></div>
        ${stackChart(ser, [{ k: 'chem', label: 'สารเคมี (หมวด RM)', c: GC.chem }], s => openTable(poLineTable('PO สารเคมี · ' + thM(s.ym), M.poSelect(S, { from: s.ym + '-01', to: M.monthEnd(s.ym), grp: 'chem' }))), 'PO สารเคมีรายเดือน')}
        <div style="margin-top:12px">${bars(it.map(x => ({ label: x.k + ' ' + Object.keys(x.names)[0].slice(0, 28), v: x.amt, txt: MB(x.amt), cls: 'c', drill: () => openTable(poLineTable('PO สารเคมี ' + x.k, py.filter(l => (l.pid || '(ไม่ระบุ)') === x.k), 'สะสมปี')) })), imax)}</div></section>
      <section class="card"><div class="head"><div><h2>สารเคมีต่อปริมาณน้ำรายพื้นที่ (บาท/ลบ.ม.)</h2><p class="sub">PO สารเคมีตาม department ÷ ปริมาณน้ำรับจริงตามไฟล์ OM · ม.ค.–${cs.last ? TH[cs.last - 1] : '–'} 2569${cs.total ? ' · ทั้งบริษัท ' + nf(cs.total.rate, 3) + ' บาท/ลบ.ม.' : ''}</p></div></div>
        ${cs.rows.length ? bars(cs.rows.map(r => ({ label: r.name + ' · ' + r.site, v: r.rate, txt: nf(r.rate, 3), cls: 'c', drill: () => openTable(poLineTable('PO สารเคมี · ' + r.name, M.poSelect(S, { grp: 'chem' }).filter(l => l.dept === r.code), 'ทั้งปี')) })), rmax) : '<div class="empty">ยังไม่มีข้อมูล</div>'}
        <p class="note" style="margin-top:8px">PO สั่งซื้อเข้าสต็อกล่วงหน้าได้ ค่ารายพื้นที่จึงเป็นค่าประมาณจนกว่าจะมีข้อมูลการเบิกใช้ · PO ที่ไม่ระบุพื้นที่หรือออกที่ส่วนกลางไม่ถูกนับในรายพื้นที่</p>
        <div style="margin-top:10px">${tableSlot(Object.assign(chemSiteTable(cs), { size: 8 }))}</div></section></div>`;
  }

  /* ---------- หน้า 6: Maintenance Snapshot (ใบงานแจ้งซ่อม + PO ซ่อมบำรุง) ---------- */
  function pMaint() {
    const asof = S.meta.asof, y0 = asof.slice(0, 4) + '-01-01', cm = M.compareMonth(S, st.ym, F()), to = selTo(), u = st.unit, mt = S.maint;
    const pm = M.poSelect(S, { from: cm.from, to: cm.to, unit: u }), py = M.poSelect(S, { from: y0, to, unit: u }), gm = M.costByGroup(pm), gy = M.costByGroup(py);
    const ppm = cm.prev ? M.costByGroup(M.poSelect(S, { from: cm.pfrom, to: cm.pto, unit: u })) : null;
    const cser = M.costMonthly(S, { unit: u }, +asof.slice(0, 4)), mkeys = [{ k: 'maint', label: 'ซ่อมบำรุง-เครื่องจักรและอะไหล่ (5131xxx · 5111001 · SU)', c: GC.maint }, { k: 'capex', label: 'สินทรัพย์ (1701xxx)', c: GC.capex }, { k: 'facility', label: 'ซ่อมอาคาร/สำนักงาน/ยานพาหนะ (5308xxx)', c: GC.facility }];
    const maintLines = py.filter(l => ['maint', 'capex', 'facility'].indexOf(l.grp) >= 0);
    const banner = `<div class="empty" style="border-style:solid">ค่าซ่อมบำรุงใช้<b>มูลค่าใบสั่งซื้อ PO</b> จาก TRCLOUD (ก่อน VAT ตามวันที่ออก PO ไม่รวม PO ยกเลิก) จัดกลุ่มตามรหัสบัญชี — เป็นมูลค่าสั่งซื้อ ไม่ใช่ค่าใช้จ่ายที่รับรู้ตามงวด · ใบงานแจ้งซ่อมมาจากไฟล์ ${mt ? `"${esc(mt.source.file)}" (นำเข้า ${thT(mt.source.imported_at)} · แจ้งซ่อม ${thDs(mt.source.reported_from)} – ${thDs(mt.source.reported_to)})` : NA('ยังไม่ได้นำเข้า')} · ใบงานกับ PO ไม่มีเลขอ้างอิงถึงกัน${u ? ' · ตัวกรองพื้นที่ไม่แสดงใบงานที่ระบุพื้นที่ไม่ได้' : ''}</div>`;
    const costKpi = `<button class="card accent warn kpi" ${drill(() => openTable(poLineTable('PO ซ่อมบำรุงและสินทรัพย์ · ' + thM(st.ym), pm.filter(l => ['maint', 'capex', 'facility'].indexOf(l.grp) >= 0))))}><span class="lab">PO ซ่อมบำรุง-เครื่องจักรและอะไหล่ · ${thM(st.ym)}</span><span class="val num">${MBv(gm.maint || 0)[0]} <small>${MBv(gm.maint || 0)[1]}</small></span>${ppm ? delta(M.pct(gm.maint || 0, ppm.maint || 0), cm.prev ? 'เทียบ ' + thDs(cm.pfrom) + '–' + thDs(cm.pto) : '') : ''}<span class="full num">สะสมปี ${MB(gy.maint || 0)} · สินทรัพย์ ${MB(gy.capex || 0)} · ซ่อมอาคาร/สำนักงาน ${MB(gy.facility || 0)}</span><span class="more">ดูรายการ PO →</span></button>`;
    if (!mt) return banner + `<div class="grid g4">${costKpi}</div><section class="card"><div class="head"><div><h2>PO ซ่อมบำรุงรายเดือน</h2></div></div>${stackChart(cser, mkeys, s => openTable(poLineTable('PO ซ่อมบำรุง · ' + thM(s.ym), M.poSelect(S, { from: s.ym + '-01', to: M.monthEnd(s.ym), unit: u, grp: ['maint', 'capex', 'facility'] }))), 'PO ซ่อมบำรุงรายเดือน')}</section><div class="state">ยังไม่มีใบงานแจ้งซ่อม — นำเข้าด้วย <code>python3 scripts/import_maintenance.py om/&lt;ไฟล์&gt;.xlsx</code></div>`;
    const all = M.woSelect(S, { unit: u }), mon = M.woSelect(S, { from: cm.from, to: cm.to, unit: u }), prv = cm.prev ? M.woSelect(S, { from: cm.pfrom, to: cm.pto, unit: u }) : null, ytd = M.woSelect(S, { from: y0, to, unit: u });
    const sm = M.woStats(mon, asof), sa = M.woStats(all, asof), sy = M.woStats(ytd, asof);
    const oldest = sa.openRows.slice().sort((a, b) => a.reported < b.reported ? -1 : 1)[0];
    // แนวโน้มใบงานรายเดือน ปีปัจจุบัน
    const ms = M.months(S), lab = ms.map(x => TH[+x.slice(5) - 1]), opened = ms.map(x => all.filter(r => r.reported.slice(0, 7) === x).length), closed = ms.map(x => all.filter(r => r.done_at && r.done_at.slice(0, 7) === x).length);
    const backlog = ms.map(x => { const e = M.monthEnd(x) > asof ? asof : M.monthEnd(x); return all.filter(r => r.state !== 'rejected' && r.reported.slice(0, 10) <= e && !(r.done_at && r.done_at.slice(0, 10) <= e)).length; });
    const base = ytd.filter(r => r.state !== 'rejected');
    const cnt = (key, n) => { const c = M.countBy(base, key).slice(0, n || 8), mx = Math.max(1, ...c.map(x => x.n)); return c.length ? bars(c.map(x => ({ label: x.k, v: x.n, txt: nf(x.n), drill: () => openTable(woTable(x.k, base.filter(r => key(r) === x.k), 'ปี 2569')) })), mx) : '<div class="empty">ไม่มีใบงาน</div>'; };
    // เครื่องจักรที่แจ้งซ่อมซ้ำ (ทั้งไฟล์)
    const rep = M.countBy(all.filter(r => r.qr && r.state !== 'rejected'), r => r.qr).filter(x => x.n >= 3).map(x => { const rs = all.filter(r => r.qr === x.k); const l = rs.slice().sort((a, b) => a.reported < b.reported ? 1 : -1)[0]; return { qr: x.k, n: x.n, machine: l.machine, mtype: l.mtype, site: siteName(l), last: l.reported.slice(0, 10), open: rs.filter(r => r.state === 'open').length, rows: rs }; });
    // รายพื้นที่: ใบงาน + PO
    const ar = areas(), sites = S.areas.filter(a => a.om_site && (!u || M.deptUnit(a.code, ar) === u)).map(a => { const w = ytd.filter(r => r.site === a.om_site), pl = py.filter(l => l.dept === a.code), g = M.costByGroup(pl);
      return { name: a.name, site: a.om_site, phase: a.phase, wo: w.filter(r => r.state !== 'rejected').length, open: sa.openRows.filter(r => r.site === a.om_site).length, maint: g.maint || 0, capex: g.capex || 0, chem: g.chem || 0, rows: w, lines: pl }; });
    const nosite = ytd.filter(r => !r.site && r.state !== 'rejected').length, other = py.filter(l => !(ar[l.dept] || {}).om_site && ['maint', 'capex', 'facility'].indexOf(l.grp) >= 0);
    const accs = {}; maintLines.forEach(l => { const k = l.acc || (l.pcat ? 'หมวด ' + l.pcat : l.pid); const x = accs[k] = accs[k] || { k, amt: 0, n: 0 }; x.amt += l.amt; x.n++; });
    const acc = Object.values(accs).sort((a, b) => b.amt - a.amt), amax = Math.max(1, ...acc.map(x => x.amt));
    const mx = M.woMatches(S, ytd), mi = maintInsights();
    return banner + `<div class="grid g4">
      <button class="card accent navy kpi" ${drill(() => openTable(woTable('ใบงานแจ้งซ่อม · ' + thM(st.ym), mon, 'ตามวันที่แจ้ง')))}><span class="lab">ใบงานแจ้งซ่อม · ${thM(st.ym)}</span><span class="val num">${nf(mon.length)} <small>ใบงาน</small></span>${prv ? delta(M.pct(mon.length, prv.length), 'เทียบ ' + thDs(cm.pfrom) + '–' + thDs(cm.pto) + ' (' + nf(prv.length) + ')') : ''}<span class="full">ปิดแล้ว ${nf(sm.done)} · ค้าง ${nf(sm.open)} · ถูกปฏิเสธ ${nf(sm.rejected)} · ด่วนมาก ${nf(sm.urgent)}</span><span class="more">ดูใบงาน →</span></button>
      <button class="card accent warn kpi" ${drill(() => openTable(woTable('ใบงานที่ยังค้าง', sa.openRows, 'ณ ' + thD(asof))))}><span class="lab">ใบงานค้าง · ณ ${thDs(asof)}</span><span class="val num">${nf(sa.open)} <small>ใบงาน</small></span><span class="full">เกิน SLA แล้ว ${nf(sa.openOver.length)} ใบงาน</span><span class="full">${oldest ? 'ค้างนานสุด ' + nf(M.woAgeDays(oldest, asof)) + ' วัน (แจ้ง ' + thDs(oldest.reported.slice(0, 10)) + ')' : 'ไม่มีใบงานค้าง'}</span><span class="more">ดูใบงานค้าง →</span></button>
      <button class="card accent kpi" ${drill(() => openTable(woTable('ใบงานปี 2569 ที่ปิดแล้วและมี SLA', ytd.filter(r => r.state === 'done' && r.sla_h), 'เทียบเวลาแจ้ง→ซ่อมเสร็จกับ SLA ในใบงาน')))}><span class="lab">ปิดงานทัน SLA · ปี 2569</span><span class="val num">${sy.slaPct !== null ? nf(sy.slaPct, 0) + '<small>%</small>' : NA('N/A')}</span><span class="full">${nf(sy.slaOk)} จาก ${nf(sy.slaN)} ใบงานที่มี SLA · ไม่ระบุ SLA ${nf(sy.noSla)}</span><span class="full">ค่ากลาง: มอบหมาย ${sy.medAssignH !== null ? nf(sy.medAssignH, 1) + ' ชม.' : '–'} · ซ่อมเสร็จ ${sy.medDoneD !== null ? nf(sy.medDoneD, 1) + ' วัน' : '–'}</span><span class="more">ดูใบงาน →</span></button>
      ${costKpi}</div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>PO ซ่อมบำรุงและสินทรัพย์รายเดือน</h2><p class="sub">มูลค่า PO ก่อน VAT ตามวันที่ออก PO · กดแท่งเพื่อดูรายการ${u ? ' · ' + esc(M.unitLabel(u, ar)) : ''}</p></div></div>
        ${stackChart(cser, mkeys, s => openTable(poLineTable('PO ซ่อมบำรุงและสินทรัพย์ · ' + thM(s.ym), M.poSelect(S, { from: s.ym + '-01', to: M.monthEnd(s.ym), unit: u, grp: ['maint', 'capex', 'facility'] }))), 'PO ซ่อมบำรุงรายเดือน')}</section>
      <section class="card"><div class="head"><div><h2>ใบงานแจ้งซ่อมรายเดือน ปี ${+asof.slice(0, 4) + 543}</h2><p class="sub">แจ้งใหม่ (ตามวันที่แจ้ง) · ปิดงาน (ตามวันที่ซ่อมเสร็จ) · ค้างสิ้นเดือน · ไม่นับใบงานที่ถูกปฏิเสธในยอดค้าง</p></div></div>
        ${lineChart(lab, [{ name: 'แจ้งใหม่', c: 'var(--bar1)', v: opened, w: 2.6 }, { name: 'ปิดงาน', c: 'var(--chem)', v: closed }, { name: 'ค้าง ณ สิ้นเดือน', c: 'var(--warn)', v: backlog, dash: 1 }], 'ใบงาน', v => nf(v))}</section></div>
    <div class="grid g3">
      <section class="card"><div class="head"><div><h2>ประเภทเครื่องจักรที่แจ้งซ่อม</h2><p class="sub">ปี 2569 · ไม่นับที่ถูกปฏิเสธ (${nf(base.length)} ใบงาน)</p></div></div>${cnt(r => r.mtype)}</section>
      <section class="card"><div class="head"><div><h2>อาการเสีย</h2><p class="sub">ตามรหัสอาการเสียในใบงาน</p></div></div>${cnt(r => r.fdesc ? r.fcode + ' ' + r.fdesc : '')}</section>
      <section class="card"><div class="head"><div><h2>วิธีซ่อม</h2><p class="sub">ตามรหัสอาการซ่อมในใบงาน</p></div></div>${cnt(r => r.rdesc ? r.rcode + ' ' + r.rdesc : '')}</section></div>
    <div class="grid g2">
      <section class="card"><div class="head"><div><h2>รายพื้นที่: ใบงานและ PO ปี 2569</h2><p class="sub">ใบงานจับพื้นที่จากรหัส QR/ชื่อโครงการในคำอธิบาย · PO ตาม department · ใบงานระบุพื้นที่ไม่ได้ ${nf(nosite)} รายการ · PO ซ่อมบำรุงที่ออกในหน่วยงานส่วนกลาง ${MB(M.sum(other, l => l.amt))}</p></div></div>
        <div class="tbl-wrap"><table><thead><tr><th>พื้นที่</th><th>เฟส</th><th class="r">ใบงาน</th><th class="r">ค้าง</th><th class="r">PO ซ่อมบำรุง</th><th class="r">PO สินทรัพย์</th><th class="r">PO สารเคมี</th></tr></thead><tbody>${sites.sort((a, b) => (b.maint + b.capex) - (a.maint + a.capex)).map(r => `<tr class="rowlink" ${drill(() => openTable(poLineTable('PO · ' + r.name, r.lines, 'ปี 2569')))} tabindex="0"><td>${esc(r.name)} <span class="note">${esc(r.site)}</span></td><td>${esc((r.phase || '').replace('Phase ', 'เฟส '))}</td><td class="r num">${nf(r.wo)}</td><td class="r num">${r.open ? nf(r.open) : '–'}</td><td class="r num">${B(r.maint)}</td><td class="r num">${B(r.capex)}</td><td class="r num">${B(r.chem)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><div class="head"><div><h2>PO ซ่อมบำรุงตามรหัสบัญชี</h2><p class="sub">ปี 2569 · รวม ${MB(M.sum(maintLines, l => l.amt))} · ${nf(maintLines.length)} บรรทัด</p></div></div>${bars(acc.map(x => ({ label: x.k.indexOf('หมวด') === 0 ? x.k + ' (อะไหล่/วัสดุ)' : accName(x.k), v: x.amt, txt: MB(x.amt), drill: () => openTable(poLineTable(x.k, maintLines.filter(l => (l.acc || (l.pcat ? 'หมวด ' + l.pcat : l.pid)) === x.k), 'ปี 2569')) })), amax)}</section></div>
    <section class="card"><div class="head"><div><h2>Maintenance Insights</h2><p class="sub">สร้างจากกฎและตัวเลขที่ตรวจย้อนได้ · ใบงานจากไฟล์แจ้งซ่อม · ค่าใช้จ่ายจาก PO</p></div></div><div class="grid g2">${mi.map(insightHtml).join('')}</div></section>
    <section class="card"><div class="head"><div><h2>เครื่องจักรที่แจ้งซ่อมซ้ำ (≥ 3 ใบงาน)</h2><p class="sub">นับตามรหัส QR ทุกช่วงในไฟล์ (${thDs(mt.source.reported_from)} – ${thDs(mt.source.reported_to)}) · ไม่นับใบงานที่ถูกปฏิเสธ</p></div></div>${rep.length ? tableSlot({ title: '', file: 'SAM_repeat_machines', sort: 'n', dir: -1, size: 8, rows: rep,
      cols: [{ k: 'qr', label: 'QR Code' }, { k: 'machine', label: 'เครื่องจักร' }, { k: 'mtype', label: 'ประเภท' }, { k: 'site', label: 'พื้นที่' }, { k: 'n', label: 'ใบงาน', r: 1 }, { k: 'open', label: 'ค้าง', r: 1 }, { k: 'last', label: 'แจ้งล่าสุด', fmt: r => thDs(r.last) }, { k: 'x', label: '', fmt: r => `<button class="link" ${drill(() => openTable(woTable('ใบงานของ ' + r.qr, r.rows)))}>ดูใบงาน</button>`, csv: () => '' }] }) : '<div class="empty">ไม่มีเครื่องที่แจ้งซ่อมซ้ำ</div>'}</section>
    <section class="card"><div class="head"><div><h2>ใบงานที่ยังค้าง</h2><p class="sub">ณ ${thD(asof)} · เรียงจากค้างนานสุด · SLA อ่านจากระดับความด่วนในใบงาน</p></div></div>${tableSlot(Object.assign(woTable('', sa.openRows), { sort: 'age', dir: -1, size: 10 }))}</section>
    <section class="card"><div class="head"><div><h2>ใบงาน ↔ PO: จับคู่ที่เป็นไปได้ <span class="tag wait">รอยืนยัน</span></h2><p class="sub">${nf(mx.length)} ใบงานปี 2569 มี PO ที่อาจเกี่ยวข้อง — ใช้เป็นจุดเริ่มตรวจสอบเท่านั้น จนกว่าจะเพิ่มเลขที่ PR/PO ในใบงาน</p></div></div>${tableSlot(Object.assign(matchTable(mx), { size: 10 }))}</section>
    <section class="card"><div class="head"><div><h2>รายการ PO ซ่อมบำรุงและสินทรัพย์</h2><p class="sub">ปี 2569 ถึง ${thDs(to)}${u ? ' · ' + esc(M.unitLabel(u, ar)) : ''}</p></div></div>${tableSlot(Object.assign(poLineTable('', maintLines), { size: 12 }))}</section>`;
  }

  /* ---------- หน้า 7: สถานะข้อมูล ---------- */
  function pData() {
    const m = S.meta, bad = m.checks.filter(c => !c.ok), o = S.om, ar = S.areas.filter(a => a.kind === 'site' || S.bl_lines.some(l => l.dept === a.code));
    const defs = [['ยอดเรียกเก็บสุทธิก่อน VAT', 'ผลรวม before_vat ของทุกบรรทัด BL (รายงาน B3) ตามวันที่ออกเอกสาร รวมรายการหักที่ติดลบ · ไม่บวก IV'], ['ค่าบริการก่อนรายการหัก', 'ผลรวมบรรทัด BL ทุกหมวดที่ไม่ใช่รายการหัก'], ['รายการหัก', 'บรรทัดที่ชื่อระบุ Pre-Treatment และยอดติดลบ (รหัส 5111002 / 5131000)'],
      ['BL ที่ยังชำระไม่ครบ', 'BL ปี 2569 สถานะ Debtor · คงเหลือ = grand_total − payment (รวม VAT) · BL สถานะ Partial ที่คงเหลือ = 3% ของยอดก่อน VAT จัดเป็นส่วนต่าง WHT ไม่นับเป็นค้างชำระ'], ['IV ค้างรับ', 'รายการจาก get_receivable_due (amount = คงค้างหลังหัก WHT) แสดงแยก สถานะ "รอตรวจสอบการตัดชำระ"'],
      ['อายุหนี้', 'วันที่อ้างอิง − วันครบกำหนด: ยังไม่ครบ / วันนี้ / 1–30 / 31–60 / 61–90 / >90 วัน'], ['เจ้าหนี้ครบกำหนด', 'get_payable_due (amount = คงค้างหลังหัก WHT) จัดกลุ่มตามวันครบกำหนดเทียบวันที่อ้างอิง · เอกสารลงวันที่อนาคตแยกออก · AP/EXP ไม่นับซ้ำด้วยประเภท+เลขที่'],
      ['ภาระ PO', 'PO อนุมัติแล้ว สถานะ New/Partial และ backlog_ap > 0 (ก่อน VAT) — แยกจากเจ้าหนี้'], ['เทียบเดือน', 'เดือนเต็มเทียบเดือนเต็ม · เดือนปัจจุบันเทียบช่วงวันเท่ากันของเดือนก่อน · ฐานเป็นศูนย์หรือไม่มีข้อมูลแสดง N/A'], ['การปัดเศษ', 'คำนวณด้วย Decimal ปัดครึ่งขึ้นเป็นสตางค์ต่อบรรทัด แล้วรวมเป็นจำนวนเต็ม'],
      ['ต้นทุนจาก PO', 'บรรทัด PO (รายงาน PO3) ไม่รวม PO ยกเลิก · มูลค่าก่อน VAT ตามวันที่ออก PO — เป็นมูลค่าสั่งซื้อ ไม่ใช่ค่าใช้จ่ายที่รับรู้ตามงวดบัญชี'],
      ['กลุ่มต้นทุน', 'สารเคมี = หมวดสินค้า RM (บัญชี 5101004) · ซ่อมบำรุง = 5131xxx, 5111001 และหมวดสินค้า SU · สินทรัพย์ = 1701xxx · บริการ/ตรวจวิเคราะห์ = 5111000, 5111002, 5141000, 5306002 · ซ่อมอาคาร/สำนักงาน/ยานพาหนะ = 5308xxx · อื่น ๆ = ที่เหลือ'],
      ['สารเคมีต่อปริมาณน้ำ', 'PO สารเคมีสะสม ÷ ปริมาณน้ำรับจริงตามไฟล์ OM ในเดือนเดียวกัน (ม.ค. ถึงเดือนล่าสุดของไฟล์ OM) · รายพื้นที่ใช้ department ของ PO จับกับรหัสพื้นที่ OM'],
      ['ใบงานค้าง / SLA', 'ค้าง = สถานะที่ไม่ใช่ ปิดงาน / ซ่อมแล้ว รอประเมิน / ถูกปฏิเสธ · ทัน SLA = เวลาแจ้ง→ซ่อมเสร็จ ≤ SLA ที่ระบุในระดับความด่วน · ระดับที่ไม่ระบุ SLA ไม่นับ'],
      ['เครื่องจักรเสียซ้ำ', 'รหัส QR เดียวกันมีใบงาน (ไม่นับที่ถูกปฏิเสธ) ตั้งแต่ 3 ใบขึ้นไปในไฟล์ — เป็นเกณฑ์แสดงผล ไม่ใช่มาตรฐานของบริษัท'],
      ['จับคู่ใบงาน ↔ PO', 'พื้นที่เดียวกัน + PO ออกภายใน 7 วันก่อนถึง 60 วันหลังวันแจ้ง + มีคำสำคัญอุปกรณ์ร่วมกัน (วาล์ว ปั๊ม ท่อ ไดอะแฟรม ฯลฯ) · สถานะ "รอยืนยัน" เสมอ']];
    return `<div class="grid g3">
      <div class="card accent navy mini"><h3>แหล่งข้อมูลและช่วงที่ดึง</h3><div class="row"><span>โหมด</span><b>Snapshot (ไม่ได้เชื่อมต่อสด)</b></div><div class="row"><span>แหล่ง</span><b style="white-space:normal;text-align:right">${esc(m.source)}</b></div><div class="row"><span>ดึงข้อมูล</span><b>${thT(m.fetched_from)} – ${m.fetched_to.slice(11, 16)} น.</b></div><div class="row"><span>ช่วงวันที่เอกสาร</span><b>${thDs(m.period_from)} – ${thDs(m.period_to)}</b></div><div class="row"><span>วันที่อ้างอิง (อายุหนี้)</span><b>${thD(m.asof)}</b></div></div>
      <div class="card accent ${bad.length ? 'warn' : ''} mini"><h3>ผลการตรวจและกระทบยอด</h3><div class="row"><span>ผ่าน</span><b class="num">${nf(m.checks.length - bad.length)} จาก ${nf(m.checks.length)} ข้อ</b></div>${bad.map(c => `<div class="row"><span>${esc(c.name)}</span><b style="white-space:normal;text-align:right;color:var(--warn)">${esc(c.detail)}</b></div>`).join('')}</div>
      <div class="card accent mini"><h3>ไฟล์ OM</h3>${o ? `<div class="row"><span>ไฟล์</span><b style="white-space:normal;text-align:right">${esc(o.source.file)}</b></div><div class="row"><span>นำเข้า</span><b>${thT(o.source.imported_at)} · rev ${o.source.revision}</b></div><div class="row"><span>จำนวนค่า / ตาราง</span><b class="num">${nf(o.series.length)} / ${nf(o.blocks.length)}</b></div><div class="row"><span>ข้อมูลถึง</span><b>${TH[M.om(S).last('volume', 'actual', 2026) - 1]} 2569</b></div><div class="row"><span>sha256</span><b>${esc(o.source.sha256.slice(0, 16))}…</b></div>` : NA()}</div>
      <div class="card accent sky mini"><h3>ไฟล์ใบงานแจ้งซ่อม</h3>${S.maint ? `<div class="row"><span>ไฟล์</span><b style="white-space:normal;text-align:right">${esc(S.maint.source.file)}</b></div><div class="row"><span>นำเข้า</span><b>${thT(S.maint.source.imported_at)}</b></div><div class="row"><span>ใบงาน</span><b class="num">${nf(S.maint.source.rows)} รายการ · ระบุพื้นที่ได้ ${nf(S.maint.rows.filter(r => r.site).length)}</b></div><div class="row"><span>วันที่แจ้ง</span><b>${thDs(S.maint.source.reported_from)} – ${thDs(S.maint.source.reported_to)}</b></div><div class="row"><span>sha256</span><b>${esc(S.maint.source.sha256.slice(0, 16))}…</b></div><p class="note">ไม่มีคอลัมน์ค่าใช้จ่าย · ไม่เก็บชื่อผู้แจ้ง/ผู้รับผิดชอบ</p>` : NA()}</div></div>
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
    $('#ptitle').textContent = pg + (['exec', 'billing', 'maint'].indexOf(st.page) >= 0 ? ' · ' + thM(st.ym) : '');
    $('#psub').textContent = 'SAM WATER SUPPLY · ' + (st.page === 'ops' ? 'ปริมาณน้ำจากไฟล์ OM · สารเคมีจาก PO ใน TRCLOUD' : st.page === 'maint' ? 'ใบงานแจ้งซ่อมจากระบบแจ้งซ่อม · ค่าใช้จ่ายจาก PO ใน TRCLOUD' : st.page === 'data' ? 'สำหรับผู้ตรวจสอบข้อมูล' : 'ข้อมูลเอกสารบัญชีจาก TRCLOUD');
    $('#status').innerHTML = `<span class="chip"><span class="dot"></span>Snapshot — ไม่ใช่ข้อมูลสด</span><span class="chip plain">ดึงจาก TRCLOUD ${thT(m.fetched_to)}</span><span class="chip plain">BL ล่าสุด ${thDs(lastBl)}</span><span class="chip plain">วันที่อ้างอิง ${thDs(m.asof)}</span>${S.om ? `<span class="chip plain">ไฟล์ OM ถึง ${TH[M.om(S).last('volume', 'actual', 2026) - 1]} ${String(2569).slice(2)}</span>` : ''}${S.maint ? `<span class="chip plain">ใบงานแจ้งซ่อมถึง ${thDs(S.maint.source.reported_to)}</span>` : ''}<span class="chip warn">ข้อมูลบางส่วน: ยังไม่มีงบการเงินและคุณภาพน้ำ</span>`;
    $('#tabs').innerHTML = PAGES.map(p => `<a href="#/${p[0]}" ${p[0] === st.page ? 'aria-current="page"' : ''}>${p[1]}</a>`).join('');
    $('#foot').innerHTML = `ใช้ภายในเพื่อการตรวจรับ · ข้อมูลการเงินของบริษัท ห้ามเผยแพร่ · สร้าง snapshot ${thT(m.built_at)} · ไม่มีปุ่มรีเฟรชเพราะระบบอ่านจาก snapshot — อัปเดตข้อมูลตาม README`;
  }
  function render(anim) {
    document.body.classList.toggle('no-anim', anim === false);
    DR = []; TB = []; try { sessionStorage.setItem('sam-st', JSON.stringify(st)); } catch (e) { /* ไม่มี storage ก็ใช้งานได้ */ }
    header();
    const fn = { exec: pExec, billing: pBilling, recv: pRecv, pay: pPay, ops: pOps, maint: pMaint, data: pData }[st.page] || pExec, main = $('#main');
    try { main.innerHTML = fn(); } catch (e) { console.error(e); main.innerHTML = `<div class="state err">แสดงหน้านี้ไม่สำเร็จ: ${esc(e.message)}</div>`; return; }
    main.querySelectorAll('[data-table]').forEach(el => mountTable(el, TB[+el.dataset.table]));
    document.title = 'SAM Executive Snapshot · ' + (PAGES.filter(p => p[0] === st.page)[0] || PAGES[0])[1];
    if (anim !== false) countUp(main);
  }
  /* ตัวเลข KPI นับขึ้นจาก 0 ถึงค่าจริง (คงรูปแบบทศนิยม/คอมมาเดิม) — ค่าสุดท้ายคือข้อความเดิมทุกตัวอักษร */
  function countUp(root) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.kpi .val').forEach(el => {
      const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue)); if (!tn) return;
      const txt = tn.nodeValue, m = txt.match(/-?[\d,]+(\.\d+)?/); if (!m) return;
      const target = parseFloat(m[0].replace(/,/g, '')), dec = m[1] ? m[1].length - 1 : 0, pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length);
      if (!isFinite(target) || !target) return;
      const t0 = performance.now(), dur = 900, fmt = v => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); tn.nodeValue = k < 1 ? pre + fmt(target * e) + post : txt; if (k < 1) requestAnimationFrame(step); };
      tn.nodeValue = pre + fmt(0) + post; requestAnimationFrame(step);
    });
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
