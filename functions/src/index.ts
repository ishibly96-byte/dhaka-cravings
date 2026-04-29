import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHmac, timingSafeEqual } from "crypto";

admin.initializeApp();

const db = admin.firestore();
const STRIPE_API_VERSION = "2026-02-25.clover";
const DELIVERY_FEE_BDT = 50;
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

type CatalogItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  heat: string;
  vegetarian?: boolean;
};

type RequestedItem = {
  id?: string;
  qty?: number;
};

const MENU_CATALOG: Record<string, CatalogItem> = {
  "naga-smash": { id: "naga-smash", name: "The Naga Smash", price: 450, category: "burgers", heat: "350k SHU" },
  "street-fries": { id: "street-fries", name: "Street Fries", price: 150, category: "fries", heat: "Mild" },
  "dhaka-double": { id: "dhaka-double", name: "The Dhaka Double", price: 450, category: "burgers", heat: "125k SHU" },
  "crispy-naga-chicken": { id: "crispy-naga-chicken", name: "Crispy Naga Chicken", price: 380, category: "burgers", heat: "80k SHU" },
  "legendary-beef-boti": { id: "legendary-beef-boti", name: "Legendary Beef Boti", price: 550, category: "camp", heat: "Hot" },
  "luchi-4-pcs": { id: "luchi-4-pcs", name: "Luchi (4 Pcs)", price: 60, category: "camp", heat: "Mild" },
  "loaded-cheesy-fries": { id: "loaded-cheesy-fries", name: "Loaded Cheesy Fries", price: 180, category: "fries", heat: "Mild" },
  "mustakim-kebabs": { id: "mustakim-kebabs", name: "Mustakim-style Kebabs", price: 250, category: "camp", heat: "Hot" },
  "naga-smash-trial": { id: "naga-smash-trial", name: "Naga Smash Trial", price: 450, category: "spicy", heat: "350k SHU" },
  "campfire-boti-box": { id: "campfire-boti-box", name: "Campfire Boti Box", price: 620, category: "spicy", heat: "120k SHU" },
  "street-fries-inferno": { id: "street-fries-inferno", name: "Street Fries Inferno", price: 220, category: "spicy", heat: "45k SHU" },
  "paneer-smash-stack": { id: "paneer-smash-stack", name: "Paneer Smash Stack", price: 390, category: "green-mean", heat: "Hot", vegetarian: true },
  "hot-honey-cauliflower": { id: "hot-honey-cauliflower", name: "Hot Honey Cauliflower", price: 280, category: "green-mean", heat: "Medium", vegetarian: true },
  "green-chili-chotpoti-crunch": { id: "green-chili-chotpoti-crunch", name: "Green Chili Chotpoti Crunch", price: 180, category: "green-mean", heat: "Medium", vegetarian: true },
  "daily-flame-special": { id: "daily-flame-special", name: "Daily Flame Special", price: 620, category: "deals", heat: "Combo" },
  "combo-optimizer": { id: "combo-optimizer", name: "Combo Optimizer", price: 990, category: "deals", heat: "Combo" },
  "mohammadpur-office-drop": { id: "mohammadpur-office-drop", name: "Mohammadpur Office Drop", price: 1490, category: "deals", heat: "Group" }
};

function isAdmin(context: { auth?: { token?: Record<string, unknown> } }): boolean {
  return context.auth?.token?.admin === true;
}

function requireAuth(context: { auth?: unknown }) {
  if (!context.auth) throw new HttpsError("unauthenticated", "Sign in required.");
}

function requireAdmin(context: { auth?: { token?: Record<string, unknown> } }) {
  if (!isAdmin(context)) throw new HttpsError("permission-denied", "Admin only.");
}

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function readSecret(secret: ReturnType<typeof defineSecret>, envName: string) {
  try {
    return secret.value() || process.env[envName] || "";
  } catch {
    return process.env[envName] || "";
  }
}

function normalizeCart(rawItems: unknown) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpsError("invalid-argument", "items is required.");
  }

  const items = rawItems.map((rawItem) => {
    const item = rawItem as RequestedItem;
    const id = String(item.id ?? "");
    const catalogItem = MENU_CATALOG[id];
    if (!catalogItem) throw new HttpsError("invalid-argument", `Unknown menu item: ${id}`);

    const qty = Math.min(Math.max(Number(item.qty ?? 1), 1), 20);
    return {
      id: catalogItem.id,
      name: catalogItem.name,
      price: catalogItem.price,
      qty,
      category: catalogItem.category,
      heat: catalogItem.heat,
      vegetarian: catalogItem.vegetarian === true
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee = subtotal > 0 ? DELIVERY_FEE_BDT : 0;
  const total = subtotal + deliveryFee;
  return { items, subtotal, deliveryFee, total };
}

async function createStripeCheckoutSession(params: {
  orderId: string;
  items: ReturnType<typeof normalizeCart>["items"];
  deliveryFee: number;
}) {
  const stripeSecretKey = readSecret(stripeSecret, "STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    throw new HttpsError("failed-precondition", "Stripe secret is not configured.");
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${APP_ORIGIN}/tracking.html?orderId=${params.orderId}&payment=stripe`);
  form.set("cancel_url", `${APP_ORIGIN}/checkout.html?orderId=${params.orderId}&payment_cancelled=1`);
  form.set("metadata[orderId]", params.orderId);
  form.set("metadata[brand]", "Dhaka Cravings");

  params.items.forEach((item, index) => {
    form.set(`line_items[${index}][quantity]`, String(item.qty));
    form.set(`line_items[${index}][price_data][currency]`, "bdt");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.price * 100));
    form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    form.set(`line_items[${index}][price_data][product_data][metadata][menuItemId]`, item.id);
  });

  if (params.deliveryFee > 0) {
    const deliveryIndex = params.items.length;
    form.set(`line_items[${deliveryIndex}][quantity]`, "1");
    form.set(`line_items[${deliveryIndex}][price_data][currency]`, "bdt");
    form.set(`line_items[${deliveryIndex}][price_data][unit_amount]`, String(params.deliveryFee * 100));
    form.set(`line_items[${deliveryIndex}][price_data][product_data][name]`, "Mohammadpur delivery fee");
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION
    },
    body: form.toString()
  });

  const payload = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.id || !payload.url) {
    throw new HttpsError("internal", payload.error?.message ?? "Stripe Checkout failed.");
  }

  return { sessionId: payload.id, url: payload.url };
}

export const upsertProfile = onCall(async (request) => {
  requireAuth(request);
  const profile = request.data ?? {};
  const displayName = String(profile.displayName ?? "").trim().slice(0, 80);
  const phone = String(profile.phone ?? "").trim().slice(0, 30);

  await db.collection("users").doc(request.auth!.uid).set(
    {
      email: request.auth!.token.email ?? null,
      displayName: displayName || null,
      phone: phone || null,
      updatedAt: nowTimestamp(),
      createdAt: nowTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
});

export const createOrder = onCall(async (request) => {
  requireAuth(request);
  const { items, subtotal, deliveryFee, total } = normalizeCart(request.data?.items);
  const customer = (request.data?.customer ?? {}) as { name?: string; phone?: string; address?: string };

  const orderRef = db.collection("orders").doc();
  await orderRef.set({
    userId: request.auth!.uid,
    status: "placed" as OrderStatus,
    paymentStatus: "unpaid",
    paymentProvider: "cash",
    customer: {
      name: String(customer.name ?? "").trim() || null,
      phone: String(customer.phone ?? "").trim() || null,
      address: String(customer.address ?? "").trim() || null
    },
    items,
    subtotal,
    deliveryFee,
    total,
    statusHistory: [{ status: "placed", at: admin.firestore.Timestamp.now(), note: "Order created." }],
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp()
  });

  return { orderId: orderRef.id, total };
});

export const createStripeCheckout = onCall({ secrets: [stripeSecret] }, async (request) => {
  requireAuth(request);
  const { items, subtotal, deliveryFee, total } = normalizeCart(request.data?.items);
  const customer = (request.data?.customer ?? {}) as { name?: string; phone?: string; address?: string };

  const orderRef = db.collection("orders").doc();
  await orderRef.set({
    userId: request.auth!.uid,
    status: "placed" as OrderStatus,
    paymentStatus: "pending",
    paymentProvider: "stripe",
    customer: {
      name: String(customer.name ?? "").trim() || null,
      phone: String(customer.phone ?? "").trim() || null,
      address: String(customer.address ?? "").trim() || null
    },
    items,
    subtotal,
    deliveryFee,
    total,
    statusHistory: [{ status: "placed", at: admin.firestore.Timestamp.now(), note: "Stripe Checkout started." }],
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp()
  });

  const checkout = await createStripeCheckoutSession({ orderId: orderRef.id, items, deliveryFee });
  await orderRef.update({
    stripeSessionId: checkout.sessionId,
    updatedAt: nowTimestamp()
  });

  return { orderId: orderRef.id, url: checkout.url };
});

export const getMyOrder = onCall(async (request) => {
  requireAuth(request);
  const orderId = String(request.data?.orderId ?? "");
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const doc = await db.collection("orders").doc(orderId).get();
  if (!doc.exists) throw new HttpsError("not-found", "Order not found.");

  const data = doc.data()!;
  if (data.userId !== request.auth!.uid) throw new HttpsError("permission-denied", "Not your order.");

  return { orderId: doc.id, ...data };
});

export const adminGetOrder = onCall(async (request) => {
  requireAdmin(request);
  const orderId = String(request.data?.orderId ?? "");
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const doc = await db.collection("orders").doc(orderId).get();
  if (!doc.exists) throw new HttpsError("not-found", "Order not found.");
  return { orderId: doc.id, ...doc.data()! };
});

export const adminListOrders = onCall(async (request) => {
  requireAdmin(request);

  const status = (request.data?.status ?? null) as OrderStatus | null;
  const limit = Math.min(Number(request.data?.limit ?? 50), 200);

  let query: FirebaseFirestore.Query = db.collection("orders").orderBy("createdAt", "desc").limit(limit);
  if (status) query = db.collection("orders").where("status", "==", status).orderBy("createdAt", "desc").limit(limit);

  const snap = await query.get();
  return {
    orders: snap.docs.map((doc) => ({ orderId: doc.id, ...doc.data() }))
  };
});

export const adminUpdateOrderStatus = onCall(async (request) => {
  requireAdmin(request);
  const orderId = String(request.data?.orderId ?? "");
  const status = String(request.data?.status ?? "") as OrderStatus;
  const note = (request.data?.note ?? null) as string | null;

  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
  const allowed: OrderStatus[] = ["placed", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled"];
  if (!allowed.includes(status)) throw new HttpsError("invalid-argument", "Invalid status.");

  const ref = db.collection("orders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new HttpsError("not-found", "Order not found.");

    tx.update(ref, {
      status,
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status,
        note,
        at: admin.firestore.Timestamp.now(),
        by: request.auth!.uid
      }),
      updatedAt: nowTimestamp()
    });
  });

  await db.collection("adminLogs").add({
    actorId: request.auth!.uid,
    action: "order.status.updated",
    orderId,
    status,
    note,
    createdAt: nowTimestamp()
  });

  return { ok: true };
});

export const adminStats = onCall(async (request) => {
  requireAdmin(request);
  const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(200).get();

  const byStatus: Record<string, number> = {};
  const byPayment: Record<string, number> = {};
  let revenue = 0;
  for (const doc of snap.docs) {
    const order = doc.data() as { status?: string; paymentStatus?: string; total?: number };
    byStatus[order.status ?? "unknown"] = (byStatus[order.status ?? "unknown"] ?? 0) + 1;
    byPayment[order.paymentStatus ?? "unknown"] = (byPayment[order.paymentStatus ?? "unknown"] ?? 0) + 1;
    if (order.paymentStatus === "paid" || order.status === "delivered") revenue += Number(order.total ?? 0);
  }

  return { sampleSize: snap.size, byStatus, byPayment, revenue };
});

export const stripeWebhook = onRequest({ secrets: [stripeWebhookSecret] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const webhookSecret = readSecret(stripeWebhookSecret, "STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    res.status(501).send("Webhook secret is not configured.");
    return;
  }

  const signature = req.header("stripe-signature") ?? "";
  const rawBody = Buffer.isBuffer((req as unknown as { rawBody?: Buffer }).rawBody)
    ? (req as unknown as { rawBody: Buffer }).rawBody
    : Buffer.from(JSON.stringify(req.body));

  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    res.status(400).send("Invalid signature.");
    return;
  }

  const event = JSON.parse(rawBody.toString("utf8")) as {
    type?: string;
    data?: { object?: { id?: string; payment_status?: string; metadata?: { orderId?: string } } };
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    const orderId = session?.metadata?.orderId;
    if (orderId && session?.payment_status === "paid") {
      await db.collection("orders").doc(orderId).set(
        {
          paymentStatus: "paid",
          stripeSessionId: session.id ?? null,
          paidAt: nowTimestamp(),
          updatedAt: nowTimestamp()
        },
        { merge: true }
      );
    }
  }

  res.json({ received: true });
});

function verifyStripeSignature(rawBody: Buffer, signature: string, secret: string) {
  const timestamp = signature.match(/t=([^,]+)/)?.[1];
  const expectedSignature = signature.match(/v1=([^,]+)/)?.[1];
  if (!timestamp || !expectedSignature) return false;

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const digestBuffer = Buffer.from(digest, "hex");
  return expectedBuffer.length === digestBuffer.length && timingSafeEqual(expectedBuffer, digestBuffer);
}

export const onOrderStatusChanged = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  const orderId = event.params.orderId;
  await db.collection("adminStats").doc("lastOrderStatusChange").set(
    {
      orderId,
      from: before.status ?? null,
      to: after.status ?? null,
      at: nowTimestamp()
    },
    { merge: true }
  );
});
