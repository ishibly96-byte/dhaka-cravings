const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const STRIPE_API_VERSION = '2026-02-25.clover';

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ ok: true, name: 'dhaka-cravings-vercel' });
});

app.get('/api/config', (req, res) => {
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

    res.json({
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeReady: Boolean(process.env.STRIPE_SECRET_KEY),
        stripeCurrency: process.env.STRIPE_CURRENCY || 'bdt',
        firebaseConfigured,
        firebaseConfig: firebaseConfigured ? firebaseConfig : null
    });
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(501).json({ error: 'Stripe secret key is missing.' });
        }

        const body = req.body;
        const items = normalizeCheckoutItems(body.items);
        if (!items.length) {
            return res.status(400).json({ error: 'Cart is empty.' });
        }

        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const origin = `${protocol}://${req.headers.host}`;
        const currency = (process.env.STRIPE_CURRENCY || 'bdt').toLowerCase();
        const amountMultiplier = Number(process.env.STRIPE_AMOUNT_MULTIPLIER || 100);
        
        const form = new URLSearchParams();
        form.set('mode', 'payment');
        form.set('success_url', safeReturnUrl(body.successUrl, origin, '/tracking.html?payment=stripe'));
        form.set('cancel_url', safeReturnUrl(body.cancelUrl, origin, '/checkout.html?payment_cancelled=1'));
        form.set('metadata[brand]', 'Dhaka Cravings');
        form.set('metadata[delivery_fee]', String(Number(body.deliveryFee || 0)));
        form.set('metadata[source]', 'vercel-serverless');

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
        res.status(stripeResponse.statusCode).json(stripeResponse.body);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/orders', async (req, res) => {
    console.log('Order received:', JSON.stringify(req.body, null, 2));
    res.status(201).json({ ok: true, message: 'Order received. (Stateless)' });
});

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
            response.on('data', (chunk) => { data += chunk; });
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

function safeReturnUrl(value, origin, fallbackPath) {
    try {
        const candidate = new URL(String(value || ''), origin);
        const originUrl = new URL(origin);
        return candidate.origin === originUrl.origin ? candidate.toString() : new URL(fallbackPath, origin).toString();
    } catch {
        return new URL(fallbackPath, origin).toString();
    }
}

module.exports = app;
