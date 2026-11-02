# Padma Crackers Bazaar — Premium Catalogue UI

## Files
- `index.html` — page structure and dialogs
- `styles.css` — responsive visual system and styling
- `app.js` — catalogue API, category mapping, cart, order submission and image lightbox
- `assets/padma-logo.png` — supplied Padma logo

## Run locally
Open `index.html` through a local web server (recommended) rather than `file://`:
- VS Code Live Server, or
- `python -m http.server 5500`

Then visit `http://localhost:5500`.

## API integration
The frontend calls:
- `GET https://www.padmacracker.com/products/search?search=` to load the live catalogue
- `POST https://www.padmacracker.com/store_orders` to create the selected-product order
- `POST https://www.padmacracker.com/order_details` in a new tab to submit customer details after the order is created
- `GET https://www.padmacracker.com/download-pdf/{order_id}` for the generated PDF
- `POST https://www.padmacracker.com/language/update-active` when switching English/Tamil

`POST /store_contacts` is not wired into this catalogue because this version has no separate contact-enquiry form. It is intentionally not called with guessed field names.

## Category mapping
Products are grouped by `category_id` using the explicit `CATEGORY_ID_GROUPS` map in `app.js`; no product-name keyword matching is used. `giftbox` and `familybox` are handled from the product `type`. If the store's current category master has changed, update the ID groups to match the current backend category IDs.

## Important integration checks before production
1. Confirm the product API returns all active products for `?search=` and that the response is one of the supported array/data/products/results/items shapes.
2. Confirm `mrp` is the current payable unit rate and `our_price` is the displayed original rate, as in the legacy catalogue.
3. Confirm the category ID groups against the live backend category master. The supplied browser export contains category IDs but no category master endpoint, so the map is an explicit front-end grouping and should be verified by the store.
4. Verify the `/store_contacts` controller expects `name`, `mobile`, `email`, and `message` in JSON.
5. Test CORS for browser requests to `/products/search`, `/store_orders`, and `/language/update-active`. The host must allow the deployed site's origin.
6. Confirm `/order_details` accepts the legacy form fields (`name`, `mobile`, `address`, `pin_code`, `email`, `state`, `district`, `order_id`) and opens correctly in a new tab.
7. Confirm CSRF protection. If the page is served from the Laravel site, expose a `<meta name="csrf-token" content="...">` tag in `index.html` or inject it from the host layout.
8. Test real order creation and PDF generation in a staging environment before using this for customer orders.

The existing packaging-fee slabs have been retained: ₹100 up to ₹5,000, ₹200 above ₹5,000 through ₹10,000, and ₹300 above ₹10,000.


## Local CORS workaround (no Padma source code needed)
This package now includes `server.js`, a small Node.js same-origin proxy.

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm start`.
4. Open `http://localhost:5500`.

Do not open `index.html` directly with `file://` and do not use VS Code Live Server for this setup. The frontend calls `/api/...` on localhost, and `server.js` forwards allowed requests server-to-server to `https://www.padmacracker.com`.

This solves the browser's CORS boundary without changing Padma's server. It does not bypass API access controls, CSRF, authentication, rate limits or backend validation. If the Padma server itself rejects requests, or the API requires a session-bound CSRF token, the relevant backend owner must enable an approved integration or provide an API credential/route. The local proxy is intended for local development; do not expose it publicly as-is.

Allowed upstream routes are deliberately limited to the endpoints used by this app. The proxy forwards JSON POST bodies and streams the PDF response. Customer contact/order data passes through your own machine to Padma's server.


### Product image URL handling
Some product API responses return a relative path such as `/laravel/product_images/19.jpeg`. `app.js` resolves these against the DigitalOcean Spaces CDN host seen in the supplied product export (`https://ninos-prod-space.blr1.cdn.digitaloceanspaces.com`). Absolute `http(s)` image URLs are kept unchanged. If the exact image URL still returns 404 when opened directly, the image may be missing or the CDN host/path may have changed; verify the image base URL with Padma before changing it.
