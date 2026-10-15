/*
 * Site settings. This is the only file you need to edit to adapt the site
 * to your university.
 */
window.APP_CONFIG = {
  SITE_NAME: "HujiNotes",
  UNIVERSITY_NAME: "Hebrew University",

  // University logo shown next to the site name (public-domain file from
  // Wikimedia Commons). Set to "" to hide it.
  UNIVERSITY_LOGO: "assets/huji-logo.svg",

  // Shown in front of prices, e.g. "$", "₪", "€".
  CURRENCY: "₪",

  // Real "Sign in with Google": paste an OAuth Client ID from
  // https://console.cloud.google.com/apis/credentials (see README.md).
  // Leave empty to use the demo sign-in only.
  GOOGLE_CLIENT_ID: "",

  // Lets people sign in by typing their university email (no password).
  // Handy for a demo; set to false once Google sign-in is configured.
  ENABLE_DEMO_LOGIN: true,

  // Only these email domains may sign in (HUJI student accounts are Google
  // accounts, so Google Sign-In works with them too).
  // An empty list allows any domain.
  ALLOWED_EMAIL_DOMAINS: ["mail.huji.ac.il"],

  // Where buyers and sellers can meet. Sellers pick one when listing an item
  // and can add an exact spot (e.g. "main library entrance").
  LOCATIONS: [
    { id: "scopus", label: "Mount Scopus campus" },
    { id: "givat-ram", label: "Edmond J. Safra campus (Givat Ram)" },
    { id: "ein-kerem", label: "Ein Kerem campus" },
    { id: "rehovot", label: "Rehovot campus" },
    { id: "other", label: "Somewhere else" },
  ],

  // Highest price a seller can ask.
  MAX_PRICE: 1000,

  // The kinds of items people can sell. Keys are stored with each listing,
  // so don't rename them after people start using the site.
  ITEM_TYPES: {
    notes: { label: "Notes", plural: "Notes", icon: "📝", want: "I want notes" },
    mock: { label: "Mock test notebook", plural: "Mock test notebooks", icon: "📋", want: "Mock test notebooks" },
  },

  // The course list sellers pick from. Replace with your university's courses.
  // `id` must be unique and should not change once listings exist.
  COURSES: [
    { id: "cs101", code: "CS 101", name: "Introduction to Computer Science", dept: "Computer Science" },
    { id: "cs201", code: "CS 201", name: "Data Structures", dept: "Computer Science" },
    { id: "cs250", code: "CS 250", name: "Algorithms", dept: "Computer Science" },
    { id: "cs310", code: "CS 310", name: "Operating Systems", dept: "Computer Science" },
    { id: "math101", code: "MATH 101", name: "Calculus I", dept: "Mathematics" },
    { id: "math102", code: "MATH 102", name: "Calculus II", dept: "Mathematics" },
    { id: "math201", code: "MATH 201", name: "Linear Algebra", dept: "Mathematics" },
    { id: "stat200", code: "STAT 200", name: "Probability and Statistics", dept: "Mathematics" },
    { id: "phys101", code: "PHYS 101", name: "Physics I: Mechanics", dept: "Physics" },
    { id: "phys102", code: "PHYS 102", name: "Physics II: Electricity and Magnetism", dept: "Physics" },
    { id: "chem101", code: "CHEM 101", name: "General Chemistry", dept: "Chemistry" },
    { id: "bio101", code: "BIO 101", name: "Introduction to Biology", dept: "Biology" },
    { id: "econ101", code: "ECON 101", name: "Principles of Microeconomics", dept: "Economics" },
    { id: "econ102", code: "ECON 102", name: "Principles of Macroeconomics", dept: "Economics" },
    { id: "psy101", code: "PSY 101", name: "Introduction to Psychology", dept: "Psychology" },
    { id: "eng110", code: "ENG 110", name: "Academic Writing", dept: "English" },
  ],
};
