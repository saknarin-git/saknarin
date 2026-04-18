# saknarin

เว็บแอพสำหรับ "กลุ่มออมทรัพย์เพื่อการผลิต บ้านพิตำ"

## ความสามารถหลัก
- สมัครสมาชิกด้วยเลขสมาชิกที่ค้นหาอัตโนมัติจากคำนำหน้า ชื่อ และสกุล
- Login ด้วย Username และ Password
- ผู้ดูแลระบบต้องอนุมัติบัญชีก่อนเข้าใช้งานจริง
- หน้า DevManager สำหรับอนุมัติผู้ใช้ใหม่และตั้งค่าระบบ
- Frontend เตรียมสำหรับ GitHub Pages
- Backend เตรียมสำหรับ Supabase Edge Functions
- Auto Deploy ผ่าน GitHub Actions ทุกครั้งที่ push ไปที่ branch main

## โครงสร้าง
- src/ = Frontend React + Vite
- supabase/functions/ = Edge Functions แยกตามงาน
- .github/workflows/ = Auto Deploy
- supabase/sql/001_init_schema.sql = สร้างตารางเริ่มต้น

## ตั้งค่าก่อนใช้งาน
1. สร้างไฟล์ .env จาก .env.example
2. ใส่ค่า VITE_SUPABASE_ANON_KEY จริงของโปรเจกต์
3. รัน SQL ใน Supabase จากไฟล์ supabase/sql/001_init_schema.sql
4. เพิ่มข้อมูลสมาชิกจริงลงตาราง members
5. ตั้ง GitHub Secrets ดังนี้
   - VITE_SUPABASE_ANON_KEY
   - SUPABASE_ACCESS_TOKEN
6. เปิด GitHub Pages แบบ Source = GitHub Actions

## คำสั่งใช้งาน
```bash
npm install
npm run dev
npm run build
```

## สร้างผู้ดูแลระบบครั้งแรก
Deploy ฟังก์ชัน bootstrap-admin แล้วเรียก POST ไปที่
https://zpknotoujmvkeqeoqgyf.supabase.co/functions/v1/bootstrap-admin
พร้อม header x-bootstrap-token และ body ข้อมูลสมาชิก/admin ชุดแรก
