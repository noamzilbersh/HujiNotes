/*
 * Data layer. There is no server: listings, offers and notifications are kept
 * in the browser's localStorage, so every account used in this browser shares
 * the same data. Open two tabs, sign in as two different people, and you can
 * watch offers and notifications go back and forth.
 *
 * Offer lifecycle:
 *   pending   – the buyer made/raised an offer, waiting for the SELLER
 *   countered – the seller countered, waiting for the BUYER
 *   accepted  – price agreed; both sides get each other's email
 *   declined  – one side said no
 *   withdrawn – the buyer took the offer back
 *   closed    – the item was sold to someone else or removed
 */
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const U = window.U;

  const DB_KEY = "noteswap.db.v1";
  const BOT_DELAY_MS = 2500;
  const DAY = 24 * 60 * 60 * 1000;

  // ---------- storage helpers ----------

  const memory = {}; // used when localStorage is blocked (e.g. some private windows)

  function readRaw() {
    if (DB_KEY in memory) return memory[DB_KEY];
    try { return window.localStorage.getItem(DB_KEY); } catch (e) { return null; }
  }

  function writeRaw(value) {
    try { window.localStorage.setItem(DB_KEY, value); delete memory[DB_KEY]; }
    catch (e) { memory[DB_KEY] = value; }
  }

  function now() { return Date.now(); }

  function uid(prefix) {
    return `${prefix}_${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function emptyDb() {
    return { version: 1, users: {}, listings: [], offers: [], notifications: [] };
  }

  function load() {
    const raw = readRaw();
    if (raw) {
      try {
        const db = JSON.parse(raw);
        if (db && db.version === 1) return db;
      } catch (e) { /* fall through and reseed */ }
    }
    const db = seed(emptyDb());
    save(db);
    return db;
  }

  function save(db) { writeRaw(JSON.stringify(db)); }

  // Read, change and write back in one step. Re-reading every time means a
  // change made in another tab is never overwritten with stale data.
  function tx(fn) {
    const db = load();
    const result = fn(db);
    save(db);
    return result;
  }

  // ---------- validation ----------

  function fail(message) { throw new Error(message); }

  function parsePrice(value, { allowZero = true } = {}) {
    const text = String(value == null ? "" : value).trim();
    if (text === "") fail("Please enter a price.");
    const n = Number(text);
    if (!Number.isFinite(n)) fail("Please enter a number for the price.");
    if (n < 0) fail("The price can't be negative.");
    if (!allowZero && n === 0) fail("The amount must be more than zero.");
    if (n > C.MAX_PRICE) fail(`The highest allowed price is ${U.money(C.MAX_PRICE)}.`);
    return Math.round(n * 100) / 100;
  }

  function cleanNote(note) {
    return String(note || "").trim().slice(0, 200);
  }

  function isActive(offer) {
    return offer.status === "pending" || offer.status === "countered";
  }

  function itemName(listing) {
    return `${U.typeInfo(listing.type).label.toLowerCase()} for ${U.courseLabel(listing.courseId)}`;
  }

  // ---------- notifications ----------

  function notify(db, to, n) {
    db.notifications.push({ id: uid("n"), to, read: false, createdAt: now(), ...n });
  }

  // ---------- offers (internal; operate on an already-loaded db) ----------

  function finalizeDeal(db, offer, listing) {
    const t = now();
    offer.status = "accepted";
    offer.agreedAt = t;
    offer.updatedAt = t;

    listing.status = "sold";
    listing.buyerEmail = offer.buyerEmail;
    listing.buyerName = offer.buyerName;
    listing.soldPrice = offer.amount;
    listing.updatedAt = t;

    // Anyone else negotiating on this item is told it's gone.
    for (const other of db.offers) {
      if (other.listingId !== listing.id || other.id === offer.id || !isActive(other)) continue;
      other.status = "closed";
      other.updatedAt = t;
      other.history.push({ by: "system", action: "closed", at: t });
      notify(db, other.buyerEmail, {
        kind: "closed",
        title: "Item no longer available",
        body: `The ${itemName(listing)} you made an offer on was sold to someone else.`,
        link: "#/my-offers",
      });
    }

    const price = offer.amount === 0 ? "for free" : `for ${U.money(offer.amount)}`;
    notify(db, offer.sellerEmail, {
      kind: "deal",
      title: `Deal agreed with ${offer.buyerName}`,
      body: `${offer.buyerName} is getting your ${itemName(listing)} ${price}. Email them to plan payment and pickup.`,
      link: "#/my-listings",
      contactEmail: offer.buyerEmail,
      contactName: offer.buyerName,
      listingId: listing.id,
    });
    notify(db, offer.buyerEmail, {
      kind: "deal",
      title: `Deal agreed with ${offer.sellerName}`,
      body: `You're getting the ${itemName(listing)} ${price}. ${offer.sellerName} has your email and may reach out, or you can write first.`,
      link: "#/my-offers",
      contactEmail: offer.sellerEmail,
      contactName: offer.sellerName,
      listingId: listing.id,
    });
  }

  // role is "buyer" or "seller"; action is "accept" | "decline" | "counter".
  function applyResponse(db, offer, listing, role, action, amount, note) {
    const t = now();
    const other = role === "seller"
      ? { email: offer.buyerEmail, name: offer.buyerName, link: "#/my-offers" }
      : { email: offer.sellerEmail, name: offer.sellerName, link: "#/my-listings" };
    const myName = role === "seller" ? offer.sellerName : offer.buyerName;
    note = cleanNote(note);

    if (action === "accept") {
      offer.history.push({ by: role, action: "accept", amount: offer.amount, at: t });
      finalizeDeal(db, offer, listing);
      return;
    }

    if (action === "decline") {
      offer.status = "declined";
      offer.updatedAt = t;
      offer.history.push({ by: role, action: "decline", note, at: t });
      notify(db, other.email, {
        kind: "declined",
        title: `${myName} declined the offer`,
        body: `The ${U.money(offer.amount)} offer on the ${itemName(listing)} was declined.` + (note ? ` They wrote: “${note}”` : ""),
        link: other.link,
      });
      return;
    }

    if (action === "counter") {
      const value = parsePrice(amount, { allowZero: false });
      if (role === "seller") {
        if (value <= offer.amount) fail(`Your counteroffer should be higher than their ${U.money(offer.amount)} offer. To take ${U.money(offer.amount)}, accept it instead.`);
        if (value > listing.price) fail(`Your counteroffer can't be more than your asking price (${U.money(listing.price)}).`);
      } else {
        if (value >= offer.amount) fail(`Your counteroffer should be lower than the seller's ${U.money(offer.amount)}. To pay ${U.money(offer.amount)}, accept it instead.`);
      }
      offer.amount = value;
      offer.status = role === "seller" ? "countered" : "pending";
      offer.updatedAt = t;
      offer.history.push({ by: role, action: "counter", amount: value, note, at: t });
      notify(db, other.email, {
        kind: "offer",
        title: `${myName} countered: ${U.money(value)}`,
        body: `New counteroffer on the ${itemName(listing)} (asking ${U.money(listing.price)}).` + (note ? ` They wrote: “${note}”` : ""),
        link: other.link,
      });
      return;
    }

    fail("Unknown action.");
  }

  // ---------- demo sellers that answer offers automatically ----------

  function botRespond(db, offer, listing) {
    const ratio = offer.amount / listing.price;
    const sellerCounters = offer.history.filter((h) => h.by === "seller" && h.action === "counter");
    const lastAsk = sellerCounters.length ? sellerCounters[sellerCounters.length - 1].amount : listing.price;

    if (ratio >= 0.8) {
      applyResponse(db, offer, listing, "seller", "accept");
    } else if (ratio < 0.4) {
      applyResponse(db, offer, listing, "seller", "decline", null, "Sorry, that's a bit too low for me.");
    } else if (sellerCounters.length >= 2) {
      if (ratio >= 0.65) applyResponse(db, offer, listing, "seller", "accept");
      else applyResponse(db, offer, listing, "seller", "decline", null, "I think we're too far apart, sorry!");
    } else {
      const middle = Math.ceil((offer.amount + lastAsk) / 2);
      if (middle <= offer.amount || middle > listing.price) applyResponse(db, offer, listing, "seller", "accept");
      else applyResponse(db, offer, listing, "seller", "counter", middle, "How about we meet in the middle?");
    }
  }

  // ---------- seed data ----------

  const DEMO_SELLERS = [
    { email: "dana.levi.demo@gmail.com", name: "Dana Levi" },
    { email: "omer.katz.demo@gmail.com", name: "Omer Katz" },
    { email: "maya.rosen.demo@gmail.com", name: "Maya Rosen" },
    { email: "jordan.lee.demo@gmail.com", name: "Jordan Lee" },
    { email: "priya.shah.demo@gmail.com", name: "Priya Shah" },
    { email: "ethan.brooks.demo@gmail.com", name: "Ethan Brooks" },
  ];

  // [seller index, course id, type, description, price, days ago]
  const SEED_LISTINGS = [
    [0, "cs101", "notes", "Full semester of typed lecture notes with code examples for every topic. Got an A.", 25, 2],
    [1, "cs101", "notes", "Handwritten notes, scanned and printed. Covers recursion and pointers really well.", 15, 6],
    [2, "cs101", "mock", "Mock test notebook with 6 past midterms and finals, all solved step by step.", 30, 1],
    [3, "cs101", "notes", "Notes from last spring. A few coffee stains but complete. Free to a good home!", 0, 9],
    [4, "cs201", "notes", "Color-coded notes on trees, heaps, hashing and graphs, with diagrams.", 35, 3],
    [5, "cs201", "mock", "Practice exam booklet with solutions. Includes the TA's review session questions.", 20, 4],
    [0, "cs250", "notes", "Clean notes for dynamic programming, greedy algorithms and NP-completeness.", 40, 5],
    [1, "cs250", "mock", "Three mock finals with full proofs. This is what got me through the exam.", 45, 2],
    [2, "math101", "notes", "Calculus I notes with lots of worked examples on limits, derivatives and integrals.", 20, 7],
    [3, "math101", "mock", "Mock test notebook: 10 practice tests, answers at the back.", 18, 3],
    [4, "math102", "notes", "Series, sequences and integration techniques. Very organized, with a formula sheet.", 22, 8],
    [5, "math201", "notes", "Linear algebra notes: vector spaces, eigenvalues, diagonalization. Typed in LaTeX.", 30, 1],
    [0, "math201", "mock", "Solved mock exams from the last three years, plus a cheat sheet.", 25, 10],
    [1, "stat200", "notes", "Probability notes with summary tables of common distributions.", 15, 4],
    [2, "phys101", "notes", "Mechanics notes with free-body diagrams for every problem type.", 28, 6],
    [3, "phys101", "mock", "Practice exam notebook, 8 tests with detailed solutions.", 32, 2],
    [4, "chem101", "notes", "General chemistry notes plus lab summaries. Free, I just want them used!", 0, 12],
    [5, "econ101", "notes", "Microeconomics notes with all the graphs redrawn neatly.", 18, 3],
    [0, "econ101", "mock", "Mock midterm and final with answer explanations.", 15, 5],
    [1, "psy101", "notes", "Intro psych notes organized by chapter, with key terms highlighted.", 12, 7],
    [2, "bio101", "notes", "Biology notes with hand-drawn cell and genetics diagrams.", 20, 11],
    [3, "eng110", "notes", "Writing guide notes plus two graded essays as examples.", 10, 4],
  ];

  function seed(db) {
    const t = now();
    for (const s of DEMO_SELLERS) db.users[s.email] = { ...s, bot: true };
    SEED_LISTINGS.forEach(([si, courseId, type, description, price, daysAgo], i) => {
      if (!U.course(courseId) || !C.ITEM_TYPES[type]) return; // course list was customized
      const seller = DEMO_SELLERS[si];
      const createdAt = t - daysAgo * DAY - (i * 37 % 20) * 60 * 60 * 1000;
      db.listings.push({
        id: `seed_${i}`, sellerEmail: seller.email, sellerName: seller.name,
        courseId, type, description, price, status: "active", createdAt, updatedAt: createdAt,
      });
    });
    return db;
  }

  // ---------- public API ----------

  const Store = {
    DB_KEY,

    reset() {
      try { window.localStorage.removeItem(DB_KEY); } catch (e) { /* ignore */ }
      delete memory[DB_KEY];
      load();
    },

    upsertUser(user) {
      tx((db) => {
        db.users[user.email] = { ...(db.users[user.email] || {}), ...user, bot: false };
      });
    },

    // --- listings ---

    createListing(user, { courseId, type, description, price }) {
      if (!U.course(courseId)) fail("Please pick a course from the list.");
      if (!C.ITEM_TYPES[type]) fail("Please choose what you're selling.");
      const text = String(description || "").trim();
      if (text.length < 10) fail("Please add a short description (at least 10 characters).");
      if (text.length > 300) fail("Please keep the description under 300 characters.");
      const value = parsePrice(price);
      return tx((db) => {
        const t = now();
        const listing = {
          id: uid("l"), sellerEmail: user.email, sellerName: user.name,
          courseId, type, description: text, price: value, status: "active", createdAt: t, updatedAt: t,
        };
        db.listings.push(listing);
        return listing;
      });
    },

    updateListing(user, listingId, { description, price }) {
      const text = String(description || "").trim();
      if (text.length < 10) fail("Please add a short description (at least 10 characters).");
      if (text.length > 300) fail("Please keep the description under 300 characters.");
      const value = parsePrice(price);
      return tx((db) => {
        const l = db.listings.find((x) => x.id === listingId);
        if (!l || l.sellerEmail !== user.email) fail("Listing not found.");
        if (l.status !== "active") fail("Only active listings can be edited.");
        l.description = text;
        l.price = value;
        l.updatedAt = now();
        return l;
      });
    },

    removeListing(user, listingId) {
      return tx((db) => {
        const l = db.listings.find((x) => x.id === listingId);
        if (!l || l.sellerEmail !== user.email) fail("Listing not found.");
        if (l.status !== "active") fail("This listing can't be removed any more.");
        const t = now();
        l.status = "removed";
        l.updatedAt = t;
        for (const o of db.offers) {
          if (o.listingId !== l.id || !isActive(o)) continue;
          o.status = "closed";
          o.updatedAt = t;
          o.history.push({ by: "system", action: "removed", at: t });
          notify(db, o.buyerEmail, {
            kind: "closed",
            title: "Listing removed",
            body: `${l.sellerName} removed the ${itemName(l)} you made an offer on.`,
            link: "#/my-offers",
          });
        }
      });
    },

    getListing(id) {
      return load().listings.find((l) => l.id === id) || null;
    },

    activeListings({ courseId, type } = {}) {
      return load().listings
        .filter((l) => l.status === "active" && (!courseId || l.courseId === courseId) && (!type || l.type === type))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    // { courseId: { notes: 3, mock: 1 } }
    countsByCourse() {
      const counts = {};
      for (const l of load().listings) {
        if (l.status !== "active") continue;
        counts[l.courseId] = counts[l.courseId] || {};
        counts[l.courseId][l.type] = (counts[l.courseId][l.type] || 0) + 1;
      }
      return counts;
    },

    listingsBySeller(email) {
      const order = { active: 0, sold: 1 };
      return load().listings
        .filter((l) => l.sellerEmail === email && l.status !== "removed")
        .sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt));
    },

    // --- offers ---

    isActive,

    getOffer(id) {
      return load().offers.find((o) => o.id === id) || null;
    },

    offersForListing(listingId) {
      return load().offers.filter((o) => o.listingId === listingId).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    offersByBuyer(email) {
      return load().offers.filter((o) => o.buyerEmail === email).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    // The buyer's most recent offer on a listing, or null.
    latestOffer(buyerEmail, listingId) {
      return load().offers
        .filter((o) => o.buyerEmail === buyerEmail && o.listingId === listingId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    },

    isMyTurn(offer, email) {
      return (offer.status === "pending" && offer.sellerEmail === email) ||
        (offer.status === "countered" && offer.buyerEmail === email);
    },

    // Offers waiting for this person to accept / counter / decline.
    offersAwaiting(email) {
      return load().offers.filter((o) => Store.isMyTurn(o, email)).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    makeOffer(user, listingId, amount, note) {
      const value = parsePrice(amount, { allowZero: false });
      return tx((db) => {
        const l = db.listings.find((x) => x.id === listingId);
        if (!l || l.status !== "active") fail("This item is no longer available.");
        if (l.sellerEmail === user.email) fail("You can't make an offer on your own listing.");
        if (l.price === 0) fail("This item is free, so there's nothing to negotiate.");
        if (value >= l.price) fail(`A counteroffer should be lower than the asking price (${U.money(l.price)}). To pay the full price, use “Buy”.`);
        if (db.offers.some((o) => o.listingId === l.id && o.buyerEmail === user.email && isActive(o))) {
          fail("You already have an open offer on this item. You can find it under My offers.");
        }
        const t = now();
        const clean = cleanNote(note);
        const offer = {
          id: uid("o"), listingId: l.id,
          sellerEmail: l.sellerEmail, sellerName: l.sellerName,
          buyerEmail: user.email, buyerName: user.name,
          amount: value, status: "pending", createdAt: t, updatedAt: t,
          history: [{ by: "buyer", action: "offer", amount: value, note: clean, at: t }],
        };
        db.offers.push(offer);
        notify(db, l.sellerEmail, {
          kind: "offer",
          title: `New counteroffer: ${U.money(value)}`,
          body: `${user.name} offered ${U.money(value)} for your ${itemName(l)} (you asked ${U.money(l.price)}).` + (clean ? ` They wrote: “${clean}”` : ""),
          link: "#/my-listings",
        });
        return offer;
      });
    },

    // Agree to the asking price (or claim a free item) straight away.
    buyNow(user, listingId) {
      return tx((db) => {
        const l = db.listings.find((x) => x.id === listingId);
        if (!l || l.status !== "active") fail("This item is no longer available.");
        if (l.sellerEmail === user.email) fail("You can't buy your own listing.");
        const t = now();
        let offer = db.offers.find((o) => o.listingId === l.id && o.buyerEmail === user.email && isActive(o));
        if (offer) {
          offer.amount = l.price;
        } else {
          offer = {
            id: uid("o"), listingId: l.id,
            sellerEmail: l.sellerEmail, sellerName: l.sellerName,
            buyerEmail: user.email, buyerName: user.name,
            amount: l.price, status: "pending", createdAt: t, updatedAt: t, history: [],
          };
          db.offers.push(offer);
        }
        offer.history.push({ by: "buyer", action: "buy", amount: l.price, at: t });
        finalizeDeal(db, offer, l);
        return offer;
      });
    },

    // action: "accept" | "decline" | "counter" | "withdraw"
    respond(user, offerId, action, amount, note) {
      return tx((db) => {
        const o = db.offers.find((x) => x.id === offerId);
        if (!o) fail("Offer not found.");
        const role = o.sellerEmail === user.email ? "seller" : o.buyerEmail === user.email ? "buyer" : null;
        if (!role) fail("This isn't your offer.");
        if (!isActive(o)) fail("This offer is no longer open.");
        const l = db.listings.find((x) => x.id === o.listingId);
        if (!l || l.status !== "active") fail("This item is no longer available.");

        if (action === "withdraw") {
          if (role !== "buyer") fail("Only the buyer can withdraw an offer.");
          const t = now();
          o.status = "withdrawn";
          o.updatedAt = t;
          o.history.push({ by: "buyer", action: "withdraw", at: t });
          notify(db, o.sellerEmail, {
            kind: "declined",
            title: `${o.buyerName} withdrew their offer`,
            body: `The offer on your ${itemName(l)} was withdrawn.`,
            link: "#/my-listings",
          });
          return o;
        }

        if (!Store.isMyTurn(o, user.email)) fail("You're waiting for the other person to respond.");
        applyResponse(db, o, l, role, action, amount, note);
        return o;
      });
    },

    // Demo sellers answer offers a couple of seconds after they arrive.
    // Returns true if anything changed.
    runDemoSellers() {
      const db = load();
      let changed = false;
      for (const o of db.offers) {
        if (o.status !== "pending" || now() - o.updatedAt < BOT_DELAY_MS) continue;
        const seller = db.users[o.sellerEmail];
        const l = db.listings.find((x) => x.id === o.listingId);
        if (!seller || !seller.bot || !l || l.status !== "active") continue;
        botRespond(db, o, l);
        changed = true;
      }
      if (changed) save(db);
      return changed;
    },

    isDemoSeller(email) {
      const u = load().users[email];
      return !!(u && u.bot);
    },

    // --- notifications ---

    notificationsFor(email) {
      return load().notifications.filter((n) => n.to === email).sort((a, b) => b.createdAt - a.createdAt);
    },

    unreadCount(email) {
      return load().notifications.filter((n) => n.to === email && !n.read).length;
    },

    markRead(email, id) {
      tx((db) => {
        const n = db.notifications.find((x) => x.id === id && x.to === email);
        if (n) n.read = true;
      });
    },

    markAllRead(email) {
      tx((db) => {
        for (const n of db.notifications) if (n.to === email) n.read = true;
      });
    },
  };

  window.Store = Store;
})();
