# Lunar Phase Quizzer — HTML5

An accessible HTML5 rebuild of the NAAP *Lunar Phase Quizzer* (originally Adobe
Flash / ActionScript 3), running on the shared KL-UNL foundation.

## It must be served over HTTP — it will NOT run from a double-clicked file

Opening `index.html` directly (a `file://` path) shows an empty/broken title bar.
**Why:** the KL-UNL masthead component (`foundation/kl-unl-masthead.js`) loads the
title / Help / About text with `fetch('foundation/contents.json')`, and browsers
block `fetch()` of local files over `file://` (same-origin policy). Served over
HTTP the fetch succeeds and the simulation loads normally.

## How to run locally

From **inside this `html5/` folder**, start any static server:

```
# Python 3
python3 -m http.server 8123
#   then open  http://localhost:8123/

# Node
npx serve
#   or:  npx http-server

# VS Code
Use the "Live Server" extension.
```

Because you serve from inside `html5/`, the simulation is at the server **root** —
open `http://localhost:8123/` (not `.../html5/index.html`).

## Production

When deployed to the cloud host (served over HTTP/HTTPS) it just works; the
`file://` limitation only affects local double-clicking.

## Layout

```
html5/
  index.html          KL-UNL scaffold: .app-shell + <kl-unl-masthead> + panels
  foundation/         KL-UNL files (see note below)
  styles/styles.css   sim-specific styles only (foundation is not edited)
  simulation.js       all simulation logic (behavior ported from the AS3 source)
  assets/moon.jpg     the reused Moon photograph (from the original export)
  README.md           this file
  CONVERSION_NOTES.md AS3 -> HTML5 behavior mapping and deviations
  ACCESSIBILITY.md    WCAG affordances, keyboard map, screen-reader notes
```

### Note on `foundation/contents.json`

The foundation JS/CSS are byte-for-byte copies. The **provided** master
`contents.json` was **not valid JSON** (literal newlines and unescaped `"`
characters inside several *other* sims' HTML strings), which made the masthead
fail to parse the file and load nothing. The copy here was repaired **only** to
make it parse — no visible text was changed, and this sim's own entry
(`lunarphasequizzer`, already present in the file) was left as-is. See
CONVERSION_NOTES.md → "Foundation contents.json repair".

## Browser support

Vanilla HTML/CSS/JS, no build step, no external dependencies. Uses Pointer
Events, `<canvas>`, native `<input type="range">`, and standards-based CSS
(grid/flex, `aspect-ratio`, `accent-color`). Works in Chrome, Edge, Firefox, and
Safari (desktop + iOS) and on Windows/macOS/Linux/Android.
