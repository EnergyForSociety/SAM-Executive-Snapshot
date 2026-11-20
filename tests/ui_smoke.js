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
  for (const [pg, label] of [['sales', 'ลูกค้าใหม่']]) { await go(pg); if (label) await sub(label); ok(/ยังไม่มีแหล่งข้อมูล/.test(await body()), 'หน้า ' + pg + (label ? ' › ' + label : '') + ' แจ้งว่ายังไม่มีแหล่งข้อมูล'); }
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
  /* ---------- หน้าโครงการ: งานจาก ClickUp ---------- */
  await go('proj'); await p.waitForTimeout(800);
  const PJ = await p.evaluate(() => window.SAM.snap.projects);
  if (!PJ) ok(false, 'snapshot ไม่มีข้อมูลโครงการจาก ClickUp');
  else {
    const mains = PJ.tasks.filter(t => !t.parent), subs = PJ.tasks.filter(t => t.parent);
    const ids = PJ.tasks.map(t => t.id);
    ok(new Set(ids).size === ids.length, 'Task ID ไม่ซ้ำหลังรวมผลค้นกับ subtasks (' + ids.length + ' รายการ)');
    ok(subs.every(t => ids.indexOf(t.parent) >= 0), 'งานย่อยทุกรายการผูกกับงานหลักที่มีอยู่จริง');
    ok(PJ.meta.counts.mains === mains.length && PJ.meta.counts.subs === subs.length && mains.length + subs.length === PJ.tasks.length,
      'งานหลัก ' + mains.length + ' กับงานย่อย ' + subs.length + ' นับแยกกัน ไม่ซ้อนกัน');
    ok(PJ.tasks.every(t => !t.cls || t.cls.state === 'proposed' || (t.cls.confirmed_by && t.cls.confirmed_on)),
      'การจัดประเภทที่เป็น confirmed ต้องมีผู้ยืนยันและวันที่ — ไม่มีรายการที่เปลี่ยนเป็น confirmed เอง');
    ok(mains.every(t => t.cls), 'งานหลักทุกรายการมีข้อเสนอการจัดประเภท');
    const txt0 = await body();
    const doneNoClose = PJ.tasks.filter(t => t.group === 'done' && !t.closed);
    ok(doneNoClose.length > 0 && doneNoClose.every(t => t.status === 'complete'),
      'งาน complete ที่ไม่มี date_closed ยังถือว่าเสร็จจากชื่อสถานะ (' + doneNoClose.length + ' รายการ)');
    ok(PJ.tasks.filter(t => t.group === 'cancelled').length === PJ.tasks.filter(t => t.status === 'cancelled').length
      && PJ.tasks.filter(t => t.group === 'hold').length === PJ.tasks.filter(t => t.status === 'on hold').length
      && PJ.tasks.every(t => t.group !== 'active' || (t.status !== 'cancelled' && t.status !== 'on hold')),
      'cancelled และ on hold แยกจาก complete และไม่ถูกนับว่ากำลังดำเนินการ');
    ok(PJ.tasks.every(t => !t.issues.some(i => i.k === 'overdue') || t.due), 'งานที่ไม่มีกำหนดส่งไม่ถูกนับว่าเกินกำหนด');
    ok(PJ.tasks.every(t => !t.issues.some(i => i.k === 'overdue') || (t.due.slice(0, 10) < PJ.meta.today && t.group !== 'done' && t.group !== 'cancelled')),
      'งานเกินกำหนดต้องเลยวันอ้างอิงจริงและยังไม่ปิดงาน');
    ok(PJ.meta.tz === 'Asia/Bangkok' && /^\d{4}-\d{2}-\d{2}$/.test(PJ.meta.today), 'วันและเวลาใช้เขต Asia/Bangkok จากผู้ใช้ ClickUp (' + PJ.meta.today + ')');
    ok(PJ.tasks.every(t => t.kid_total === null || t.kid_total > 0), 'งานที่ไม่มีงานย่อยได้ค่า N/A ไม่ใช่ 0%');
    const phys = txt0.split('Physical Progress');
    ok(phys.length > 1 && phys.slice(0, -1).every(s => /ไม่(ใช้|ใช่)[^.]{0,40}$/.test(s.replace(/\s+/g, ' '))),
      'ทุกครั้งที่พูดถึง Physical Progress คือการบอกว่าไม่ใช้สัดส่วนงานย่อยแทน (' + (phys.length - 1) + ' จุด)');
    ok(/ไม่ใช่อัตราการใช้กำลังคน/.test(txt0) && !/Resource Utilization\s*[:=]?\s*\d/.test(txt0), 'ไม่มีการคำนวณ Resource Utilization หรือต้นทุนแรงงาน');
    ok(/ยังไม่ยืนยัน|ยังไม่ได้ยืนยันการจัดประเภท/.test(txt0) && !/ไม่มีโครงการ(?!$)/.test(txt0.replace('ไม่ได้แปลว่าบริษัทไม่มีโครงการ', '')),
      'ไม่มีโครงการส่งมอบที่ยืนยัน → สื่อว่ายังไม่ยืนยันการจัดประเภท ไม่ใช่บริษัทไม่มีโครงการ');
    // แผนงานตามแผนธุรกิจ = List ใน ClickUp
    const tabs = await p.locator('#main .subseg button').allInnerTexts();
    ok(tabs.length === PJ.meta.lists.length + 1 && PJ.meta.lists.every(l => tabs.some(t => t.trim() === (l.name || l.id))),
      'หน้าย่อยคือแผนงานตามแผนธุรกิจครบทุก List (' + PJ.meta.lists.length + ' แผนงาน)');
    // ลิงก์กลับ ClickUp ต้องเป็น URL ที่เครื่องมือคืนมา
    const hrefs = await p.locator('#main a.pj-id').evaluateAll(a => a.map(x => x.getAttribute('href')));
    ok(hrefs.length > 0 && hrefs.every(h => PJ.tasks.some(t => t.url === h)), 'ลิงก์เปิดงานใช้ URL ที่ ClickUp คืนมาเท่านั้น (' + hrefs.length + ' ลิงก์)');
    // ชื่องานจากต้นทางถูก escape
    const inj = await p.evaluate(() => { const d = document.createElement('div'); d.textContent = '<img src=x onerror=alert(1)>'; return d.innerHTML; });
    ok(inj.indexOf('&lt;img') === 0, 'ข้อความต้นทางถูก escape ก่อนแสดงผล');
    // ตัวกรองของหน้ามีผลจริงกับตาราง
    const cnt = async () => (await p.locator('#main .tools .note').first().innerText()).trim();
    const before = await cnt();
    await p.selectOption('#main select[data-k="status"]', 'cancelled'); await p.waitForTimeout(400);
    const after = await cnt();
    ok(before !== after && /งานย่อย 1/.test(after), 'ตัวกรองสถานะเปลี่ยนรายการในตาราง (' + before + ' → ' + after + ')');
    await p.locator('#main button[data-x="reset"]').click(); await p.waitForTimeout(300);
    ok((await cnt()) === before, 'ล้างตัวกรองของหน้าแล้วกลับมาเท่าเดิม');
    // ส่งออก CSV ของตารางงาน
    const dl = p.waitForEvent('download'); await p.locator('#main button[data-x="csv"]').click();
    const f = await dl; ok(/SAM_clickup_tasks_.*\.csv/.test(f.suggestedFilename()), 'ส่งออก CSV งานจาก ClickUp (' + f.suggestedFilename() + ')');
    // ตัวกรองเดือน/พื้นที่ทางบัญชีถูกปิดในหน้านี้และบอกเหตุผล
    ok(await p.locator('#f-m').count() === 0 && /ใช้กับเอกสารบัญชี TRCLOUD จึงปิดไว้ในหน้านี้/.test(await p.locator('#filters').innerText()),
      'ปิดตัวกรองเดือน/พื้นที่ทางบัญชีในหน้าโครงการพร้อมระบุเหตุผล');
    // เวลาที่ดึง ClickUp แยกจาก TRCLOUD
    const meta = await p.evaluate(() => ({ cu: window.SAM.snap.projects.meta.fetched_to, tr: window.SAM.snap.meta.fetched_to }));
    ok(meta.cu !== meta.tr && /คนละเวลากับข้อมูลบัญชี/.test(await body()), 'แยกเวลาที่ดึง ClickUp ออกจากเวลาที่ดึง TRCLOUD');
    // ขยาย/ย่อ และดูงานย่อยได้
    await p.locator('#main .pj-tog').first().click(); await p.waitForTimeout(300);
    ok(await p.locator('#main tr.pj-sub').count() > 0 || await p.locator('#main tr.pj-det').count() > 0, 'กดชื่องานแล้วเห็นรายละเอียดและงานย่อย');
  }
  await go('exec');
  if (out) { await p.emulateMedia({ media: 'print' }); await p.pdf({ path: out + '/exec_print.pdf', format: 'A4', landscape: true, printBackground: true }); await p.emulateMedia({ media: 'screen' }); ok(fs.statSync(out + '/exec_print.pdf').size > 20000, 'พิมพ์/บันทึก PDF หน้า Executive'); }
  ok(!errs.length, 'ไม่มี JavaScript error ' + errs.join('; '));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
