# CRAVORA — Pizza & More
> **"Big Flavour. Bold Cravings."** — Full-Stack AI-Powered Pakistani Food Commerce Platform

CRAVORA is a complete, connected, responsive full-stack food-ordering platform inspired by the breadth of Pakistan's premier pizza and fast-food ordering experiences. Every customer feature—from multi-group pizza & combo customization, polygon/radius delivery zone coverage, and coupon calculation to live order tracking, RBAC admin operations, and the **Cravora AI** tool-calling food concierge—is connected to persistent relational database records and verified backend logic.

---

## 1. Architecture & Technology Stack

| Layer | Technology & Verified Versions | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React `18.3.1`, Vite `6.0.3`, TypeScript `5.6.3`, Tailwind CSS `3.4.16`, React Router `6.28.0`, Framer Motion `11.15.0`, TanStack Query `5.62.7`, React Hook Form `7.54.1`, Zod `3.24.1`, Lucide React `0.468.0`, Leaflet `1.9.4` | Responsive desktop & mobile ordering UI, interactive delivery pin & zone map, customization modal, cart drawer, checkout, live order tracker, and Admin Portal |
| **Backend** | Python `3.12+` / `3.14`, FastAPI `0.115+`, Pydantic v2 `2.10+`, SQLAlchemy ORM `2.0+`, Alembic `1.14+`, PyJWT `2.10+`, bcrypt `4.2+`, httpx `0.28+` | REST + WebSocket APIs, server-side customization & coupon calculation, RBAC authorization, HMAC webhook verification, and AI tool execution |
| **Database** | PostgreSQL `16` (`database/schema.sql` + `psycopg` v3) with zero-config local SQLite fallback (`PRAGMA foreign_keys=ON`) | Normalized relational persistence for 24 tables (`users`, `branches`, `delivery_zones`, `categories`, `products`, `product_variants`, `customization_groups`, `customization_options`, `orders`, `order_items`, `payments`, `coupons`, `support_tickets`, `audit_events`, etc.) |
| **AI Concierge** | **Cravora AI** (`backend/app/services/ai_agent.py`) | Supports OpenAI / Gemini tool-calling with 12 validated backend tools + transparent Local Tool-Executing Concierge & FAQ Fallback when no external LLM API key is configured |
| **Maps & Coverage** | Leaflet + OpenStreetMap / Nominatim + Google Maps / Mapbox adapter (`backend/app/services/maps.py`) | Haversine distance, ray-casting point-in-polygon & radius delivery zone validation, address autocomplete, and reverse geocoding |

---

## 2. Repository Structure

```text
cravora-food-website/
├── backend/
│   ├── alembic/                  # Alembic migrations & environment config
│   ├── app/
│   │   ├── services/
│   │   │   ├── ai_agent.py       # Cravora AI + 12 validated backend tools
│   │   │   ├── maps.py           # Polygon/radius zone check, Haversine, geocoding
│   │   │   ├── notifications.py  # Honest Email/SMS/WhatsApp notification logger
│   │   │   ├── payments.py       # Payment adapter + HMAC-SHA256 webhook verifier
│   │   │   └── pricing.py        # Authoritative server-side customization & coupon engine
│   │   ├── config.py             # Environment settings (Pydantic Settings)
│   │   ├── database.py           # SQLAlchemy 2.0 engine & session management
│   │   ├── main.py               # FastAPI application, REST routers & WebSocket
│   │   ├── models.py             # 24 normalized SQLAlchemy ORM models
│   │   ├── schemas.py            # Strict Pydantic v2 input/output schemas
│   │   ├── security.py           # JWT, bcrypt, RBAC, rate limiting & audit logs
│   │   └── seed.py               # Idempotent seeder (16 categories, 26+ products, 6 branches)
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
├── database/
│   └── schema.sql                # Complete PostgreSQL production DDL with indexes & FKs
├── frontend/
│   ├── public/
│   │   ├── cravora-icon.svg      # Original Cravora brand icon
│   │   └── manifest.json         # Progressive Web App (PWA) manifest
│   ├── src/
│   │   ├── api/client.ts         # Typed API client & PKR formatter
│   │   ├── components/           # InteractiveMap, LocationModal, ProductCustomizeModal,
│   │   │                         # CartDrawer, CravoraAIConcierge, ProductCard, NavbarAndFooter
│   │   ├── context/StoreContext.tsx
│   │   ├── pages/                # HomePage, MenuPage, DealsPage, BranchesPage, CheckoutPage,
│   │   │                         # OrderTrackingPage, AccountPage, SupportAndLegalPage, AdminDashboardPage
│   │   ├── types/index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── tests/
│   └── test_cravora_platform.py  # End-to-end automated pytest suite (Customer, AI, Admin, Maps, Security)
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## 3. Quick Start & Local Run Instructions

### Option A: Local Development (FastAPI + Vite)

1. **Copy Environment Variables:**
   ```powershell
   Copy-Item .env.example .env
   ```

2. **Start the Backend (FastAPI on `http://localhost:8000`):**
   ```powershell
   uv venv backend/.venv
   uv pip install -r backend/requirements.txt --python backend/.venv/Scripts/python.exe
   backend\.venv\Scripts\uvicorn.exe app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
   ```
   *On startup, the backend automatically initializes all 24 tables and runs the idempotent seeder (`backend/app/seed.py`). Interactive OpenAPI docs are available at `http://localhost:8000/docs`.*

3. **Start the Frontend (Vite on `http://localhost:5173`):**
   ```powershell
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

4. **Run Automated End-to-End Tests (`pytest`):**
   ```powershell
   backend\.venv\Scripts\pytest.exe tests/test_cravora_platform.py -v
   ```

### Option B: Docker Compose (PostgreSQL 16 + Backend + Frontend)

```bash
docker compose up --build -d
```
- **Frontend:** `http://localhost:5173`
- **Backend API & Docs:** `http://localhost:8000/docs`
- **PostgreSQL 16:** `localhost:5432` (initialized with `database/schema.sql`)

---

## 4. Seeded Demo Accounts, Orders & Coupons

> **Note on Sample Data:** All seeded products, prices, branches, promotions, and reviews are clearly marked with `is_sample_data = true` for development and evaluation, and can be edited or deleted via the Admin Dashboard without modifying source code.

| Role / Entity | Credentials / Reference | Details |
| :--- | :--- | :--- |
| **Administrator** | `admin@cravora.pk` / `CravoraAdmin!2026` | Full access to `/admin` (Analytics, Products CRUD, Orders, Coupons, Branches, Support & AI metrics) |
| **Kitchen / Staff** | `kitchen@cravora.pk` / `CravoraStaff!2026` | Order status updates & support ticket management |
| **Customer Account** | `hamza@example.com` / `Customer!2026` | 450 Loyalty Points, saved Islamabad addresses, order history |
| **Sample Active Order** | `CRV-20261020-1001` (Phone: `+92 333 5129081`) | Trackable on `/track-order` and via **Cravora AI** |
| **Sample Support Ticket** | `TKT-10420` | Trackable and reply-enabled on `/support` and `/admin` |
| **Active Promo Codes** | `CRAVORA20` (20% OFF > Rs. 1,500), `CROWN300` (Rs. 300 OFF > Rs. 1,600), `FAMILY500` (Rs. 500 OFF > Rs. 3,200), `PICKUP15` (15% OFF Pickup > Rs. 1,000) | Validated on the server against minimum order, expiration, and fulfillment rules |

---

## 5. Key API Endpoints Summary

- **Health & Metadata:** `GET /api/health`
- **Authentication & Loyalty:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`, `GET /api/auth/me`, `GET /api/auth/loyalty`, `GET /api/auth/addresses`, `POST /api/auth/addresses`
- **Menu & Customizations:** `GET /api/menu/categories`, `GET /api/menu/products`, `GET /api/menu/products/{slug_or_id}`
- **Server-Side Cart & Promotions:** `POST /api/cart/calculate`, `GET /api/promotions`, `POST /api/promotions/validate`
- **Maps, Geocoding & Coverage:** `GET /api/branches`, `POST /api/maps/check-coverage`, `GET /api/maps/geocode/search`, `GET /api/maps/geocode/reverse`
- **Orders & Live Tracking:** `POST /api/orders`, `GET /api/orders/my`, `GET /api/orders/{order_reference}?phone=...`, `POST /api/orders/{order_reference}/cancel`, `POST /api/orders/{order_reference}/rider-location`, `WS /ws/orders/{order_reference}`
- **Payments & Webhooks:** `GET /api/payments/methods`, `POST /api/payments/webhook` (HMAC-SHA256 verified via `X-Cravora-Signature`)
- **Cravora AI Concierge:** `POST /api/ai/chat`, `GET /api/ai/status`
- **Support & Newsletter:** `POST /api/support/tickets`, `GET /api/support/tickets/{ticket_reference}`, `POST /api/support/tickets/{ticket_reference}/messages`, `POST /api/newsletter/subscribe`
- **Admin Dashboard (RBAC Protected):** `GET /api/admin/overview`, `POST /api/admin/products`, `PUT /api/admin/products/{id}`, `DELETE /api/admin/products/{id}`, `GET /api/admin/orders`, `PATCH /api/admin/orders/{ref}/status`, `POST /api/admin/coupons`, `POST /api/admin/branches`, `GET /api/admin/support/tickets`, `POST /api/admin/support/tickets/{ref}/reply`, `GET /api/admin/ai-settings`

---

## 6. External Service Activation & Security Configuration

1. **AI Provider (`OPENAI_API_KEY` / `GEMINI_API_KEY`):**
   - Set `LLM_PROVIDER="openai"` and `OPENAI_API_KEY="sk-..."` in `.env` (server-side only).
   - When no external API key is configured, **Cravora AI** transparently discloses that it is running in `local_tool_concierge` mode and still executes all 12 database tools (`search_products`, `prepare_cart`, `get_verified_order_status`, `check_delivery_coverage`, `create_support_ticket`, etc.) against live data.
2. **Maps & Geocoding (`MAPS_PROVIDER`):**
   - Uses Leaflet + OpenStreetMap tiles and Nominatim + built-in Pakistani neighborhood coordinates out-of-the-box.
   - To enable Google Maps or Mapbox server geocoding, set `GOOGLE_MAPS_SERVER_API_KEY` or `MAPBOX_ACCESS_TOKEN` in `.env` and restrict browser keys by HTTP referrer and API scope in Google Cloud Console.
3. **Online Payments (`SAFEPAY_MERCHANT_KEY`, `JAZZCASH_MERCHANT_ID`, `EASYPAISA_STORE_ID`):**
   - Cash on Delivery (`cod`) is active out-of-the-box.
   - Online Card and Digital Wallet methods are honestly labeled in the checkout UI as requiring merchant credentials in `.env` before live charging, while the HMAC-SHA256 webhook signature verifier (`POST /api/payments/webhook`) is fully implemented and tested.
4. **Notifications (`SMTP_HOST`, `SMS_API_KEY`, `WHATSAPP_BUSINESS_TOKEN`):**
   - Notification dispatches are recorded in `notification_records`. In development without live SMTP/SMS credentials, notifications are recorded with status `logged_dev_mode` rather than falsely claiming external delivery.

---

## 7. Database Backup & Recovery

- **PostgreSQL (Production / Docker):**
  - **Backup:** `docker exec -t cravora-postgres pg_dump -U cravora -F c -b -v -f /tmp/cravora_backup.dump cravora`
  - **Restore:** `docker exec -t cravora-postgres pg_restore -U cravora -d cravora --clean /tmp/cravora_backup.dump`
- **Local SQLite Development File:**
  - **Backup:** Copy `backend/cravora.db` using `sqlite3 backend/cravora.db ".backup 'backend/cravora_backup.db'"`

---

## 8. Known Limitations & Local Environment Notes

- **Host Environment during Build Verification:** Docker Engine and a local PostgreSQL service were not installed on the Windows host machine during build verification. Full PostgreSQL DDL (`database/schema.sql`), `psycopg` v3 driver, Alembic migrations, and `docker-compose.yml` are provided, while local runtime verification and `pytest` execution ran against SQLAlchemy's SQLite engine with strict foreign-key enforcement (`PRAGMA foreign_keys=ON`).
- **Live Rider Telemetry:** The rider GPS endpoint (`POST /api/orders/{ref}/rider-location`) and map marker are implemented, but without a physical rider mobile app broadcasting GPS coordinates, orders display the honest 5-stage kitchen/dispatch timeline by default.
- **Legal Policy Templates:** The Privacy, Terms, Delivery, and Refund policies on `/support` are structured templates and must be reviewed by qualified legal counsel before commercial launch.
