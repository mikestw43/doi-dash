# UI Design System Spec — Institutional Dark Dashboard

> **สถานะ: บันทึกไว้ ยังไม่ได้ลงมือทำ** — spec ที่ตกลงไว้สำหรับธีมใหม่ของ DOI DASH
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

## ของเดิมตอนนี้เป็นแบบไหน

ธีมปัจจุบันเป็นแนว **retro terminal / พิกเซล** คนละทางกับ spec ใหม่เกือบทั้งหมด

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

## งานที่ต้องทำมือ (ตัวแปรช่วยไม่ได้)

1. **ลบ glow ทั้งหมด** — spec บอก "zero glow" แต่โค้ดยังมี `textShadow`/`boxShadow` ~46 จุด
   และตัวแปร `--glow-*` อีก 8 จุด
2. **สีที่เขียนตรง ๆ ในไฟล์ ~68 จุด** ไม่ได้ผ่านตัวแปร กระจายอยู่ตามไฟล์
   โดยเฉพาะ `GroupManager.tsx`, `PnLChart.tsx`, `EquityChart.tsx`, `LoginPage.tsx`
3. **มุมมน** — ตอนนี้มีแค่ 10 จุดที่ตั้ง `borderRadius` ต้องเพิ่มให้ทั่วทั้งการ์ด
4. **ขนาดฟอนต์** — spec ใช้ 11–32px แต่สเกลเดิม (`--fs-*`) เล็กกว่ามาก
   (หัวข้อ 8–10px เพราะฟอนต์พิกเซลกว้าง) ต้องปรับสเกลใหม่ทั้งชุด
5. **กราฟ** — `PnLChart` / `EquityChart` (Recharts) ต้องเปลี่ยนเป็น area chart สีนวล ไม่ใช่เส้นสด

## เรื่องฟอนต์ที่ต้องเช็กก่อน

| ฟอนต์ | สถานะ |
|---|---|
| **Kanit** | ฟรี อยู่บน Google Fonts ใช้ได้เลย |
| **LEMON MILK** | ฟรีเฉพาะใช้ส่วนตัว — ใช้เชิงพาณิชย์ต้องซื้อ license |
| **Termina** | ฟอนต์ขาย ต้องซื้อ webfont license |

ทั้งสองตัวไม่มีบน Google Fonts ต้องซื้อแล้วเอาไฟล์ `.woff2` มาวางใน `frontend/public/fonts/`
แล้วประกาศ `@font-face` เอง (ต่างจากตอนนี้ที่โหลดจาก Google Fonts ผ่าน `frontend/index.html`)

ถ้ายังไม่อยากซื้อ ตัวที่หน้าตาใกล้เคียงและฟรี: **Termina → Saira / Archivo / Space Grotesk**,
**LEMON MILK → Michroma / Chakra Petch** (ควรลองเทียบของจริงก่อนตัดสินใจ)

## ภาพอ้างอิง

- `design/references/reference-desktop-institutional-dark.webp` — โทนและการจัดวางแบบ dashboard ที่ต้องการ
- `design/references/reference-mobile-doi-dash.jpg` — mockup มือถือของ DOI DASH เอง (การ์ด KPI, heatmap, calendar)
