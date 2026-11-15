// ตรวจหน้าจอจริงด้วย Playwright (ถ้ามี): node tests/ui_smoke.js [โฟลเดอร์เก็บภาพ]
const { chromium } = require('playwright'), fs = require('fs'), srv = require('../scripts/serve.js');
(async () => {
  const out = process.argv[2]; let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  await new Promise(r => srv.listen(8098, '127.0.0.1', r));
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const go = async h => { await p.goto('http://127.0.0.1:8098/web/#/' + h); await p.waitForTimeout(500); };
  const num = t => +t.replace(/[^\d.-]/g, '');
  const sub = async label => { await p.locator('#main .subseg button', { hasText: label }).first().click(); await p.waitForTimeout(400); };
  const body = async () => await p.locator('#main').innerText();
  const clean = t => t.length > 300 && !/NaN|undefined|Infinity|แสดงหน้านี้ไม่สำเร็จ/.test(t);
  // 7 หมวดตามกรอบผู้บริหาร
  for (const pg of ['exec', 'sales', 'fin', 'proj', 'strat', 'ops', 'data']) { await go(pg); ok(clean(await body()), 'หน้า ' + pg + ' แสดงผลได้'); }
  // ทุกหน้าย่อย
  for (const [pg, labels] of [['sales', ['ยอดเรียกเก็บและพื้นที่', 'ลูกค้าใหม่']], ['fin', ['งบบริหาร', 'ลูกหนี้', 'เจ้าหนี้']], ['ops', ['การผลิตและสารเคมี', 'Maintenance']]]) {
    await go(pg); for (const l of labels) { await sub(l); ok(clean(await body()), 'หน้าย่อย ' + pg + ' › ' + l + ' แสดงผลได้'); }
  }
  // ลิงก์เดิมของเว็บรุ่นก่อนยังพาไปหน้าย่อยที่ถูกต้อง
  for (const [h, want] of [['billing', 'ยอดเรียกเก็บและพื้นที่'], ['recv', 'ลูกหนี้'], ['pay', 'เจ้าหนี้'], ['maint', 'Maintenance']]) {
    await go(h); ok((await p.locator('#ptitle').innerText()).includes(want), 'ลิงก์เดิม #/' + h + ' พาไปหน้าย่อย ' + want);
  }
  // ธีมทั้งสามโหมด
  for (const t of ['auto', 'light', 'dark']) {
    await go('exec'); await p.locator('#theme button[data-t=' + t + ']').click(); await p.waitForTimeout(300);
    ok(clean(await body()) && await p.locator('#theme button[data-t=' + t + '][aria-pressed=true]').count() === 1, 'ธีม ' + t + ' ใช้งานได้');
  }
  await p.locator('#theme button[data-t=auto]').click();
  // งบบริหาร: ต้องไม่แสดงกำไรเป็น KPI และต้องบอกเหตุผล
  await go('fin'); await sub('งบบริหาร'); const plt = await body();
  ok(/ยังไม่แสดงกำไรเป็น KPI/.test(plt) && /ผลเบื้องต้น/.test(plt), 'หน้างบบริหารบอกว่ายังไม่แสดงกำไรและกำกับผลเบื้องต้น');
  ok(await p.locator('#main .kpi .lab', { hasText: 'กำไร' }).count() === 0, 'ไม่มีการ์ด KPI กำไรในหน้างบบริหาร');
  // หน้าที่ยังไม่มีแหล่งข้อมูลต้องบอกตรง ๆ ไม่แสดงศูนย์
  for (const [pg, label] of [['proj', null], ['sales', 'ลูกค้าใหม่']]) { await go(pg); if (label) await sub(label); ok(/ยังไม่มีแหล่งข้อมูล/.test(await body()), 'หน้า ' + pg + (label ? ' › ' + label : '') + ' แจ้งว่ายังไม่มีแหล่งข้อมูล'); }
  await go('exec');
  const kpi = await p.locator('button.kpi .full').first().innerText();                          // ยอดเต็มบนการ์ด
  await p.locator('button.kpi').first().click(); await p.waitForTimeout(300);
  const foot = await p.locator('#modal tfoot td.r.num').last().evaluate(el => el.parentElement.innerText);
  ok(foot.includes(kpi.split(' บาท')[0]), 'รายละเอียด KPI เดือนรวมได้เท่ายอดบนการ์ด (' + kpi.split(' บาท')[0] + ')');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#modal button[data-x=csv]').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'); ok(csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n').length > 5, 'ส่งออก CSV ได้ (' + dl.suggestedFilename() + ')');
  await p.keyboard.press('Escape'); ok(await p.locator('#modal').isHidden(), 'ปิดหน้าต่างรายละเอียดด้วย Esc');
  await p.selectOption('#f-m', '2026-10'); await p.waitForTimeout(300);
  ok((await p.locator('button.kpi .lab').first().innerText()).includes('ต.ค.'), 'ตัวกรองเดือนเปลี่ยน KPI');
  const full = num((await p.locator('button.kpi .full').first().innerText()).split(' บาท')[0]);
  await p.selectOption('#f-u', 'P12'); await p.waitForTimeout(300);
  const p12 = num((await p.locator('button.kpi .full').first().innerText()).split(' บาท')[0]);
  ok(p12 > 0 && p12 < full, 'ตัวกรองพื้นที่เปลี่ยนยอด (' + p12 + ' < ' + full + ')');
  await p.locator('svg.chart g.hit').nth(2).click(); await p.waitForTimeout(300);
  ok((await p.locator('#modal-title').innerText()).includes('มี.ค.'), 'กดแท่งกราฟเปิดเอกสารของเดือนนั้น'); await p.keyboard.press('Escape');
  await go('billing'); await p.fill('#main input[type=search]', 'RP-MA'); await p.waitForTimeout(300);
  ok(/รายการ/.test(await p.locator('#main .tools .note').last().innerText()), 'ค้นหาในตารางเอกสาร');
  await p.selectOption('#f-u', ''); await p.selectOption('#f-m', '2026-11');
  await go('maint'); await p.waitForTimeout(1000); const wo = num((await p.locator('button.kpi .val').first().innerText()));
  await p.locator('button.kpi').first().click(); await p.waitForTimeout(300);
  ok(+(await p.locator('#modal .tools .note').last().innerText()).replace(/[^\d]/g, '') === wo, 'จำนวนใบงานบนการ์ดเท่ากับรายการในรายละเอียด (' + wo + ')'); await p.keyboard.press('Escape');
  ok((await p.locator('#main').innerText()).includes('รอยืนยัน'), 'การจับคู่ใบงาน ↔ PO แสดงสถานะรอยืนยัน');
  ok(!(await p.locator('#tabs').innerText()).includes('สัญญาและความเสี่ยง'), 'ไม่มีแท็บสัญญาและความเสี่ยง');
  await go('exec'); const nk = await p.locator('#main .grid.g4 > .kpi').count();
  ok(nk === 5, 'หน้า Executive มี KPI 5 ใบ (ยอดเรียกเก็บ · ปริมาณน้ำ · สารเคมี · ซ่อมบำรุง · ต้นทุนดำเนินงาน) — ได้ ' + nk);
  ok(await p.locator('#main .grid.g4 > .kpi .val .na').count() === 0, 'หน้าแรกไม่มีการ์ด KPI ที่ไม่มีข้อมูล');
  ok(/KPI ที่ยังแสดงไม่ได้/.test(await body()), 'หน้าแรกบอก KPI ที่ยังแสดงไม่ได้พร้อมเหตุผล');
  if (out) { await p.emulateMedia({ media: 'print' }); await p.pdf({ path: out + '/exec_print.pdf', format: 'A4', landscape: true, printBackground: true }); await p.emulateMedia({ media: 'screen' }); ok(fs.statSync(out + '/exec_print.pdf').size > 20000, 'พิมพ์/บันทึก PDF หน้า Executive'); }
  ok(!errs.length, 'ไม่มี JavaScript error ' + errs.join('; '));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
