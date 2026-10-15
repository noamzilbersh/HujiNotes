/* The single-page app: routing, pages, modals, toasts and notifications. */
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const U = window.U;
  const S = window.Store;
  const A = window.Auth;
  const esc = U.esc;

  const $app = document.getElementById("app");
  const $nav = document.getElementById("nav");
  const $user = document.getElementById("user-area");
  const $modal = document.getElementById("modal-root");
  const $toasts = document.getElementById("toasts");

  const EMAIL_DOMAIN = (C.ALLOWED_EMAIL_DOMAINS || [])[0] || "gmail.com";

  // Ready-made accounts so you can try both sides of a deal quickly.
  const DEMO_ACCOUNTS = [
    { name: "Alex Student", email: "alex.student.demo@" + EMAIL_DOMAIN },
    { name: "Sam Seller", email: "sam.seller.demo@" + EMAIL_DOMAIN },
  ];

  const ICONS = {
    bell: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m22 7-10 6L2 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let me = null;
  let current = { name: "", live: false };
  let pendingRoute = null; // where to go after signing in
  let buySort = "newest";
  let knownNotifs = null; // { owner, ids:Set } notifications this tab has already shown
  let modal = null; // { onSubmit, returnFocus }
  let pendingHighlight = null; // CSS selector to point at after the next page renders
  let helpLog = []; // the help chat so far: { from: "bot"|"user", id?, text? }
  let photoBusy = 0; // photos still being resized

  // ---------- routing ----------

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { name: parts[0] || "home", params: parts.slice(1) };
  }

  const views = {
    home: viewHome,
    login: viewLogin,
    sell: viewSell,
    buy: viewBuy,
    "my-listings": viewMyListings,
    "my-offers": viewMyOffers,
    notifications: viewNotifications,
    help: viewHelp,
  };

  function render({ keepScroll = false } = {}) {
    me = A.current();
    const route = parseHash();
    if (!me && route.name !== "login" && route.name !== "help") {
      pendingRoute = location.hash || "#/";
      location.replace("#/login");
      return;
    }
    if (me && route.name === "login") {
      location.replace("#/");
      return;
    }
    const out = (views[route.name] || viewNotFound)(...route.params);
    const y = window.scrollY;
    $app.innerHTML = out.html;
    document.title = (out.title ? out.title + " · " : "") + C.SITE_NAME;
    current = { name: route.name, live: !!out.live };
    renderHeader(route.name);
    if (out.mount) out.mount();
    window.scrollTo(0, keepScroll ? y : 0);
    if (pendingHighlight) highlight(pendingHighlight);
    pendingHighlight = null;
    checkNotifications();
  }

  // Called when data changed elsewhere (another tab, or a demo seller replied).
  // Re-renders the page unless the person is in the middle of typing.
  function refresh() {
    if (!me) return;
    renderHeader(current.name);
    checkNotifications();
    if (!current.live || modal) return;
    const a = document.activeElement;
    if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    render({ keepScroll: true });
  }

  // ---------- header ----------

  function avatar(user, cls = "") {
    if (user.picture) {
      return `<img class="avatar ${cls}" src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">`;
    }
    return `<span class="avatar ${cls}" aria-hidden="true">${esc(U.initials(user.name))}</span>`;
  }

  function renderHeader(active) {
    if (!me) {
      $nav.hidden = true;
      $nav.innerHTML = "";
      $user.innerHTML = `<a class="btn ghost sm" href="#/help" ${active === "help" ? 'aria-current="page"' : ""}>❓ Help</a>`;
      return;
    }
    const unread = S.unreadCount(me.email);
    const waiting = S.offersAwaiting(me.email);
    const sellerTurn = waiting.filter((o) => o.sellerEmail === me.email).length;
    const buyerTurn = waiting.length - sellerTurn;
    const links = [
      ["home", "#/", "Home", 0],
      ["buy", "#/buy", "Buy", 0],
      ["sell", "#/sell", "Sell", 0],
      ["my-listings", "#/my-listings", "My listings", sellerTurn],
      ["my-offers", "#/my-offers", "My offers", buyerTurn],
      ["help", "#/help", "Help", 0],
    ];
    $nav.hidden = false;
    $nav.innerHTML = links.map(([name, href, label, dot]) =>
      `<a href="${href}" ${name === active ? 'aria-current="page"' : ""}>${label}${dot ? `<span class="dot" title="${dot} waiting for your answer">${dot}</span>` : ""}</a>`
    ).join("");
    $user.innerHTML = `
      <a class="bell" href="#/notifications" aria-label="Notifications, ${unread} unread" ${active === "notifications" ? 'aria-current="page"' : ""}>
        ${ICONS.bell}${unread ? `<span class="badge">${unread > 99 ? "99+" : unread}</span>` : ""}
      </a>
      <span class="me" title="${esc(me.email)}">${avatar(me)}<span class="me-name">${esc(U.firstName(me.name))}</span></span>
      <button class="btn ghost sm" data-action="sign-out">Sign out</button>`;
  }

  // ---------- toasts & notifications ----------

  function toast(message, kind = "info", link) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.innerHTML = `<span class="toast-msg">${esc(message)}</span>` +
      (link ? `<a href="${esc(link)}">View</a>` : "") +
      '<button class="toast-x" type="button" aria-label="Dismiss">×</button>';
    const remove = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); };
    el.querySelector(".toast-x").addEventListener("click", remove);
    const a = el.querySelector("a");
    if (a) a.addEventListener("click", remove);
    $toasts.appendChild(el);
    while ($toasts.children.length > 3) $toasts.firstElementChild.remove();
    setTimeout(remove, kind === "error" ? 7000 : 5000);
  }

  // Pops a toast for notifications that arrived since this tab last looked.
  function checkNotifications({ silent = false } = {}) {
    if (!me) { knownNotifs = null; return; }
    const list = S.notificationsFor(me.email);
    if (!knownNotifs || knownNotifs.owner !== me.email) {
      knownNotifs = { owner: me.email, ids: new Set(list.map((n) => n.id)) };
      return;
    }
    const fresh = list.filter((n) => !knownNotifs.ids.has(n.id));
    fresh.forEach((n) => knownNotifs.ids.add(n.id));
    if (silent) return;
    fresh.filter((n) => !n.read).slice(0, 3).reverse().forEach((n) => toast("🔔 " + n.title, "notif", n.link));
  }

  // ---------- shared pieces ----------

  function coursesByDept() {
    const groups = new Map();
    for (const c of C.COURSES) {
      const d = c.dept || "Other";
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(c);
    }
    return [...groups];
  }

  function typeTag(type) {
    const t = U.typeInfo(type);
    return `<span class="tag tag-${esc(type)}">${t.icon} ${esc(t.label)}</span>`;
  }

  function priceTag(price) {
    return `<span class="price ${price === 0 ? "free" : ""}">${U.money(price)}</span>`;
  }

  function listingSummary(l) {
    return `<div class="summary ${l.photo ? "has-photo" : ""}">
      ${l.photo ? `<img class="summary-photo" src="${esc(l.photo)}" alt="">` : ""}
      <div>
        <div class="summary-top">${typeTag(l.type)} ${priceTag(l.price)}</div>
        <p class="summary-course">${esc(U.courseLabel(l.courseId))}</p>
        <p class="summary-desc">${esc(l.description)}</p>
        <p class="meta">Seller: ${esc(l.sellerName)}</p>
        ${locationLine(l)}
      </div>
    </div>`;
  }

  function locationLine(l) {
    const where = U.locationText(l);
    return where ? `<p class="meta location">📍 ${esc(where)}</p>` : "";
  }

  // Clickable photo that opens full size.
  function listingPhoto(l, cls) {
    if (!l.photo) return "";
    return `<button class="photo-btn ${cls}" type="button" data-action="view-photo" data-id="${esc(l.id)}" aria-label="View photo full size">
      <img src="${esc(l.photo)}" alt="Photo of the ${esc(U.typeInfo(l.type).label.toLowerCase())}" loading="lazy"></button>`;
  }

  // Photo picker used on the Sell page and in the Edit dialog. The resized
  // image is kept in the hidden "photo" input as a data URL.
  function photoField(label, current, id) {
    return `<div class="field" id="${id}">
      <span class="label">${label}</span>
      <input type="hidden" name="photo" value="${esc(current || "")}">
      <div class="photo-pick">
        <img class="photo-preview" alt="Preview of your photo" ${current ? `src="${esc(current)}"` : "hidden"}>
        <div class="btn-row">
          <label class="btn secondary sm file-btn">📷 <span class="file-label">${current ? "Change photo" : "Add a photo"}</span>
            <input type="file" accept="image/*" data-photo-input></label>
          <button class="btn ghost sm" type="button" data-action="remove-photo" ${current ? "" : "hidden"}>Remove</button>
        </div>
      </div>
      <div class="hint"><span>Optional. A photo of the cover or a sample page helps buyers.</span></div>
    </div>`;
  }

  function locationFields(label, l, id) {
    const current = (l && l.location) || "";
    return `<div class="field" id="${id}">
      <label class="label" for="${id}-select">${label}</label>
      <select id="${id}-select" name="location" data-location-select>
        <option value="">Decide later with the buyer</option>
        ${(C.LOCATIONS || []).map((loc) => `<option value="${esc(loc.id)}" ${loc.id === current ? "selected" : ""}>${esc(loc.label)}</option>`).join("")}
      </select>
      <input name="locationDetails" maxlength="80" value="${esc((l && l.locationDetails) || "")}" aria-label="Exact meeting spot"
        placeholder="${current === "other" ? "Where? e.g. Café Hillel, Emek Refaim" : "Exact spot (optional), e.g. Main library entrance"}">
    </div>`;
  }

  function watermark(cls = "") {
    return C.UNIVERSITY_LOGO ? `<img class="watermark ${cls}" src="${esc(C.UNIVERSITY_LOGO)}" alt="" aria-hidden="true">` : "";
  }

  // Scrolls to an element and makes it pulse so people see what to press.
  function highlight(selector) {
    let el = null;
    for (const sel of selector.split(",")) {
      el = document.querySelector(sel.trim());
      if (el) break;
    }
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("guide-pulse");
    setTimeout(() => el.classList.remove("guide-pulse"), 4200);
  }

  function contactBox(name, email, listing, price) {
    const subject = `${C.SITE_NAME}: ${U.typeInfo(listing.type).label} for ${U.course(listing.courseId) ? U.course(listing.courseId).code : "your course"}`;
    const what = price === 0 ? "free" : U.money(price);
    return `<div class="contact">
      <p class="contact-title">🎉 Deal agreed: ${esc(what)}</p>
      <p>Get in touch with ${esc(name)} to plan payment and pickup:</p>
      ${U.locationText(listing) ? `<p>📍 Meeting place: <strong>${esc(U.locationText(listing))}</strong></p>` : ""}
      <div class="btn-row">
        <a class="btn primary sm" href="mailto:${esc(email)}?subject=${encodeURIComponent(subject)}">${ICONS.mail} ${esc(email)}</a>
        <button class="btn ghost sm" type="button" data-action="copy" data-text="${esc(email)}">Copy email</button>
      </div>
      <p class="note">💳 Payment is between you two. The site doesn't handle money.</p>
    </div>`;
  }

  function statusPill(o, role) {
    const labels = {
      pending: role === "seller" ? ["Your turn", "turn"] : ["Waiting for seller", "wait"],
      countered: role === "buyer" ? ["Your turn", "turn"] : ["Waiting for buyer", "wait"],
      accepted: ["Agreed", "ok"],
      declined: ["Declined", "off"],
      withdrawn: ["Withdrawn", "off"],
      closed: ["Closed", "off"],
    };
    const [text, cls] = labels[o.status] || [o.status, "off"];
    return `<span class="pill pill-${cls}">${text}</span>`;
  }

  function describeStep(h, o, role) {
    const who = h.by === role ? "You" : esc(h.by === "seller" ? o.sellerName : o.buyerName);
    const amt = `<strong>${U.money(h.amount)}</strong>`;
    switch (h.action) {
      case "offer": return `${who} offered ${amt}`;
      case "counter": return `${who} countered with ${amt}`;
      case "accept": return `${who} accepted ${amt}`;
      case "buy": return h.amount === 0 ? `${who} claimed it for free` : `${who} agreed to the asking price, ${amt}`;
      case "decline": return `${who} declined`;
      case "withdraw": return `${who} withdrew the offer`;
      case "closed": return "Sold to someone else";
      case "removed": return "The seller removed the listing";
      default: return esc(h.action);
    }
  }

  function thread(o, role) {
    return `<ol class="thread">${o.history.map((h) => `
      <li class="${h.by === role ? "mine" : h.by === "system" ? "system" : "theirs"}">
        <span>${describeStep(h, o, role)}</span> <time>${U.timeAgo(h.at)}</time>
        ${h.note ? `<q>${esc(h.note)}</q>` : ""}
      </li>`).join("")}</ol>`;
  }

  function respondButtons(o) {
    return `<div class="btn-row">
      <button class="btn primary sm" data-action="accept" data-id="${esc(o.id)}">Accept ${U.money(o.amount)}</button>
      <button class="btn secondary sm" data-action="counter" data-id="${esc(o.id)}">Counter</button>
      <button class="btn ghost sm" data-action="decline" data-id="${esc(o.id)}">Decline</button>
    </div>`;
  }

  // One negotiation, seen from `role` ("buyer" or "seller").
  function offerBlock(o, role, listing) {
    const other = role === "seller" ? o.buyerName : o.sellerName;
    let actions = "";
    if (S.isMyTurn(o, me.email)) actions = respondButtons(o);
    else if (o.status === "pending" && role === "buyer") actions = `<div class="btn-row"><button class="btn ghost sm" data-action="withdraw" data-id="${esc(o.id)}">Withdraw offer</button></div>`;
    else if (o.status === "accepted" && listing) {
      actions = role === "seller"
        ? contactBox(o.buyerName, o.buyerEmail, listing, o.amount)
        : contactBox(o.sellerName, o.sellerEmail, listing, o.amount);
    }
    return `<div class="offer ${S.isMyTurn(o, me.email) ? "is-turn" : ""}">
      <div class="offer-head">
        <span class="offer-who">${avatar({ name: other }, "sm")} ${esc(other)}</span>
        ${statusPill(o, role)}
        <span class="offer-amount">${U.money(o.amount)}</span>
      </div>
      ${thread(o, role)}
      ${actions}
    </div>`;
  }

  function emptyState(icon, title, text, cta) {
    return `<div class="empty"><div class="empty-icon">${icon}</div><h2>${title}</h2><p>${text}</p>${cta || ""}</div>`;
  }

  // ---------- pages ----------

  function viewLogin() {
    const google = A.googleEnabled();
    const demo = A.demoEnabled();
    const placeholder = "you@" + EMAIL_DOMAIN;
    return {
      title: "Sign in",
      html: `
      ${watermark("on-login")}
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${esc(C.UNIVERSITY_NAME)} · student marketplace</p>
          <h1>Finished a class? Pass your notes on.</h1>
          <p class="lead">Sell or give away your notes and mock test notebooks, or find them for the class you're taking now.</p>
          <ol class="how">
            <li><strong>Sign in</strong> with your university email (@${esc(EMAIL_DOMAIN)}).</li>
            <li><strong>Sell:</strong> pick the course, write a short description, set a price.</li>
            <li><strong>Buy:</strong> pick the course, then notes or mock test notebooks. Pay the asking price or make a counteroffer.</li>
            <li><strong>Agree on a price</strong> and you both get each other's email. You pay each other directly, not through the site.</li>
          </ol>
        </div>
        <div class="card login-card">
          <h2>Sign in</h2>
          ${google ? '<div id="gsi-button" class="gsi"></div>' : ""}
          ${google && demo ? '<div class="divider"><span>or demo sign-in</span></div>' : ""}
          ${demo ? `
          <form data-form="demo-login" class="stack" novalidate>
            <label class="field"><span class="label">Your name</span>
              <input name="name" maxlength="40" autocomplete="name" placeholder="e.g. Noa Cohen" required></label>
            <label class="field"><span class="label">University email</span>
              <input name="email" type="email" autocomplete="email" placeholder="${esc(placeholder)}" required></label>
            <p class="form-error" role="alert" hidden></p>
            <button class="btn primary block" type="submit">${ICONS.mail} Sign in</button>
          </form>
          <div class="demo-accounts">
            <p class="muted small">Or try a ready-made account:</p>
            <div class="btn-row">${DEMO_ACCOUNTS.map((a, i) =>
              `<button class="chip-btn" type="button" data-action="demo-account" data-i="${i}">${avatar(a, "sm")} ${esc(a.name)}</button>`).join("")}</div>
          </div>
          <p class="note">Demo mode: no password is needed and everything stays in this browser.
            Tip: sign in as a different person in a second tab to see offers and notifications go back and forth.</p>` : ""}
          <p class="small center-text">Not sure how it works? <a href="#/help">Ask the help bot</a></p>
        </div>
      </section>`,
      mount() {
        const el = document.getElementById("gsi-button");
        if (el) A.renderGoogleButton(el, onSignedIn, (err) => toast(err.message, "error"));
      },
    };
  }

  function onSignedIn(user) {
    knownNotifs = null;
    toast(`Welcome, ${U.firstName(user.name)}!`, "success");
    const next = pendingRoute && !/^#\/?login/.test(pendingRoute) ? pendingRoute : "#/";
    pendingRoute = null;
    location.hash = next;
  }

  function viewHome() {
    const waiting = S.offersAwaiting(me.email);
    const activeListings = S.listingsBySeller(me.email).filter((l) => l.status === "active").length;
    const openOffers = S.offersByBuyer(me.email).filter(S.isActive).length;
    const unread = S.unreadCount(me.email);
    return {
      title: "Home",
      live: true,
      html: `
      ${watermark()}
      <section class="page-head">
        <h1>Hi ${esc(U.firstName(me.name))}, what would you like to do?</h1>
      </section>
      <div class="choice-grid">
        <a class="choice choice-sell" href="#/sell">
          <span class="choice-icon" aria-hidden="true">📤</span>
          <span class="choice-title">Sell</span>
          <span class="choice-text">List notes or a mock test notebook from a class you finished. Set a price, or give it away for free.</span>
          <span class="choice-cta">Start selling →</span>
        </a>
        <a class="choice choice-buy" href="#/buy">
          <span class="choice-icon" aria-hidden="true">🛒</span>
          <span class="choice-title">Buy</span>
          <span class="choice-text">Find notes and mock test notebooks for the course you're taking.</span>
          <span class="choice-cta">Find a course →</span>
        </a>
      </div>
      ${waiting.length ? `
      <section class="section">
        <h2>Waiting for your answer <span class="count">${waiting.length}</span></h2>
        <div class="stack">${waiting.map((o) => {
          const l = S.getListing(o.listingId);
          const role = o.sellerEmail === me.email ? "seller" : "buyer";
          return `<article class="card compact">
            <p class="meta">${role === "seller" ? "Your listing" : "You're buying"} · ${l ? typeTag(l.type) : ""} ${l ? esc(U.courseLabel(l.courseId)) : ""}</p>
            ${offerBlock(o, role, l)}
          </article>`;
        }).join("")}</div>
      </section>` : ""}
      <section class="stats">
        <a class="stat" href="#/my-listings"><strong>${activeListings}</strong><span>active listing${activeListings === 1 ? "" : "s"}</span></a>
        <a class="stat" href="#/my-offers"><strong>${openOffers}</strong><span>open offer${openOffers === 1 ? "" : "s"}</span></a>
        <a class="stat" href="#/notifications"><strong>${unread}</strong><span>unread notification${unread === 1 ? "" : "s"}</span></a>
      </section>`,
    };
  }

  function viewSell() {
    const types = Object.entries(C.ITEM_TYPES);
    return {
      title: "Sell",
      html: `
      <section class="page-head">
        <a class="back" href="#/">← Back</a>
        <h1>Sell your notes</h1>
        <p class="lead">Buyers can pay your price straight away or send you a counteroffer.</p>
      </section>
      <form class="card form" data-form="sell" novalidate>
        <div class="field">
          <label class="label" for="sell-course"><span class="step">1</span> Which class is it from?</label>
          <select id="sell-course" name="courseId" required>
            <option value="">Choose a course…</option>
            ${coursesByDept().map(([dept, courses]) => `<optgroup label="${esc(dept)}">${courses.map((c) =>
              `<option value="${esc(c.id)}">${esc(c.code)} · ${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
        </div>
        <fieldset class="field">
          <legend class="label"><span class="step">2</span> What are you selling?</legend>
          <div class="type-pick">${types.map(([key, t], i) => `
            <label class="type-option">
              <input type="radio" name="type" value="${esc(key)}" ${i === 0 ? "checked" : ""}>
              <span><span class="type-icon" aria-hidden="true">${t.icon}</span> ${esc(t.label)}</span>
            </label>`).join("")}
          </div>
        </fieldset>
        <div class="field">
          <label class="label" for="sell-desc"><span class="step">3</span> Short description</label>
          <textarea id="sell-desc" name="description" rows="3" maxlength="300" required
            placeholder="e.g. Typed notes for the whole semester with solved examples. Printed and bound."></textarea>
          <div class="hint"><span>What's included, condition, printed or digital.</span><span data-counter-for="sell-desc">0/300</span></div>
        </div>
        ${photoField('<span class="step">4</span> Photo <span class="muted">(optional)</span>', "", "sell-photo")}
        <div class="field">
          <label class="label" for="sell-price"><span class="step">5</span> Price</label>
          <div class="price-row">
            <div class="price-input"><span>${esc(C.CURRENCY)}</span>
              <input id="sell-price" name="price" type="number" min="0" max="${C.MAX_PRICE}" step="0.5" inputmode="decimal" placeholder="20" required></div>
            <label class="check"><input type="checkbox" name="free" data-toggle-free> Give it away for free</label>
          </div>
        </div>
        ${locationFields('<span class="step">6</span> Where can you meet?', null, "sell-location")}
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button class="btn primary lg" type="submit">Post listing</button></div>
      </form>`,
    };
  }

  function viewBuy(courseId, type) {
    if (!courseId) return viewCoursePicker();
    const course = U.course(courseId);
    if (!course) return viewNotFound();
    if (!type) return viewTypePicker(course);
    if (!C.ITEM_TYPES[type]) return viewNotFound();
    return viewListings(course, type);
  }

  function viewCoursePicker() {
    const counts = S.countsByCourse();
    const typeKeys = Object.keys(C.ITEM_TYPES);
    return {
      title: "Buy",
      html: `
      <section class="page-head">
        <a class="back" href="#/">← Back</a>
        <h1>What course?</h1>
        <p class="lead">Pick the course you need notes or a mock test notebook for.</p>
        <input class="search" type="search" data-filter="courses" placeholder="Search by course name or code…" aria-label="Search courses">
      </section>
      ${coursesByDept().map(([dept, courses]) => `
        <section class="dept" data-dept>
          <h2 class="dept-name">${esc(dept)}</h2>
          <div class="course-grid">${courses.map((c) => {
            const n = counts[c.id] || {};
            const total = typeKeys.reduce((sum, k) => sum + (n[k] || 0), 0);
            return `<a class="course-tile" href="#/buy/${encodeURIComponent(c.id)}" data-search="${esc((c.code + " " + c.name + " " + dept).toLowerCase())}">
              <span class="course-code">${esc(c.code)}</span>
              <span class="course-name">${esc(c.name)}</span>
              <span class="course-count ${total ? "" : "none"}">${total
                ? typeKeys.filter((k) => n[k]).map((k) => `<span title="${esc(U.typeInfo(k).plural)}">${U.typeInfo(k).icon} ${n[k]}</span>`).join(" · ")
                : "Nothing listed yet"}</span>
            </a>`;
          }).join("")}</div>
        </section>`).join("")}
      <p class="empty-search muted" hidden>No courses match your search.</p>`,
    };
  }

  function viewTypePicker(course) {
    const counts = S.countsByCourse()[course.id] || {};
    return {
      title: course.code,
      live: true,
      html: `
      <section class="page-head">
        <a class="back" href="#/buy">← All courses</a>
        <p class="eyebrow">${esc(course.code)}</p>
        <h1>${esc(course.name)}</h1>
        <p class="lead">What are you looking for?</p>
      </section>
      <div class="choice-grid">${Object.entries(C.ITEM_TYPES).map(([key, t]) => `
        <a class="choice" href="#/buy/${encodeURIComponent(course.id)}/${encodeURIComponent(key)}">
          <span class="choice-icon" aria-hidden="true">${t.icon}</span>
          <span class="choice-title">${esc(t.want)}</span>
          <span class="choice-text">${counts[key] ? `${counts[key]} available` : "None listed yet"}</span>
          <span class="choice-cta">See options →</span>
        </a>`).join("")}
      </div>`,
    };
  }

  function viewListings(course, type) {
    const t = U.typeInfo(type);
    const listings = S.activeListings({ courseId: course.id, type });
    const sorters = {
      newest: (a, b) => b.createdAt - a.createdAt,
      "price-asc": (a, b) => a.price - b.price || b.createdAt - a.createdAt,
      "price-desc": (a, b) => b.price - a.price || b.createdAt - a.createdAt,
    };
    listings.sort(sorters[buySort] || sorters.newest);
    const otherTypes = Object.entries(C.ITEM_TYPES);
    return {
      title: `${t.plural} · ${course.code}`,
      live: true,
      html: `
      <section class="page-head">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/buy">Buy</a> › <a href="#/buy/${encodeURIComponent(course.id)}">${esc(course.code)}</a> › <span>${esc(t.plural)}</span></nav>
        <h1>${esc(t.plural)} for ${esc(course.code)}</h1>
        <p class="lead">${esc(course.name)}</p>
        <div class="toolbar">
          <div class="segmented" role="tablist">${otherTypes.map(([k, ot]) =>
            `<a href="#/buy/${encodeURIComponent(course.id)}/${encodeURIComponent(k)}" role="tab" aria-selected="${k === type}" ${k === type ? 'class="on"' : ""}>${ot.icon} ${esc(ot.plural)}</a>`).join("")}
          </div>
          <label class="sort">Sort
            <select data-sort>
              <option value="newest" ${buySort === "newest" ? "selected" : ""}>Newest</option>
              <option value="price-asc" ${buySort === "price-asc" ? "selected" : ""}>Price: low to high</option>
              <option value="price-desc" ${buySort === "price-desc" ? "selected" : ""}>Price: high to low</option>
            </select>
          </label>
        </div>
      </section>
      ${listings.length ? `<p class="muted small">${listings.length} option${listings.length === 1 ? "" : "s"}</p>
        <div class="listing-grid">${listings.map((l) => buyerCard(l, listings.some((x) => x.photo))).join("")}</div>`
        : emptyState(t.icon, `No ${esc(t.plural.toLowerCase())} for ${esc(course.code)} yet`,
          "Check back later, or try the other category.",
          `<div class="btn-row center"><a class="btn secondary" href="#/sell">Have some? Sell yours</a></div>`)}`,
    };
  }

  // withPlaceholder: other cards in the grid have photos, so keep this one the same shape.
  function buyerCard(l, withPlaceholder) {
    const own = l.sellerEmail === me.email;
    const offer = own ? null : S.latestOffer(me.email, l.id);
    return `<article class="card listing">
      ${l.photo ? listingPhoto(l, "listing-photo")
        : withPlaceholder ? `<div class="listing-photo placeholder" aria-hidden="true">${U.typeInfo(l.type).icon}</div>` : ""}
      <div class="listing-top">${typeTag(l.type)} ${priceTag(l.price)}</div>
      <p class="desc">${esc(l.description)}</p>
      ${locationLine(l)}
      <p class="meta">${avatar({ name: l.sellerName }, "xs")} ${esc(l.sellerName)} · listed ${U.timeAgo(l.createdAt)}</p>
      <div class="listing-actions">${own
        ? '<p class="status-line">This is your listing. <a href="#/my-listings">Manage it</a></p>'
        : buyerActions(l, offer)}</div>
    </article>`;
  }

  function buyerActions(l, offer) {
    const seller = esc(U.firstName(l.sellerName));
    if (offer && offer.status === "pending") {
      return `<p class="status-line wait">⏳ You offered <strong>${U.money(offer.amount)}</strong>. Waiting for ${seller} to answer.</p>
        <div class="btn-row"><button class="btn ghost sm" data-action="withdraw" data-id="${esc(offer.id)}">Withdraw offer</button></div>`;
    }
    if (offer && offer.status === "countered") {
      return `<p class="status-line turn">💬 ${seller} countered with <strong>${U.money(offer.amount)}</strong>.</p>${respondButtons(offer)}`;
    }
    const before = offer && offer.status === "declined"
      ? `<p class="status-line muted">Your last offer (${U.money(offer.amount)}) was declined. You can try again.</p>` : "";
    if (l.price === 0) {
      return before + `<div class="btn-row"><button class="btn primary" data-action="buy" data-id="${esc(l.id)}">Get it for free</button></div>`;
    }
    return before + `<div class="btn-row">
      <button class="btn primary" data-action="buy" data-id="${esc(l.id)}">Buy for ${U.money(l.price)}</button>
      <button class="btn secondary" data-action="make-offer" data-id="${esc(l.id)}">Make a counteroffer</button>
    </div>`;
  }

  function viewMyListings() {
    const listings = S.listingsBySeller(me.email);
    return {
      title: "My listings",
      live: true,
      html: `
      <section class="page-head row">
        <div><h1>My listings</h1><p class="lead">Things you're selling and the offers on them.</p></div>
        <a class="btn primary" href="#/sell">+ New listing</a>
      </section>
      ${listings.length ? `<div class="stack">${listings.map(sellerCard).join("")}</div>`
        : emptyState("📤", "You haven't listed anything yet", "Finished a class? Your notes could help someone else.",
          '<div class="btn-row center"><a class="btn primary" href="#/sell">Sell something</a></div>')}`,
    };
  }

  function sellerCard(l) {
    const offers = S.offersForListing(l.id);
    const open = offers.filter(S.isActive).sort((a, b) => S.isMyTurn(b, me.email) - S.isMyTurn(a, me.email));
    const past = offers.filter((o) => !S.isActive(o) && o.status !== "accepted");
    const deal = offers.find((o) => o.status === "accepted");
    return `<article class="card seller-card ${l.status}">
      <div class="listing-top">
        <div>${typeTag(l.type)} <span class="pill ${l.status === "active" ? "pill-ok" : "pill-off"}">${l.status === "active" ? "Active" : "Sold"}</span></div>
        ${priceTag(l.price)}
      </div>
      <div class="seller-main">
        <div>
          <h2 class="card-title">${esc(U.courseLabel(l.courseId))}</h2>
          <p class="desc">${esc(l.description)}</p>
          ${locationLine(l)}
          <p class="meta">Listed ${U.timeAgo(l.createdAt)}</p>
        </div>
        ${listingPhoto(l, "thumb")}
      </div>
      ${l.status === "active" ? `<div class="btn-row">
        <button class="btn ghost sm" data-action="edit-listing" data-id="${esc(l.id)}">Edit</button>
        <button class="btn ghost sm danger" data-action="remove-listing" data-id="${esc(l.id)}">Remove</button>
      </div>` : ""}
      ${deal ? offerBlock(deal, "seller", l) : ""}
      ${l.status === "active" ? `
        <div class="offers">
          <h3>Offers ${open.length ? `<span class="count">${open.length}</span>` : ""}</h3>
          ${open.length ? open.map((o) => offerBlock(o, "seller", l)).join("")
            : '<p class="muted small">No open offers. Buyers can take your price or send a counteroffer.</p>'}
        </div>` : ""}
      ${past.length ? `<details class="past"><summary>Earlier offers (${past.length})</summary>${past.map((o) => offerBlock(o, "seller", l)).join("")}</details>` : ""}
    </article>`;
  }

  function viewMyOffers() {
    const offers = S.offersByBuyer(me.email);
    const groups = [
      ["Waiting for your answer", offers.filter((o) => o.status === "countered")],
      ["Waiting for the seller", offers.filter((o) => o.status === "pending")],
      ["Agreed deals", offers.filter((o) => o.status === "accepted")],
      ["Past offers", offers.filter((o) => !S.isActive(o) && o.status !== "accepted")],
    ].filter(([, list]) => list.length);
    return {
      title: "My offers",
      live: true,
      html: `
      <section class="page-head"><h1>My offers</h1><p class="lead">Everything you're buying or negotiating.</p></section>
      ${groups.length ? groups.map(([title, list]) => `
        <section class="section">
          <h2>${title} <span class="count">${list.length}</span></h2>
          <div class="stack">${list.map((o) => {
            const l = S.getListing(o.listingId);
            return `<article class="card">
              ${l ? `<div class="listing-top">${typeTag(l.type)} <span class="muted small">Asking ${U.money(l.price)}</span></div>
                <div class="seller-main">
                  <div>
                    <h3 class="card-title">${esc(U.courseLabel(l.courseId))}</h3>
                    <p class="desc">${esc(l.description)}</p>
                    ${locationLine(l)}
                  </div>
                  ${listingPhoto(l, "thumb")}
                </div>` : ""}
              ${offerBlock(o, "buyer", l)}
            </article>`;
          }).join("")}</div>
        </section>`).join("")
        : emptyState("🛒", "No offers yet", "When you buy something or make a counteroffer, it shows up here.",
          '<div class="btn-row center"><a class="btn primary" href="#/buy">Find a course</a></div>')}`,
    };
  }

  function viewNotifications() {
    const list = S.notificationsFor(me.email);
    const unread = list.filter((n) => !n.read).length;
    const icons = { offer: "💬", deal: "🎉", declined: "✖️", closed: "📦" };
    return {
      title: "Notifications",
      live: true,
      html: `
      <section class="page-head row">
        <div><h1>Notifications</h1><p class="lead">${unread ? `${unread} unread` : "You're all caught up."}</p></div>
        ${unread ? '<button class="btn ghost" data-action="mark-all-read">Mark all as read</button>' : ""}
      </section>
      ${list.length ? `<ul class="notif-list">${list.map((n) => `
        <li class="notif ${n.read ? "" : "unread"}">
          <span class="notif-icon" aria-hidden="true">${icons[n.kind] || "🔔"}</span>
          <div class="notif-body">
            <p class="notif-title">${esc(n.title)}${n.read ? "" : '<span class="sr-only"> (unread)</span>'}</p>
            <p>${esc(n.body)}</p>
            ${n.contactEmail ? `<div class="contact-inline">${ICONS.mail}
              <a href="mailto:${esc(n.contactEmail)}">${esc(n.contactEmail)}</a>
              <button class="link-btn" data-action="copy" data-text="${esc(n.contactEmail)}">Copy</button></div>` : ""}
            <div class="notif-foot">
              <time>${U.timeAgo(n.createdAt)}</time>
              ${/^#\//.test(n.link || "") ? `<button class="link-btn" data-action="open-notif" data-id="${esc(n.id)}" data-link="${esc(n.link)}">View</button>` : ""}
              ${n.read ? "" : `<button class="link-btn" data-action="mark-read" data-id="${esc(n.id)}">Mark as read</button>`}
            </div>
          </div>
        </li>`).join("")}</ul>`
        : emptyState("🔔", "No notifications yet", "You'll be notified here about counteroffers and agreed deals.")}`,
    };
  }

  // ---------- help chatbot ----------

  function viewHelp() {
    const flow = window.HELP_FLOW;
    if (!helpLog.length) helpLog.push({ from: "bot", id: "start" });
    const last = helpLog.length - 1;
    return {
      title: "Help",
      html: `
      <section class="page-head">
        <h1>Help</h1>
        <p class="lead">Answer a couple of questions and I'll show you exactly where to go and what to press.</p>
      </section>
      <div class="card chat">
        <div class="chat-log" id="chat-log" aria-live="polite">
          ${helpLog.map((m, i) => m.from === "user"
            ? `<div class="msg user"><p class="bubble">${esc(m.text)}</p></div>`
            : botMessage(flow[m.id] || flow.notUnderstood, i === last)).join("")}
        </div>
        <form class="chat-input" data-form="help-ask">
          <input maxlength="200" placeholder="Or type a question, e.g. “how do I add a photo?”" aria-label="Type your question">
          <button class="btn primary sm" type="submit">Send</button>
        </form>
        <div class="chat-foot"><button class="link-btn" type="button" data-action="help-restart">↺ Start over</button></div>
      </div>`,
      mount() {
        const log = document.getElementById("chat-log");
        log.scrollTop = log.scrollHeight;
        if (helpLog.length > 1 && helpLog[helpLog.length - 2].typed) document.querySelector(".chat-input input").focus();
      },
    };
  }

  function botMessage(node, isLatest) {
    const options = node.options || window.HELP_FLOW.start.options;
    return `<div class="msg bot ${isLatest ? "latest" : ""}">
      <span class="bot-avatar" aria-hidden="true">🤖</span>
      <div class="bubble">
        <p>${node.text}</p>
        ${node.steps ? `<ol class="help-steps">${node.steps.map((step) => `<li>${step}</li>`).join("")}</ol>` : ""}
        ${node.go ? `<button class="btn primary sm" type="button" data-action="help-go" data-link="${esc(node.go.link)}"
          data-highlight="${esc(node.go.highlight || "")}">👉 ${esc(node.go.label)}</button>` : ""}
        ${isLatest ? `<div class="chat-options">${options.map(([label, id]) =>
          `<button class="chip-btn" type="button" data-action="help-pick" data-node="${esc(id)}">${esc(label)}</button>`).join("")}</div>` : ""}
      </div>
    </div>`;
  }

  function helpSay(nodeId, userText, typed) {
    helpLog.push({ from: "user", text: userText, typed: !!typed });
    helpLog.push({ from: "bot", id: window.HELP_FLOW[nodeId] ? nodeId : "notUnderstood" });
    render({ keepScroll: true });
  }

  // Picks the help topic whose keywords best match what was typed.
  function matchHelp(text) {
    const q = text.toLowerCase();
    let best = "notUnderstood";
    let bestScore = 0;
    for (const [id, node] of Object.entries(window.HELP_FLOW)) {
      const score = (node.keywords || []).reduce((sum, k) => sum + (q.includes(k) ? k.length : 0), 0);
      if (score > bestScore) { best = id; bestScore = score; }
    }
    return best;
  }

  function viewNotFound() {
    return {
      title: "Not found",
      html: emptyState("🤔", "Page not found", "That page doesn't exist.", '<div class="btn-row center"><a class="btn primary" href="#/">Go home</a></div>'),
    };
  }

  // ---------- modals ----------

  function openModal({ title, body, submitLabel, danger = false, onSubmit }) {
    modal = { onSubmit, returnFocus: document.activeElement };
    $modal.innerHTML = `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <form data-form="modal" novalidate>
            <header class="modal-head">
              <h2 id="modal-title">${title}</h2>
              <button class="icon-btn" type="button" data-action="close-modal" aria-label="Close">×</button>
            </header>
            <div class="modal-body">${body}<p class="form-error" role="alert" hidden></p></div>
            <footer class="modal-foot">
              <button class="btn ghost" type="button" data-action="close-modal">Cancel</button>
              <button class="btn ${danger ? "danger-solid" : "primary"}" type="submit">${submitLabel}</button>
            </footer>
          </form>
        </div>
      </div>`;
    document.body.classList.add("modal-open");
    const first = $modal.querySelector("input:not([type=hidden]), textarea") || $modal.querySelector("button[type=submit]");
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal) return;
    const back = modal.returnFocus;
    modal = null;
    $modal.innerHTML = "";
    document.body.classList.remove("modal-open");
    if (back && document.contains(back)) back.focus();
  }

  function showFormError(form, message) {
    const el = form.querySelector(".form-error");
    if (!el) { toast(message, "error"); return; }
    el.textContent = message;
    el.hidden = false;
  }

  // Run something that changes data, then refresh the page.
  function perform(fn, successMessage) {
    try {
      fn();
    } catch (err) {
      toast(err.message, "error");
      render({ keepScroll: true });
      return;
    }
    checkNotifications({ silent: true }); // our own action: don't toast our own notifications
    if (successMessage) toast(successMessage, "success");
    render({ keepScroll: true });
  }

  function amountField(label, max, suggestions) {
    return `<label class="field"><span class="label">${label}</span>
      <div class="price-input"><span>${esc(C.CURRENCY)}</span>
        <input name="amount" type="number" min="0.5" ${max ? `max="${max}"` : ""} step="0.5" inputmode="decimal" required></div></label>
      ${suggestions && suggestions.length ? `<div class="suggest"><span class="muted small">Quick picks:</span>${suggestions.map((v) =>
        `<button class="chip-btn" type="button" data-action="fill-amount" data-value="${v}">${U.money(v)}</button>`).join("")}</div>` : ""}
      <label class="field"><span class="label">Message <span class="muted">(optional)</span></span>
        <input name="note" maxlength="200" placeholder="e.g. I can pick them up on campus on Tuesday"></label>`;
  }

  function uniqueSuggestions(values, low, high) {
    return [...new Set(values.map((v) => Math.round(v)))].filter((v) => v > low && v < high);
  }

  // ---------- event handling ----------

  const actions = {
    "sign-out"() {
      A.signOut();
      me = null;
      knownNotifs = null;
      pendingRoute = null;
      location.hash = "#/login";
    },

    "demo-account"(el) {
      const account = DEMO_ACCOUNTS[Number(el.dataset.i)];
      try { onSignedIn(A.signIn({ ...account, method: "demo" })); }
      catch (err) { toast(err.message, "error"); }
    },

    buy(el) {
      const l = S.getListing(el.dataset.id);
      if (!l || l.status !== "active") { toast("This item is no longer available.", "error"); render({ keepScroll: true }); return; }
      const free = l.price === 0;
      openModal({
        title: free ? "Get it for free" : `Buy for ${U.money(l.price)}`,
        body: `${listingSummary(l)}
          <p>${free ? "By confirming, you're claiming this item." : `By confirming, you agree to pay <strong>${U.money(l.price)}</strong>.`}
          ${esc(l.sellerName)} will get your email (${esc(me.email)}) and you'll get theirs, so you can plan payment and pickup.</p>
          <p class="note">💳 Payment happens directly between you two, not on this site.</p>`,
        submitLabel: free ? "Confirm" : `Confirm, buy for ${U.money(l.price)}`,
        onSubmit: () => { S.buyNow(me, l.id); return "Deal agreed! Check the seller's email under My offers."; },
      });
    },

    "make-offer"(el) {
      const l = S.getListing(el.dataset.id);
      if (!l || l.status !== "active") { toast("This item is no longer available.", "error"); render({ keepScroll: true }); return; }
      openModal({
        title: "Make a counteroffer",
        body: `${listingSummary(l)}
          ${amountField(`Your offer (asking ${U.money(l.price)})`, l.price, uniqueSuggestions([l.price * 0.9, l.price * 0.8, l.price * 0.7], 0, l.price))}
          <p class="muted small">${esc(l.sellerName)} will be notified and can accept, decline or counter.</p>`,
        submitLabel: "Send offer",
        onSubmit: (data) => { S.makeOffer(me, l.id, data.get("amount"), data.get("note")); return "Offer sent! We'll notify you when the seller answers."; },
      });
    },

    accept(el) {
      const o = S.getOffer(el.dataset.id);
      if (!o) return;
      const l = S.getListing(o.listingId);
      const seller = o.sellerEmail === me.email;
      const other = seller ? o.buyerName : o.sellerName;
      openModal({
        title: `Accept ${U.money(o.amount)}?`,
        body: `${l ? listingSummary(l) : ""}
          <p>You and ${esc(other)} will both get each other's email address to plan payment and pickup.</p>
          ${seller ? '<p class="muted small">The listing will be marked as sold and any other open offers will be closed.</p>' : ""}
          <p class="note">💳 Payment happens directly between you two, not on this site.</p>`,
        submitLabel: `Accept ${U.money(o.amount)}`,
        onSubmit: () => { S.respond(me, o.id, "accept"); return "Deal agreed! You can now email each other."; },
      });
    },

    counter(el) {
      const o = S.getOffer(el.dataset.id);
      if (!o) return;
      const l = S.getListing(o.listingId);
      if (!l) return;
      const seller = o.sellerEmail === me.email;
      const suggestions = seller
        ? uniqueSuggestions([(o.amount + l.price) / 2, o.amount + (l.price - o.amount) * 0.75], o.amount, l.price + 1)
        : uniqueSuggestions([o.amount * 0.9, o.amount * 0.85], 0, o.amount);
      openModal({
        title: "Send a counteroffer",
        body: `${listingSummary(l)}
          <p>Current offer: <strong>${U.money(o.amount)}</strong>${seller ? ` from ${esc(o.buyerName)}` : ` from ${esc(o.sellerName)}`}.</p>
          ${amountField(seller ? `Your price (between ${U.money(o.amount)} and ${U.money(l.price)})` : `Your offer (below ${U.money(o.amount)})`,
            seller ? l.price : null, suggestions)}`,
        submitLabel: "Send counteroffer",
        onSubmit: (data) => { S.respond(me, o.id, "counter", data.get("amount"), data.get("note")); return "Counteroffer sent!"; },
      });
    },

    decline(el) {
      const o = S.getOffer(el.dataset.id);
      if (!o) return;
      const other = o.sellerEmail === me.email ? o.buyerName : o.sellerName;
      openModal({
        title: `Decline ${U.money(o.amount)}?`,
        body: `<p>${esc(other)} will be told the offer was declined.</p>
          <label class="field"><span class="label">Message <span class="muted">(optional)</span></span>
            <input name="note" maxlength="200" placeholder="e.g. Sorry, that's too low for me"></label>`,
        submitLabel: "Decline offer",
        danger: true,
        onSubmit: (data) => { S.respond(me, o.id, "decline", null, data.get("note")); return "Offer declined."; },
      });
    },

    withdraw(el) {
      const o = S.getOffer(el.dataset.id);
      if (!o) return;
      openModal({
        title: "Withdraw your offer?",
        body: `<p>${esc(o.sellerName)} will be told you withdrew your ${U.money(o.amount)} offer.</p>`,
        submitLabel: "Withdraw offer",
        danger: true,
        onSubmit: () => { S.respond(me, o.id, "withdraw"); return "Offer withdrawn."; },
      });
    },

    "edit-listing"(el) {
      const l = S.getListing(el.dataset.id);
      if (!l) return;
      openModal({
        title: "Edit listing",
        body: `<p class="muted">${typeTag(l.type)} ${esc(U.courseLabel(l.courseId))}</p>
          <label class="field"><span class="label">Description</span>
            <textarea name="description" rows="3" maxlength="300" required>${esc(l.description)}</textarea></label>
          <label class="field"><span class="label">Price (0 = free)</span>
            <div class="price-input"><span>${esc(C.CURRENCY)}</span>
              <input name="price" type="number" min="0" max="${C.MAX_PRICE}" step="0.5" value="${esc(l.price)}" required></div></label>
          ${photoField("Photo", l.photo, "edit-photo")}
          ${locationFields("Where can you meet?", l, "edit-location")}`,
        submitLabel: "Save changes",
        onSubmit: (data) => {
          if (photoBusy) throw new Error("Your photo is still loading. Try again in a moment.");
          S.updateListing(me, l.id, listingFields(data));
          return "Listing updated.";
        },
      });
    },

    "remove-listing"(el) {
      const l = S.getListing(el.dataset.id);
      if (!l) return;
      openModal({
        title: "Remove this listing?",
        body: `${listingSummary(l)}<p>Buyers with open offers will be notified.</p>`,
        submitLabel: "Remove listing",
        danger: true,
        onSubmit: () => { S.removeListing(me, l.id); return "Listing removed."; },
      });
    },

    "remove-photo"(el) {
      const field = el.closest(".field");
      setPhoto(field, "");
      field.querySelector("[data-photo-input]").value = "";
    },

    "view-photo"(el) {
      const l = S.getListing(el.dataset.id);
      if (!l || !l.photo) return;
      modal = { onSubmit: null, returnFocus: el };
      $modal.innerHTML = `
        <div class="modal-backdrop lightbox" data-action="close-modal-backdrop" role="dialog" aria-modal="true" aria-label="Photo">
          <figure>
            <img src="${esc(l.photo)}" alt="Photo of the ${esc(U.typeInfo(l.type).label.toLowerCase())}">
            <figcaption>${esc(U.courseLabel(l.courseId))}</figcaption>
          </figure>
          <button class="icon-btn lightbox-x" type="button" data-action="close-modal" aria-label="Close">×</button>
        </div>`;
      document.body.classList.add("modal-open");
      $modal.querySelector(".lightbox-x").focus();
    },

    "help-pick"(el) {
      helpSay(el.dataset.node, el.textContent.trim());
    },

    "help-restart"() {
      helpLog = [];
      render();
    },

    "help-go"(el) {
      pendingHighlight = el.dataset.highlight || null;
      if (location.hash === el.dataset.link) render();
      else location.hash = el.dataset.link;
    },

    "fill-amount"(el) {
      const input = el.closest("form").querySelector('input[name="amount"]');
      if (input) { input.value = el.dataset.value; input.focus(); }
    },

    "mark-all-read"() { perform(() => S.markAllRead(me.email)); },

    "mark-read"(el) { perform(() => S.markRead(me.email, el.dataset.id)); },

    "open-notif"(el) {
      S.markRead(me.email, el.dataset.id);
      if (location.hash === el.dataset.link) render();
      else location.hash = el.dataset.link;
    },

    copy(el) {
      const text = el.dataset.text;
      const done = () => toast(`Copied ${text}`, "success");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, () => toast("Couldn't copy. Select the address and copy it manually.", "error"));
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy.", "error"); }
        ta.remove();
      }
    },

    "close-modal"() { closeModal(); },

    "close-modal-backdrop"(el, e) { if (e.target === el) closeModal(); },

    "reset-demo"() {
      openModal({
        title: "Reset demo data?",
        body: "<p>This deletes every listing, offer and notification stored in this browser and restores the sample listings.</p>",
        submitLabel: "Reset everything",
        danger: true,
        onSubmit: () => {
          S.reset();
          if (me) S.upsertUser({ email: me.email, name: me.name });
          knownNotifs = null;
          return "Demo data reset.";
        },
      });
    },
  };

  const forms = {
    "demo-login"(form) {
      const data = new FormData(form);
      if (!String(data.get("name") || "").trim()) { showFormError(form, "Please enter your name."); return; }
      try { onSignedIn(A.signIn({ email: data.get("email"), name: data.get("name"), method: "demo" })); }
      catch (err) { showFormError(form, err.message); }
    },

    sell(form) {
      if (photoBusy) { showFormError(form, "Your photo is still loading. Try again in a moment."); return; }
      const data = new FormData(form);
      try {
        S.createListing(me, { courseId: data.get("courseId"), type: data.get("type"), ...listingFields(data) });
      } catch (err) {
        showFormError(form, err.message);
        return;
      }
      toast("Your listing is live!", "success");
      location.hash = "#/my-listings";
    },

    "help-ask"(form) {
      const input = form.querySelector("input");
      const text = input.value.trim();
      if (!text) return;
      helpSay(matchHelp(text), text, true);
    },

    modal(form) {
      if (!modal || !modal.onSubmit) return;
      let message;
      try {
        message = modal.onSubmit(new FormData(form));
      } catch (err) {
        showFormError(form, err.message);
        return;
      }
      closeModal();
      checkNotifications({ silent: true });
      if (message) toast(message, "success");
      render({ keepScroll: true });
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !actions[el.dataset.action]) return;
    if (el.dataset.action !== "close-modal-backdrop") e.preventDefault();
    actions[el.dataset.action](el, e);
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form || !forms[form.dataset.form]) return;
    e.preventDefault();
    forms[form.dataset.form](form);
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches('[data-filter="courses"]')) filterCourses(t.value);
    if (t.id) {
      const counter = document.querySelector(`[data-counter-for="${t.id}"]`);
      if (counter) counter.textContent = `${t.value.length}/${t.maxLength}`;
    }
    const err = t.form && t.form.querySelector(".form-error");
    if (err) err.hidden = true;
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-toggle-free]")) {
      const price = t.form.querySelector('input[name="price"]');
      price.disabled = t.checked;
      price.value = t.checked ? "0" : "";
      if (!t.checked) price.focus();
    }
    if (t.matches("[data-photo-input]") && t.files && t.files[0]) {
      const field = t.closest(".field");
      photoBusy++;
      field.querySelector(".file-label").textContent = "Loading…";
      resizePhoto(t.files[0])
        .then((dataUrl) => setPhoto(field, dataUrl))
        .catch((err) => { setPhoto(field, field.querySelector('input[name="photo"]').value); toast(err.message, "error"); })
        .finally(() => { photoBusy--; t.value = ""; });
    }
    if (t.matches("[data-location-select]")) {
      const details = t.form.querySelector('input[name="locationDetails"]');
      details.placeholder = t.value === "other" ? "Where? e.g. Café Hillel, Emek Refaim" : "Exact spot (optional), e.g. Main library entrance";
      if (t.value === "other") details.focus();
    }
    if (t.matches("[data-sort]")) {
      buySort = t.value;
      render({ keepScroll: true });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal) closeModal();
  });

  function listingFields(data) {
    return {
      description: data.get("description"),
      price: data.get("free") === "on" ? 0 : data.get("price"),
      photo: data.get("photo"),
      location: data.get("location"),
      locationDetails: data.get("locationDetails"),
    };
  }

  function setPhoto(field, dataUrl) {
    field.querySelector('input[name="photo"]').value = dataUrl;
    const img = field.querySelector(".photo-preview");
    img.hidden = !dataUrl;
    if (dataUrl) img.src = dataUrl; else img.removeAttribute("src");
    field.querySelector(".file-label").textContent = dataUrl ? "Change photo" : "Add a photo";
    field.querySelector('[data-action="remove-photo"]').hidden = !dataUrl;
  }

  // Shrinks a photo to at most 1000px and re-encodes it as JPEG, so it fits
  // in the browser's limited storage.
  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) { reject(new Error("Please choose an image file (JPG or PNG).")); return; }
      if (file.size > 20 * 1024 * 1024) { reject(new Error("That photo is too big. Please choose one under 20 MB.")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; // transparent PNGs get a white background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't open that image. Please try a JPG or PNG."));
      };
      img.src = url;
    });
  }

  function filterCourses(query) {
    const q = query.trim().toLowerCase();
    let any = false;
    document.querySelectorAll("[data-dept]").forEach((section) => {
      let visible = 0;
      section.querySelectorAll("[data-search]").forEach((tile) => {
        const show = !q || tile.dataset.search.includes(q);
        tile.hidden = !show;
        if (show) visible++;
      });
      section.hidden = visible === 0;
      if (visible) any = true;
    });
    const empty = document.querySelector(".empty-search");
    if (empty) empty.hidden = any;
  }

  // ---------- start ----------

  window.addEventListener("hashchange", () => { closeModal(); render(); });

  // Another tab changed the data.
  window.addEventListener("storage", (e) => {
    if (e.key === S.DB_KEY || e.key === null) refresh();
  });

  // Demo sellers reply to offers a few seconds after they arrive.
  setInterval(() => {
    if (S.runDemoSellers()) refresh();
  }, 1000);

  document.getElementById("site-name").textContent = C.SITE_NAME;
  const logo = document.getElementById("uni-logo");
  if (C.UNIVERSITY_LOGO) logo.src = C.UNIVERSITY_LOGO;
  else { logo.remove(); document.querySelector(".brand-divider").remove(); }
  document.getElementById("footer-university").textContent = C.UNIVERSITY_NAME;
  render();
})();
