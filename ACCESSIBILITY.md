# Accessibility — Lunar Phase Quizzer

Target: WCAG 2.1 AA. Human screen-reader QA (NVDA + VoiceOver) is still required;
this documents the affordances built in.

## Structure & landmarks

* Single `<h1>` is rendered by the `<kl-unl-masthead>` component (the sim adds no
  competing `h1`). Panels use `<section>` with `<h2>` headings; the diagram
  panel's heading is visually-hidden (`.sr-only`) but present for navigation.
* `<main>` wraps the app; the Question Chooser uses `<fieldset>`/`<legend>` with
  grouped radio buttons; every control has a real `<label>`.
* `<html lang="en">`.

## Canvas text alternatives (1.1.1)

Both canvases have `role="img"` with an `aria-describedby` text equivalent that
is updated from the single `render()`:

* Diagram: "Top-down view of the Moon's orbit around Earth. The Moon is at N
  degrees around its orbit, toward the <compass> of Earth. Sunlight comes from
  the <compass>." Hidden quantities are described as hidden, never leaked.
* Moon's Appearance: "The Moon appears as a <phase name>, N percent illuminated."
  or, when the phase is the hidden question, a statement that it is hidden.

## Screen-reader narration — units always spoken

Every value with a unit is announced with its quantity name **and** unit, never
as a bare number:

* Sliders carry `aria-valuetext`, e.g.
  * "Moon position 45 degrees around the orbit"
  * "Sunlight direction 180 degrees"
  * "Moon phase: waning gibbous, 85 percent illuminated"
  Units are spelled as full words ("degrees", "percent illuminated") so they are
  not skipped or mis-read; the visual readout may show the "°" glyph.
* A single polite `aria-live` region (`#live-region`) announces committed changes
  (on pointer-release / slider `change`, **not** on every tick to avoid
  flooding), with units and the pedagogical payoff, e.g. "Moon position 100
  degrees. phase now waxing gibbous, 85 percent illuminated." When the phase is
  the hidden answer, the phase is omitted from announcements so it is not leaked.
* Mode changes, reset, and show/hide answer are announced.

## Keyboard (2.1.1 / 2.1.2 / 2.4.7)

* Everything is operable by keyboard in a logical tab order; focus rings come
  from the foundation's `:focus-visible`.
* Diagram interaction has two keyboard paths in addition to pointer dragging:
  1. **The canvas itself is focusable** (`tabindex="0"`). Clicking the Moon or the
     sunlight arrows selects that object (a periwinkle focus ring is drawn around
     it); the **arrow keys** then move the selected object — fine steps of 0.01
     rad, or **Shift+arrow** to snap to the eight primary positions — matching the
     original Flash draggable objects. Tabbing to the canvas auto-selects the
     first available object.
  2. The **Moon position** and **Sunlight direction** native range sliders (and
     the **Moon phase** slider) provide fully-labeled control. Native
     `<input type="range">` gives Left/Down/Right/Up (step), PageUp/PageDown
     (large step), and Home/End (extremes) for free. Because the angles are
     cyclic, a `keydown` handler wraps min↔max so you can cross the 0°/359° seam.
* No keyboard traps; the masthead dialog manages its own focus/Escape and is not
  fought.

## Color & contrast (1.4.1 / 1.4.3 / 1.4.11)

* Palette comes from the KL-UNL CSS custom properties. Body text ≥ 4.5:1;
  controls/graphical elements ≥ 3:1. The green question bubble uses dark-green
  text (`#14320a`) on light-green (`#b3f681`) for contrast.
* State is **never** encoded by color alone: the quiz question is shown as text
  in a bubble, the phase is named in text ("waning gibbous, 85 percent
  illuminated") alongside the picture, and slider values have text readouts.

## Timing / motion (2.2.2 / 2.3.3)

* The only motion is a 250 ms opacity cross-fade on mode change (well under 5 s,
  no flashing). `prefers-reduced-motion: reduce` is honored in JS (transitions
  snap to their end state) and in CSS. Nothing animates continuously, so no
  Pause control is needed; Reset is provided by the masthead.

## Larger, zoomable text (1.4.4 / 1.4.10)

* Body text is `1.125rem` with headings/labels scaled up, all in `rem`/`em`.
* On-screen diagram text (instructions, question bubbles, the "sunlight"-adjacent
  labels) lives in **HTML overlays**, not baked into the canvas, so it scales
  with browser zoom and reflows. The layout is usable at 200 % zoom and reflows
  to a single column without clipping or horizontal scrolling.
* The one label drawn on the canvas is the decorative rotating "sunlight" word
  that tracks the arrow cluster (as in the original). Its meaning is redundantly
  available in the diagram's text description and instructions, so no information
  is lost to an audio-only or zoomed-in user.

## Touch / responsive

* Pointer Events unify mouse and touch; `touch-action: none` on the draggable
  canvas prevents the page scrolling/zooming during a drag. No hover-only
  affordances. Interactive targets meet the ≥ 44 px minimum (foundation
  `.button`, and `min-height: 2.75rem` on the custom sliders).

## Known limitations / QA still needed

* Human testing with NVDA (Windows, Chrome + Firefox) and VoiceOver (macOS +
  iOS Safari) is still required to confirm announcement ordering and phrasing.
* The Earth globe and phase pictures are canvas graphics; their meaning is
  carried by the text descriptions, but a blind user relies on those
  descriptions rather than the imagery.
