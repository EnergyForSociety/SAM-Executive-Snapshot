# SAM Executive Snapshot

ภาพรวมยอดเรียกเก็บ การเดินระบบ และความเสี่ยงตามสัญญา ของ SAM WATER SUPPLY สำหรับ CEO และผู้บริหาร
**สถานะ: รุ่นตรวจรับภายใน — ใช้ข้อมูลจริงแบบ Snapshot (ไม่ใช่ข้อมูลสด) ห้ามเผยแพร่สู่สาธารณะ**

## เปิดใช้งาน

**เว็บใช้งานจริง (ผู้บริหาร):** https://energyforsociety.github.io/SAM-Executive-Snapshot/ — เข้าสู่ระบบด้วยบัญชี Microsoft 365 ของบริษัท
ต้องอยู่ในกลุ่ม `sam_dashboard_viewers` และมีสิทธิ์อ่านไฟล์กุญแจใน SharePoint · ข้อมูลบน GitHub เป็นข้อมูลเข้ารหัส AES-256-GCM

**ทดสอบในเครื่อง (ผู้พัฒนา):** `node scripts/serve.js` แล้วเปิด http://127.0.0.1:8090/web/ (อ่าน `data/snapshot.json` ไม่เข้ารหัส เฉพาะเครื่องนี้)
การดับเบิลคลิกเปิด `web/index.html` โดยตรงจะไม่ทำงาน เพราะเบราว์เซอร์ไม่ให้ไฟล์ในเครื่องโหลดข้อมูล

ธีม: ปุ่ม อัตโนมัติ / สว่าง / มืด ที่หัวเว็บ (จำค่าไว้ในเบราว์เซอร์) · มีแอนิเมชันตอนเปิดหน้า และปิดอัตโนมัติถ้าเครื่องตั้งค่าลดการเคลื่อนไหว

## สร้างและเผยแพร่เว็บ (เหมือน STAR dashboard)

```
python3 scripts/build_snapshot.py
node scripts/build-static.js --key C:\mcp\keys\sam-dash-key.txt --out site
```

- กุญแจของ SAM แยกจาก STAR/HEA เก็บนอก repo · ครั้งแรกสคริปต์สร้างกุญแจให้ แล้วอัปโหลดไฟล์กุญแจไป SharePoint แชร์เฉพาะกลุ่ม `sam_dashboard_viewers` (สิทธิ์ View)
- ใส่ `groupId` และ `keyShareUrl` ใน `static/auth-config.js` แล้ว build ใหม่
- ใช้ App registration เดิม "CCC Staff Status Login" — เพิ่ม Redirect URI (SPA) `https://energyforsociety.github.io/SAM-Executive-Snapshot/`
- commit และ push ด้วย GitHub Desktop · GitHub Pages ใช้ GitHub Actions (`.github/workflows/pages.yml`) เผยแพร่โฟลเดอร์ `site/` เหมือน STAR — ตั้งค่า Settings → Pages → Source: **GitHub Actions**
- สคริปต์ build ตรวจว่าไม่มีข้อมูลจริงที่ไม่เข้ารหัสในโฟลเดอร์ `site/` ก่อนจบ

## หน้าจอ

| หน้า | เนื้อหา |
|---|---|
| Executive Snapshot | KPI 4 ตัว · ภาพรวม 3 ด้าน (การเงิน / เดินระบบ / ความเสี่ยง) · กราฟรายเดือน · อันดับพื้นที่ · CEO Insights · รายการต้องติดตาม |
| ยอดเรียกเก็บและพื้นที่ | ผลงานรายพื้นที่ แยกส่วนงานบริหาร · ประเภทบริการและรายการหัก · ตาราง BL รายบรรทัด |
| ลูกหนี้และการรับชำระ | BL ที่ยังไม่รับชำระ · IV ค้างรับรอกระทบยอด · ยอดยกมาปี 2568 · อายุหนี้ · ความสัมพันธ์ BL → IV |
| เจ้าหนี้และภาระจัดซื้อ | ครบกำหนดแล้ว / 7 วัน / 30 วัน · ตามผู้ขาย พื้นที่ ประเภท · ภาระ PO แยกจากเจ้าหนี้ |
| การเดินระบบ (OM) | ปริมาณน้ำรับจริง เทียบสัญญา / แผน CP / แผนธุรกิจ / ปีก่อน รายพื้นที่ (จากไฟล์ OM) |
| สัญญาและความเสี่ยง | ทะเบียนสัญญา (รอข้อมูล) · Risk Register แยกข้อเท็จจริง / รอยืนยัน / ยังไม่มีข้อมูล |
| สถานะข้อมูล | ชุดข้อมูล เวลาที่ดึง ผลการตรวจ ข้อจำกัด mapping พื้นที่ และนิยาม KPI |

ทุก KPI กราฟ และแถวกดดูเอกสารที่ใช้คำนวณได้ · ตารางค้นหา กรอง เรียง แบ่งหน้า และส่งออก CSV (ป้องกัน formula injection) · ปุ่ม "พิมพ์ / บันทึก PDF" ใช้กับหน้า Executive

## โครงสร้าง (แยก 5 ชั้น)

```
scripts/ingest_session.py    1) Source adapter — เก็บ response ดิบจาก TRCLOUD (อ่านอย่างเดียว) → raw/
raw/                         2) Raw snapshot + raw/_manifest.json (เครื่องมือ พารามิเตอร์ เวลาที่ดึง จำนวนแถว)
scripts/build_snapshot.py    3) Normalization + ความสัมพันธ์เอกสาร + การตรวจ → data/snapshot.json
web/metrics.js               4) Metric calculations (ไม่มี DOM · ทดสอบด้วย node)
web/app.js, index.html, styles.css   5) Dashboard UI
scripts/import_om.py         นำเข้า Excel ของ OM → data/om.json (+ประวัติ revision)
scripts/import_contracts.py  นำเข้าทะเบียนสัญญา (CSV) → data/contracts.json
config/area_mapping.json     department ↔ รหัสพื้นที่ OM ↔ เฟส
config/settings.json         เกณฑ์เตือนภายใน (แยกจากกำหนดตามสัญญา)
templates/                   แม่แบบ CSV สำหรับ OM/ผู้ดูแลสัญญา (A–E)
docs/                        นิยาม KPI · สิ่งที่ต้องยืนยัน · คำถามถึง OM
tests/                       ชุดทดสอบ
```

จำนวนเงินคำนวณด้วย `Decimal` ปัดครึ่งขึ้นเป็นสตางค์ต่อบรรทัด แล้วเก็บ/รวมเป็นจำนวนเต็ม (สตางค์) ตลอดทั้งระบบ

## การอัปเดตข้อมูล

ระบบนี้**ไม่มีปุ่ม Refresh** เพราะ Web Server เรียก MCP ของ TRCLOUD เองไม่ได้ — connector ใช้ได้เฉพาะใน session ของผู้ช่วย (Claude)

1. ใน session ของผู้ช่วยที่เชื่อม MCP ของ SAM ให้ดึงรายงานชุดเดิม (ดู `raw/_manifest.json` — เฉพาะเครื่องมือ `get_*` / `search_*`)
2. `python3 scripts/ingest_session.py <transcript.jsonl>` — เก็บ response ดิบลง `raw/` (สคริปต์จะหยุดถ้าพบการเรียกเครื่องมือเขียนข้อมูล)
3. `python3 scripts/build_snapshot.py` — ถ้าชุดข้อมูลหลักไม่ครบ ซ้ำ หรือหัวเอกสารไม่ตรงกับบรรทัด จะ**ไม่เขียนทับ** snapshot เดิม
4. เปิดเว็บใหม่ — แถบสถานะจะแสดงเวลาที่ดึงชุดใหม่

ข้อมูล OM: `python3 scripts/import_om.py om/<ไฟล์>.xlsx` แล้วรันข้อ 3 (ไฟล์เดิมไม่ถูกนับซ้ำ ไฟล์แก้ไขได้ revision ใหม่)
ทะเบียนสัญญา: กรอก `templates/contracts.csv` → `python3 scripts/import_contracts.py <ไฟล์>` แล้วรันข้อ 3

### ถ้าต้องการเชื่อมต่อสด (ยังไม่ได้ทำ)
ต้องเพิ่ม (ก) สิทธิ์ API ของ TRCLOUD สำหรับ user อ่านอย่างเดียวของ SAM ที่เรียกจากเครื่องเซิร์ฟเวอร์ได้ (ข) adapter ที่เขียนไฟล์ `raw/*.json` + `raw/_manifest.json` รูปแบบเดียวกับ `ingest_session.py` (ค) ที่เก็บ credential นอก source code เช่น environment variable — ชั้น 3–5 ใช้ต่อได้โดยไม่ต้องแก้

## ทดสอบ

```
python3 -m unittest discover tests      # normalization, ปัดเศษ, ช่วงให้บริการ, WHT, ซ้ำ, ทะเบียนสัญญา
node --test tests/metrics.test.js       # BL/IV ไม่ซ้ำ, รายการหัก, อายุหนี้, MTD, ข้อมูลขาด, ตัวกรอง, CSV
node tests/ui_smoke.js <โฟลเดอร์ภาพ>     # ตรวจหน้าจอจริง (ต้องมี Playwright)
node tests/gate_test.js site <กุญแจ>    # จำลอง Microsoft 365: login, สิทธิ์กลุ่ม, กุญแจผิด, ออกจากระบบ
```

## ความปลอดภัย

- ใช้เครื่องมือ TRCLOUD แบบอ่านอย่างเดียว เฉพาะบริษัท SAM · ไม่มี credential ใน source code, frontend หรือ log
- `raw/`, `data/`, `om/` เป็นข้อมูลการเงินจริง — เก็บในโฟลเดอร์โครงการนี้เท่านั้น ห้ามขึ้น repository สาธารณะ (ดู `.gitignore`)
- เว็บจริงเปิดได้หลังเข้าสู่ระบบ Microsoft 365 + อยู่ในกลุ่ม `sam_dashboard_viewers` + อ่านไฟล์กุญแจใน SharePoint ได้ (แบบเดียวกับ STAR) · ข้อมูลบน GitHub เข้ารหัสทั้งหมด
- repo เป็นสาธารณะ (เพื่อใช้ GitHub Pages) — `.gitignore` กันข้อมูลดิบ เอกสารที่มีตัวเลขจริง และ mapping พื้นที่ ไม่ให้ขึ้น Git
