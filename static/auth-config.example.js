/* ตั้งค่าการเข้าสู่ระบบ Microsoft 365 ของ SAM Executive Snapshot (เว็บ static บน GitHub Pages)
   ไม่มีความลับในไฟล์นี้ (client/tenant/group ID เปิดเผยได้) — คัดลอกเป็น static/auth-config.js แล้วใส่ค่าจริง */
window.DASH_AUTH = {
  clientId: '75b5084b-4823-4a13-bb79-d47af910fb21',   // App registration เดิม "CCC Staff Status Login" (ใช้ร่วมกับ STAR)
  tenantId: '54cf0b45-7b5b-41b0-bbeb-dddef5eae512',
  groupId: '<Object ID ของกลุ่ม sam_dashboard_viewers>',
  groupName: 'sam_dashboard_viewers',
  keyShareUrl: '<ลิงก์แชร์ไฟล์กุญแจ sam-dash-key.txt ใน SharePoint (แชร์เฉพาะ sam_dashboard_viewers สิทธิ์ View)>',
  // redirectUri: 'https://energyforsociety.github.io/SAM-Executive-Snapshot/',   // ไม่ใส่ = ใช้ URL ของหน้าเว็บเอง
};
