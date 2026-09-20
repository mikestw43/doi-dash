# รัน OnlyFunds บนคอมตัวเอง (สำหรับปรับ UI)

ปรับหน้าตาเว็บในเครื่องตัวเองเร็วกว่าแก้บนเซิร์ฟเวอร์มาก —
แก้ไฟล์ปุ๊บ หน้าเว็บในเบราว์เซอร์เปลี่ยนทันทีภายในไม่ถึงวินาที
ไม่ต้องรอ build ไม่ต้องรอ deploy และไม่กระทบเว็บจริงที่ลูกค้าใช้อยู่

ฐานข้อมูลเป็นไฟล์ SQLite ไฟล์เดียวในเครื่องคุณ ไม่ต้องต่อ cloud ไม่ต้องมีอินเทอร์เน็ต

---

## ครั้งแรกครั้งเดียว — ติดตั้ง 2 โปรแกรม

1. **Node.js** เวอร์ชัน 22 LTS → https://nodejs.org (กด Next รัว ๆ ได้เลย)
2. **Git** → https://git-scm.com/downloads

ติดตั้งเสร็จเปิดหน้าต่างคำสั่งขึ้นมา
(Windows: กด Start พิมพ์ `PowerShell` — Mac: เปิด `Terminal`)
แล้วเช็กว่าติดตั้งผ่าน:

```bash
node -v      # ต้องขึ้น v22.x.x
git --version
```

แนะนำลง **VS Code** (https://code.visualstudio.com) ไว้เปิดดูโค้ดด้วย จะสะดวกกว่ามาก

---

## โหลดโปรเจกต์ลงเครื่อง

```bash
git clone https://github.com/mikestw43/onlyfunds.git
cd onlyfunds
git checkout claude/doi-dash-vps-migration-ljlqso
```

> ถ้าเครื่องคุณมีโฟลเดอร์ `doi-dash` จากรอบก่อนอยู่แล้ว ใช้อันเดิมต่อได้เลย
> ไม่ต้องโคลนใหม่ — GitHub จะส่งต่อชื่อเก่าไปชื่อใหม่ให้เอง แค่สั่ง `git pull`
> (ชื่อ branch ยังเป็นชื่อเดิมอยู่ เพราะเป็นชื่อ branch ไม่ใช่ชื่อโปรเจกต์)

---

## ตั้งค่าครั้งแรก (ทำครั้งเดียว ใช้เวลา 2–3 นาที)

**Windows (PowerShell):**
```powershell
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
cd backend
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run seed:demo
cd ..\frontend
npm install
cd ..
```

**Mac / Linux:**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd backend && npm install && npx prisma generate && npx prisma db push && npm run seed && npm run seed:demo
cd ../frontend && npm install
cd ..
```

`npm run seed:demo` จะใส่บัญชีตัวอย่าง 5 บัญชี พร้อมออเดอร์ กำไร/ขาดทุน
และตัวเลขที่ขยับเองตลอดเวลา จะได้มีของให้ดูตอนปรับ UI

---

## รันทุกครั้งที่จะทำงาน — เปิด 2 หน้าต่าง

**หน้าต่างที่ 1 (backend):**
```bash
cd onlyfunds/backend
npm run dev
```

**หน้าต่างที่ 2 (หน้าเว็บ):**
```bash
cd onlyfunds/frontend
npm run dev
```

แล้วเปิดเบราว์เซอร์ไปที่ **http://localhost:5173**

ล็อกอินด้วย `admin@onlyfunds.com` / `password`

> ปิดงานก็แค่กด `Ctrl + C` ในทั้งสองหน้าต่าง

---

## ปรับ UI

ไฟล์หน้าตาเว็บอยู่ใน `frontend/src/components/` แยกตามหน้า เช่น

| อยากแก้หน้าไหน | ไฟล์ |
|---|---|
| การ์ดสรุปด้านบน | `components/overview/SummaryCards.tsx` |
| ตาราง/การ์ดบัญชี | `components/bots/BotTable.tsx`, `BotCard.tsx` |
| หน้า Analytics | `components/analytics/` |
| หน้า Calendar | `components/calendar/EconomicCalendar.tsx` |
| แถบหัวเว็บ | `components/layout/Header.tsx` |
| สี ฟอนต์ ธีมรวม | `src/index.css` |
| ข้อความไทย/อังกฤษ | `src/i18n/th.json`, `en.json` |

เซฟไฟล์ปุ๊บ เบราว์เซอร์อัปเดตเองทันที ไม่ต้องกด refresh

---

## พอใจแล้ว เอาขึ้นเว็บจริงยังไง

```bash
git add -A
git commit -m "ปรับ UI หน้าแรก"
git push
```

แล้วบน VPS สั่ง:
```bash
cd /opt/onlyfunds && bash deploy/update.sh
```

หรือจะไม่แตะ git เองเลยก็ได้ — สั่งผ่าน Claude ให้ push ให้ แล้วคุณแค่รัน `update.sh` บน VPS

---

## เจอปัญหาบ่อย ๆ

**`npm run dev` ขึ้นว่า port ถูกใช้อยู่** — มีหน้าต่างเก่าค้างอยู่ ปิดให้หมดแล้วเปิดใหม่

**หน้าเว็บขึ้นแต่ตัวเลขไม่ขยับ / ขึ้น offline** — ลืมเปิดหน้าต่าง backend (หน้าต่างที่ 1)

**อยากล้างข้อมูลเริ่มใหม่:**
```bash
cd backend
rm prisma/dev.db            # Windows: del prisma\dev.db
npx prisma db push
npm run seed
npm run seed:demo
```

**`npm install` ช้ามาก** — ครั้งแรกโหลดเยอะจริง รอ 3–5 นาที ครั้งต่อไปเร็วแล้ว

**แก้แล้วพัง อยากย้อนกลับ:**
```bash
git checkout .              # ทิ้งทุกอย่างที่แก้ กลับไปเหมือนตอนโหลดมา
```

---

## ข้อควรรู้

- ฐานข้อมูลในเครื่อง (`backend/prisma/dev.db`) แยกกับของจริงบน VPS คนละไฟล์
  ลบเล่นได้ ไม่กระทบลูกค้า
- ไฟล์ `.env` ทั้งสองอันไม่ขึ้น git — รหัสลับอยู่ในเครื่องคุณเท่านั้น
- **อย่ารัน `npm run seed:demo` บน VPS** มันมีไว้สำหรับเครื่องตัวเองเท่านั้น
