// ทดสอบประตูเข้าสู่ระบบ + การถอดรหัส โดยจำลอง Microsoft 365 (ไม่ต่อเน็ตจริง): node tests/gate_test.js <โฟลเดอร์ site ที่ build แล้ว> <ไฟล์กุญแจ>
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http');
const site = path.resolve(process.argv[2]), key = fs.readFileSync(process.argv[3], 'utf8').trim();
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => { let f = path.join(site, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; if (!f.startsWith(site) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const MSAL = (groups) => `window.msal = { InteractionRequiredAuthError: function () {}, PublicClientApplication: function () {
  this.initialize = async () => {}; this.handleRedirectPromise = async () => null; this.setActiveAccount = () => {};
  this.getAllAccounts = () => sessionStorage.getItem('fake-login') ? [{ name: 'ผู้ทดสอบ', username: 't@x', idTokenClaims: { tid: window.DASH_AUTH.tenantId, groups: ${JSON.stringify(groups)} } }] : [];
  this.loginRedirect = async () => { sessionStorage.setItem('fake-login', 1); location.reload(); };
  this.acquireTokenSilent = async () => ({ accessToken: 'fake' }); this.logoutRedirect = async () => { sessionStorage.clear(); location.reload(); }; } };`;
(async () => {
  await new Promise(r => srv.listen(8095, '127.0.0.1', r)); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const b = await chromium.launch();
  const run = async (groups, keyText) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/vendor/msal-browser.min.js*', r => r.fulfill({ contentType: 'text/javascript', body: MSAL(groups) }));
    await p.route('**/auth-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: "window.DASH_AUTH={clientId:'c',tenantId:'t',groupId:'g-sam',groupName:'sam_dashboard_viewers',keyShareUrl:'https://example.sharepoint.com/k'};" }));
    await p.route('https://graph.microsoft.com/**', r => r.request().url().endsWith('/driveItem') ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ '@microsoft.graph.downloadUrl': 'https://dl.example/k' }) }) : r.fulfill({ status: 404 }));
    await p.route('https://dl.example/**', r => r.fulfill({ contentType: 'text/plain', body: keyText }));
    await p.goto('http://127.0.0.1:8095/'); await p.waitForTimeout(400);
    return { p, ctx, errs };
  };
  let { p, ctx, errs } = await run(['g-sam'], key);
  ok(await p.locator('#lock').isVisible() && await p.locator('#dash-root').isHidden(), 'ก่อนเข้าสู่ระบบเห็นเฉพาะหน้า login');
  ok((await p.locator('#go').innerText()).includes('Microsoft 365'), 'ปุ่มเข้าสู่ระบบด้วย Microsoft 365');
  await p.screenshot({ path: path.join(path.dirname(site), 'gate_lock.png') });
  await p.click('#go'); await p.waitForTimeout(1500);
  ok(await p.locator('#dash-root').isVisible() && await p.locator('#lock').isHidden(), 'ถอดรหัสและเปิด dashboard หลังเข้าสู่ระบบ');
  ok((await p.locator('#who').innerText()) === 'ผู้ทดสอบ' && await p.locator('#logout').isVisible(), 'แสดงชื่อผู้ใช้และปุ่มออกจากระบบ');
  ok(await p.locator('button.kpi').count() === 4 && !/NaN|undefined/.test(await p.locator('#main').innerText()), 'ข้อมูลที่ถอดรหัสแสดงผลครบ');
  await p.screenshot({ path: path.join(path.dirname(site), 'gate_open.png') });
  await p.click('#logout'); await p.waitForTimeout(600); ok(await p.locator('#lock').isVisible(), 'ออกจากระบบกลับหน้า login');
  ok(!errs.length, 'ไม่มี JavaScript error ' + errs.join('; ')); await ctx.close();
  ({ p, ctx } = await run(['other'], key)); await p.click('#go'); await p.waitForTimeout(800);
  ok((await p.locator('#err').innerText()).includes('sam_dashboard_viewers') && await p.locator('#dash-root').isHidden(), 'ผู้ที่ไม่อยู่ในกลุ่มเปิดไม่ได้'); await ctx.close();
  ({ p, ctx } = await run(['g-sam'], require('crypto').randomBytes(32).toString('base64'))); await p.click('#go'); await p.waitForTimeout(800);
  ok((await p.locator('#err').innerText()).includes('ไม่ตรง') && await p.locator('#dash-root').isHidden(), 'กุญแจผิดถอดรหัสไม่ได้'); await ctx.close();
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
