/* ตั้งค่าการเข้าสู่ระบบ Microsoft 365 ของ SAM Executive Snapshot (เว็บ static บน GitHub Pages)
   ไม่มีความลับในไฟล์นี้ (client/tenant/group ID เปิดเผยได้) — คัดลอกเป็น static/auth-config.js แล้วใส่ค่าจริง */
window.DASH_AUTH = {
  clientId: '75b5084b-4823-4a13-bb79-d47af910fb21',   // App registration เดิม "CCC Staff Status Login" (ใช้ร่วมกับ STAR)
  tenantId: '54cf0b45-7b5b-41b0-bbeb-dddef5eae512',
  groupId: 'd71d2b3e-cbb6-4a29-b72e-24788bedb7df',   // sam_dashboard_viewers (สร้าง 15 พ.ย. 2569)
  groupName: 'sam_dashboard_viewers',
  keyShareUrl: 'https://sevenutilitiesandpower.sharepoint.com/:t:/g/IQCTCXqGUFBeR7EDnk-uM5NwAefdNVuoMvWZB2IIwPfnjRc?e=gj9Qpl',   // แชร์เฉพาะ sam_dashboard_viewers (15 พ.ย. 2569)
  // redirectUri: 'https://energyforsociety.github.io/SAM-Executive-Snapshot/',   // ไม่ใส่ = ใช้ URL ของหน้าเว็บเอง
};
