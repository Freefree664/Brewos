# Rivantoq

**Every service. One system.**

Rivantoq is a café operations and guest-ordering platform built with React, Vite, TypeScript and Supabase.

## Current platform modules

The preview branch includes owner onboarding and café workspaces, branch and table setup, QR guest menus and ordering, owner menu management, order management, POS billing, staff workspaces, kitchen and waiter workflows, analytics, loyalty features, and restaurant UPI QR settings.

Feature availability must be confirmed against the live preview and current database before a production release. A successful build is not a substitute for end-to-end testing.

## Important payment limitations

- Restaurant UPI QR codes open the customer's UPI app; Rivantoq does not receive automatic payment confirmation.
- Staff must independently verify a transaction before recording it as paid.
- Subscription plan payments are submitted for manual Super Admin verification.
- Automated gateway settlement, refunds, tax configuration and payment reconciliation are not included.

## Supabase configuration

GitHub Actions uses repository variables for:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only a Supabase publishable/anon key belongs in the browser. Never place a service-role key, database password, or other server secret in frontend code or GitHub variables used by the frontend build.

## Database migrations

SQL migrations are stored in `supabase/migrations/`. For an existing project, compare the live schema and migration history before applying anything. Do not replay the initial schema or blindly run the entire migration folder against a live database.

The pre-launch hardening migration `20261126010000_prelaunch_order_access_hardening.sql` is prepared for review. It has **not** been applied to the live Supabase database. Apply it only after reviewing the changes and testing the application against a staging database or an approved maintenance window.

## Development and build

```bash
npm install
npm run dev
npm run build
```

The static site is generated in `dist/`.

## GitHub Pages preview

The preview deployment workflow is `.github/workflows/deploy-github-pages.yml`. It publishes the `deploy/github-pages-preview` branch to:

https://freefree664.github.io/Brewos/

The validation workflow runs the TypeScript check and production build on pushes and pull requests. The preview branch is not automatically the production release. Keep `main` unchanged until the release has been reviewed and explicitly approved.

## Pre-launch checks

- Test with at least two independent café owner accounts and verify that neither can read or modify the other's data.
- Test each staff role using separate linked accounts and branch assignments.
- Test a complete table QR order with an active session and staff-issued code.
- Test POS order creation, split/partial payments, closed-order protection and manual payment verification.
- Test menu creation, edits, availability and image upload.
- Test subscription request submission and Super Admin review with test records.
- Confirm Supabase RLS, SECURITY DEFINER function grants, storage policies and migration history.
- Verify the latest GitHub Pages deployment and test on a phone/tablet.

## Brand

Emerald `#059669`, cream `#F5EBD8`, charcoal `#292524`.

