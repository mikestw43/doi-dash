# ย้าย OnlyFunds ไปรันบน VPS ตัวเดียว

คู่มือนี้พาไปทีละขั้น ตั้งแต่ VPS เปล่า ๆ จนเว็บใช้งานได้จริง
คัดลอกคำสั่งไปวางในหน้าต่าง SSH ได้เลย ไม่ต้องแก้โค้ดอะไรเพิ่ม

**ของเดิม:** Frontend อยู่ Vercel + Backend/Postgres อยู่ Railway
**ของใหม่:** VPS 1 เครื่อง → Nginx (เสิร์ฟหน้าเว็บ + ต่อ API) → Node.js (PM2) → SQLite 1 ไฟล์
**ค่าใช้จ่าย:** ~$5/เดือน (ค่า VPS อย่างเดียว) + ค่าโดเมนปีละประมาณ $10

---

## ขั้น 0 — เตรียมของ 2 อย่าง

1. **VPS** แรม 1–2 GB, Ubuntu 22.04 หรือ 24.04 เช่น
   Hetzner CX22 (~€4), DigitalOcean $6, Vultr $5, Contabo $5
   *แนะนำ 2 GB ถ้าเลือกได้ เพราะตอน build หน้าเว็บกินแรม*
2. **โดเมน** เช่น `dash.yourname.com` — จำเป็นถ้าอยากได้ HTTPS (แม่กุญแจ)
   ยังไม่มีโดเมนก็ติดตั้งก่อนได้ ใช้เลข IP ไปพลาง ๆ แล้วค่อยรันสคริปต์ซ้ำทีหลัง

> MT5 บังคับให้ EA ยิงเข้า URL ที่อยู่ใน whitelist และควรเป็น `https://`
> ถ้าใช้ IP เปล่า ๆ EA จะส่งข้อมูลแบบไม่เข้ารหัส — ใช้ทดสอบได้ แต่อย่าใช้จริงยาว ๆ

---

## ขั้น 1 — ชี้โดเมนมาที่ VPS

ในหน้าจัดการโดเมน เพิ่ม DNS record:

| Type | Name | Value |
|------|------|-------|
| A    | dash | (เลข IP ของ VPS) |

รอ 5–30 นาที แล้วเช็กจากเครื่องตัวเองว่าชี้ถูกหรือยัง:

```bash
ping dash.yourname.com
```

---

## ขั้น 2 — เข้า VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## ขั้น 3 — ดึงโค้ดลง VPS

```bash
apt update && apt install -y git
git clone https://github.com/mikestw43/onlyfunds.git /opt/onlyfunds
cd /opt/onlyfunds
```

---

## ขั้น 4 — รันสคริปต์ติดตั้ง

```bash
bash deploy/setup.sh dash.yourname.com
```

ใช้เวลาประมาณ 5–10 นาที สคริปต์จะทำให้ทั้งหมดนี้เอง:

- อัปเดตระบบ + สร้าง swap 2 GB (กัน build ตาย)
- ติดตั้ง Node.js 22, PM2, Nginx, Certbot, SQLite
- สร้าง `backend/.env` พร้อมรหัสลับแบบสุ่ม
- build backend + frontend
- สร้างฐานข้อมูล SQLite + ผู้ใช้ admin
- ตั้ง Nginx + เปิดใช้ PM2 ให้สตาร์ตเองตอนรีบูต
- ตั้งสำรองข้อมูลอัตโนมัติทุกคืนตี 3

ตอนท้ายสคริปต์จะถามเรื่อง SSL — ถ้า DNS ชี้มาแล้วให้ตอบ `y`
Certbot จะขอใบรับรองให้ แล้วบังคับ https อัตโนมัติ

**ยังไม่มีโดเมน?** ใส่เลข IP แทนได้ `bash deploy/setup.sh 203.0.113.10`
(จะข้ามขั้น SSL ให้เอง) พอมีโดเมนแล้วค่อยรันสคริปต์ซ้ำด้วยชื่อโดเมน

---

## ขั้น 5 — ย้ายข้อมูลเดิมจาก Railway (ข้ามได้ถ้าเริ่มใหม่)

ทำบน VPS เครื่องเดียวกัน ตอนนี้ Railway ยังต้องเปิดอยู่

1. เปิด Railway → เลือก service **Postgres** → แท็บ **Variables**
   → คัดลอกค่า **`DATABASE_PUBLIC_URL`**
   (ต้องเป็นตัว public — ตัวที่ลงท้าย `.railway.internal` ใช้จากข้างนอกไม่ได้)

2. ดึงข้อมูลออกมาเป็นไฟล์เดียว:

```bash
cd /opt/onlyfunds
bash deploy/migrate-data/export-from-railway.sh "postgresql://...ที่คัดลอกมา..."
```

3. ยัดข้อมูลเข้า SQLite:

```bash
bash deploy/migrate-data/import-to-sqlite.sh
```

สคริปต์จะถามว่าจะเก็บฐานข้อมูลเปล่าที่เพิ่งสร้างไว้ข้าง ๆ ไหม
— ถ้าเพิ่งติดตั้งเสร็จและยังไม่มีข้อมูลอะไร ให้ตอบ `y`

4. เข้าเว็บแล้วล็อกอินด้วยบัญชีเดิมจาก Railway เพื่อเช็กว่าข้อมูลมาครบ

> รันซ้ำได้ ข้อมูลไม่ซ้ำซ้อน — แถวที่มีอยู่แล้วจะถูกข้าม

---

## ขั้น 6 — ตรวจว่าทุกอย่างทำงาน

```bash
curl https://dash.yourname.com/api/health     # ต้องได้ status: ok
pm2 status                                    # onlyfunds-api ต้องเป็น online
```

แล้วเปิดเว็บ `https://dash.yourname.com` ลองล็อกอิน
ถ้าเป็นการติดตั้งใหม่ ใช้ `admin@onlyfunds.com` / `password`
**แล้วรีบเปลี่ยนรหัสผ่านทันที**

---

## ขั้น 7 — แจ้งผู้ใช้ให้ย้าย EA

EA ตัวเดิมในเครื่องผู้ใช้ยังยิงไป Railway อยู่ ต้องให้แต่ละคนแก้ 2 จุดใน MT5
(ไม่ต้องดาวน์โหลด EA ใหม่ แค่แก้ค่าในหน้าตั้งค่า)

1. คลิกขวาที่ EA บนชาร์ต → **Properties** → ช่อง **ServerURL**
   เปลี่ยนเป็น `https://dash.yourname.com`
2. **Tools → Options → Expert Advisors** → **Allow WebRequest for listed URL**
   → เพิ่ม `https://dash.yourname.com` (ลบอันเก่าของ Railway ออกได้)

หน้า Accounts และหน้า Download ในเว็บจะโชว์ URL ใหม่ให้อัตโนมัติแล้ว

> **สำคัญ:** อย่าเพิ่งปิด Railway จนกว่าผู้ใช้จะย้าย EA ครบ
> ระหว่างนี้ปล่อยให้ทั้งสองที่รันคู่กันไปก่อนสัก 1–2 สัปดาห์ก็ได้

---

## ขั้น 8 — ปิดของเก่า (เมื่อมั่นใจแล้ว)

1. **Railway** → Project Settings → Delete Project (หรือหยุด service ไว้ก่อน)
2. **Vercel** → Project Settings → Delete Project
3. ถ้าเคยใช้โดเมนเดิมชี้ไป Vercel ให้แก้ DNS มาที่ IP ของ VPS
4. ถ้าใช้ Google Login ดูหัวข้อถัดไป

---

## เปิดใช้ Google Login (ไม่บังคับ)

ปุ่ม Google จะไม่ขึ้นเลยจนกว่าจะตั้งค่า **2 ที่ ต้องใส่ทั้งคู่** —
ฝั่งหน้าเว็บใช้แสดงปุ่ม ฝั่งเซิร์ฟเวอร์ใช้ตรวจว่า token ที่ส่งมาออกให้แอปเราจริง
ใส่แค่ที่เดียวจะกดปุ่มแล้วล็อกอินไม่ผ่าน โดยไม่มีข้อความบอกสาเหตุ

1. เข้า **Google Cloud Console → APIs & Services → Credentials**
   - ยังไม่มีก็สร้าง **OAuth client ID** แบบ **Web application**
   - ช่อง **Authorized JavaScript origins** ใส่ URL ของเว็บ เช่น `https://onlyfunds.duckdns.org`
   - คัดลอก **Client ID** (ลงท้ายด้วย `.apps.googleusercontent.com`)

2. บน VPS:

```bash
cd /opt/onlyfunds
CLIENT_ID="วาง-client-id-ตรงนี้"

sed -i "s|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=$CLIENT_ID|" frontend/.env
grep -q '^GOOGLE_CLIENT_ID=' backend/.env \
  && sed -i "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=$CLIENT_ID|" backend/.env \
  || echo "GOOGLE_CLIENT_ID=$CLIENT_ID" >> backend/.env

bash deploy/update.sh
```

> บัญชีที่สมัครผ่าน Google **ไม่ต้องรอแอดมินอนุมัติ** เพราะ Google ยืนยันอีเมลมาแล้ว
> ต่างจากสมัครด้วยรหัสผ่านที่ต้องรออนุมัติก่อนใช้งาน

---

## ใช้งานประจำวัน

| อยากทำอะไร | คำสั่ง |
|---|---|
| ดูสถานะ | `pm2 status` |
| ดู log สด | `pm2 logs onlyfunds-api` |
| รีสตาร์ต API | `pm2 restart onlyfunds-api` |
| อัปเดตโค้ดใหม่ | `cd /opt/onlyfunds && bash deploy/update.sh` |
| เปิดอัปเดตอัตโนมัติ | `bash /opt/onlyfunds/deploy/auto-update.sh --install` |
| สำรองข้อมูลเดี๋ยวนี้ | `bash /opt/onlyfunds/deploy/backup.sh` |
| ดูไฟล์สำรอง | `ls -lh /opt/onlyfunds/backups` |

ไฟล์สำรองเก็บไว้ 14 ชุดล่าสุด สำรองอัตโนมัติทุกคืนตี 3 และก่อน `update.sh` ทุกครั้ง

**ดึงไฟล์สำรองมาเก็บที่เครื่องตัวเอง** (รันบนเครื่องตัวเอง ไม่ใช่บน VPS):

```bash
scp root@YOUR_VPS_IP:/opt/onlyfunds/backups/*.gz ~/Downloads/
```

---

## อัปเดตอัตโนมัติ (ไม่ต้องพิมพ์คำสั่งเอง)

ตั้งครั้งเดียว แล้วเซิร์ฟเวอร์จะอัปเดตตัวเองทุกครั้งที่มีโค้ดใหม่บน GitHub

```bash
bash /opt/onlyfunds/deploy/auto-update.sh --install
```

ตั้งแล้วเซิร์ฟเวอร์จะเช็ก GitHub ทุก 5 นาที ถ้าไม่มีอะไรใหม่ก็ไม่ทำอะไรเลย
(แค่เช็ก ไม่กิน CPU) ถ้ามีคอมมิตใหม่ถึงจะ deploy ให้เอง

| อยากทำอะไร | คำสั่ง |
|---|---|
| ดูว่าอัปเดตอะไรไปบ้าง | `tail -f /var/log/onlyfunds-auto-update.log` |
| ปิดอัปเดตอัตโนมัติ | `bash /opt/onlyfunds/deploy/auto-update.sh --uninstall` |

**ถ้า deploy ล้มเหลว** มันจะเขียนบอกใน log แล้ว**หยุดลองคอมมิตนั้น** ไม่วนซ้ำ
ทุก 5 นาทีจนเซิร์ฟเวอร์ทำงานหนัก — เว็บยังรันเวอร์ชันเดิมที่ใช้ได้อยู่ พอมี
คอมมิตใหม่เข้ามาถึงจะลองอีกครั้ง


## เวลามีปัญหา

**เว็บขึ้น 502 Bad Gateway** — backend ไม่ได้รัน
```bash
pm2 status
pm2 logs onlyfunds-api --lines 50
```

**เว็บเปิดได้แต่ข้อมูลไม่ขึ้น / ขึ้นว่า offline** — ดูว่า EA ยิงเข้ามาไหม
```bash
pm2 logs onlyfunds-api | grep mt5
```

**แก้ Nginx แล้วเว็บพัง**
```bash
nginx -t                  # บอกว่าผิดบรรทัดไหน
systemctl restart nginx
```

**ใบรับรอง SSL หมดอายุ** — ปกติต่ออายุเองอัตโนมัติ สั่งเองได้ด้วย
```bash
certbot renew --dry-run   # ทดสอบ
certbot renew             # ต่อจริง
```

**ดิสก์เต็ม**
```bash
df -h
pm2 flush                 # ล้าง log เก่า
```

---

## ไฟล์อะไรอยู่ตรงไหน

```
/opt/onlyfunds/
├── backend/
│   ├── .env               ← รหัสลับ + ที่อยู่ฐานข้อมูล (ห้ามลบ ห้ามขึ้น git)
│   ├── onlyfunds.db        ← ฐานข้อมูลทั้งหมดอยู่ในไฟล์นี้ไฟล์เดียว
│   └── dist/              ← โค้ดที่ build แล้ว (PM2 รันตัวนี้)
├── frontend/dist/         ← หน้าเว็บที่ build แล้ว (Nginx เสิร์ฟตรงนี้)
├── backups/               ← ไฟล์สำรองฐานข้อมูล
├── logs/                  ← log ของ API
└── deploy/                ← สคริปต์ทั้งหมดในคู่มือนี้
```

ไฟล์ตั้งค่า Nginx อยู่ที่ `/etc/nginx/sites-available/onlyfunds`
