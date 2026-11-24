# BrewOS

BrewOS is a café management web app built with React, Vite, TypeScript and Supabase.

## Current working areas

- Public BrewOS landing page with English/Hindi language toggle
- Supabase authentication and owner dashboard
- Restaurant and branch setup
- Dining table creation and QR token generation
- Owner-managed menu items: name, description, category, selling price, preparation cost, photo and availability
- Estimated item profit for owners (private cost data is not displayed to guests)
- QR table check-in and guest menu display (requires the public Supabase RPCs described below)

## Supabase configuration

Set these Vite environment variables before building:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the project's Supabase publishable/anon key only. Never put a service-role key or database password in frontend environment variables.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The static production files are generated in `dist/`.

## Hostinger deployment (static Vite site)

BrewOS currently builds as a static Vite frontend; Supabase provides authentication and database services. A Hostinger plan that supports static/PHP website hosting is sufficient for this frontend. Node.js hosting is not required for the current Vite build.

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment.
2. Run `npm install` and `npm run build` on a computer with Node.js.
3. In Hostinger, create/select the target website after the hosting plan is active.
4. Upload the **contents** of the generated `dist/` folder into the website's document root (usually `public_html`), not the source-code folder.
5. Open the website and test sign-in, owner dashboard, menu editing, and a table QR link.

Do not upload `.env`, service-role keys, database credentials, or the full source repository to the public document root. Do not overwrite an existing website until its contents have been backed up.

## QR menu backend dependency

The QR guest page calls these Supabase RPCs:

- `get_public_table_info(p_token)`
- `get_public_cafe_menu(p_slug)`

The second function must return guest-safe menu fields only (item name, description, category, selling price, image URL and availability). It must never expose preparation costs or profit data. Verify the exact SQL function signature and return shape against the deployed Supabase schema before treating QR menu display as production-ready.

## Important scope note

The public landing page and owner menu workflow are implemented. Online order submission, kitchen workflow, POS billing, inventory, and payment processing are not yet complete production workflows. Subscription payment references are submitted for manual verification; selecting a plan does not itself activate a subscription.

## Brand

Emerald `#059669`, cream `#F5EBD8`, charcoal `#292524`.
