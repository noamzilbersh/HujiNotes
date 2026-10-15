# 📚 HujiNotes: a student marketplace for class notes

### 👉 [Open the website](https://noamzilbersh.github.io/HujiNotes/)

**Live site:** https://noamzilbersh.github.io/HujiNotes/

A demo website where Hebrew University students can **sell, give away and buy**
notes and mock test notebooks from classes they've finished.
*An unofficial student project, not affiliated with the university.*

- **Sign in with your HUJI email** (`@mail.huji.ac.il`). Real Google Sign-In when configured, plus a demo sign-in.
- **Sell:** pick the course from a list, choose *Notes* or *Mock test notebook*,
  write a short description, **add a photo** (optional), set a price (or give it
  away for free) and choose **where to meet** (Mount Scopus, Givat Ram, …).
- **Buy:** *What course?* → *I want notes* or *Mock test notebooks* → see every option.
- **Counteroffers:** if the price is too high, make an offer. The seller gets a
  notification and can **accept, decline or counter**, and the negotiation can go
  back and forth.
- **Deal agreed:** the seller gets a notification with the buyer's email, and the
  buyer gets the seller's, so they can plan payment and pickup. **No payment
  happens on the site.**
- **Help bot:** the Help page has a chatbot with built-in questions. It asks what
  you need, gives step-by-step instructions, and its "Take me there" button
  opens the right page and highlights exactly what to press.

It's a static site (HTML, CSS and JavaScript with no server and no build step),
so it runs on **GitHub Pages** for free.

## Try it locally

Double-click `index.html`, or serve the folder (needed for Google Sign-In):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

### Demo tips

- Data is stored in your browser's `localStorage`, so nothing is shared between
  different computers. The site comes with sample listings from demo sellers.
- **Demo sellers answer offers automatically** a few seconds later: they accept
  offers close to their price, counter in the middle, and decline very low ones.
- **To test both sides yourself**, open two tabs and sign in as two different people
  (each tab keeps its own sign-in). Sell something in one tab, make an offer in
  the other, and watch the notifications arrive live.
- **Reset demo data** at the bottom of the page restores the sample listings.

## Put it on GitHub Pages

1. Create a repository on GitHub (e.g. `HujiNotes`) and push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/HujiNotes.git
   git branch -M main
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, choose `main` and `/ (root)`, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/HujiNotes/`.

## Customize it

Everything lives in **`js/config.js`**:

| Setting | What it does |
|---|---|
| `SITE_NAME`, `UNIVERSITY_NAME` | Names shown on the site |
| `UNIVERSITY_LOGO` | Logo next to the site name (set `""` to hide) |
| `LOCATIONS` | Meeting places sellers can choose from |
| `CURRENCY` | Price symbol (currently `"₪"`) |
| `COURSES` | The course list sellers pick from. Replace with your university's courses |
| `ALLOWED_EMAIL_DOMAINS` | Which emails may sign in (currently `mail.huji.ac.il`) |
| `GOOGLE_CLIENT_ID` | Turns on real "Sign in with Google" (see below) |
| `ENABLE_DEMO_LOGIN` | Allow sign-in by typing an email (set `false` once Google sign-in works) |

## Turn on real Google Sign-In (optional)

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   and create a project if you don't have one.
2. Set up the **OAuth consent screen** (External, app name, your email).
3. **Create credentials → OAuth client ID → Web application.**
4. Under **Authorized JavaScript origins** add `https://<your-username>.github.io`
   (and `http://localhost:8000` for local testing).
5. Copy the Client ID into `GOOGLE_CLIENT_ID` in `js/config.js` and push.

The Client ID is public by design, so it's safe to commit.

## Limitations (it's a demo)

- **There's no server**, so listings live only in each visitor's browser. Two
  students on different phones won't see each other's listings. Making it real
  needs a shared backend such as Firebase or Supabase, and `js/store.js` is the
  only file that would need to change.
- Google sign-in is checked only in the browser, not verified by a server.
- "Notifications" are shown inside the site; no emails are sent.

## Project structure

```
index.html        page shell
css/styles.css    styles (light + dark mode, mobile friendly)
js/config.js      settings & course list  ← edit this
js/util.js        formatting helpers
js/store.js       data: listings, offers, notifications (localStorage)
js/auth.js        Google / demo sign-in
js/help.js        the help chatbot's questions and answers
assets/           Hebrew University logo
js/app.js         pages, routing and interactions
```

## Credits

The Hebrew University logo (`assets/huji-logo.svg`) is from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hebrew_University_Logo.svg),
where it is marked as public domain.
