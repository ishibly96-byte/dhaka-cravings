const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const STRIPE_API_VERSION = '2026-02-25.clover';
const BODY_LIMIT_BYTES = 1024 * 1024;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8'
};

loadEnvFile('.env');
loadEnvFile('.env.local');

const server = http.createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
        console.log(`${req.method} ${requestUrl.pathname}`);

        if (requestUrl.pathname.startsWith('/api/')) {
            await handleApi(req, res, requestUrl);
            return;
        }

        serveStaticFile(req, res, requestUrl);
    } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: 'Internal server error.' });
    }
});

server.listen(PORT, () => {
    console.log('=========================================');
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('=========================================');
    console.log('Press Ctrl+C to stop.');
});

async function handleApi(req, res, requestUrl) {
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, name: 'dhaka-cravings-local' });
        return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/config') {
        sendJson(res, 200, getPublicConfig());
        return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/create-checkout-session') {
        const body = await readJsonBody(req);
        await createStripeCheckoutSession(req, res, body);
        return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/orders') {
        const body = await readJsonBody(req);
        await persistLocalOrder(body);
        sendJson(res, 201, { ok: true });
        return;
    }

    sendJson(res, 404, { error: 'API route not found.' });
}

function serveStaticFile(req, res, requestUrl) {
    const safePath = getSafeFilePath(requestUrl.pathname);
    if (!safePath) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 Forbidden</h1>');
        return;
    }

    const absolutePath = safePath === ROOT_DIR ? path.join(ROOT_DIR, 'index.html') : safePath;
    fs.readFile(absolutePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT' || err.code === 'EISDIR') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>404 Not Found</h1><p>The file ${escapeHtml(requestUrl.pathname)} could not be found.</p>`);
                return;
            }
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>500 Internal Server Error</h1><p>${escapeHtml(err.code || 'Read failed')}</p>`);
            return;
        }

        const extension = path.extname(absolutePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[extension] || 'application/octet-stream' });
        res.end(content);
    });
}

function getSafeFilePath(urlPathname) {
    const decodedPath = decodeURIComponent(urlPathname === '/' ? '/index.html' : urlPathname);
    const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    const absolutePath = path.join(ROOT_DIR, normalizedPath);
    const relativePath = path.relative(ROOT_DIR, absolutePath);
    return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath) ? absolutePath : null;
}

function getPublicConfig() {
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || '',
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
    };
    const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

    return {
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeReady: Boolean(process.env.STRIPE_SECRET_KEY),
        stripeCurrency: process.env.STRIPE_CURRENCY || 'bdt',
        firebaseConfigured,
        firebaseConfig: firebaseConfigured ? firebaseConfig : null
    };
}

async function createStripeCheckoutSession(req, res, body) {
    if (!process.env.STRIPE_SECRET_KEY) {
        sendJson(res, 501, { error: 'Stripe secret key is missing. Add STRIPE_SECRET_KEY to .env.local and restart the server.' });
        return;
    }

    const items = normalizeCheckoutItems(body.items);
    if (!items.length) {
        sendJson(res, 400, { error: 'Cart is empty.' });
        return;
    }

    const origin = getRequestOrigin(req);
    const currency = (process.env.STRIPE_CURRENCY || 'bdt').toLowerCase();
    const amountMultiplier = Number(process.env.STRIPE_AMOUNT_MULTIPLIER || 100);
    const form = new URLSearchParams();

    form.set('mode', 'payment');
    form.set('success_url', safeReturnUrl(body.successUrl, origin, '/tracking.html?payment=stripe'));
    form.set('cancel_url', safeReturnUrl(body.cancelUrl, origin, '/checkout.html?payment_cancelled=1'));
    form.set('metadata[brand]', 'Dhaka Cravings');
    form.set('metadata[delivery_fee]', String(Number(body.deliveryFee || 0)));
    form.set('metadata[source]', 'local-node-server');

    items.forEach((item, index) => {
        form.set(`line_items[${index}][quantity]`, String(item.qty));
        form.set(`line_items[${index}][price_data][currency]`, currency);
        form.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(item.price * amountMultiplier)));
        form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
        if (item.heat) form.set(`line_items[${index}][price_data][product_data][metadata][heat]`, item.heat);
    });

    if (Number(body.deliveryFee || 0) > 0) {
        const deliveryIndex = items.length;
        form.set(`line_items[${deliveryIndex}][quantity]`, '1');
        form.set(`line_items[${deliveryIndex}][price_data][currency]`, currency);
        form.set(`line_items[${deliveryIndex}][price_data][unit_amount]`, String(Math.round(Number(body.deliveryFee || 0) * amountMultiplier)));
        form.set(`line_items[${deliveryIndex}][price_data][product_data][name]`, 'Mohammadpur delivery fee');
    }

    const stripeResponse = await postStripeForm('/v1/checkout/sessions', form);
    sendJson(res, stripeResponse.statusCode, stripeResponse.body);
}

function normalizeCheckoutItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => ({
            name: String(item.name || 'Dhaka Cravings Item').slice(0, 120),
            price: Math.max(0, Number(item.price || 0)),
            qty: Math.max(1, Math.min(99, Number(item.qty || 1))),
            heat: String(item.heat || '').slice(0, 60)
        }))
        .filter((item) => item.price > 0);
}

function postStripeForm(apiPath, form) {
    return new Promise((resolve, reject) => {
        const payload = form.toString();
        const request = https.request({
            hostname: 'api.stripe.com',
            path: apiPath,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
                'Stripe-Version': STRIPE_API_VERSION
            }
        }, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    resolve({ statusCode: response.statusCode || 500, body: JSON.parse(data) });
                } catch {
                    resolve({ statusCode: response.statusCode || 500, body: { error: data || 'Stripe response parsing failed.' } });
                }
            });
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
    });
}

async function persistLocalOrder(order) {
    const ordersDir = path.join(ROOT_DIR, 'orders');
    const ordersFile = path.join(ordersDir, 'local-orders.json');
    await fs.promises.mkdir(ordersDir, { recursive: true });
    let orders = [];
    try {
        orders = JSON.parse(await fs.promises.readFile(ordersFile, 'utf8'));
        if (!Array.isArray(orders)) orders = [];
    } catch {
        orders = [];
    }
    orders.unshift({
        ...order,
        storedAt: new Date().toISOString()
    });
    await fs.promises.writeFile(ordersFile, JSON.stringify(orders.slice(0, 100), null, 2));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (Buffer.byteLength(data) > BODY_LIMIT_BYTES) {
                reject(new Error('Request body too large.'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!data) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });
        req.on('error', reject);
    });
}

function safeReturnUrl(value, origin, fallbackPath) {
    try {
        const candidate = new URL(String(value || ''), origin);
        const originUrl = new URL(origin);
        return candidate.origin === originUrl.origin ? candidate.toString() : new URL(fallbackPath, origin).toString();
    } catch {
        return new URL(fallbackPath, origin).toString();
    }
}

function getRequestOrigin(req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${req.headers.host || `localhost:${PORT}`}`;
}

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

function loadEnvFile(filename) {
    const envPath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) return;
        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');
        if (key && process.env[key] === undefined) process.env[key] = value;
    });
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
}
