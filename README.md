# Dhaka Cravings Website

This is the fully functional local HTML/CSS/JS frontend for the Dhaka Cravings project, converted from Stitch screens.

## Project Structure

- `index.html`: Homepage with hero section and featured items.
- `menu.html`: Full menu with categories and products.
- `product.html`: Detailed view of a specific product (e.g., The Naga Smash).
- `checkout.html`: Checkout form and cart summary.
- `tracking.html`: Order tracking simulation.
- `js/main.js`: Cart drawer, menu/deals enhancements, and checkout orchestration.
- `js/backend.js`: Firebase Auth, callable Functions, Stripe Checkout, and admin dashboard wiring.
- `server.js`: Local Node API/static server for config, Stripe Checkout Sessions, and demo order persistence.
- `.env.example`: Safe template for Firebase and Stripe test configuration.
- `about.html`, `support.html`, `privacy.html`, `terms.html`: Trust, support, and compliance pages.

## How to Run Locally

### Option 1: Using the Node.js Script (Recommended)

Since the project includes a simple `server.js` script, you can run it using Node.js. This ensures all links and assets load correctly via HTTP.

1. Open your terminal or command prompt.
2. Navigate to the `DhakaCravings` directory:
   ```bash
   cd "C:\Users\HP\Desktop\AI Antigravity\DhakaCravings"
   ```
3. Run the server script:
   ```bash
   node server.js
   ```
4. Open your web browser and go to:
   [http://localhost:3000](http://localhost:3000)

### Option 1B: Using the PowerShell Fallback Server

If Node.js is not installed, run the bundled PowerShell server instead:

```powershell
.\server.ps1
```

It serves the same localhost URL and supports the local config/order/Stripe API routes.

### Local Payment & Firebase Config

Do not paste secret keys into source files. Copy `.env.example` to `.env.local`, then fill in your local values:

```bash
copy .env.example .env.local
```

Required for payment testing:
- `STRIPE_SECRET_KEY`: Stripe test secret key used by the local server to create Checkout Sessions.
- `STRIPE_PUBLISHABLE_KEY`: Stripe test publishable key exposed to browser config.

Optional Firebase browser config:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`

Firebase Functions production secrets:
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Stripe webhook target:
```text
https://<region>-dhaka-cravings.cloudfunctions.net/stripeWebhook
```

### Option 2: Using VS Code Live Server Extension

If you use Visual Studio Code:
1. Open the `DhakaCravings` folder in VS Code.
2. Install the **Live Server** extension (if you haven't already).
3. Right-click on `index.html` and select **"Open with Live Server"**.
4. It will automatically open the site in your default browser.

### Option 3: Opening `index.html` directly

You can also simply double-click the `index.html` file in your file explorer to open it directly in your browser. Note that some JavaScript features or relative paths might behave differently when opened via the `file://` protocol compared to a real server, but basic navigation will still work.

## Features

- **Responsive Design**: The layout adapts to mobile and desktop screens using Tailwind CSS plus a mobile-first cart drawer.
- **Interlinked Pages**: Menu, deals, tracking, support, privacy, and terms pages are connected.
- **Micro-Interactions**: Add-to-cart, dynamic checkout totals, and order feedback are handled in JavaScript.
- **Dark Mode Aesthetic**: The site uses a high-contrast dark theme optimized for food photography.
- **Payment Ready**: Stripe hosted Checkout Sessions are config-driven.

## Firebase Backend (Order Tracking + Admin)

This repo now includes a Firebase backend scaffold under `functions/` plus Firestore rules/indexes:

- Callable functions for order tracking:
  - `createOrder`, `createStripeCheckout`, `getMyOrder`, `upsertProfile`
- Callable admin functions (requires `admin: true` custom claim):
  - `adminGetOrder`, `adminListOrders`, `adminUpdateOrderStatus`, `adminStats`
- HTTP webhook:
  - `stripeWebhook`

Files:
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/src/index.ts`

Local dev (once you have Firebase CLI configured):
```bash
cd "C:\Users\HP\Desktop\AI Antigravity\DhakaCravings\functions"
npm i
npm run serve
```

Admin access:
- Mark an admin user by setting a custom claim `admin: true` (via Admin SDK / a one-off script / console tooling).
