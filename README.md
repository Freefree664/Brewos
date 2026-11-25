# BrewOS

BrewOS is a café ordering and management web app built with React, Vite, TypeScript and Supabase.

## Current working areas

- Public BrewOS landing page with English/Hindi language toggle
- Supabase email authentication and owner workspace
- Restaurant, first-branch and dining-table setup
- Guest-facing table QR, digital menu, cart and staff-PIN-protected order submission
- Owner menu tools for categories, photos, availability, selling prices and private preparation costs
- Order dashboard with status updates, Supabase Realtime and a 15-second polling fallback
- Optional browser notifications while the owner dashboard is open
- UPI QR subscription requests with transaction-reference submission and manual Super Admin verification

## Not yet implemented

- Dedicated kitchen display / preparation queue
- Staff scheduling, attendance and waiter assignment
- Inventory and ingredient tracking
- Sales reports and analytics

The landing page labels these items as in development. Do not advertise them as available features until they are implemented and tested.

## Supabase configuration

Set these Vite environment variables for every build context:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use only the Supabase publishable/anon key in the browser. Never put a service-role key, database password, or other server secret in frontend environment variables.

## Database migrations

For a new Supabase project, review and apply migrations in numeric order:

1. `0001_initial_schema.sql`
2. `0002_subscription_payment_requests.sql`
3. `0003_super_admin_payment_review.sql`
4. `0004_owner_onboarding.sql`
5. `0005_menu_item_costs_and_storage.sql`
6. `0006_table_qr_foundation.sql`
7. `0007_guest_ordering.sql`
8. `0008_super_admin_cafe_moderation_and_realtime.sql`
9. `0009_restrict_internal_security_definer_rpcs.sql`
10. `0010_version_public_qr_menu_rpcs.sql`
11. `0011_remove_legacy_menu_image_policies.sql`
12. `0012_restore_owner_menu_image_policies.sql`
13. `0013_pos_order_creation.sql`
14. `0014_pos_discounts_and_payments.sql`
15. `0015_table_sessions_and_guest_order_tracking.sql`
16. `0016_secure_session_codes_disable_legacy_pin.sql`
17. `0017_subscription_plan_pricing_update.sql`
18. `0018_restaurant_upi_and_pos_customer_contact.sql`
19. `0019_guest_digital_bills_and_upi_qr.sql`

For an existing project, inspect its migration history and schema first. Do not replay `0001_initial_schema.sql` or blindly rerun the entire sequence on a live database. Apply only missing migrations after verifying that equivalent tables, functions and policies are not already present. In particular, `0007_guest_ordering.sql` has already been applied to the current project; do not apply it again just because it appears in this list.

The POS screen supports item search, quantity changes, dine-in/takeaway/delivery, server-validated discounts, manual cash/card/UPI payment records (including split tenders), UPI QR generation from each restaurant's saved UPI ID, customer WhatsApp bill sharing, and printable receipts. Bills and payment records are stored in the database. UPI QR generation does not verify or collect money: staff must independently verify a payment before recording it as paid. Tax configuration, refunds and payment reconciliation remain future work.

The first Super Admin must be added to `public.super_admins` by a trusted project administrator using the Supabase SQL Editor. Do not expose an administrative key in the app.

### Public QR menu functions

The guest page calls:

- `get_public_table_info(p_token)`
- `get_public_cafe_menu(p_slug)`

Their verified live definitions are versioned in `0010_version_public_qr_menu_rpcs.sql`. The table lookup accepts a full QR token and returns only restaurant, branch and table labels. The public menu RPC returns guest-facing menu data only; it does not return preparation costs or profit details.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The static production files are generated in `dist/`.

## Deployment

BrewOS currently uses Netlify. The build command and publish directory are configured in `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Node.js: 20

The `feature/owner-dashboard` branch deploys as a Netlify preview. The production site follows `main`; do not treat a branch preview as the production release. Merge and production release only after the database and end-to-end checks pass.

Hostinger migration can be done later if/when a suitable plan is purchased. The current Vite frontend is static; Supabase continues to provide auth and database services.

## Operational checks before launch

- Confirm the public QR RPC definitions and database migration state.
- Test owner restaurant creation, approval and table QR generation using an authorized account.
- Test menu create/edit/availability and photo upload with owner RLS.
- Test one complete guest order with an active table and a staff-issued PIN.
- Confirm order status updates and Realtime/polling notifications.
- Test the subscription request and Super Admin review flow using a test payment record; never approve a real payment without independently verifying the transaction.
- Test fresh QR scans against the current production domain after the production deploy.

The guest-order and owner-order code paths are implemented, but a successful frontend build does not prove these live database flows have passed. Browser alerts require the dashboard to remain open. Subscription checkout is not an automated payment gateway: a Super Admin must verify payment before activation.

## Brand

Emerald `#059669`, cream `#F5EBD8`, charcoal `#292524`.

## Phase 2 — POS & Billing

- Owner workspace POS with branch-aware menu search, cart controls, order types and customer notes.
- Atomic database order creation recalculates menu prices and discounts server-side.
- Manual cash/card/UPI payment ledger supports partial and split tender entries, with balance-due checks and owner/manager authorization.
- Printable bill/receipt view. No automated payment gateway, tax engine, refunds or settlement reconciliation yet.


## Table sessions and guest order tracking

- Owner/manager starts or ends a table session from Tables & QR setup.
- Each active session has one six-digit code. The static table QR page displays that code automatically while the session is active; ending the session invalidates it.
- Customers can place multiple orders during the same active table session without requesting a new code for every order.
- After placing an order, the guest page polls a QR-token-scoped status RPC and shows the order timeline through confirmation, preparation, ready, served and completion.
- The legacy one-time PIN issuer is disabled. The public session code is intentionally visible only to a visitor holding that table's unguessable QR token; anyone with a copy of the table QR can order while the session is open.


## Restaurant UPI and customer bills

- Each restaurant owner can save a restaurant-specific UPI ID in the owner workspace.
- POS bill creation includes a payment-mode choice (cash, UPI or card). UPI bills display a QR for the exact outstanding bill amount; cash bills do not display a QR.
- POS bills are saved as orders and item snapshots in the owner's BrewOS order records. An optional customer phone number enables a prefilled WhatsApp bill message; the owner must review and send it.
- For table QR orders, the customer sees an itemized digital bill and can choose UPI QR or cash at the counter after the order is marked completed.
- UPI QR codes only initiate a payment in the customer's UPI app. BrewOS does not receive payment confirmation automatically; restaurant staff must verify the transaction and record the payment.
