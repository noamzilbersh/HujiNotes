/* Small shared helpers: escaping, formatting, course lookups. */
(function () {
  "use strict";
  const C = window.APP_CONFIG;
  const courseMap = new Map(C.COURSES.map((c) => [c.id, c]));

  const U = {
    // Escape text before putting it into HTML. Use for everything a user typed.
    esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[ch]);
    },

    money(amount) {
      const n = Number(amount) || 0;
      if (n === 0) return "Free";
      return C.CURRENCY + (Number.isInteger(n) ? String(n) : n.toFixed(2));
    },

    course(id) {
      return courseMap.get(id) || null;
    },

    courseLabel(id) {
      const c = courseMap.get(id);
      return c ? `${c.code} · ${c.name}` : "Unknown course";
    },

    typeInfo(type) {
      return C.ITEM_TYPES[type] || { label: type, plural: type, icon: "📄", want: type };
    },

    firstName(name) {
      return String(name || "").trim().split(/\s+/)[0] || "there";
    },

    initials(name) {
      const parts = String(name || "?").trim().split(/\s+/);
      return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    },

    timeAgo(ts) {
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 45) return "just now";
      const m = Math.round(s / 60);
      if (m < 60) return `${m} min ago`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
      const d = Math.round(h / 24);
      if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
      return new Date(ts).toLocaleDateString();
    },
  };

  window.U = U;
})();
