(() => {
    const CART_KEY = 'dhakaCravings.cart.v2';
    const ORDER_KEY = 'dhakaCravings.orders.v1';
    const DEFAULT_CONFIG = {
        stripePublishableKey: '',
        stripeReady: false,
        firebaseConfigured: false,
        firebaseConfig: null
    };
    const DEFAULT_CART = [
        { id: 'naga-smash', name: 'The Naga Smash', price: 450, qty: 1, heat: '350k SHU' },
        { id: 'street-fries', name: 'Street Fries', price: 150, qty: 1, heat: 'Mild' }
    ];
    const ITEM_FALLBACKS = {
        'the dhaka double': { id: 'dhaka-double', name: 'The Dhaka Double', price: 450, heat: '125k SHU' },
        'crispy naga chicken': { id: 'crispy-naga-chicken', name: 'Crispy Naga Chicken', price: 380, heat: '80k SHU' },
        'legendary beef boti': { id: 'legendary-beef-boti', name: 'Legendary Beef Boti', price: 550, heat: 'Hot' },
        'luchi (4 pcs)': { id: 'luchi-4-pcs', name: 'Luchi (4 Pcs)', price: 60, heat: 'Mild' },
        'loaded cheesy fries': { id: 'loaded-cheesy-fries', name: 'Loaded Cheesy Fries', price: 180, heat: 'Mild' },
        'mustakim-style kebabs': { id: 'mustakim-kebabs', name: 'Mustakim-style Kebabs', price: 250, heat: 'Hot' },
        'the naga smash': { id: 'naga-smash', name: 'The Naga Smash', price: 450, heat: '350k SHU' }
    };

    let appConfig = { ...DEFAULT_CONFIG };
    document.addEventListener('DOMContentLoaded', async () => {
        injectBaseStyles();
        hideLegacyCartBars();
        seedCartIfNeeded();
        await loadPublicConfig();
        improveNavLinks();
        injectCartDrawer();
        bindGlobalInteractions();
        enhanceMenuPage();
        setupCheckoutPage();
        updateCartUI();
        console.log('Dhaka Cravings website initialized.');
    });

    async function loadPublicConfig() {
        const windowConfig = window.DHAKA_CRAVINGS_CONFIG || {};
        if (window.location.protocol.startsWith('http')) {
            try {
                const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
                if (response.ok) {
                    const serverConfig = await response.json();
                    appConfig = { ...DEFAULT_CONFIG, ...serverConfig, ...windowConfig };
                    window.DHAKA_CRAVINGS_CONFIG = appConfig;
                    return;
                }
            } catch (error) {
                console.warn('Config endpoint unavailable, using browser defaults.', error);
            }
        }
        appConfig = { ...DEFAULT_CONFIG, ...windowConfig };
        window.DHAKA_CRAVINGS_CONFIG = appConfig;
    }

    function injectBaseStyles() {
        if (document.getElementById('dc-enhancement-styles')) return;
        const style = document.createElement('style');
        style.id = 'dc-enhancement-styles';
        style.textContent = `
            .dc-legacy-cart-bar { display: none !important; }
            .dc-location-strip {
                position: sticky;
                top: 72px;
                z-index: 45;
                margin: 0 auto;
                max-width: 1200px;
                padding: 10px 20px 0;
                pointer-events: none;
            }
            .dc-location-strip__inner {
                pointer-events: auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                border: 1px solid rgba(255,107,0,.35);
                background: linear-gradient(135deg, rgba(19,16,14,.95), rgba(52,29,14,.92));
                color: #fff;
                border-radius: 999px;
                padding: 10px 14px;
                box-shadow: 0 16px 40px rgba(0,0,0,.35);
                backdrop-filter: blur(14px);
            }
            .dc-location-strip__meta {
                display: flex;
                flex-direction: column;
                min-width: 0;
                font-size: 12px;
                line-height: 1.25;
            }
            .dc-location-strip__meta strong {
                color: #ff8a35;
                font-size: 11px;
                letter-spacing: .1em;
                text-transform: uppercase;
            }
            .dc-location-strip button,
            .dc-cart-fab,
            .dc-cart-drawer button,
            .dc-payment-card,
            .dc-menu-card button {
                min-height: 44px;
            }
            .dc-location-strip button {
                border: 0;
                border-radius: 999px;
                background: #ff6b00;
                color: #fff;
                font-weight: 900;
                padding: 8px 14px;
                text-transform: uppercase;
                white-space: nowrap;
            }
            .dc-cart-overlay {
                position: fixed;
                inset: 0;
                z-index: 80;
                background: rgba(0,0,0,.58);
                opacity: 0;
                pointer-events: none;
                transition: opacity .22s ease;
            }
            .dc-cart-drawer {
                position: fixed;
                top: 0;
                right: 0;
                z-index: 90;
                width: min(440px, 100vw);
                height: 100vh;
                display: flex;
                flex-direction: column;
                color: #fff;
                background: #110d0b;
                border-left: 1px solid rgba(255,107,0,.35);
                box-shadow: -30px 0 80px rgba(0,0,0,.45);
                transform: translateX(105%);
                transition: transform .25s ease;
            }
            body.dc-cart-open .dc-cart-overlay {
                opacity: 1;
                pointer-events: auto;
            }
            body.dc-cart-open .dc-cart-drawer {
                transform: translateX(0);
            }
            .dc-cart-drawer__head,
            .dc-cart-drawer__foot {
                padding: 20px;
                border-color: rgba(255,255,255,.08);
            }
            .dc-cart-drawer__head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }
            .dc-cart-drawer__items {
                flex: 1;
                overflow: auto;
                padding: 18px 20px;
            }
            .dc-cart-item {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 10px;
                padding: 14px;
                margin-bottom: 12px;
                border: 1px solid rgba(255,255,255,.09);
                border-radius: 16px;
                background: rgba(255,255,255,.045);
            }
            .dc-cart-item h4 {
                margin: 0 0 4px;
                font-size: 15px;
                font-weight: 900;
                text-transform: uppercase;
            }
            .dc-cart-item p {
                margin: 0;
                color: #b7aaa2;
                font-size: 13px;
            }
            .dc-cart-qty {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .dc-cart-qty button,
            .dc-cart-drawer__close {
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 999px;
                background: rgba(255,255,255,.06);
                color: #fff;
                width: 36px;
                height: 36px;
            }
            .dc-cart-drawer__foot {
                border-top: 1px solid rgba(255,255,255,.08);
                background: linear-gradient(180deg, rgba(28,20,16,.96), #0b0908);
            }
            .dc-cart-total-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
                color: #d8ccc4;
                font-size: 14px;
            }
            .dc-cart-total-row strong {
                color: #ff6b00;
                font-size: 28px;
                font-weight: 1000;
            }
            .dc-cart-checkout {
                width: 100%;
                margin-top: 12px;
                border: 0;
                border-radius: 14px;
                background: #ff6b00;
                color: #fff;
                font-weight: 1000;
                letter-spacing: .04em;
                text-transform: uppercase;
            }
            .dc-cart-fab {
                position: fixed;
                right: 22px;
                bottom: 22px;
                z-index: 60;
                display: inline-flex;
                align-items: center;
                gap: 12px;
                border: 0;
                border-radius: 999px;
                background: #fff;
                color: #111;
                padding: 10px 16px;
                box-shadow: 0 18px 50px rgba(0,0,0,.35);
                font-weight: 1000;
                text-transform: uppercase;
            }
            .dc-cart-fab__count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 26px;
                height: 26px;
                border-radius: 999px;
                background: #ff6b00;
                color: #fff;
            }
            .dc-toast {
                position: fixed;
                left: 50%;
                bottom: 92px;
                z-index: 100;
                max-width: min(92vw, 420px);
                transform: translateX(-50%) translateY(18px);
                opacity: 0;
                pointer-events: none;
                border: 1px solid rgba(255,107,0,.4);
                border-radius: 999px;
                background: rgba(17,13,11,.94);
                color: #fff;
                padding: 12px 18px;
                font-size: 14px;
                font-weight: 800;
                box-shadow: 0 18px 50px rgba(0,0,0,.38);
                transition: opacity .2s ease, transform .2s ease;
            }
            .dc-toast.is-visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            .dc-menu-section {
                margin-bottom: 56px;
            }
            .dc-menu-section__head {
                display: flex;
                align-items: end;
                justify-content: space-between;
                gap: 16px;
                border-bottom: 1px solid rgba(255,255,255,.12);
                margin-bottom: 20px;
                padding-bottom: 12px;
            }
            .dc-menu-section__head h2 {
                color: #fff;
                font-size: clamp(30px, 5vw, 56px);
                font-weight: 1000;
                line-height: .9;
                margin: 0;
                text-transform: uppercase;
            }
            .dc-menu-section__head p {
                color: #b7aaa2;
                margin: 0;
                max-width: 520px;
            }
            .dc-menu-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 16px;
            }
            .dc-menu-card {
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 20px;
                background: radial-gradient(circle at top right, rgba(255,107,0,.22), transparent 34%), #1a1411;
                padding: 18px;
                min-height: 220px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            .dc-menu-card--green {
                background: radial-gradient(circle at top right, rgba(64,214,83,.22), transparent 34%), #111812;
            }
            .dc-menu-card__eyebrow,
            .dc-heat-chip {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                width: max-content;
                border-radius: 999px;
                background: rgba(255,107,0,.18);
                color: #ff9a57;
                font-size: 11px;
                font-weight: 1000;
                letter-spacing: .08em;
                padding: 5px 8px;
                text-transform: uppercase;
            }
            .dc-menu-card--green .dc-menu-card__eyebrow {
                background: rgba(64,214,83,.16);
                color: #6cff7d;
            }
            .dc-menu-card h3 {
                color: #fff;
                font-size: 24px;
                font-weight: 1000;
                line-height: 1;
                margin: 14px 0 8px;
                text-transform: uppercase;
            }
            .dc-menu-card p {
                color: #c8bbb2;
                margin: 0 0 16px;
            }
            .dc-menu-card__bottom {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }
            .dc-menu-card__price {
                color: #ff6b00;
                font-size: 26px;
                font-weight: 1000;
            }
            .dc-menu-card button {
                border: 0;
                border-radius: 12px;
                background: #ff6b00;
                color: #fff;
                font-weight: 1000;
                padding: 10px 14px;
                text-transform: uppercase;
            }
            .dc-payment-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
            }
            .dc-payment-card {
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                border: 2px solid transparent;
                border-radius: 14px;
                background: rgba(255,255,255,.055);
                padding: 16px;
                text-align: center;
                transition: border-color .2s ease, background .2s ease;
            }
            .dc-payment-card:has(input:checked) {
                border-color: #ff6b00;
                background: rgba(255,107,0,.12);
            }
            .dc-payment-card input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
            }
            .dc-payment-card strong {
                color: #fff;
                font-size: 13px;
                text-transform: uppercase;
            }
            .dc-payment-card span {
                color: #b7aaa2;
                font-size: 12px;
            }
            .dc-payment-status {
                color: #c8bbb2;
                font-size: 13px;
                margin-top: 12px;
            }
            .dc-checkout-empty {
                border: 1px dashed rgba(255,255,255,.2);
                border-radius: 16px;
                padding: 18px;
                color: #c8bbb2;
                text-align: center;
            }
            @media (max-width: 768px) {
                .dc-location-strip {
                    top: 68px;
                    padding-inline: 12px;
                }
                .dc-location-strip__inner {
                    align-items: stretch;
                    border-radius: 20px;
                    flex-direction: column;
                }
                .dc-location-strip button {
                    width: 100%;
                }
                .dc-menu-grid,
                .dc-payment-grid {
                    grid-template-columns: 1fr;
                }
                .dc-cart-fab {
                    left: 12px;
                    right: 12px;
                    bottom: 12px;
                    justify-content: space-between;
                    border-radius: 18px;
                    padding: 14px 16px;
                }
                .dc-cart-drawer {
                    width: 100vw;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function hideLegacyCartBars() {
        const candidates = Array.from(document.body.querySelectorAll(':scope > div'));
        candidates.forEach((element) => {
            const text = normalizeText(element.textContent);
            const isFixedBottom = element.className.includes('fixed') && element.className.includes('bottom-0');
            if (isFixedBottom && /checkout|view cart|add/.test(text)) {
                element.classList.add('dc-legacy-cart-bar');
            }
        });
    }

    function seedCartIfNeeded() {
        if (!localStorage.getItem(CART_KEY)) saveCart(DEFAULT_CART);
    }

    function improveNavLinks() {
        const linkMap = {
            deals: 'menu.html#deals',
            'about us': 'about.html',
            support: 'support.html',
            privacy: 'privacy.html',
            terms: 'terms.html'
        };
        document.querySelectorAll('a').forEach((anchor) => {
            const label = normalizeText(anchor.textContent);
            if (linkMap[label]) anchor.setAttribute('href', linkMap[label]);
        });
        document.querySelectorAll('footer div').forEach((element) => {
            if (element.textContent.includes('©') || element.textContent.includes('Â©')) {
                element.textContent = '© 2026 Dhaka Cravings. Straight from Mohammadpur.';
            }
        });
    }

    function injectLocationStrip() {
        return;
    }

    function injectCartDrawer() {
        if (document.querySelector('.dc-cart-drawer')) return;
        const overlay = document.createElement('div');
        overlay.className = 'dc-cart-overlay';
        overlay.setAttribute('data-cart-close', 'true');

        const drawer = document.createElement('aside');
        drawer.className = 'dc-cart-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Dhaka Cravings cart');
        drawer.innerHTML = `
            <div class="dc-cart-drawer__head">
                <div>
                    <div class="dc-menu-card__eyebrow">Slide-Out Cart</div>
                    <h2 style="margin:6px 0 0;font-size:28px;font-weight:1000;text-transform:uppercase;">Your Loot</h2>
                </div>
                <button type="button" class="dc-cart-drawer__close" aria-label="Close cart" data-cart-close>×</button>
            </div>
            <div class="dc-cart-drawer__items" data-cart-items></div>
            <div class="dc-cart-drawer__foot">
                <div class="dc-cart-total-row"><span>Subtotal</span><span data-cart-subtotal>৳ 0</span></div>
                <div class="dc-cart-total-row"><span>Delivery estimate</span><span data-cart-delivery>৳ 50</span></div>
                <div class="dc-cart-total-row"><span data-cart-eta>Mohammadpur delivery fee included</span></div>
                <div class="dc-cart-total-row"><span>Total</span><strong data-cart-total>৳ 0</strong></div>
                <button type="button" class="dc-cart-checkout" data-cart-checkout>Checkout Securely</button>
            </div>
        `;

        const floatingCart = document.createElement('button');
        floatingCart.type = 'button';
        floatingCart.className = 'dc-cart-fab';
        floatingCart.setAttribute('data-cart-open', 'true');
        floatingCart.innerHTML = `
            <span class="dc-cart-fab__count" data-cart-count>0</span>
            <span>Cart</span>
            <span data-cart-fab-total>৳ 0</span>
        `;

        const toast = document.createElement('div');
        toast.className = 'dc-toast';
        toast.setAttribute('data-dc-toast', 'true');

        document.body.append(overlay, drawer, floatingCart, toast);
    }

    function bindGlobalInteractions() {
        document.addEventListener('click', handleDocumentClick, true);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeCart();
        });
        const drawer = document.querySelector('.dc-cart-drawer');
        drawer?.addEventListener('click', handleCartDrawerClick);
    }

    function handleDocumentClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const cartOpenControl = target.closest('[data-cart-open], button[aria-label="shopping_cart"], [data-icon="shopping_cart"]');
        if (cartOpenControl && !target.closest('.dc-cart-drawer')) {
            stopClick(event);
            openCart();
            return;
        }

        const cartCloseControl = target.closest('[data-cart-close]');
        if (cartCloseControl) {
            stopClick(event);
            closeCart();
            return;
        }

        const addControl = target.closest('[data-add-item], button');
        if (addControl && isAddToCartControl(addControl)) {
            stopClick(event);
            const item = inferItemFromControl(addControl);
            addToCart(item, 1);
            flashAdded(addControl);
            openCart();
        }
    }

    function stopClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function isAddToCartControl(control) {
        if (!(control instanceof Element)) return false;
        if (control.closest('.dc-cart-drawer')) return false;
        if (control.hasAttribute('data-add-item')) return true;
        if (looksLikeQuantityControl(control)) return false;
        const text = normalizeText(control.textContent);
        const icon = normalizeText(control.querySelector('[data-icon], .material-symbols-outlined')?.textContent || '');
        return /^add(\s+to\s+(cart|order))?/.test(text) || icon === 'add' || icon === 'shopping_bag';
    }

    function looksLikeQuantityControl(control) {
        const parentText = normalizeText(control.parentElement?.textContent || '');
        return parentText.includes('remove') && parentText.includes('add') && /\d/.test(parentText);
    }

    function inferItemFromControl(control) {
        const explicitName = control.getAttribute('data-item-name');
        if (explicitName) {
            return {
                id: slugify(explicitName),
                name: explicitName,
                price: Number(control.getAttribute('data-item-price') || 0),
                heat: control.getAttribute('data-item-heat') || '',
                vegetarian: control.getAttribute('data-item-vegetarian') === 'true'
            };
        }

        const container = control.closest('article, main, section') || document.body;
        const titleElement = container.querySelector('h1, h2, h3');
        const name = cleanLabel(titleElement?.textContent || 'Dhaka Cravings Item');
        const fallback = ITEM_FALLBACKS[normalizeText(name)] || {};
        const price = fallback.price || parsePrice(container.textContent) || 250;
        return {
            id: fallback.id || slugify(name),
            name: fallback.name || name,
            price,
            heat: fallback.heat || ''
        };
    }

    function parsePrice(text) {
        const match = String(text || '').replace(/,/g, '').match(/(?:৳|tk|bdt|à§³)?\s*([0-9]{2,5})/i);
        return match ? Number(match[1]) : 0;
    }

    function addToCart(item, qty) {
        const cart = getCart();
        const existingItem = cart.find((cartItem) => cartItem.id === item.id);
        if (existingItem) {
            existingItem.qty += qty;
        } else {
            cart.push({ ...item, qty });
        }
        saveCart(cart);
        updateCartUI();
        showToast(`${item.name} added. Cart is ready when you are.`);
    }

    function updateCartItem(id, nextQty) {
        const cart = getCart()
            .map((item) => item.id === id ? { ...item, qty: Math.max(0, nextQty) } : item)
            .filter((item) => item.qty > 0);
        saveCart(cart);
        updateCartUI();
    }

    function getCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }

    function getCartTotals() {
        const cart = getCart();
        const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
        const delivery = subtotal > 0 ? 50 : 0;
        const total = subtotal + delivery;
        return { cart, count, subtotal, delivery, total };
    }

    function updateCartUI() {
        const totals = getCartTotals();
        document.querySelectorAll('[data-cart-count]').forEach((element) => {
            element.textContent = String(totals.count);
        });
        document.querySelectorAll('[data-cart-fab-total]').forEach((element) => {
            element.textContent = formatTk(totals.total);
        });
        document.querySelectorAll('[data-cart-subtotal]').forEach((element) => {
            element.textContent = formatTk(totals.subtotal);
        });
        document.querySelectorAll('[data-cart-delivery]').forEach((element) => {
            element.textContent = totals.delivery ? formatTk(totals.delivery) : '৳ 0';
        });
        document.querySelectorAll('[data-cart-total]').forEach((element) => {
            element.textContent = formatTk(totals.total);
        });

        document.querySelectorAll('[data-cart-eta]').forEach((element) => {
            element.textContent = 'Mohammadpur delivery fee included at checkout';
        });

        const itemsContainer = document.querySelector('[data-cart-items]');
        if (itemsContainer) itemsContainer.innerHTML = renderCartItems(totals.cart);
        renderCheckoutSummary();
    }

    function renderCartItems(cart) {
        if (!cart.length) {
            return `<div class="dc-checkout-empty">Your cart is empty. Go cause a little delicious trouble on the menu.</div>`;
        }
        return cart.map((item) => `
            <article class="dc-cart-item">
                <div>
                    <h4>${escapeHtml(item.name)}</h4>
                    <p>${escapeHtml(item.heat || 'Fresh from Mohammadpur')} • ${formatTk(item.price)} each</p>
                </div>
                <div class="dc-cart-qty" data-dc-quantity>
                    <button type="button" aria-label="Decrease ${escapeHtml(item.name)}" data-cart-decrement="${escapeHtml(item.id)}">−</button>
                    <strong>${item.qty}</strong>
                    <button type="button" aria-label="Increase ${escapeHtml(item.name)}" data-cart-increment="${escapeHtml(item.id)}">+</button>
                </div>
            </article>
        `).join('');
    }

    function handleCartDrawerClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const incrementButton = target.closest('[data-cart-increment]');
        if (incrementButton) {
            const id = incrementButton.getAttribute('data-cart-increment');
            const item = getCart().find((cartItem) => cartItem.id === id);
            if (item) updateCartItem(id, item.qty + 1);
            return;
        }

        const decrementButton = target.closest('[data-cart-decrement]');
        if (decrementButton) {
            const id = decrementButton.getAttribute('data-cart-decrement');
            const item = getCart().find((cartItem) => cartItem.id === id);
            if (item) updateCartItem(id, item.qty - 1);
            return;
        }

        if (target.closest('[data-cart-checkout]')) {
            if (!getCart().length) {
                showToast('Add something spicy first. The cart is hungry too.');
                return;
            }
            closeCart();
            if (!isCheckoutPage()) window.location.href = 'checkout.html';
        }
    }

    function openCart() {
        document.body.classList.add('dc-cart-open');
    }

    function closeCart() {
        document.body.classList.remove('dc-cart-open');
    }

    function flashAdded(control) {
        if (!(control instanceof HTMLElement)) return;
        const originalContent = control.innerHTML;
        control.innerHTML = '<span style="font-weight:1000;">Added!</span>';
        window.setTimeout(() => {
            control.innerHTML = originalContent;
        }, 900);
    }

    function bindLocationControls() {
        return;
    }

    function requestLiveLocation() {
        showToast('Delivery is currently handled through the saved checkout address.');
    }

    function useTypedLocation(source) {
        const container = source.closest('section, main, body') || document.body;
        const input = container.querySelector('input[placeholder*="Where to"]') || document.querySelector('input[placeholder*="Where to"]');
        const label = cleanLabel(input?.value || 'Mohammadpur drop zone');
        const guessedDistance = /town hall|mohammadpur|block|road|salimullah|tajmahal/i.test(label) ? 1.8 : 4.2;
        const etaMin = estimateEta(guessedDistance);
        showToast(`Delivery estimate saved for ${label}: ${etaMin}-${etaMin + 8} min.`);
    }

    function refreshLocationUI() {
        updateCartUI();
    }

    function saveLocation(location) {
        return location;
    }

    function getSavedLocation() {
        return null;
    }

    function getDistanceKm(firstLat, firstLng, secondLat, secondLng) {
        const earthRadiusKm = 6371;
        const latDelta = toRadians(secondLat - firstLat);
        const lngDelta = toRadians(secondLng - firstLng);
        const firstLatRadians = toRadians(firstLat);
        const secondLatRadians = toRadians(secondLat);
        const haversine =
            Math.sin(latDelta / 2) ** 2 +
            Math.cos(firstLatRadians) * Math.cos(secondLatRadians) * Math.sin(lngDelta / 2) ** 2;
        return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }

    function toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    function estimateEta(distanceKm) {
        const prepMinutes = 18;
        const roadMinutes = Math.ceil(Number(distanceKm || 1) * 5);
        const trafficBuffer = Number(distanceKm || 1) > 4 ? 8 : 4;
        return Math.max(22, prepMinutes + roadMinutes + trafficBuffer);
    }

    function enhanceMenuPage() {
        if (!isMenuPage()) return;
        addHeatChipsToExistingCards();
        injectMenuStrategySections();
        if (window.location.hash) {
            window.setTimeout(() => {
                document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        }
    }

    function addHeatChipsToExistingCards() {
        document.querySelectorAll('article').forEach((article) => {
            const text = normalizeText(article.textContent);
            const matchingItem = Object.values(ITEM_FALLBACKS).find((item) => text.includes(normalizeText(item.name)));
            if (!matchingItem?.heat || article.querySelector('.dc-heat-chip')) return;
            const chip = document.createElement('span');
            chip.className = 'dc-heat-chip';
            chip.textContent = `Heat ${matchingItem.heat}`;
            const content = article.querySelector('.p-gutter, .absolute.bottom-0, div:last-child') || article;
            content.prepend(chip);
        });
    }

    function injectMenuStrategySections() {
        const main = document.querySelector('main');
        if (!main || document.getElementById('green-mean')) return;
        main.insertAdjacentHTML('beforeend', `
            <section id="spicy" class="dc-menu-section">
                <div class="dc-menu-section__head">
                    <h2>Scoville<br><span style="color:#ff6b00;">Scale</span></h2>
                    <p>Heat-level indicators turn the spicy category into a dare, not a guessing game.</p>
                </div>
                <div class="dc-menu-grid">
                    ${menuCard('Naga Smash Trial', '350k SHU', 'Smash burger with controlled Naga burn and cooling slaw.', 450, '350k SHU')}
                    ${menuCard('Campfire Boti Box', '120k SHU', 'Beef boti, luchi, onions, and smoked chili dip.', 620, '120k SHU')}
                    ${menuCard('Street Fries Inferno', '45k SHU', 'Loaded fries with chili crisp, cheese, and jalapeño dust.', 220, '45k SHU')}
                </div>
            </section>
            <section id="green-mean" class="dc-menu-section">
                <div class="dc-menu-section__head">
                    <h2>Green &<br><span style="color:#50f06b;">Mean</span></h2>
                    <p>Vegetarian items with the same loud, high-contrast Dhaka Cravings attitude.</p>
                </div>
                <div class="dc-menu-grid">
                    ${menuCard('Paneer Smash Stack', 'Vegetarian', 'Charred paneer, naga aioli, pickles, and double cheese.', 390, 'Hot', true)}
                    ${menuCard('Hot Honey Cauliflower', 'Vegetarian', 'Crispy cauliflower tossed in chili honey and toasted sesame.', 280, 'Medium', true)}
                    ${menuCard('Green Chili Chotpoti Crunch', 'Vegetarian', 'Tangy chotpoti crunch cup with green chili oil.', 180, 'Medium', true)}
                </div>
            </section>
            <section id="deals" class="dc-menu-section">
                <div class="dc-menu-section__head">
                    <h2>Deals That<br><span style="color:#ff6b00;">Hit Back</span></h2>
                    <p>Tiered value engineering: daily specials, combo optimizers, and group drops.</p>
                </div>
                <div class="dc-menu-grid">
                    ${menuCard('Daily Flame Special', 'Save ৳80', 'Naga Smash, Street Fries, and a cold drink.', 620, 'Combo')}
                    ${menuCard('Combo Optimizer', 'Best Value', 'Two burgers, one loaded fries, two drinks.', 990, 'Combo')}
                    ${menuCard('Mohammadpur Office Drop', 'Feeds 4', 'Boti box, paneer stack, fries, luchi, and dips.', 1490, 'Group')}
                </div>
            </section>
        `);
    }

    function menuCard(name, eyebrow, description, price, heat, vegetarian = false) {
        return `
            <article class="dc-menu-card ${vegetarian ? 'dc-menu-card--green' : ''}">
                <div>
                    <span class="dc-menu-card__eyebrow">${escapeHtml(eyebrow)}</span>
                    <h3>${escapeHtml(name)}</h3>
                    <p>${escapeHtml(description)}</p>
                </div>
                <div class="dc-menu-card__bottom">
                    <span class="dc-menu-card__price">${formatTk(price)}</span>
                    <button type="button" data-add-item data-item-name="${escapeHtml(name)}" data-item-price="${price}" data-item-heat="${escapeHtml(heat)}" data-item-vegetarian="${vegetarian}">Add</button>
                </div>
            </article>
        `;
    }

    function setupCheckoutPage() {
        if (!isCheckoutPage()) return;
        enhanceCheckoutLocation();
        renderPaymentPanel();
        renderCheckoutSummary();
        document.addEventListener('change', (event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.name === 'payment') {
                handlePaymentSelection(target.value);
            }
        });
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const placeOrderButton = target.closest('#dc-place-order, [data-place-order]');
            if (placeOrderButton) {
                event.preventDefault();
                placeOrder();
            }
        });
    }

    function enhanceCheckoutLocation() {
        const dropZoneSection = Array.from(document.querySelectorAll('section')).find((section) =>
            normalizeText(section.textContent).includes('drop zone')
        );
        const addressBlock = dropZoneSection?.querySelector('.bg-surface-container-high p');
        if (addressBlock) addressBlock.setAttribute('data-checkout-location', 'true');
        return;
    }

    function renderPaymentPanel() {
        const paymentSection = Array.from(document.querySelectorAll('section')).find((section) =>
            normalizeText(section.textContent).startsWith('account_balance_wallet payment') ||
            normalizeText(section.textContent).includes('payment')
        );
        if (!paymentSection || paymentSection.dataset.dcEnhanced === 'true') return;
        paymentSection.dataset.dcEnhanced = 'true';
        paymentSection.innerHTML = `
            <h2 class="font-headline-md text-headline-md text-on-background flex items-center gap-sm mb-md">
                <span class="material-symbols-outlined text-primary-container" data-icon="account_balance_wallet" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
                Payment
            </h2>
            <div class="dc-payment-grid">
                ${paymentCard('stripe', 'credit_card', 'Stripe Checkout', appConfig.stripeReady ? 'Test mode ready' : 'Add test secret key')}
                ${paymentCard('cod', 'local_shipping', 'Cash on Delivery', 'Fallback for local demo')}
            </div>
            <p class="dc-payment-status" data-payment-status>
                Stripe uses hosted Checkout Sessions. No raw card data touches this site.
            </p>
        `;
        const stripeInput = paymentSection.querySelector('input[value="stripe"]');
        if (stripeInput) stripeInput.checked = true;
    }

    function paymentCard(value, icon, title, subtitle) {
        return `
            <label class="dc-payment-card">
                <input name="payment" value="${value}" type="radio">
                <span class="material-symbols-outlined text-primary-container text-3xl" data-icon="${icon}">${icon}</span>
                <strong>${title}</strong>
                <span>${subtitle}</span>
            </label>
        `;
    }

    function handlePaymentSelection(value) {
        const status = document.querySelector('[data-payment-status]');
        if (!status) return;
        if (value === 'stripe') {
            status.textContent = appConfig.stripeReady
                ? 'Stripe test mode is ready. You will be redirected to hosted Checkout.'
                : 'Stripe secret key is missing. Add it to .env.local, then restart the server.';
        } else {
            status.textContent = 'Cash on Delivery will create a Firebase order and move to tracking.';
        }
    }

    function renderCheckoutSummary() {
        if (!isCheckoutPage()) return;
        const summarySection = Array.from(document.querySelectorAll('section')).find((section) =>
            normalizeText(section.textContent).includes('the loot')
        );
        if (!summarySection) return;
        const totals = getCartTotals();
        summarySection.innerHTML = `
            <h2 class="font-headline-md text-headline-md text-on-background border-b border-surface-variant pb-sm">The Loot</h2>
            <div class="flex flex-col gap-sm">
                ${totals.cart.length ? totals.cart.map(checkoutItemMarkup).join('') : '<div class="dc-checkout-empty">Your cart is empty. Add a flame from the menu first.</div>'}
            </div>
            <div class="border-t border-surface-variant pt-md flex flex-col gap-xs">
                <div class="flex justify-between items-center">
                    <span class="font-body-md text-body-md text-secondary">Subtotal</span>
                    <span class="font-body-md text-body-md text-on-background">${formatTk(totals.subtotal)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="font-body-md text-body-md text-secondary">Delivery Fee</span>
                    <span class="font-body-md text-body-md text-on-background">${formatTk(totals.delivery)}</span>
                </div>
                <div class="flex justify-between items-center mt-sm pt-sm border-t border-surface-variant">
                    <span class="font-headline-md text-headline-md text-primary-container uppercase">Total</span>
                    <span class="font-display-xl text-display-xl text-primary-container">${formatTk(totals.total)}</span>
                </div>
            </div>
            <button id="dc-place-order" data-place-order class="w-full bg-primary-container text-white font-label-bold text-label-bold uppercase py-4 rounded-lg hover:bg-orange-500 transition-colors active:scale-[0.98] mt-sm flex items-center justify-center gap-sm">
                <span>Place Order</span>
                <span class="material-symbols-outlined" data-icon="local_fire_department">local_fire_department</span>
            </button>
            <p class="text-center font-body-md text-body-md text-surface-container-highest mt-xs">Secure checkout and server-verified totals.</p>
        `;
    }

    function checkoutItemMarkup(item) {
        return `
            <div class="flex justify-between items-start gap-sm">
                <div>
                    <h3 class="font-label-bold text-label-bold text-on-background uppercase">${escapeHtml(item.name)}</h3>
                    <p class="font-body-md text-body-md text-secondary">x${item.qty} • ${escapeHtml(item.heat || 'Fresh')}</p>
                </div>
                <span class="font-price-display text-price-display text-on-background">${formatTk(item.price * item.qty)}</span>
            </div>
        `;
    }

    async function placeOrder() {
        const selectedPayment = document.querySelector('input[name="payment"]:checked')?.value || 'stripe';
        const totals = getCartTotals();
        if (!totals.cart.length) {
            showToast('Your cart is empty. Add a flame first.');
            return;
        }

        if (selectedPayment === 'stripe') {
            await startStripeCheckout(totals);
            return;
        }
        await persistLocalOrder('cod', totals);
        window.location.href = 'tracking.html';
    }

    function getCheckoutCustomer() {
        const address = document.querySelector('[data-checkout-location]')?.textContent || 'Mohammadpur, Block C';
        return {
            name: '',
            phone: '',
            address: cleanLabel(address)
        };
    }

    async function startStripeCheckout(totals) {
        if (!window.location.protocol.startsWith('http')) {
            showToast('Run the site at localhost so Stripe can call the local API.');
            return;
        }
        setPaymentStatus('Creating secure Stripe Checkout session…');
        try {
            if (window.DhakaCravingsBackend?.startStripeCheckout) {
                const payload = await window.DhakaCravingsBackend.startStripeCheckout({
                    items: totals.cart,
                    customer: getCheckoutCustomer()
                });
                window.location.href = payload.url;
                return;
            }
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    items: totals.cart,
                    deliveryFee: totals.delivery,
                    successUrl: `${window.location.origin}/tracking.html?payment=stripe`,
                    cancelUrl: `${window.location.origin}/checkout.html?payment_cancelled=1`
                })
            });
            const payload = await response.json();
            if (!response.ok) {
                setPaymentStatus(payload.error || 'Stripe checkout could not start.');
                showToast(payload.error || 'Stripe checkout could not start.');
                return;
            }
            window.location.href = payload.url;
        } catch (error) {
            console.error(error);
            setPaymentStatus('Stripe API is unavailable. Check server logs and .env.local.');
            showToast('Stripe API is unavailable. Check server logs.');
        }
    }

    async function persistLocalOrder(paymentMethod, totals) {
        const order = {
            id: `DC-${Date.now()}`,
            paymentMethod,
            status: 'placed',
            items: totals.cart,
            subtotal: totals.subtotal,
            delivery: totals.delivery,
            total: totals.total,
            createdAt: new Date().toISOString()
        };

        if (window.DhakaCravingsBackend?.createCashOrder) {
            await window.DhakaCravingsBackend.createCashOrder({
                items: totals.cart,
                customer: getCheckoutCustomer()
            });
            return;
        }

        const orders = getLocalOrders();
        orders.unshift(order);
        localStorage.setItem(ORDER_KEY, JSON.stringify(orders.slice(0, 20)));

        if (window.location.protocol.startsWith('http')) {
            try {
                await fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(order)
                });
            } catch (error) {
                console.warn('Local order persistence endpoint unavailable.', error);
            }
        }
    }

    function getLocalOrders() {
        try {
            const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function setPaymentStatus(message) {
        const status = document.querySelector('[data-payment-status]');
        if (status) status.textContent = message;
    }

    function showToast(message) {
        const toast = document.querySelector('[data-dc-toast]');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('is-visible');
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 2600);
    }

    function formatTk(amount) {
        return `৳ ${Number(amount || 0).toLocaleString('en-BD')}`;
    }

    function normalizeText(text) {
        return cleanLabel(text).toLowerCase();
    }

    function cleanLabel(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function slugify(text) {
        return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dhaka-cravings-item';
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

    function isMenuPage() {
        return window.location.pathname.endsWith('menu.html') || window.location.pathname.endsWith('/menu');
    }

    function isCheckoutPage() {
        return window.location.pathname.endsWith('checkout.html') || window.location.pathname.endsWith('/checkout');
    }
})();
