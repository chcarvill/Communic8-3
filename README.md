# Communic8 — Marketing & Sales Board

A personal board for holding every marketing/sales idea for the coaching
business at once, without having to decide or rank anything yet — then,
once you're ready, dragging specific pieces of work onto an actual
calendar.

## How to open it

Just double-click `index.html`. No installation, no server, no build
step. It works straight away in any modern browser (Chrome, Firefox,
Edge, Safari).

Everything you do is saved automatically to your browser's local storage
on this device, so closing the tab and coming back later picks up right
where you left off. (It does *not* sync across devices or browsers —
it's tied to the browser you're using on the computer you opened it on.)

## How it works

**The canvas (top half)** holds every idea from the original brainstorm,
loosely clustered by category. Nothing here is ranked or judged — it's
just everything that's possible, visible at once. You can drag any card
anywhere on the canvas if you want to regroup things yourself.

**Build it / Do it** — every idea splits into two separate, independent
pieces of work:
- **Creation** (sage green, sprout icon) — the one-off effort to build
  the thing: writing the post, designing the flyer, setting up the
  funnel.
- **Application** (clay/terracotta, arrow icon) — the recurring effort
  to actually run it: making the calls, posting it, showing up.

Click "Build it" or "Do it" on any idea card to spawn that piece of
work. It'll appear in the **"Not yet scheduled"** tray underneath the
canvas.

**The calendar (bottom half)** is a plain week view. Drag any card out
of the tray (or out of another day) onto a specific day to commit to
doing it then. Drag it back to the tray if you change your mind. Once
you've actually done a piece of work, click the ✓ on its card to mark it
done — it'll grey out and stay there as a record, rather than
disappearing.

Drag the thin divider between the canvas and the calendar up or down to
resize how much space each gets.

Use **"+ New idea"** in the toolbar to add anything new that occurs to
you later — it'll drop into the canvas near its category.

## Installing it as an app (after hosting)

Once this is hosted somewhere real (e.g. GitHub Pages) rather than
opened as a local file, you can install it as a proper app icon with no
browser address bar — same as the Mission Control app.

**On a phone:** open the hosted URL in your browser, then use
"Add to Home Screen" (Chrome/Android) or "Add to Home Screen" from the
Share menu (Safari/iOS). It'll appear as a normal app icon and open
full-screen.

**On desktop:** open the hosted URL in Chrome or Edge, then click the
install icon that appears in the address bar (or find "Install app" in
the browser's menu). It'll appear in your applications list/dock like
any other program.

This only works once the site is served over `https://` — browsers
won't offer this option for a file opened locally from your computer,
since installable apps require a real, securely-served address.

## File structure

```
communic8-marketing/
├── index.html                   ← open this one
├── app.js                       ← all the app logic
├── manifest.json                ← PWA install config (name, icon, colors)
├── sw.js                        ← service worker (offline support + installability)
├── data.json                    ← the editable, human-readable list of ideas
├── data-embedded.js             ← auto-generated copy of data.json (see below)
├── regenerate_embedded_data.py  ← regenerates data-embedded.js from data.json
└── assets/
    ├── icon-creation.png        ← used inside the app (sprout)
    ├── icon-application.png     ← used inside the app (arrow)
    ├── app-icon-192.png         ← home-screen / install icon
    ├── app-icon-512.png         ← home-screen / install icon (larger)
    ├── make_icons.py            ← regenerates the in-app icons
    └── make_app_icons.py        ← regenerates the install icons
```

### Why is there both `data.json` and `data-embedded.js`?

Browsers block a webpage from fetching local files (like `data.json`)
when you've just double-clicked an HTML file rather than loading it from
a real web server — this is a security restriction, not a bug. To get
around that, `data-embedded.js` contains the exact same content as
`data.json`, just wrapped so it can load as a normal script with no
restrictions.

You'll only ever need to touch `data.json` directly if you want to
**bulk-edit the original idea list by hand** — adding a dozen ideas at
once, fixing a typo in the seed data, etc. After editing `data.json`,
run:

```
python3 regenerate_embedded_data.py
```

This copies your changes into `data-embedded.js` so they'll show up the
next time the app starts fresh (i.e. before you've added anything via
the "+ New idea" button, or after clearing your browser's saved data for
this page).

If you only ever use the "+ New idea" button inside the app itself, you
never need to touch either of these files or run the script — new ideas
you add that way are saved straight to your browser's local storage.

## Resetting everything

If you ever want to wipe all progress and start over from the original
seed ideas, open your browser's developer console on this page and run:

```js
localStorage.removeItem("communic8_marketing_state_v1");
```

Then refresh the page.
