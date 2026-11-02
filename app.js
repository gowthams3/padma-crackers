(() => {
  "use strict";

  // Requests go to the local same-origin proxy. The proxy forwards them to Padma's API.
  const API = "/api";
  // Product API may return image paths instead of complete URLs.
  // The supplied catalogue export used this DigitalOcean Spaces CDN host.
  const IMAGE_CDN_BASE =
    "https://ninos-prod-space.blr1.digitaloceanspaces.com";
  const ENDPOINTS = {
    products: `${API}/products/search`,
    orders: `${API}/store_orders`,
    contacts: `${API}/store_contacts`,
    language: `${API}/language/update-active`,
    orderDetails: `${API}/order_details`,
    pdf: `${API}/download-pdf/`
  };

  // The catalogue's category_id is the source of truth. These explicit ID groups
  // replace name-keyword guessing and keep every product in its original category family.
  const CATEGORY_ID_GROUPS = {
    "new": [1],
    "sparklers": [2],
    "shower": [3, 4, 5, 6, 14, 15, 16, 19, 29, 30, 31, 32],
    "chakkr": [7, 8, 9, 13, 20],
    "flowerpots": [11, 12],
    "bombs": [17, 21, 22, 23, 24, 25],
    "rockets": [26],
    "aerial": [27, 33, 34, 42, 43, 45, 48, 49, 63, 64, 67, 85, 88, 89, 90, 91, 96, 97, 98, 99, 100, 105, 106, 107, 108, 109, 110, 111, 112, 114, 116, 117, 118, 119, 120],
    "fancy": [35, 121, 122, 123]
  };
  const CATEGORY_META = [
    { id: "all", label: "All products", ta: "அனைத்து பொருட்கள்", icon: "✦" },
    { id: "new", label: "New arrivals", ta: "புதிய வரவுகள்", icon: "✧" },
    { id: "sparklers", label: "Sparklers", ta: "மத்தாப்பு", icon: "✳" },
    { id: "shower", label: "Showers & fountains", ta: "ஷவர் & ஃபவுண்டன்", icon: "✺" },
    { id: "chakkr", label: "Chakkars", ta: "சக்கரம்", icon: "◉" },
    { id: "flowerpots", label: "Flower pots", ta: "பூந்தொட்டி", icon: "♨" },
    { id: "bombs", label: "Bombs & bijili", ta: "வெடிகள்", icon: "✹" },
    { id: "rockets", label: "Rockets", ta: "ராக்கெட்டுகள்", icon: "↗" },
    { id: "aerial", label: "Aerial shots", ta: "வானவேடிக்கை", icon: "✦" },
    { id: "fancy", label: "Fancy & special", ta: "சிறப்பு வகைகள்", icon: "❖" },
    { id: "gift", label: "Gift boxes", ta: "கிப்ட் பாக்ஸ்", icon: "◇" },
    { id: "family", label: "Family packs", ta: "குடும்ப பேக்", icon: "⌂" },
    { id: "other", label: "Other collections", ta: "மற்றவை", icon: "＋" }
  ];
  const state = {
    products: [], filtered: [], cart: new Map(), category: "all", brand: "",
    sort: "featured", maxPrice: 0, query: "", language: 1, pageSize: 24,
    shown: 24, lightboxImages: [], lightboxIndex: 0, orderId: null, isLoading: false
  };
  const $ = id => document.getElementById(id);
  const money = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const parseLang = value => {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try { return JSON.parse(value); } catch { return { "1": value, "2": value }; }
  };
  const langValue = (value, language = state.language) => {
    const parsed = parseLang(value);
    return parsed[String(language)] || parsed["1"] || Object.values(parsed)[0] || "";
  };
  const resolveImageUrl = (value) => {
    const raw = String(value || "").trim();

    if (!raw) return "";

    // Keep existing absolute URLs unchanged
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    // Convert relative image paths into CDN URLs
    return `${IMAGE_CDN_BASE}/${raw.replace(/^\/+/, "")}`;
  };
  const unwrapProducts = payload => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["data", "products", "results", "items"]) {
      if (Array.isArray(payload[key])) return payload[key];
      if (payload[key] && Array.isArray(payload[key].data)) return payload[key].data;
    }
    return [];
  };
  function categoryFor(product) {
    const type = String(product.type || "").toLowerCase();
    if (type === "giftbox") return "gift";
    if (type === "familybox") return "family";
    const id = Number(product.category_id ?? product.categoryId);
    for (const [category, ids] of Object.entries(CATEGORY_ID_GROUPS)) {
      if (ids.includes(id)) return category;
    }
    return "other";
  }
  function normalizeProduct(raw) {
    const id = Number(raw.id);
    const name = raw.name ?? raw.product_name ?? "";
    const company = raw.company_name ?? raw.brand ?? "";
    const image = resolveImageUrl(
      raw.img_url ??
      raw.front_image ??
      raw.image ??
      raw.image_url ??
      ""
    );

    const productType = String(raw.type || "").toLowerCase();

    const isSpecialPack = ["giftbox", "familybox"].includes(productType);

    const mrp = Number(raw.mrp ?? 0);

    const currentPrice = isSpecialPack
      ? Math.round(mrp * 0.17)
      : Number(raw.mrp ?? raw.final_amount ?? raw.rate ?? 0);

    const originalPrice = isSpecialPack
      ? mrp
      : Number(raw.our_price ?? raw.original_price ?? currentPrice);

    return {
      id, code: raw.product_code ?? raw.code ?? `#${id}`,
      name, nameEn: langValue(name, 1), nameTa: langValue(name, 2),
      company, brand: langValue(company, 1) || String(company || "Padma"),
      brandTa: langValue(company, 2), image, price: currentPrice,
      original: originalPrice, discount: Number(raw.percentage ?? 0),
      additionalCharge: Number(raw.additional_charge_percentage ?? 0),
      categoryId: raw.category_id ?? null, type: raw.type || "product",
      status: raw.status
    };
  }
  const activeProducts = products => products
    .map(normalizeProduct)
    .filter(p => p.id && p.status !== 0 && p.status !== "0" && p.price >= 0);

  async function fetchCatalogue() {
    state.isLoading = true;
    $("loadingState").hidden = false;
    $("productGrid").innerHTML = "";
    try {
      const response = await fetch(`${ENDPOINTS.products}?search=`, {
        method: "GET", headers: { "Accept": "application/json" }, cache: "no-store"
      });
      if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
      const payload = await response.json();
      state.products = activeProducts(unwrapProducts(payload));
      if (!state.products.length) throw new Error("The product API returned no active products.");
      state.shown = state.pageSize;
      populateBrands();
      renderCategories();
      applyFilters();
      $("heroProductCount").textContent = state.products.length.toLocaleString("en-IN");
    } catch (error) {
      $("productGrid").innerHTML = `<div class="empty-state"><b>We couldn't load the catalogue.</b>${safe(error.message)}<br><br><button class="button button-outline" id="retryCatalogue" type="button">Try again</button></div>`;
      $("retryCatalogue")?.addEventListener("click", fetchCatalogue);
      $("resultCount").textContent = "Catalogue unavailable";
    } finally {
      state.isLoading = false;
      $("loadingState").hidden = true;
    }
  }

  function populateBrands() {
    const brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $("brandFilter").innerHTML = '<option value="">All brands</option>' + brands.map(b => `<option value="${safe(b)}">${safe(b)}</option>`).join("");
  }
  function categoryLabel(id) {
    const category = CATEGORY_META.find(c => c.id === id);
    return category ? (state.language === 2 ? category.ta : category.label) : "Other collections";
  }
  function renderCategories() {
    const counts = state.products.reduce((map, p) => {
      const id = categoryFor(p); map[id] = (map[id] || 0) + 1; return map;
    }, {});
    $("categoryRail").innerHTML = CATEGORY_META
      .filter(c => c.id === "all" || (counts[c.id] || 0) > 0)
      .map(c => {
        const count = c.id === "all" ? state.products.length : (counts[c.id] || 0);
        const label = state.language === 2 ? c.ta : c.label;
        return `<button class="category-chip ${state.category === c.id ? "active" : ""}" type="button" data-category="${c.id}"><span class="cat-icon">${c.icon}</span><span><b>${safe(label)}</b><small>${count} items</small></span></button>`;
      }).join("");
    $("categoryRail").querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
      state.category = button.dataset.category; state.shown = state.pageSize; renderCategories(); applyFilters();
    }));
  }
  function applyFilters() {
    const query = state.query.trim().toLocaleLowerCase();
    let products = state.products.filter(p => {
      const haystack = [p.nameEn, p.nameTa, p.brand, p.brandTa, p.code].join(" ").toLocaleLowerCase();
      return (!query || haystack.includes(query)) &&
        (state.category === "all" || categoryFor(p) === state.category) &&
        (!state.brand || p.brand === state.brand) &&
        (!state.maxPrice || p.price <= state.maxPrice);
    });
    if (state.sort === "low") products.sort((a, b) => a.price - b.price);
    if (state.sort === "high") products.sort((a, b) => b.price - a.price);
    if (state.sort === "az") products.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    state.filtered = products;
    $("resultCount").textContent = `${products.length.toLocaleString("en-IN")} products`;
    $("activeCategoryLabel").textContent = categoryLabel(state.category);
    renderProducts();
  }
  function productName(p) { return state.language === 2 ? (p.nameTa || p.nameEn) : (p.nameEn || p.nameTa); }
  function renderProducts() {
    const products = state.filtered.slice(0, state.shown);
    $("productGrid").innerHTML = products.length ? products.map(p => {
      const qty = state.cart.get(p.id) || 0;
      const discount = p.discount > 0 ? `<span class="discount-tag">${Math.round(p.discount)}% OFF</span>` : "";
      const image = p.image ? `<img src="${safe(p.image)}" alt="${safe(productName(p))}" loading="lazy" data-image-id="${p.id}">` : `<span class="no-image">✦</span>`;
      const typeTag = p.type !== "product" ? `<span class="product-type">${p.type === "giftbox" ? "Gift box" : "Family pack"}</span>` : "";
      return `<article class="product-card" data-product="${p.id}">
        <div class="product-visual" data-zoom="${p.id}">${image}<span class="product-code">${safe(p.code)}</span>${typeTag}<span class="zoom-hint">⌕</span></div>
        <div class="product-info"><div class="product-brand">${safe(p.brand)}</div><h3>${safe(productName(p))}</h3><div class="product-tamil">${safe(state.language === 2 ? p.nameEn : p.nameTa)}</div>
          <div class="price-line"><span class="current-price">${money(p.price)}</span>${p.original > p.price ? `<span class="old-price">${money(p.original)}</span>` : ""}${discount}</div>
          <div class="product-actions">${qty ? `<div class="qty-stepper"><button type="button" data-change="${p.id}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-change="${p.id}" data-delta="1" aria-label="Increase quantity">+</button></div>` : `<button class="add-button" type="button" data-add="${p.id}">＋ Add to list</button>`}</div>
        </div></article>`;
    }).join("") : `<div class="empty-state"><b>No matching products.</b>Try another search or reset the filters.</div>`;
    $("loadMore").hidden = state.shown >= state.filtered.length;
    $("productGrid").querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => changeQty(Number(b.dataset.add), 1)));
    $("productGrid").querySelectorAll("[data-change]").forEach(b => b.addEventListener("click", () => changeQty(Number(b.dataset.change), Number(b.dataset.delta))));
    $("productGrid").querySelectorAll("[data-zoom]").forEach(el => el.addEventListener("click", () => openLightbox(Number(el.dataset.zoom))));
  }
  function changeQty(id, delta) {
    const current = state.cart.get(id) || 0, next = Math.max(0, Math.min(100, current + delta));
    if (next) state.cart.set(id, next); else state.cart.delete(id);
    renderProducts(); renderCart();
  }
  function selectedProducts() {
    return [...state.cart.entries()].map(([id, qty]) => {
      const product = state.products.find(p => p.id === id);
      return product ? { ...product, qty } : null;
    }).filter(Boolean);
  }
  function productTotal() { return selectedProducts().reduce((sum, p) => sum + p.price * p.qty, 0); }
  function packageFee(total) {
    if (total <= 0) return 0;
    if (total <= 5000) return 100;
    if (total <= 10000) return 200;
    return 300;
  }
  function renderCart() {
    const rows = selectedProducts(), count = rows.reduce((sum, p) => sum + p.qty, 0), total = productTotal();
    $("headerCount").textContent = count; $("panelCount").textContent = count;
    $("cartTotal").textContent = money(total);
    $("mobileListMeta").textContent = `${count} quantities · ${money(total)}`;
    $("checkoutButton").disabled = !rows.length; $("shareButton").disabled = !rows.length;
    $("cartLines").innerHTML = rows.length ? rows.map(p => `<div class="cart-row"><div><b>${safe(productName(p))}</b><small>${safe(p.code)} · ${money(p.price)} each</small></div><div class="cart-qty"><button type="button" data-cart-change="${p.id}" data-delta="-1">−</button><span>${p.qty}</span><button type="button" data-cart-change="${p.id}" data-delta="1">+</button></div></div>`).join("") : `<div class="cart-empty"><span>✧</span><b>Your list starts here.</b><small>Add products to keep your selection together.</small></div>`;
    $("cartLines").querySelectorAll("[data-cart-change]").forEach(b => b.addEventListener("click", () => changeQty(Number(b.dataset.cartChange), Number(b.dataset.delta))));
    const budget = Number($("budgetRange").value);
    $("budgetValue").textContent = money(budget);
    $("budgetMessage").textContent = total > budget ? `${money(total - budget)} above your selected budget.` : `${money(budget - total)} remaining in your budget.`;
  }

  function syncSearch(value) {
    state.query = value;
    $("searchInput").value = value; $("mobileSearchInput").value = value;
    state.shown = state.pageSize; applyFilters();
  }
  function openCart() {
    if (window.matchMedia("(max-width: 800px)").matches) {
      $("checkoutModal").classList.add("open");
      $("checkoutModal").setAttribute("aria-hidden", "false");
      prepareCheckout();
    } else $("cartPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function shareList() {
    const rows = selectedProducts();
    if (!rows.length) return;
    const lines = ["Padma Crackers Bazaar — Shopping List", "", ...rows.map(p => `${p.code} | ${productName(p)} | Qty: ${p.qty} | ${money(p.price * p.qty)}`), "", `Product total: ${money(productTotal())}`, `Packaging fee (estimated): ${money(packageFee(productTotal()))}`, `Estimated payable: ${money(productTotal() + packageFee(productTotal()))}`, "Please confirm availability and final amount."];
    window.open("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")), "_blank", "noopener");
  }
  function prepareCheckout() {
    const rows = selectedProducts();
    $("checkoutSummary").innerHTML = `<b>${rows.length} selected products</b><br>${rows.map(p => `${safe(p.code)} · ${safe(productName(p))} × ${p.qty} — ${money(p.price * p.qty)}`).join("<br>")}<br><br>Product total: <b>${money(productTotal())}</b> · Estimated packaging: <b>${money(packageFee(productTotal()))}</b>`;
    $("orderMessage").textContent = "";
  }
  function openCheckout() {
    if (!selectedProducts().length) return;
    prepareCheckout();
    $("checkoutModal").classList.add("open");
    $("checkoutModal").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeCheckout() {
    $("checkoutModal").classList.remove("open");
    $("checkoutModal").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function openLightbox(id) {
    const images = state.filtered.filter(p => p.image);
    state.lightboxImages = images; state.lightboxIndex = Math.max(0, images.findIndex(p => p.id === id));
    showLightboxImage();
    $("imageLightbox").classList.add("open"); $("imageLightbox").setAttribute("aria-hidden", "false");
  }
  function showLightboxImage() {
    const p = state.lightboxImages[state.lightboxIndex];
    if (!p) return;
    $("lightboxImage").src = p.image; $("lightboxImage").alt = productName(p);
    $("lightboxCaption").textContent = `${p.code} · ${productName(p)} · ${money(p.price)}`;
  }
  function closeLightbox() {
    $("imageLightbox").classList.remove("open"); $("imageLightbox").setAttribute("aria-hidden", "true");
    $("lightboxImage").removeAttribute("src");
  }
  function moveLightbox(direction) {
    if (!state.lightboxImages.length) return;
    state.lightboxIndex = (state.lightboxIndex + direction + state.lightboxImages.length) % state.lightboxImages.length;
    showLightboxImage();
  }
  async function submitContact(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("contactSubmit"), status = $("contactStatus");
    const values = Object.fromEntries(new FormData(form).entries());
    button.disabled = true; button.textContent = "Sending…"; status.textContent = "";
    try {
      const response = await fetch(ENDPOINTS.contacts, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", ...(csrfToken() ? { "X-CSRF-TOKEN": csrfToken() } : {}) },
        body: JSON.stringify(values)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === "fail") throw new Error(result.message || "Enquiry could not be sent.");
      status.textContent = "Thank you. Your enquiry has been sent.";
      form.reset();
    } catch (error) {
      status.textContent = error.message || "Unable to send right now. Please try again.";
    } finally {
      button.disabled = false; button.innerHTML = 'Send enquiry <span>→</span>';
    }
  }

  async function updateLanguage() {
    state.language = state.language === 1 ? 2 : 1;
    $("languageButton").textContent = state.language === 1 ? "தமிழ்" : "English";
    renderCategories(); applyFilters(); renderCart();
    try {
      await fetch(ENDPOINTS.language, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ language_id: state.language })
      });
    } catch (error) { console.warn("Language preference could not be synced.", error); }
  }
  function csrfToken() { return document.querySelector('meta[name="csrf-token"]')?.content || ""; }
  async function submitOrder(event) {
    event.preventDefault();
    const rows = selectedProducts();
    if (!rows.length) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("submitOrder"), message = $("orderMessage");
    button.disabled = true; button.innerHTML = "Submitting selection…";
    message.textContent = "Creating your order summary. Please wait.";
    const total = productTotal(), fee = packageFee(total);
    const details = rows.map(p => ({
      id: p.id,
      model: p.type || "product",
      discount: Math.round(p.discount || 0),
      mrp: Math.round(p.original || p.price),
      rate: Math.round(p.price),
      qty: Math.round(p.qty)
    }));
    const orderData = {
      product_details: details,
      total_pay: total + fee,
      saved_price: rows.reduce((sum, p) => sum + Math.max(0, (p.original - p.price)) * p.qty, 0),
      total_product: rows.length,
      package_fee: fee
    };
    try {
      const response = await fetch(ENDPOINTS.orders, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", ...(csrfToken() ? { "X-CSRF-TOKEN": csrfToken() } : {}) },
        body: JSON.stringify(orderData)
      });
      const result = await response.json();
      if (result.status === "stale") {
        message.textContent = "The product list has changed. Please refresh the catalogue and select your products again.";
        return;
      }
      if (result.status !== "success" || !result.order?.id) {
        message.textContent = result.message || "We couldn't create the order summary. Please try again or contact the store.";
        return;
      }
      state.orderId = result.order.id;
      const customerSnapshot = Object.fromEntries(new FormData(form).entries());
      $("successActions").hidden = false;
      $("customerForm").querySelectorAll("input,button").forEach(el => el.disabled = true);
      button.hidden = true;
      message.textContent = "Your product selection is saved. Continue to send your contact and delivery details.";
      $("downloadPdf").onclick = () => window.open(ENDPOINTS.pdf + encodeURIComponent(state.orderId), "_blank", "noopener");
      submitCustomerDetails(customerSnapshot, state.orderId);
    } catch (error) {
      message.textContent = "Network error while submitting. Please check your connection and try again.";
      console.error(error);
    } finally {
      if (!state.orderId) { button.disabled = false; button.innerHTML = 'Submit selection <span>→</span>'; }
    }
  }
  function submitCustomerDetails(customer, orderId) {
    const continueButton = document.createElement("button");
    continueButton.type = "button"; continueButton.className = "button button-dark";
    continueButton.textContent = "Send customer details";
    continueButton.addEventListener("click", () => {
      const postForm = document.createElement("form");
      postForm.method = "POST"; postForm.action = ENDPOINTS.orderDetails; postForm.target = "_blank";
      const values = { ...customer, order_id: orderId };
      const token = csrfToken();
      if (token) values._token = token;
      Object.entries(values).forEach(([name, value]) => {
        const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value);
        postForm.appendChild(input);
      });
      document.body.appendChild(postForm); postForm.submit(); postForm.remove();
      $("orderMessage").textContent = "Customer details opened in a new tab. Use Download order PDF if you need the PDF copy.";
      continueButton.disabled = true; continueButton.textContent = "Details sent";
    });
    $("successActions").appendChild(continueButton);
  }

  $("searchInput").addEventListener("input", e => syncSearch(e.target.value));
  $("mobileSearchInput").addEventListener("input", e => syncSearch(e.target.value));
  $("brandFilter").addEventListener("change", e => { state.brand = e.target.value; state.shown = state.pageSize; applyFilters(); });
  $("sortFilter").addEventListener("change", e => { state.sort = e.target.value; state.shown = state.pageSize; applyFilters(); });
  $("maxPrice").addEventListener("input", e => { state.maxPrice = Number(e.target.value) || 0; state.shown = state.pageSize; applyFilters(); });
  $("clearFilters").addEventListener("click", () => {
    state.category = "all"; state.brand = ""; state.sort = "featured"; state.maxPrice = 0;
    $("brandFilter").value = ""; $("sortFilter").value = "featured"; $("maxPrice").value = "";
    syncSearch(""); renderCategories(); applyFilters();
  });
  $("loadMore").addEventListener("click", () => { state.shown += state.pageSize; renderProducts(); });
  $("budgetRange").addEventListener("input", renderCart);
  $("shareButton").addEventListener("click", shareList);
  $("openCart").addEventListener("click", openCart);
  $("heroCart").addEventListener("click", openCart);
  $("mobileOpenCart").addEventListener("click", openCheckout);
  $("checkoutButton").addEventListener("click", openCheckout);
  $("closeCheckout").addEventListener("click", closeCheckout);
  $("checkoutModal").addEventListener("click", e => { if (e.target === $("checkoutModal")) closeCheckout(); });
  $("customerForm").addEventListener("submit", submitOrder);
  $("contactForm").addEventListener("submit", submitContact);
  $("languageButton").addEventListener("click", updateLanguage);
  $("closeLightbox").addEventListener("click", closeLightbox);
  $("lightboxPrev").addEventListener("click", () => moveLightbox(-1));
  $("lightboxNext").addEventListener("click", () => moveLightbox(1));
  $("imageLightbox").addEventListener("click", e => { if (e.target === $("imageLightbox")) closeLightbox(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeLightbox(); closeCheckout(); }
    if ($("imageLightbox").classList.contains("open") && e.key === "ArrowLeft") moveLightbox(-1);
    if ($("imageLightbox").classList.contains("open") && e.key === "ArrowRight") moveLightbox(1);
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); $("searchInput").focus(); }
  });
  $("year").textContent = new Date().getFullYear();
  renderCart();
  fetchCatalogue();
})();