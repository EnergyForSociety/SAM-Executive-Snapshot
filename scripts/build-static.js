// สร้างเว็บ static สำหรับ GitHub Pages: ข้อมูล snapshot เข้ารหัส AES-256-GCM และเปิดได้หลังเข้าสู่ระบบ Microsoft 365 เท่านั้น
// ใช้: node scripts/build-static.js --key <ไฟล์กุญแจนอก repo> [--out site]
//   ไฟล์กุญแจยังไม่มี → สร้างกุญแจใหม่ (base64 ของ 32 ไบต์) ที่ path นั้น · ห้ามเก็บกุญแจใน Git หรือในโฟลเดอร์เว็บ
//   กุญแจของ SAM ต้องแยกจาก STAR/HEA และอัปโหลดไว้ใน SharePoint ที่แชร์เฉพาะกลุ่ม sam_dashboard_viewers
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const keyPath = arg('key'), out = path.resolve(arg('out', path.join(ROOT, 'site')));
if (!keyPath) { console.error('ต้องระบุ --key <ไฟล์กุญแจ>'); process.exit(1); }
if (path.resolve(keyPath).startsWith(ROOT)) { console.error('ห้ามเก็บไฟล์กุญแจไว้ในโฟลเดอร์โครงการ'); process.exit(1); }
let keyB64;
if (fs.existsSync(keyPath)) keyB64 = fs.readFileSync(keyPath, 'utf8').replace(/^﻿/, '').trim();
else { keyB64 = crypto.randomBytes(32).toString('base64'); fs.mkdirSync(path.dirname(path.resolve(keyPath)), { recursive: true }); fs.writeFileSync(keyPath, keyB64 + '\n', { mode: 0o600 }); console.log('สร้างกุญแจใหม่:', keyPath); }
const key = Buffer.from(keyB64, 'base64');
if (key.length !== 32) { console.error('ไฟล์กุญแจไม่ถูกต้อง (ต้องเป็น base64 ของ 32 ไบต์)'); process.exit(1); }

const snapPath = path.join(ROOT, 'data', 'snapshot.json');
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
if (!snap.bl_lines || !snap.bl_lines.length) { console.error('snapshot ไม่มีข้อมูล — รัน python3 scripts/build_snapshot.py ก่อน'); process.exit(1); }
const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([c.update(JSON.stringify(snap), 'utf8'), c.final(), c.getAuthTag()]);   // WebCrypto: ciphertext||tag

const auth = fs.readFileSync(path.join(ROOT, 'static', 'auth-config.js'), 'utf8');
const unset = /groupId:\s*'</.test(auth) || /keyShareUrl:\s*'</.test(auth);

try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { console.warn('ลบโฟลเดอร์เดิมไม่ได้ (' + e.code + ') — เขียนทับไฟล์แทน'); }
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(ROOT, 'web'), out, { recursive: true });
for (const f of ['gate.js', 'gate.css', 'auth-config.js']) fs.copyFileSync(path.join(ROOT, 'static', f), path.join(out, f));
fs.writeFileSync(path.join(out, 'data.enc.js'), '/* ข้อมูลเข้ารหัส AES-256-GCM — ถอดได้ด้วยกุญแจใน SharePoint เท่านั้น */\nwindow.DASH_ENC = ' + JSON.stringify({ i: iv.toString('base64'), c: enc.toString('base64'), asof: snap.meta.asof, built: new Date().toISOString() }) + ';\n');
fs.writeFileSync(path.join(out, '.nojekyll'), '');
fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const rep = (a, b) => { if (!html.includes(a)) throw new Error('ไม่พบใน index.html: ' + a); html = html.replace(a, b); };
rep('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="gate.css">');
rep('<body>', `<body class="locked">
<div class="lock" id="lock">
  <div class="lock-box">
    <div class="logo-zone"><img src="assets/sam-logo-light.png" width="133" height="64" alt="SAM WATER SUPPLY"><div class="brand-txt"><b>Executive Snapshot</b><span>ภาพรวมยอดเรียกเก็บและการติดตามชำระ</span></div></div>
    <form onsubmit="return false">
      <h1>SAM Executive Snapshot</h1>
      <p>รายงานภายในสำหรับผู้บริหาร · เข้าสู่ระบบด้วยบัญชี Microsoft 365 ของบริษัท</p>
      <button class="gbtn" id="go" type="button" disabled>กำลังตรวจสอบ…</button>
      <button class="gbtn ghost" id="out" type="button" hidden>ออกจากระบบ / ลองบัญชีอื่น</button>
      <p class="err" id="err" role="alert"></p>
    </form>
    <p class="fine">ข้อมูลเข้ารหัส · เปิดได้เฉพาะผู้ที่ได้รับสิทธิ์</p>
  </div>
</div>`);
rep('<div id="dash-root">', '<div id="dash-root" hidden>');
rep('<script src="app.js"></script>', '<script>window.DASH_STATIC = 1;</script>\n<script src="vendor/msal-browser.min.js"></script>\n<script src="auth-config.js"></script>\n<script src="data.enc.js"></script>\n<script src="app.js"></script>\n<script src="gate.js"></script>');
const ver = Date.now().toString(36);
html = html.replace(/(src|href)="((?!https?:|\/\/)[\w./-]+\.(?:js|css))"/g, (m, a, f) => `${a}="${f}?v=${ver}"`);
fs.writeFileSync(path.join(out, 'index.html'), html);

// ตรวจไม่ให้ข้อมูลดิบหลุดไปกับเว็บ
const leak = [], secrets = [...new Set(snap.bl_lines.map(l => l.org).concat(snap.pay.map(p => p.vendor)).filter(x => x && x.length > 6))];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html|css|json|txt)$/.test(f) && !/data\.enc\.js$|msal-browser/.test(f)) { const t = fs.readFileSync(p, 'utf8'); if (/\b(?:BL|RE|IV|AP|RR)\d{10}\b/.test(t) || secrets.some(x => t.includes(x))) leak.push(path.relative(out, p)); } } })(out);
if (leak.length) { console.error('พบข้อมูลจริงในไฟล์เว็บที่ไม่เข้ารหัส: ' + leak.join(', ')); process.exit(1); }
console.log('สร้างเว็บที่', out, '· ข้อมูล ณ', snap.meta.asof, '·', (enc.length / 1024).toFixed(0), 'KB (เข้ารหัส)');
if (unset) console.warn('⚠ static/auth-config.js ยังไม่มี groupId / keyShareUrl ของ SAM — หน้าเข้าสู่ระบบจะแจ้ง "ยังตั้งค่าเว็บไม่ครบ" จนกว่าจะใส่ค่า');
