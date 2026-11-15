// ตรวจหน้าจอจริงด้วย Playwright (ถ้ามี): node tests/ui_smoke.js [โฟลเดอร์เก็บภาพ]
const { chromium } = require('playwright'), fs = require('fs'), srv = require('../scripts/serve.js');
(async () => {
  const out = process.argv[2]; let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  await new Promise(r => srv.listen(8098, '127.0.0.1', r));
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const go = async h => { await p.goto('http://127.0.0.1:8098/web/#/' + h); await p.waitForTimeout(500); };
  const num = t => +t.replace(/[^\d.-]/g, '');
  for (const pg of ['exec', 'billing', 'recv', 'pay', 'ops', 'maint', 'data']) { await go(pg); const t = await p.locator('#main').innerText(); ok(t.length > 500 && !/NaN|undefined|Infinity|แสดงหน้านี้ไม่สำเร็จ/.test(t), 'หน้า ' + pg + ' แสดงผลได้'); }
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
  await go('exec'); ok(await p.locator('#main .grid.g4 > .kpi').count() === 4, 'หน้า Executive มี KPI 4 ใบ');
  if (out) { await p.emulateMedia({ media: 'print' }); await p.pdf({ path: out + '/exec_print.pdf', format: 'A4', landscape: true, printBackground: true }); await p.emulateMedia({ media: 'screen' }); ok(fs.statSync(out + '/exec_print.pdf').size > 20000, 'พิมพ์/บันทึก PDF หน้า Executive'); }
  ok(!errs.length, 'ไม่มี JavaScript error ' + errs.join('; '));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
