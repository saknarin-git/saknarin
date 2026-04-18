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
- supabase/migrations/ = Database migrations สำหรับสร้าง schema บน Supabase
- .github/workflows/ = Auto Deploy
- supabase/sql/001_init_schema.sql = สร้างตารางเริ่มต้น

## ตั้งค่าก่อนใช้งาน
1. สร้างไฟล์ .env จาก .env.example
2. ใส่ค่า VITE_SUPABASE_ANON_KEY ของโปรเจกต์ โดยต้องเป็น public anon key หรือ publishable key เท่านั้น
3. ห้ามนำ secret key, service role key หรือ key ที่ขึ้นต้นด้วย sb_secret_ มาใส่ใน frontend
4. รัน SQL ใน Supabase จากไฟล์ supabase/sql/001_init_schema.sql
5. เพิ่มข้อมูลสมาชิกจริงลงตาราง members
6. ตั้ง GitHub Secrets ดังนี้
   - VITE_SUPABASE_ANON_KEY
   - SUPABASE_ACCESS_TOKEN
   - SUPABASE_DB_PASSWORD
   - BOOTSTRAP_ADMIN_TOKEN
7. เปิด GitHub Pages แบบ Source = GitHub Actions

หมายเหตุเพิ่มเติม: workflow backend จะ deploy functions และพยายาม push database migrations อัตโนมัติจากโฟลเดอร์ supabase/migrations ถ้ามีการตั้งค่า SUPABASE_DB_PASSWORD ไว้ใน GitHub Secrets แล้ว

หมายเหตุ: ฝั่ง frontend ในโปรเจกต์นี้จะส่งค่า VITE_SUPABASE_ANON_KEY ไปกับ request ไปยัง Supabase Edge Functions ดังนั้นค่านี้ต้องเป็น public key ที่เปิดเผยได้เท่านั้น

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
