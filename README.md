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

When deployed to any static host (served over HTTP/HTTPS) it just works; the
`file://` limitation only affects local double-clicking. All asset references are
**relative**, so the sim runs correctly at a site root *or* under a subpath such
as `https://user.github.io/repo/`.

## Hosting on GitHub Pages

GitHub Pages works, but two of its defaults get in the way of this project, so
one of the options below is needed:

* **Pages only serves from a repo _root_ or a `/docs` folder** — not from an
  arbitrary `html5/` subfolder.
* **Pages runs Jekyll by default**, which can interfere with a plain static
  site. (This repo ships an empty `html5/.nojekyll` marker to disable it.)

**Option A — deploy `html5/` with the included GitHub Action (recommended, no
files to move).** This repo contains `.github/workflows/deploy-pages.yml`, which
uploads the `html5/` folder as the Pages site root. To use it:

1. Push the repository to GitHub (default branch `main`; edit the workflow if you
   use `master`).
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and
   choose **GitHub Actions**.
3. Push (or run the workflow manually from the **Actions** tab). The sim will be
   live at `https://<user>.github.io/<repo>/`.

**Option B — deploy from a branch.** If you prefer the "Deploy from a branch"
setting, the served content must be at the repo root or in `/docs`. Copy the
**contents of `html5/`** (including the `.nojekyll` file) into the repo root or a
`docs/` folder, then set **Settings → Pages → Source** to that branch/folder.

Either way, because paths are relative, no code changes are needed.

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
