import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    getAuth,
    getIdTokenResult,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js";

const FALLBACK_CONFIG = {
    apiKey: "AIzaSyA2B5k7jZd-fSHaN8ZN5W3CX51fLzKRZzg",
    authDomain: "dhaka-cravings.firebaseapp.com",
    projectId: "dhaka-cravings",
    storageBucket: "dhaka-cravings.firebasestorage.app",
    messagingSenderId: "384608833320",
    appId: "1:384608833320:web:3317f8a1109f54edab0a1d"
};

const config = await loadConfig();
const app = initializeApp(config.firebaseConfig || FALLBACK_CONFIG);
const auth = getAuth(app);
const functions = getFunctions(app);

const callables = {
    createOrder: httpsCallable(functions, "createOrder"),
    createStripeCheckout: httpsCallable(functions, "createStripeCheckout"),
    upsertProfile: httpsCallable(functions, "upsertProfile"),
    adminListOrders: httpsCallable(functions, "adminListOrders"),
    adminUpdateOrderStatus: httpsCallable(functions, "adminUpdateOrderStatus"),
    adminStats: httpsCallable(functions, "adminStats")
};

async function loadConfig() {
    try {
        const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
        if (response.ok) return await response.json();
    } catch {
        // Firebase Hosting will not have the local config endpoint.
    }
    return { firebaseConfig: FALLBACK_CONFIG };
}

function cartForBackend(cart) {
    return (cart || []).map((item) => ({
        id: item.id,
        qty: Number(item.qty || 1)
    }));
}

function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "checkout.html";
}

async function requireUser() {
    if (auth.currentUser) return auth.currentUser;
    window.location.href = `auth.html?next=${encodeURIComponent(window.location.pathname.split("/").pop() || "checkout.html")}`;
    throw new Error("Sign in required.");
}

async function startStripeCheckout({ items, customer }) {
    await requireUser();
    const result = await callables.createStripeCheckout({
        items: cartForBackend(items),
        customer: customer || {}
    });
    return result.data;
}

async function createCashOrder({ items, customer }) {
    await requireUser();
    const result = await callables.createOrder({
        items: cartForBackend(items),
        customer: customer || {}
    });
    return result.data;
}

async function isCurrentUserAdmin() {
    if (!auth.currentUser) return false;
    const token = await getIdTokenResult(auth.currentUser, true);
    return token.claims.admin === true;
}

window.DhakaCravingsBackend = {
    app,
    auth,
    functions,
    callables,
    createCashOrder,
    isCurrentUserAdmin,
    onAuthStateChanged,
    signOut,
    startStripeCheckout
};

setupAuthPage();
setupAdminPage();

function setupAuthPage() {
    const form = document.querySelector("[data-auth-form]");
    if (!form) return;

    const message = document.querySelector("[data-auth-message]");
    const modeButtons = document.querySelectorAll("[data-auth-mode]");
    let mode = "signin";

    modeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            mode = button.getAttribute("data-auth-mode") || "signin";
            modeButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
        });
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const email = String(formData.get("email") || "");
        const password = String(formData.get("password") || "");
        const displayName = String(formData.get("displayName") || "");
        const phone = String(formData.get("phone") || "");

        try {
            if (mode === "signup") {
                await createUserWithEmailAndPassword(auth, email, password);
                await callables.upsertProfile({ displayName, phone });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            window.location.href = getNextUrl();
        } catch (error) {
            if (message) message.textContent = error.message || "Authentication failed.";
        }
    });
}

function setupAdminPage() {
    const adminRoot = document.querySelector("[data-admin-root]");
    if (!adminRoot) return;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "auth.html?next=admin.html";
            return;
        }

        if (!(await isCurrentUserAdmin())) {
            adminRoot.innerHTML = `<section class="admin-empty">This account is signed in, but it does not have the admin claim yet.</section>`;
            return;
        }

        await renderAdminDashboard(adminRoot);
    });
}

async function renderAdminDashboard(root) {
    const [ordersResult, statsResult] = await Promise.all([
        callables.adminListOrders({ limit: 50 }),
        callables.adminStats({})
    ]);
    const orders = ordersResult.data.orders || [];
    const stats = statsResult.data || {};

    root.innerHTML = `
        <section class="admin-stats">
            <article><span>Total Orders</span><strong>${stats.sampleSize || 0}</strong></article>
            <article><span>Revenue</span><strong>${formatTk(stats.revenue || 0)}</strong></article>
            <article><span>Paid</span><strong>${stats.byPayment?.paid || 0}</strong></article>
        </section>
        <section class="admin-table">
            ${orders.map(orderRow).join("") || `<div class="admin-empty">No orders yet.</div>`}
        </section>
    `;

    root.querySelectorAll("[data-status-update]").forEach((button) => {
        button.addEventListener("click", async () => {
            const orderId = button.getAttribute("data-order-id");
            const status = button.closest("[data-order-row]")?.querySelector("select")?.value;
            if (!orderId || !status) return;
            await callables.adminUpdateOrderStatus({ orderId, status });
            await renderAdminDashboard(root);
        });
    });
}

function orderRow(order) {
    const items = (order.items || []).map((item) => `${item.qty}x ${item.name}`).join(", ");
    return `
        <article class="admin-row" data-order-row>
            <div>
                <strong>${order.orderId}</strong>
                <span>${items}</span>
            </div>
            <div>${formatTk(order.total || 0)}</div>
            <div>${order.paymentStatus || "unpaid"}</div>
            <select>
                ${["placed", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled"].map((status) => `
                    <option value="${status}" ${order.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
                `).join("")}
            </select>
            <button data-status-update data-order-id="${order.orderId}">Update</button>
        </article>
    `;
}

function formatTk(amount) {
    return `BDT ${Number(amount || 0).toLocaleString("en-BD")}`;
}
