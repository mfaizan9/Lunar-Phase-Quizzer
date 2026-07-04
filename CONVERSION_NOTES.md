# Conversion Notes — Lunar Phase Quizzer (Flash AS3 → Accessible HTML5)

## Behavior model (one paragraph)

The simulator shows a top-down view of the Moon's orbit around Earth, with
sunlight arrows indicating the direction of the Sun. Three quantities are locked
together by a single relationship — the **phase angle**, the **Moon's orbital
position**, and the **Sunlight direction** — such that any two determine the
third:

```
phaseAngle = (PI + sunlightAngle - moonAngle)   (mod 2*PI)
```

The "Question Chooser" hides exactly one of the three (Where is the Sun? / Where
is the Moon? / What is the Moon's phase?); the user sets the two visible
quantities (by dragging in the diagram, or with the sliders), and *show answer*
temporarily reveals the hidden one. The Moon's Appearance panel renders the Moon
as seen from Earth for the current phase angle.

## Source of truth

Behavior was ported from the decompiled ActionScript 3:

| Source file | What was ported |
|---|---|
| `lunarPhaseQuizzer003_fla/LunarPhaseQuizzer_1.as` | main controller, reset(), show/hide answer, slider↔phase sync |
| `Diagram.as` | angle relationships, four modes, alpha transitions, positions |
| `DraggableDiagramObject.as` | drag: `atan2(-mouseY, mouseX)` + grab offset + shift-snap to `PI/4` |
| `astroUNL/utils/PhaseDisc.as` | the light/dark terminator curve (ported verbatim) |
| `ProtoSimpleSliderMoonPhase.as`, `ProtoSliderLogicCyclic.as` | slider value range `[0, 2π]`, `value = PI - phaseAngle`, eight primary discs |
| `MoonBlank.as` | the plain dark disc shown when the phase is hidden (`#101010` fill, `#606060` stroke) |
| `About.as`, `Help.as`, `texts/*.txt` | on-screen strings, Help/About content |

### Verbatim constants

```
moonDistance      = 155
sunlightDistance  = 235
snapInterval      = PI/4  (0.7853981633974483)
modeTransition    = 250 ms
PhaseDisc radius  = 101 (Moon's Appearance), darkAlpha = 0.8, lightAlpha = 0
reset state:  moonAngle = PI/4,  sunlightAngle = PI  →  phaseAngle = 7π/4
```

### Phase-angle convention (important — verified against `PhaseDisc.update()`)

The ported `PhaseDisc` algorithm produces:

* `phaseAngle = 0`  → 0 % dark → **full moon** (100 % illuminated)
* `phaseAngle = PI` → 100 % dark → **new moon** (0 % illuminated)
* illuminated fraction seen from Earth = `(1 + cos(phaseAngle)) / 2`

Increasing `phaseAngle` from `0` toward `PI` walks the **waning** half
(gibbous → third quarter → crescent → new); from `PI` toward `2π` walks the
**waxing** half. This ordering was cross-checked against the eight primary phase
discs the original builds on the slider
(`phaseAngle_i = PI − i/8·2π`, i = 0…7). The canvas rendering is the verbatim
algorithm; the phase *names* and *illumination percentages* used in labels and
screen-reader text are derived from the same convention.

## AS3 → JS idiom mapping

* AS3 classes (`Diagram`, `DraggableDiagramObject`, `PhaseDisc`, …) → one plain
  state object + pure functions; a single `render()` redraws everything.
* `onEnterFrame` / `Timer` / `getTimer()` → `requestAnimationFrame` +
  `performance.now()`; the same 250 ms transition constant is used.
* AS drawing (`beginFill`/`moveTo`/`curveTo`) → canvas 2D. `PhaseDisc`'s
  `curveTo` tessellation → `quadraticCurveTo` with the identical control points.
* `_rotation` (degrees) → radians for canvas `rotate()`; screen-Y-down and the
  `-r*sin` sign convention preserved so orbital direction matches.
* Pointer drag reproduces `_angleOffset = property − atan2(-mouseY, mouseX)` and
  snaps with `shiftKey`; pointer coordinates are mapped back through the canvas
  CSS scale so the math stays in original stage coordinates at any display size.
* The Flash UI component framework (`fl.controls.*`, `FUIComponent`) was **not**
  ported; its observable behavior is reproduced with native accessible controls.

## Reused assets vs. code-drawn

* **Reused as-is:** the Moon photograph (`images/105.jpg` → `assets/moon.jpg`),
  drawn into the Moon's Appearance canvas and composited with the (code-drawn)
  `PhaseDisc` dark overlay.
* **Code-drawn** (these are runtime-drawn vector geometry in the original, with
  no standalone exported file): the orbit circle, the sunlight arrow cluster +
  "sunlight" label, the day/night terminator shadows, the eight phase-disc
  ticks, and the Moon's Appearance phase overlay.
* **Approximated:** the small Earth globe in the diagram. The original Earth is a
  bitmap composited inside the `Diagram` sprite, but no clean isolated Earth
  texture was among the exported files (only the fully-composited sprite render).
  It is code-drawn as a blue ocean disc with green landmasses and a rotating
  day/night terminator — recognizably Earth, crisp at any zoom. Noted here as a
  deviation from strict bitmap reuse.

## Rendering / layout deviations (Goal C is a soft priority)

* Layout uses the KL-UNL shell (panels, classes, palette), not the original
  Flash pixel layout. Panel structure and reading order mirror the original:
  diagram (left), Question Chooser + Moon's Appearance (right sidebar); it
  collapses to a single column on narrow/portrait screens.
* Keyboard access to the diagram is provided two ways: (a) the canvas is
  focusable — clicking the Moon or sunlight arrows selects it (focus ring shown)
  and the arrow keys move it (0.01 rad fine step; Shift+arrow snaps to `PI/4`),
  reproducing `DraggableDiagramObject.onKeyDownFunc`; and (b) two always-labeled
  native sliders under the canvas ("Moon position", "Sunlight direction"). When a
  quantity is the hidden answer, its slider **and** its diagram element are
  removed from view and the accessibility tree so the answer is not leaked;
  *show answer* reveals them.
* The original auto-fades the first-run instructions after the first
  interaction; here the instructions remain visible (more helpful, no behavioral
  impact).
* The mode cross-fade uses a smoothstep ease rather than the original's cubic
  spline easer. Only opacity is affected; timing constant (250 ms) is preserved,
  and `prefers-reduced-motion` snaps instantly.

## Foundation `contents.json` repair

The supplied master `contents.json` was **invalid JSON**: several *other* sims'
entries contained literal newline characters and unescaped double-quotes inside
their HTML string values (e.g. `href="..."` written without `\"`). Because the
masthead does `JSON.parse` on the whole file, this broke the title/Help/About
for **every** sim, not just some. The copy in `html5/foundation/` was repaired
by a mechanical pass that (a) collapsed in-string control characters to spaces
and (b) escaped in-string `"` — **no visible text was changed** and no entry's
meaning altered. This sim's own entry (`lunarphasequizzer`) already existed in
the file and was left unchanged (so no new entry needed adding). This is the
only change to any foundation file; `kl-unl-masthead.js`, `kl-unl.css`, and
`kl-unl.js` are byte-for-byte copies.

*(If your pipeline treats `contents.json` as a single shared master rather than a
per-sim copy, discard the repaired copy here and instead apply the same
JSON-validity fix to the shared master — the sim only requires that the file
parse and that the `lunarphasequizzer` key resolve.)*

## MathJax

The foundation's MathJax helper (`kl-unl.js`) is loaded, but this simulation
displays **no mathematical notation** anywhere in its UI (no equations, no
numeric readouts in math notation, no variables/subscripts/Greek). Angles are
shown as plain "45°" degree readouts. Therefore no MathJax equations are created;
the `klunlInitEqn()` hook is redefined only to boot the simulation, as the
foundation intends.
