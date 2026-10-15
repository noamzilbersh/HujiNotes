/*
 * The help chatbot's script. Each entry is one bot message:
 *   text     – what the bot says (HTML allowed; this file is trusted content)
 *   steps    – optional numbered instructions
 *   go       – optional "Take me there" button: page to open and the element to highlight
 *   options  – buttons the user can press next: [label, id of the next entry]
 *   keywords – words typed into the chat box that lead to this entry
 */
(function () {
  "use strict";
  const START_OVER = ["Something else", "start"];

  window.HELP_FLOW = {
    start: {
      text: "Hi! 👋 I'm the HujiNotes helper. What do you need help with?",
      options: [
        ["📤 I want to sell something", "sell"],
        ["🛒 I want to buy notes", "buy"],
        ["💬 Counteroffers and negotiating", "offers"],
        ["🤝 We agreed on a price. What now?", "deal"],
        ["✏️ Edit or remove my listing", "manage"],
        ["🔔 Where are my notifications?", "notifs"],
        ["🔑 Signing in", "signin"],
      ],
    },

    // ----- selling -----
    sell: {
      keywords: ["sell", "selling", "post", "upload", "give away", "למכור", "מכירה"],
      text: "Great! Are you selling it for a price, or giving it away for free?",
      options: [["For a price", "sell_paid"], ["For free", "sell_free"]],
    },
    sell_paid: {
      text: "Here's exactly what to do:",
      steps: [
        "Press <b>Sell</b> in the top menu (or the <b>Sell</b> card on the Home page).",
        "Under <b>1. Which class is it from?</b> open the list and pick your course.",
        "Under <b>2. What are you selling?</b> choose <b>Notes</b> or <b>Mock test notebook</b>.",
        "In <b>3. Short description</b> write what's included, its condition, and whether it's printed or digital.",
        "<b>4. Photo</b> is optional. Press <b>Add a photo</b> and choose a picture of the cover or a sample page.",
        "Type your price in <b>5. Price</b>.",
        "In <b>6. Where can you meet?</b> pick a campus and, if you like, an exact spot.",
        "Press <b>Post listing</b>. That's it! You'll get a notification when someone buys it or makes an offer.",
      ],
      go: { label: "Take me to the Sell page", link: "#/sell", highlight: "#sell-course" },
      options: [["How do I add a photo?", "photo"], ["How do I set the meeting place?", "location"], ["What happens after I post?", "after_post"], START_OVER],
    },
    sell_free: {
      keywords: ["free", "donate", "giveaway", "בחינם"],
      text: "That's kind of you! Giving something away works almost the same as selling:",
      steps: [
        "Press <b>Sell</b> in the top menu.",
        "Pick the course, choose <b>Notes</b> or <b>Mock test notebook</b>, and write a short description.",
        "Optionally press <b>Add a photo</b>.",
        "Next to the price, tick <b>Give it away for free</b>.",
        "Pick where you can meet, then press <b>Post listing</b>.",
        "When someone presses <b>Get it for free</b>, you'll both get each other's email.",
      ],
      go: { label: "Take me to the Sell page", link: "#/sell", highlight: "[data-toggle-free]" },
      options: [["How do I set the meeting place?", "location"], START_OVER],
    },
    photo: {
      keywords: ["photo", "picture", "image", "pic", "camera", "תמונה"],
      text: "Adding a photo helps buyers see what they're getting:",
      steps: [
        "Press <b>Sell</b> in the top menu (or <b>Edit</b> on a listing under <b>My listings</b>).",
        "Find <b>4. Photo</b> and press <b>Add a photo</b>.",
        "Choose a picture from your computer, or take one with your phone's camera.",
        "A preview appears. Press <b>Change photo</b> to pick another or <b>Remove</b> to delete it.",
      ],
      go: { label: "Show me where", link: "#/sell", highlight: "#sell-photo" },
      options: [["How do I set the meeting place?", "location"], START_OVER],
    },
    location: {
      keywords: ["location", "where", "meet", "meeting", "pickup", "pick up", "campus", "scopus", "givat ram", "מיקום", "איפה"],
      text: "You choose where to hand over the notes when you post them:",
      steps: [
        "On the <b>Sell</b> page, scroll to <b>6. Where can you meet?</b>",
        "Pick a campus, for example <b>Mount Scopus campus</b> or <b>Givat Ram</b>.",
        "Optionally add an exact spot, like “Main library entrance”.",
        "If it's not on a campus, choose <b>Somewhere else</b> and type the place.",
        "Not sure yet? Leave <b>Decide later with the buyer</b>.",
      ],
      go: { label: "Show me where", link: "#/sell", highlight: "#sell-location" },
      options: [START_OVER],
    },
    after_post: {
      text: "Your item now appears under <b>My listings</b> and in the Buy section for that course. Buyers can:",
      steps: [
        "Press <b>Buy</b>: the deal is agreed right away and you both get each other's email.",
        "Press <b>Make a counteroffer</b>: you get a notification and can accept, counter or decline.",
        "Either way, the 🔔 bell at the top right shows a red number when something happens.",
      ],
      go: { label: "Open My listings", link: "#/my-listings", highlight: '#nav a[href="#/my-listings"]' },
      options: [["Someone made me an offer", "offer_seller"], START_OVER],
    },

    // ----- buying -----
    buy: {
      keywords: ["buy", "buying", "find", "search", "purchase", "looking for", "לקנות", "קנייה"],
      text: "Sure! Do you know which course you need?",
      options: [["Yes, I know the course", "buy_steps"], ["Not sure, just browsing", "buy_browse"]],
    },
    buy_steps: {
      text: "Here's how to find and buy it:",
      steps: [
        "Press <b>Buy</b> in the top menu.",
        "Under <b>What course?</b> type the course name or code in the search box.",
        "Press the course.",
        "Press <b>I want notes</b> or <b>Mock test notebooks</b>.",
        "Look through the options. Use <b>Sort</b> to order them by price.",
        "Press <b>Buy for…</b> to pay the asking price, or <b>Make a counteroffer</b> if it's too expensive.",
      ],
      go: { label: "Take me to Buy", link: "#/buy", highlight: ".search" },
      options: [["The price is too high", "offer_buyer"], ["What happens after I press Buy?", "deal"], START_OVER],
    },
    buy_browse: {
      text: "Press <b>Buy</b> in the top menu. Every course tile shows how many items are available (📝 notes, 📋 mock test notebooks). “Nothing listed yet” means nobody is selling for that course right now.",
      go: { label: "Take me to Buy", link: "#/buy", highlight: ".course-grid" },
      options: [["I found a course, now what?", "buy_steps"], START_OVER],
    },

    // ----- offers -----
    offers: {
      keywords: ["offer", "counter", "negotiate", "cheaper", "expensive", "price", "הצעה", "מחיר"],
      text: "Happy to help. Which one describes you?",
      options: [
        ["I'm buying and the price is too high", "offer_buyer"],
        ["I'm selling and got an offer", "offer_seller"],
        ["The seller answered my offer", "offer_reply"],
      ],
    },
    offer_buyer: {
      text: "You can suggest a lower price:",
      steps: [
        "Find the item: <b>Buy</b> → your course → <b>I want notes</b> or <b>Mock test notebooks</b>.",
        "Press <b>Make a counteroffer</b> on the item.",
        "Type your price (it has to be lower than the asking price), or press one of the quick picks.",
        "Optionally add a message, like when you can pick it up.",
        "Press <b>Send offer</b>. The seller is notified, and you'll be notified when they answer.",
      ],
      go: { label: "Take me to Buy", link: "#/buy", highlight: ".search" },
      options: [["The seller answered my offer", "offer_reply"], START_OVER],
    },
    offer_seller: {
      keywords: ["got an offer", "someone offered", "accept", "decline", "answer an offer"],
      text: "Here's how to answer an offer:",
      steps: [
        "Press <b>My listings</b> in the top menu. An orange number shows how many offers are waiting for you.",
        "Find the offer marked <b>Your turn</b> (highlighted in orange).",
        "Press <b>Accept</b> to agree to their price, <b>Counter</b> to suggest a price between their offer and yours, or <b>Decline</b>.",
        "If you accept, you both get each other's email to arrange the handover.",
      ],
      go: { label: "Open My listings", link: "#/my-listings", highlight: ".offer.is-turn, #nav a[href=\"#/my-listings\"]" },
      options: [["We agreed. What now?", "deal"], START_OVER],
    },
    offer_reply: {
      keywords: ["seller answered", "answered", "replied", "reply", "countered me", "responded"],
      text: "To see the seller's answer:",
      steps: [
        "Press <b>My offers</b> in the top menu.",
        "If the seller countered, it's under <b>Waiting for your answer</b>.",
        "Press <b>Accept</b>, <b>Counter</b> with a new price, or <b>Decline</b>.",
        "If they accepted, it's under <b>Agreed deals</b> together with their email.",
      ],
      go: { label: "Open My offers", link: "#/my-offers", highlight: ".offer.is-turn, #nav a[href=\"#/my-offers\"]" },
      options: [["We agreed. What now?", "deal"], START_OVER],
    },

    // ----- after a deal -----
    deal: {
      keywords: ["agreed", "deal", "pay", "payment", "money", "contact", "email", "bit", "paybox", "תשלום", "לשלם"],
      text: "Congrats! 🎉 Once you agree on a price:",
      steps: [
        "You both get a notification with the other person's email.",
        "<b>Buyers:</b> go to <b>My offers</b> → <b>Agreed deals</b>. <b>Sellers:</b> go to <b>My listings</b>, where the sold item has a green box.",
        "Press the email button to write to them, or <b>Copy email</b>.",
        "Agree on a time and meet at the meeting place shown with 📍.",
        "Pay each other directly (cash, Bit, PayBox…). The site never handles money.",
      ],
      go: { label: "Open My offers", link: "#/my-offers", highlight: ".contact" },
      options: [["I'm the seller. Where's the buyer's email?", "deal_seller"], START_OVER],
    },
    deal_seller: {
      text: "Press <b>My listings</b>. The sold item shows a green <b>Deal agreed</b> box with the buyer's email. Press it to write to them. It's also in your 🔔 notifications.",
      go: { label: "Open My listings", link: "#/my-listings", highlight: ".contact" },
      options: [START_OVER],
    },

    // ----- other -----
    manage: {
      keywords: ["edit", "change", "remove", "delete", "update", "mistake", "my listing", "לערוך", "למחוק"],
      text: "You can change or remove anything you're still selling:",
      steps: [
        "Press <b>My listings</b> in the top menu.",
        "Find the item and press <b>Edit</b> to change the description, price, photo or meeting place, then press <b>Save changes</b>.",
        "Or press <b>Remove</b> and confirm. Anyone with an open offer is notified.",
        "Items that are already sold can't be edited.",
      ],
      go: { label: "Open My listings", link: "#/my-listings", highlight: '[data-action="edit-listing"]' },
      options: [START_OVER],
    },
    notifs: {
      keywords: ["notification", "notifications", "bell", "alert", "התראה", "התראות"],
      text: "Notifications are under the 🔔 bell at the top right:",
      steps: [
        "A red number on the bell means you have unread notifications.",
        "Press the bell to see all of them.",
        "Press <b>View</b> on a notification to jump to the right page.",
        "Press <b>Mark all as read</b> to clear the red number.",
        "New notifications also pop up at the bottom of the screen while you're on the site.",
      ],
      go: { label: "Show me the bell", link: "#/notifications", highlight: ".bell" },
      options: [START_OVER],
    },
    signin: {
      keywords: ["sign in", "login", "log in", "account", "password", "huji", "להתחבר", "כניסה"],
      text: "Sign in with your HUJI student email (it ends with <b>@mail.huji.ac.il</b>). Type your name and email on the sign-in page and press <b>Sign in</b>. Other addresses, like Gmail, won't work. To sign out, press <b>Sign out</b> at the top right.",
      options: [START_OVER],
    },

    notUnderstood: {
      text: "Sorry, I didn't quite get that 🤔 Try one of these:",
      options: null, // filled with the start options
    },
  };
})();
