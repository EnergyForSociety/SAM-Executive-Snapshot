// เปิดเว็บสำหรับตรวจรับภายใน — ฟังเฉพาะ 127.0.0.1 (ไม่เปิดสู่เครือข่าย) และให้บริการเฉพาะ web/ กับ data/snapshot.json
// ใช้: node scripts/serve.js [port]   แล้วเปิด http://127.0.0.1:8090/web/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  let rel = decodeURIComponent(q.url.split('?')[0]); if (rel === '/' ) { r.writeHead(302, { Location: '/web/' }); return r.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.normalize(path.join(ROOT, rel));
  if (!f.startsWith(ROOT) || !/^\/(web\/|data\/snapshot\.json$)/.test(rel) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
  fs.createReadStream(f).pipe(r);
});
if (require.main === module) { const port = +process.argv[2] || 8090; srv.listen(port, '127.0.0.1', () => console.log('SAM Executive Snapshot: http://127.0.0.1:' + port + '/web/  (เฉพาะเครื่องนี้)')); }
module.exports = srv;
