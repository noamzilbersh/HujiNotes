/*
 * Sign-in. Two options:
 *  - Google Sign-In (real Google account picker) when GOOGLE_CLIENT_ID is set.
 *  - Demo sign-in: type your university email, no password.
 *
 * Note: without a server, the Google token is only decoded in the browser and
 * never verified, which is fine for a demo but not for production.
 * The session lives in sessionStorage, so each browser tab can be signed in as
 * a different person (useful for testing offers between a buyer and a seller).
 */
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const SESSION_KEY = "hujinotes.session.v1";
  let memorySession = null;

  function readSession() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return memorySession;
    }
  }

  function writeSession(user) {
    memorySession = user;
    try {
      if (user) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* memorySession is enough */ }
  }

  function normalizeEmail(email) {
    const value = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Please enter a valid email address.");
    const domain = value.split("@")[1];
    const allowed = C.ALLOWED_EMAIL_DOMAINS || [];
    if (allowed.length && !allowed.includes(domain)) {
      throw new Error(`Please use ${allowed.length === 1 ? "an" : "one of these:"} ${allowed.map((d) => "@" + d).join(", ")} address.`);
    }
    return value;
  }

  // Google ID tokens are JWTs; the middle part is base64url-encoded JSON.
  function decodeJwt(token) {
    const part = String(token).split(".")[1];
    if (!part) throw new Error("Google sign-in returned an unexpected response.");
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  let gsiPromise = null;
  function loadGoogleScript() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (!gsiPromise) {
      gsiPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gsiPromise = null; reject(new Error("Couldn't load Google Sign-In. Check your connection.")); };
        document.head.appendChild(s);
      });
    }
    return gsiPromise;
  }

  const Auth = {
    current() {
      return readSession();
    },

    signIn({ email, name, picture, method }) {
      const cleanEmail = normalizeEmail(email);
      const cleanName = String(name || "").trim().replace(/\s+/g, " ").slice(0, 40) || cleanEmail.split("@")[0];
      const user = { email: cleanEmail, name: cleanName, picture: picture || "", method: method || "demo" };
      writeSession(user);
      window.Store.upsertUser({ email: user.email, name: user.name });
      return user;
    },

    signOut() {
      writeSession(null);
      try {
        if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect();
      } catch (e) { /* ignore */ }
    },

    // Google only allows sign-in from http(s) origins listed in the Cloud console.
    googleEnabled() {
      return !!C.GOOGLE_CLIENT_ID && /^https?:$/.test(window.location.protocol);
    },

    demoEnabled() {
      return C.ENABLE_DEMO_LOGIN !== false || !Auth.googleEnabled();
    },

    renderGoogleButton(container, onUser, onError) {
      loadGoogleScript().then(() => {
        window.google.accounts.id.initialize({
          client_id: C.GOOGLE_CLIENT_ID,
          callback: (response) => {
            try {
              const p = decodeJwt(response.credential);
              if (p.email_verified === false) throw new Error("Your Google email address isn't verified.");
              onUser(Auth.signIn({ email: p.email, name: p.name, picture: p.picture, method: "google" }));
            } catch (err) {
              onError(err);
            }
          },
        });
        window.google.accounts.id.renderButton(container, {
          theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 280,
        });
      }).catch(onError);
    },
  };

  window.Auth = Auth;
})();
