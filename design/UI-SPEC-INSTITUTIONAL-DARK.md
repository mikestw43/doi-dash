# UI Design System Spec — Institutional Dark Dashboard

> **สถานะ: ลงมือแล้ว (รอบแรก)** — สีและตัวอักษรเปลี่ยนตาม spec นี้แล้ว
> เหลือกราฟ ธีมสว่าง และฟอนต์ตัวจริง (ดูหัวข้อ "เหลืออะไรบ้าง" ท้ายไฟล์)
> ภาพอ้างอิงอยู่ใน `design/references/`

---

## 1. Visual Style & Theme Concept
- Concept: Modern Minimalist / Institutional Dark Dashboard (Clean, Professional, Non-glare)
- Visual Mood: High-contrast dark mode, clean typography, spatial padding, zero neon/cyberpunk glow effects.
- Primary Elements: Rounded rectangle cards, subtle border dividers, clean alignment, clear typographic hierarchy.

## 2. Color Palette & Tokens
- Main Background: `#121316` (Deep Charcoal Black)
- Card / Panel Background: `#1A1C20` (Dark Slate Gray)
- Primary Text / Numbers: `#ECEED1` / `#FFFFFF` (High Contrast White)
- Secondary Text / Labels: `#8E95A2` (Muted Light Gray)
- Border / Dividers: `#2A2D34` (Subtle Dark Border)

### Semantic Colors (Status Indicators)
- Profit / Positive Gain: `#34D399` (Emerald Mint)
  - Badge Background: `#34D3991A` (10–15% Opacity)
- Loss / Negative Drawdown: `#F87171` (Soft Coral Red)
  - Badge Background: `#F871711A` (10–15% Opacity)
- Neutral / Unchanged: `#9CA3AF` (Muted Gray)

## 3. Typography Rules & Hierarchy

### A. LEMON MILK BOLD (Headers & Titles)
- Use Case: App Bar Title (`DOI DASH`), Main Section Titles (`PORTFOLIO`, `ANALYTICS`)
- Size: 16–18px (All Caps)
- Tracking / Letter Spacing: +0.5px to +1px
- Role: Defines major section visual anchors. Strictly avoid long text body or dense tables.

### B. TERMINA (Metrics, Numbers & EN Body)
- Use Case: Hero Numbers, P/L Values, Table Data, Calendar Metrics, Labels
- Font Weights & Sizes:
  - Hero Metrics (Total Balance, Equity): Termina Bold / Semibold, 24–32px
  - Secondary Metrics & Table Values: Termina Medium, 13–15px
  - Field Labels & Subheaders: Termina Medium, 11–12px (Muted `#8E95A2`)
- Role: Wide geometric structure ensures maximum readability for numeric financial data.

### C. KANIT (Thai Text & Descriptions)
- Use Case: Thai UI Labels, Portfolio Summaries, System Alerts, Thai Descriptions
- Font Weights & Sizes: Kanit Regular / Light, 12–14px (Line Height 1.4–1.5)
- Role: Modern loopless sans-serif providing seamless visual harmony with Termina.

## 4. UI Layout & Component Guidelines
1. Layout Structure: Mobile-first responsive card grid with fixed top bar and bottom tab navigation.
2. Data Visualization: Use soft-colored area charts and heatmaps instead of saturated neon graphs.
3. Component Separation: Maintain subtle border lines (`#2A2D34`) or distinct dark background cards
   (`#1A1C20`) without heavy drop shadows or glows.

---

# บันทึกเพิ่มเติม — สิ่งที่ต้องทำตอนลงมือจริง

ส่วนด้านล่างนี้ไม่ใช่ตัว spec แต่เป็นการสำรวจโค้ดปัจจุบันว่าห่างจาก spec แค่ไหน

## ของเดิมเป็นแบบไหน (ก่อนแก้)

ธีมเดิมเป็นแนว **retro terminal / พิกเซล** คนละทางกับ spec นี้เกือบทั้งหมด

| | ตอนนี้ | ตาม spec ใหม่ |
|---|---|---|
| พื้นหลัง | `#0f172a` (น้ำเงินกรมท่า) | `#121316` (ดำถ่าน) |
| การ์ด | `#1e293b` | `#1A1C20` |
| ฟอนต์หัวข้อ | Press Start 2P (พิกเซล) | LEMON MILK BOLD |
| ฟอนต์ตัวเลข | Share Tech Mono / VT323 | TERMINA |
| ฟอนต์ไทย | ไม่มีแยก | KANIT |
| เอฟเฟกต์ | มี glow / text-shadow | **ห้ามมี** |
| มุมการ์ด | เหลี่ยม | มน (rounded) |

## ข่าวดี: ธีมผูกกับตัวแปรชุดเดียว

`frontend/src/index.css` เก็บสีและฟอนต์ไว้เป็น CSS variable ทั้งหมด
และโค้ดเรียกใช้ผ่านตัวแปรแล้ว **428 จุด** — เปลี่ยนค่าที่เดียวเปลี่ยนทั้งเว็บ

### ตารางแปลงค่า (พร้อมใช้)

| ตัวแปร | ค่าเดิม | ค่าใหม่ |
|---|---|---|
| `--bg-primary` / `--bg` | `#0f172a` | `#121316` |
| `--bg-secondary` / `--bg-nav` | `#0c1422` | `#121316` |
| `--bg-card` | `#1e293b` | `#1A1C20` |
| `--bg-tertiary` / `--bg-card2` / `--bg-input` | `#162032` | `#1A1C20` |
| `--border-color` | `#162032` | `#2A2D34` |
| `--border2` | `#2d4060` | `#2A2D34` |
| `--text-primary` / `--text` | `#e5e7eb` | `#FFFFFF` |
| `--text-secondary` | `#94a3b8` | `#8E95A2` |
| `--text-muted` / `--text-dim` | `#64748b` | `#8E95A2` |
| `--success` / `--green` | `#22c55e` | `#34D399` |
| `--danger` / `--red` | `#ef4444` | `#F87171` |
| `--warning` / `--yellow` | `#facc15` | ยังไม่ได้ระบุใน spec — ต้องเลือก |
| `--accent-blue` / `--cyan` | `#38bdf8` | ยังไม่ได้ระบุใน spec — ต้องเลือก |
| `--ff-title` / `--ff-section` | `'Press Start 2P'` | `'LEMON MILK', sans-serif` |
| `--ff-body` / `--ff-input` / `--ff-label` | `'Share Tech Mono'` | `'Termina', sans-serif` |
| `--ff-display` / `--ff-micro` | `'VT323'` | `'Termina', sans-serif` |
| (ใหม่) `--ff-thai` | — | `'Kanit', sans-serif` |
| (ใหม่) `--radius-card` | — | ต้องกำหนด เช่น `10px` |

> **2 สีที่ spec ยังไม่ได้ระบุ:** สีเตือน (warning) กับสี accent ที่ใช้กับปุ่ม/ลิงก์/เส้นกราฟ
> ต้องเลือกเพิ่มก่อนลงมือ ไม่งั้นจะเหลือสีฟ้า-เหลืองของธีมเก่าค้างอยู่

## ทำไปแล้วอะไรบ้าง

1. **ชุดสีทั้งหมด** เปลี่ยนตามตารางข้างบน ทั้งใน `index.css` และค่าที่เขียนตรง ๆ
   ในไฟล์คอมโพเนนต์อีก 39 ไฟล์ (227 บรรทัด)
2. **ลบเอฟเฟกต์เรืองแสงหมดแล้ว** — `textShadow` / `boxShadow` 46 จุดในคอมโพเนนต์
   กับเงาแบบพิกเซลใน CSS หายหมด เหลือเฉพาะในธีม HUD ที่เป็นธีมแยก
3. **ลบพื้นหลังตาราง + เส้นสแกนไลน์** ออกจาก `body` เหลือสีพื้นเรียบตาม spec
4. **การ์ดมีมุมมน** (`--radius-card: 10px`) ขอบเป็นเส้นบาง `#2a2d34` ไม่ใช่กรอบสีจัด
   สถานะ (offline / demo / เตือน) แสดงด้วยขอบซ้าย 2px แทนการย้อมทั้งกรอบ
5. **ตัวเลขเป็นสีขาว** ยกเว้นกำไร/ขาดทุนที่ยังเขียว-แดงตาม spec
   (เดิม equity เหลือง, margin ฟ้า, margin level เขียว — อ่านเป็นสถานะทั้งที่ไม่ใช่)
6. **สเกลตัวอักษรใหม่ทั้งชุด** หัวข้อ 8-10px → 13-18px ตาม spec
   และใส่ `tabular-nums` ให้ตัวเลขในตารางเรียงตรงหลัก
7. **ฟอนต์** เปลี่ยนเป็น Archivo + Kanit (ดูหัวข้อถัดไป)

## เรื่องฟอนต์ที่ต้องเช็กก่อน

| ฟอนต์ | สถานะ |
|---|---|
| **Kanit** | ฟรี อยู่บน Google Fonts ใช้ได้เลย |
| **LEMON MILK** | ฟรีเฉพาะใช้ส่วนตัว — ใช้เชิงพาณิชย์ต้องซื้อ license |
| **Termina** | ฟอนต์ขาย ต้องซื้อ webfont license |

ทั้งสองตัวไม่มีบน Google Fonts **ตอนนี้จึงใช้ Archivo แทนไปก่อน** (ฟรี จาก Google Fonts)
ส่วนข้อความไทยใช้ **Kanit** ตาม spec แล้ว — Archivo ไม่มีตัวอักษรไทย เลยวาง Kanit ต่อท้าย
ในทุก font stack ข้อความไทยจึงตกไปใช้ Kanit เองอัตโนมัติ

**พอซื้อฟอนต์จริงแล้วเปลี่ยนยังไง** — วางไฟล์ `.woff2` ไว้ที่ `frontend/public/fonts/`
ประกาศ `@font-face` ใน `index.css` แล้วแก้ token 2 กลุ่มนี้:

```css
--ff-title / --ff-section   →  'LEMON MILK', 'Kanit', sans-serif
--ff-body / --ff-input / --ff-label / --ff-micro / --ff-display
                            →  'Termina', 'Kanit', sans-serif
```

เท่านี้ทั้งเว็บเปลี่ยนตาม ไม่ต้องแก้ไฟล์คอมโพเนนต์เลย

## ภาพอ้างอิง

- `design/references/reference-desktop-institutional-dark.webp` — โทนและการจัดวางแบบ dashboard ที่ต้องการ
- `design/references/reference-mobile-doi-dash.jpg` — mockup มือถือของ DOI DASH เอง (การ์ด KPI, heatmap, calendar)


---

## เหลืออะไรบ้าง

1. **กราฟ** — `PnLChart`, `EquityChart` (Recharts) ยังเป็นเส้นสีเดิม
   spec อยากได้ area chart สีนวล
2. **ฟอนต์ตัวจริง** — Lemon Milk + Termina (ดูวิธีเปลี่ยนข้างบน)
3. **ธีมสว่าง (light) กับธีม HUD** — ยังเป็นชุดสีเดิม ธีมหลัก (dark) เปลี่ยนแล้ว
4. **2 สีที่ spec ไม่ได้ระบุ** — ตอนนี้เลือกให้ก่อนแล้ว: เตือน `#fbbf24` (amber),
   accent `#60a5fa` (blue) ทั้งคู่อยู่ระดับเดียวกับเขียว/แดงใน spec ถ้าอยากได้สีอื่นบอกได้
