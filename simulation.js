/* ==========================================================================
   Lunar Phase Quizzer — behavior port (AS3 -> vanilla JS)
   --------------------------------------------------------------------------
   Ground truth for behavior is the decompiled ActionScript:
     - Diagram.as (angle relationships, modes, alpha transitions)
     - DraggableDiagramObject.as (drag: atan2 offset + shift-snap to PI/4)
     - astroUNL/utils/PhaseDisc.as (the light/dark terminator curve)
     - ProtoSimpleSliderMoonPhase.as / LunarPhaseQuizzer_1.as (slider <-> phase)

   Geometry constants are VERBATIM from the source:
     moonDistance   = 155
     sunlightDistance = 235
     snapInterval   = PI/4  (0.7853981633974483)
     phaseAngle = (PI + sunlightAngle - moonAngle) mod 2*PI
     slider value <-> phase:  value = PI - phaseAngle   (mod 2*PI)

   Presentation (KL-UNL shell, colors, controls) follows the accessibility
   rules and does NOT reproduce the original Flash pixel layout.
   ========================================================================== */

'use strict';

(function () {
  const TAU = 2 * Math.PI;
  const SNAP = Math.PI / 4;              // _snapInterval, eight primary positions

  // ---- Diagram geometry (original stage units; canvas keeps these coords) --
  const MOON_DISTANCE = 155;             // Diagram._moonDistance
  const SUN_DISTANCE  = 235;             // Diagram._sunlightDistance
  const EARTH = { x: 280, y: 285 };      // earth origin inside the 560x560 canvas
  const EARTH_R = 31;
  const MOON_R  = 11;
  const ORBIT_R = MOON_DISTANCE;

  // ---- Mode constants (match Diagram.as strings) --------------------------
  const HIDE_SUNLIGHT = 'hideSunlight';
  const HIDE_MOON = 'hideMoon';
  const HIDE_MOON_APPEARANCE = 'hideMoonAppearance';
  const SHOW_ALL = 'showAll';

  const MODE_TRANSITION_MS = 250;        // Diagram._modeTransitionDuration

  // ---- Angle helper (matches ((a % TAU) + TAU) % TAU everywhere in source) -
  const norm = (a) => ((a % TAU) + TAU) % TAU;

  const prefersReduced = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  //  STATE  (single source of truth)
  // =========================================================================
  const state = {
    mode: HIDE_MOON_APPEARANCE,          // active diagram mode
    selectedMode: HIDE_MOON_APPEARANCE,  // the chosen radio (mode when answer hidden)
    moonAngle: Math.PI / 4,              // radians
    sunlightAngle: Math.PI,              // radians
    phaseAngle: norm(Math.PI + Math.PI - Math.PI / 4), // derived
    // Alpha (0..1) of fading groups; tied together as in Diagram.as:
    //   shadowAlpha drives sunlight arrows + earth & moon terminators
    //   moonAlpha drives the orbital Moon disc
    //   appearanceAlpha drives the Moon's Appearance disc + phase control
    shadowAlpha: 1,
    moonAlpha: 1,
    appearanceAlpha: 0,
    // animation targets
    tShadow: 1, tMoon: 1, tAppearance: 0,
    // canvas keyboard focus
    activeObject: null,       // 'moon' | 'sun' | null (selected diagram object)
    canvasFocused: false,     // whether the diagram canvas has focus
  };

  const INCREMENT_STEP = 0.01;   // DraggableDiagramObject._incrementStep (radians)

  // =========================================================================
  //  DOM
  // =========================================================================
  const el = {};
  function cacheDom() {
    el.diagram = document.getElementById('diagram-canvas');
    el.diagramCtx = el.diagram.getContext('2d');
    el.diagramDesc = document.getElementById('diagram-desc');
    el.instructions = document.getElementById('diagram-instructions');
    el.sunBubble = document.getElementById('sun-question');
    el.moonBubble = document.getElementById('moon-question');

    el.appearance = document.getElementById('appearance-canvas');
    el.appearanceCtx = el.appearance.getContext('2d');
    el.appearanceDesc = document.getElementById('appearance-desc');
    el.appearanceBubble = document.getElementById('appearance-question');

    el.moonSlider = document.getElementById('moon-slider');
    el.sunSlider = document.getElementById('sun-slider');
    el.phaseSlider = document.getElementById('phase-slider');
    el.moonReadout = document.getElementById('moon-readout');
    el.sunReadout = document.getElementById('sun-readout');
    el.moonRow = document.getElementById('moon-control-row');
    el.sunRow = document.getElementById('sun-control-row');
    el.phaseRow = document.getElementById('phase-control-row');
    el.phaseTicks = document.getElementById('phase-ticks');

    el.radios = Array.from(document.querySelectorAll('input[name="mode"]'));
    el.toggleAnswer = document.getElementById('toggle-answer');
    el.live = document.getElementById('live-region');
  }

  // =========================================================================
  //  ANGLE RELATIONSHIPS  (ported from Diagram.as setters + update())
  // =========================================================================
  // update(): recompute the HIDDEN quantity from the two visible ones.
  function updateDerived() {
    if (state.mode === HIDE_SUNLIGHT) {
      // _sunlightAngle = phase + moon - PI
      state.sunlightAngle = norm(state.phaseAngle + state.moonAngle - Math.PI);
    } else if (state.mode === HIDE_MOON) {
      // _moonAngle = PI + sun - phase
      state.moonAngle = norm(Math.PI + state.sunlightAngle - state.phaseAngle);
    } else if (state.mode === HIDE_MOON_APPEARANCE) {
      // _phaseAngle = PI + sun - moon
      state.phaseAngle = norm(Math.PI + state.sunlightAngle - state.moonAngle);
    }
  }

  function setMoonAngle(v) {                 // Diagram.set moonAngle
    if (state.mode === HIDE_MOON) return;
    state.moonAngle = norm(v);
    if (state.mode === SHOW_ALL) {
      state.phaseAngle = norm(Math.PI + state.sunlightAngle - state.moonAngle);
    }
    updateDerived();
  }

  function setSunlightAngle(v) {             // Diagram.set sunlightAngle
    if (state.mode === HIDE_SUNLIGHT) return;
    state.sunlightAngle = norm(v);
    if (state.mode === SHOW_ALL) {
      state.phaseAngle = norm(Math.PI + state.sunlightAngle - state.moonAngle);
    }
    updateDerived();
  }

  function setPhaseAngle(v) {                // Diagram.set phaseAngle
    if (state.mode === HIDE_MOON_APPEARANCE) return;
    state.phaseAngle = norm(v);
    if (state.mode === SHOW_ALL) {
      state.moonAngle = norm(Math.PI + state.sunlightAngle - state.phaseAngle);
    }
    updateDerived();
  }

  // =========================================================================
  //  MODES
  // =========================================================================
  function alphaTargetsFor(mode) {
    // Returns [shadow, moon, appearance] finalize targets (Diagram.finalizeMode
    // + main-timeline moonAppearanceAlphaEaser).
    if (mode === HIDE_SUNLIGHT)        return [0, 1, 1];
    if (mode === HIDE_MOON)            return [1, 0, 1];
    if (mode === HIDE_MOON_APPEARANCE) return [1, 1, 0];
    return [1, 1, 1];                  // SHOW_ALL
  }

  function instructionsFor(mode) {
    // Verbatim from Diagram.setMode (\\r -> line break); second line is the
    // always-present shift-snap hint (texts/88.txt).
    let line1;
    if (mode === HIDE_SUNLIGHT) {
      line1 = "Drag the Moon or change the Moon’s<br>phase to change the sunlight direction.";
    } else if (mode === HIDE_MOON) {
      line1 = "Drag the sunlight arrows or change the<br>Moon’s phase to move the Moon.";
    } else {
      line1 = "Drag the Moon or the sunlight arrows<br>to change the Moon’s phase.";
    }
    const line2 = "Hold the shift key while dragging to snap<br>the object to the eight primary positions.";
    return '<span class="lpq-instr-line">' + line1 + '</span>' +
           '<span class="lpq-instr-line">' + line2 + '</span>';
  }

  function setMode(mode, immediate) {
    state.mode = mode;
    updateDerived();

    const [ts, tm, ta] = alphaTargetsFor(mode);
    state.tShadow = ts; state.tMoon = tm; state.tAppearance = ta;
    if (immediate || prefersReduced()) {
      state.shadowAlpha = ts; state.moonAlpha = tm; state.appearanceAlpha = ta;
    } else {
      startTransition();
    }

    // Keep the selected canvas object valid for the new mode (its target alpha)
    const moonOK = state.tMoon > 0.5, sunOK = state.tShadow > 0.5;
    if (state.activeObject === 'moon' && !moonOK) state.activeObject = sunOK ? 'sun' : null;
    else if (state.activeObject === 'sun' && !sunOK) state.activeObject = moonOK ? 'moon' : null;

    el.instructions.innerHTML = instructionsFor(mode);
    applyControlVisibility();
    render();
  }

  function applyControlVisibility() {
    const shown = state.mode === SHOW_ALL;

    // A control/element is hidden exactly when its quantity is the unknown and
    // the answer is not currently revealed. Hiding removes it from the a11y
    // tree too, so the answer is never leaked to a screen reader.
    const sunHidden = state.selectedMode === HIDE_SUNLIGHT && !shown;
    const moonHidden = state.selectedMode === HIDE_MOON && !shown;
    const phaseHidden = state.selectedMode === HIDE_MOON_APPEARANCE && !shown;

    toggleControl(el.sunRow, el.sunSlider, sunHidden);
    toggleControl(el.moonRow, el.moonSlider, moonHidden);
    toggleControl(el.phaseRow, el.phaseSlider, phaseHidden);

    // Question bubbles overlay the canvas when the element is hidden.
    el.sunBubble.hidden = !sunHidden;
    el.moonBubble.hidden = !moonHidden;
    el.appearanceBubble.hidden = !phaseHidden;

    // Radios are disabled while the answer is shown (LunarPhaseQuizzer.setMode).
    el.radios.forEach((r) => { r.disabled = shown; });
    el.toggleAnswer.textContent = shown ? 'hide answer' : 'show answer';
  }

  function toggleControl(row, input, hidden) {
    if (hidden) {
      row.setAttribute('hidden', '');
      input.disabled = true;
    } else {
      row.removeAttribute('hidden');
      input.disabled = false;
    }
  }

  // ---- Mode transition (simple time-based cross-fade of the alpha groups) --
  let transitionRAF = null;
  let transitionStart = 0;
  let transitionFrom = null;
  function startTransition() {
    transitionFrom = {
      shadow: state.shadowAlpha, moon: state.moonAlpha, appearance: state.appearanceAlpha,
    };
    transitionStart = performance.now();
    if (transitionRAF) cancelAnimationFrame(transitionRAF);
    const step = (now) => {
      const t = Math.min(1, (now - transitionStart) / MODE_TRANSITION_MS);
      const e = t * t * (3 - 2 * t);           // smoothstep (cubic ease)
      state.shadowAlpha = transitionFrom.shadow + (state.tShadow - transitionFrom.shadow) * e;
      state.moonAlpha = transitionFrom.moon + (state.tMoon - transitionFrom.moon) * e;
      state.appearanceAlpha = transitionFrom.appearance + (state.tAppearance - transitionFrom.appearance) * e;
      render();
      if (t < 1) {
        transitionRAF = requestAnimationFrame(step);
      } else {
        transitionRAF = null;
      }
    };
    transitionRAF = requestAnimationFrame(step);
  }

  // =========================================================================
  //  PHASE DISC  (ported verbatim from PhaseDisc.as update(); dark region only)
  // =========================================================================
  function phaseDiscDarkPath(ctx, cx, cy, radius, phaseAngle) {
    const p = norm(phaseAngle);
    const sign = p < Math.PI ? -1 : 1;         // _loc2_
    const n = 4;                               // _loc3_
    const x4 = radius * Math.cos(p);           // _loc4_
    const seg = Math.PI / n;                   // _loc5_
    const half = seg / 2;                      // _loc6_
    const r7 = radius / Math.cos(half);        // _loc7_
    const x8 = x4 / Math.cos(half);            // _loc8_

    ctx.beginPath();
    ctx.moveTo(cx + 0, cy - radius);
    for (let i = 1; i <= n; i++) {
      const a = i * seg;
      const ex = radius * Math.sin(a);
      const ey = -radius * Math.cos(a);
      const ca = a - half;
      const cxp = r7 * Math.sin(ca);
      const cyp = -r7 * Math.cos(ca);
      ctx.quadraticCurveTo(cx + sign * cxp, cy + cyp, cx + sign * ex, cy + ey);
    }
    for (let i = n - 1; i >= 0; i--) {
      const a = i * seg;
      const ex = x4 * Math.sin(a);
      const ey = -radius * Math.cos(a);
      const ca = a + half;
      const cxp = x8 * Math.sin(ca);
      const cyp = -r7 * Math.cos(ca);
      ctx.quadraticCurveTo(cx + sign * cxp, cy + cyp, cx + sign * ex, cy + ey);
    }
    ctx.closePath();
  }

  // =========================================================================
  //  RENDER  (redraw everything from state)
  // =========================================================================
  const moonPhoto = new Image();
  let moonPhotoReady = false;
  moonPhoto.src = 'assets/moon.jpg';
  moonPhoto.onload = () => { moonPhotoReady = true; render(); };

  function render() {
    drawDiagram();
    drawAppearance();
    syncControls();
    updateDescriptions();
  }

  function drawDiagram() {
    const ctx = el.diagramCtx;
    const W = el.diagram.width, H = el.diagram.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // Orbit circle (code-drawn geometry)
    ctx.save();
    ctx.strokeStyle = 'rgba(200,200,200,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(EARTH.x, EARTH.y, ORBIT_R, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Sun direction unit vector on screen (y-down): (cos, -sin)
    const sunDir = { x: Math.cos(state.sunlightAngle), y: -Math.sin(state.sunlightAngle) };

    // ---- Earth (approximated globe + rotating day/night terminator) --------
    drawGlobe(ctx, EARTH.x, EARTH.y, EARTH_R, true, sunDir, state.shadowAlpha);

    // ---- Moon disc on the orbit -------------------------------------------
    const mx = EARTH.x + MOON_DISTANCE * Math.cos(state.moonAngle);
    const my = EARTH.y - MOON_DISTANCE * Math.sin(state.moonAngle);
    if (state.moonAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = state.moonAlpha;
      drawGlobe(ctx, mx, my, MOON_R, false, sunDir, state.shadowAlpha);
      ctx.restore();
    }

    // ---- Sunlight arrow cluster -------------------------------------------
    if (state.shadowAlpha > 0.01) {
      drawSunlight(ctx, state.sunlightAngle, state.shadowAlpha);
    }

    // ---- Keyboard focus indicator (matches the original focusIndicator) ----
    if (state.canvasFocused && state.activeObject) {
      ctx.save();
      ctx.strokeStyle = '#9191ff';
      ctx.lineWidth = 2;
      if (state.activeObject === 'moon' && state.moonAlpha > 0.01) {
        ctx.beginPath();
        ctx.arc(mx, my, MOON_R + 6, 0, TAU);
        ctx.stroke();
      } else if (state.activeObject === 'sun' && state.shadowAlpha > 0.01) {
        const phi = state.sunlightAngle;
        ctx.translate(EARTH.x + SUN_DISTANCE * Math.cos(phi),
                      EARTH.y - SUN_DISTANCE * Math.sin(phi));
        ctx.rotate(-phi);
        ctx.strokeRect(-40, -170, 80, 340);
      }
      ctx.restore();
    }
  }

  // Draw a lit sphere (earth or moon) with a straight day/night terminator.
  function drawGlobe(ctx, cx, cy, r, isEarth, sunDir, shadowAlpha) {
    ctx.save();
    // Base lit disc
    if (isEarth) {
      // Ocean base
      ctx.fillStyle = '#2f6aa8';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      // A few landmasses (approximation of the original earth bitmap)
      ctx.fillStyle = '#3f9b46';
      const land = [
        [-0.35, -0.30, 0.34], [0.28, -0.05, 0.30],
        [-0.10, 0.42, 0.26], [0.42, 0.40, 0.20], [-0.55, 0.20, 0.18],
      ];
      for (const [lx, ly, lr] of land) {
        ctx.beginPath();
        ctx.ellipse(cx + lx * r, cy + ly * r, lr * r, lr * r * 0.85, 0, 0, TAU);
        ctx.fill();
      }
      // Clip subsequent shading to the disc
    } else {
      ctx.fillStyle = '#d7d7d7';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }

    // Night side: dark hemisphere on the side away from the Sun.
    // Terminator is the diameter perpendicular to sunDir (top-down view).
    if (shadowAlpha > 0.01) {
      const ang = Math.atan2(sunDir.y, sunDir.x); // screen angle of the Sun
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(ang);                 // Sun now toward +x; night is -x
      ctx.globalAlpha = shadowAlpha * (isEarth ? 0.82 : 1);
      ctx.fillStyle = isEarth ? '#05121f' : '#141414';
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true); // left (night) half
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Subtle outline
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isEarth ? 'rgba(255,255,255,0.15)' : 'rgba(160,160,160,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // Cluster of 7 arrows pointing toward Earth, plus a "sunlight" label,
  // placed at radius SUN_DISTANCE and rotated to the sunlight direction.
  function drawSunlight(ctx, phi, alpha) {
    const sx = EARTH.x + SUN_DISTANCE * Math.cos(phi);
    const sy = EARTH.y - SUN_DISTANCE * Math.sin(phi);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.rotate(-phi);                  // matches AS: rotation = -phi
    ctx.strokeStyle = '#f2ea9a';
    ctx.fillStyle = '#f2ea9a';
    ctx.lineWidth = 2;
    const ys = [-144, -96, -48, 0, 48, 96, 144];
    const tail = 14, tip = -26, head = 7;    // arrow along -x_local -> toward Earth
    for (const y of ys) {
      ctx.beginPath();
      ctx.moveTo(tail, y);
      ctx.lineTo(tip, y);
      ctx.stroke();
      ctx.beginPath();                       // arrowhead
      ctx.moveTo(tip, y);
      ctx.lineTo(tip + head, y - head);
      ctx.lineTo(tip + head, y + head);
      ctx.closePath();
      ctx.fill();
    }
    // Vertical "sunlight" label (decorative; described in the a11y text)
    ctx.save();
    ctx.translate(34, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#c9de6a';
    ctx.font = '600 26px Sans-Serif, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('sunlight', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawAppearance() {
    const ctx = el.appearanceCtx;
    const W = el.appearance.width, H = el.appearance.height;
    const cx = W / 2, cy = H / 2, R = 100;   // PhaseDisc radius ~101 in source
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const a = state.appearanceAlpha;

    // Layer A: the Moon photo + PhaseDisc dark overlay (alpha = appearanceAlpha)
    if (a > 0.01) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      if (moonPhotoReady) {
        ctx.drawImage(moonPhoto, cx - R, cy - R, 2 * R, 2 * R);
      } else {
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      }
      // Dark (unlit) region, darkAlpha 0.8 over the photo (PhaseDisc.as)
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = '#000000';
      phaseDiscDarkPath(ctx, cx, cy, R, state.phaseAngle);
      ctx.fill();
      ctx.restore();
    }

    // Layer B: the "blank" dark disc shown when the phase is hidden
    // (MoonBlank.as: fill #101010, 1px stroke #606060), alpha = 1 - a
    if (a < 0.99) {
      ctx.save();
      ctx.globalAlpha = 1 - a;
      ctx.fillStyle = '#101010';
      ctx.strokeStyle = '#606060';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // =========================================================================
  //  CONTROL <-> STATE SYNC
  // =========================================================================
  const radToDeg = (r) => norm(r) * 180 / Math.PI;

  function syncControls() {
    // Moon position slider (degrees, CCW from +x)
    const moonDeg = Math.round(radToDeg(state.moonAngle)) % 360;
    setSlider(el.moonSlider, moonDeg,
      'Moon position ' + moonDeg + ' degrees around the orbit');
    el.moonReadout.textContent = moonDeg + '°';

    // Sunlight direction slider
    const sunDeg = Math.round(radToDeg(state.sunlightAngle)) % 360;
    setSlider(el.sunSlider, sunDeg,
      'Sunlight direction ' + sunDeg + ' degrees');
    el.sunReadout.textContent = sunDeg + '°';

    // Phase slider: value = PI - phaseAngle (mod TAU); expose in degrees but
    // announce the phase name + illuminated percentage (units-complete).
    const phaseValRad = norm(Math.PI - state.phaseAngle);
    const phaseDeg = Math.round(phaseValRad * 180 / Math.PI) % 360;
    const name = phaseName(state.phaseAngle);
    const illum = illumPercent(state.phaseAngle);
    setSlider(el.phaseSlider, phaseDeg,
      'Moon phase: ' + name + ', ' + illum + ' percent illuminated');
  }

  function setSlider(slider, value, valueText) {
    if (document.activeElement !== slider) {
      slider.value = String(value);
    }
    slider.setAttribute('aria-valuetext', valueText);
  }

  // =========================================================================
  //  DESCRIPTIONS + ANNOUNCEMENTS  (units always spoken)
  // =========================================================================
  // Phase name from the sim's phaseAngle. Per PhaseDisc.as (ported verbatim):
  //   phaseAngle = 0   -> fully lit  (full moon)
  //   phaseAngle = PI  -> fully dark (new moon)
  // and, from the slider's eight primary discs, increasing phaseAngle past PI
  // toward 2*PI is the waning half. See CONVERSION_NOTES.md.
  function phaseName(p) {
    p = norm(p);
    const eps = 0.02;
    if (p < eps || TAU - p < eps) return 'full moon';
    if (Math.abs(p - Math.PI) < eps) return 'new moon';
    if (Math.abs(p - Math.PI / 2) < eps) return 'first quarter';
    if (Math.abs(p - 3 * Math.PI / 2) < eps) return 'third quarter';
    if (p < Math.PI / 2) return 'waxing gibbous';   // (0, PI/2)
    if (p < Math.PI) return 'waxing crescent';      // (PI/2, PI)
    if (p < 3 * Math.PI / 2) return 'waning crescent'; // (PI, 3PI/2)
    return 'waning gibbous';                          // (3PI/2, 2PI)
  }

  // Illuminated fraction as seen from Earth: (1 + cos(phaseAngle)) / 2
  const illumPercent = (p) => Math.round((1 + Math.cos(p)) / 2 * 100);

  const COMPASS = [
    [0, 'right'], [45, 'upper right'], [90, 'top'], [135, 'upper left'],
    [180, 'left'], [225, 'lower left'], [270, 'bottom'], [315, 'lower right'],
  ];
  function compass(rad) {
    const d = radToDeg(rad);
    let best = COMPASS[0], bestDiff = 999;
    for (const c of COMPASS) {
      let diff = Math.abs(((d - c[0] + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    }
    return best[1];
  }

  function phaseDescription() {
    const name = phaseName(state.phaseAngle);
    const illum = illumPercent(state.phaseAngle);
    return name + ', ' + illum + ' percent illuminated';
  }

  function updateDescriptions() {
    const shown = state.mode === SHOW_ALL;
    const knowPhase = !(state.selectedMode === HIDE_MOON_APPEARANCE && !shown);
    const knowMoon = !(state.selectedMode === HIDE_MOON && !shown);
    const knowSun = !(state.selectedMode === HIDE_SUNLIGHT && !shown);

    const moonDeg = Math.round(radToDeg(state.moonAngle));
    const sunDeg = Math.round(radToDeg(state.sunlightAngle));

    let d = 'Top-down view of the Moon’s orbit around Earth. ';
    d += knowMoon
      ? 'The Moon is at ' + moonDeg + ' degrees around its orbit, toward the ' +
        compass(state.moonAngle) + ' of Earth. '
      : 'The Moon’s position is hidden. ';
    d += knowSun
      ? 'Sunlight comes from the ' + compass(state.sunlightAngle) + '. '
      : 'The sunlight direction is hidden. ';
    el.diagramDesc.textContent = d;

    el.appearanceDesc.textContent = knowPhase
      ? 'The Moon appears as a ' + phaseDescription() + '.'
      : 'The Moon’s phase is hidden; this is the question to answer.';
  }

  function announce(msg) {
    el.live.textContent = '';
    // Force re-announcement even if text repeats
    window.requestAnimationFrame(() => { el.live.textContent = msg; });
  }

  // =========================================================================
  //  POINTER DRAG on the diagram canvas (moon + sunlight)
  // =========================================================================
  let drag = null;   // { target:'moon'|'sun', offset:Number }

  function canvasToStage(evt) {
    const rect = el.diagram.getBoundingClientRect();
    const sx = (evt.clientX - rect.left) * (el.diagram.width / rect.width);
    const sy = (evt.clientY - rect.top) * (el.diagram.height / rect.height);
    return { x: sx, y: sy };
  }

  function angleFromStage(pt) {
    // atan2(-mouseY, mouseX) with mouse relative to Earth (matches AS source)
    return Math.atan2(-(pt.y - EARTH.y), pt.x - EARTH.x);
  }

  function hitMoon(pt) {
    if (state.moonAlpha < 0.5) return false;
    const mx = EARTH.x + MOON_DISTANCE * Math.cos(state.moonAngle);
    const my = EARTH.y - MOON_DISTANCE * Math.sin(state.moonAngle);
    return Math.hypot(pt.x - mx, pt.y - my) <= MOON_R + 10;
  }

  function hitSunlight(pt) {
    if (state.shadowAlpha < 0.5) return false;
    const phi = state.sunlightAngle;
    const sx = EARTH.x + SUN_DISTANCE * Math.cos(phi);
    const sy = EARTH.y - SUN_DISTANCE * Math.sin(phi);
    const dx = pt.x - sx, dy = pt.y - sy;
    // inverse of rotate(-phi): local = R(phi) * (global - center)
    const lx = Math.cos(phi) * dx - Math.sin(phi) * dy;
    const ly = Math.sin(phi) * dx + Math.cos(phi) * dy;
    return lx >= -40 && lx <= 40 && ly >= -170 && ly <= 170;
  }

  function onPointerDown(evt) {
    const pt = canvasToStage(evt);
    let target = null;
    if (hitMoon(pt) && !(state.selectedMode === HIDE_MOON && state.mode !== SHOW_ALL)) {
      target = 'moon';
    } else if (hitSunlight(pt) && !(state.selectedMode === HIDE_SUNLIGHT && state.mode !== SHOW_ALL)) {
      target = 'sun';
    }
    if (!target) return;
    // Dragging a hidden element is not allowed (matches mouseEnabled=false)
    if (target === 'moon' && state.mode === HIDE_MOON) return;
    if (target === 'sun' && state.mode === HIDE_SUNLIGHT) return;

    const prop = target === 'moon' ? state.moonAngle : state.sunlightAngle;
    drag = { target, offset: prop - angleFromStage(pt) };  // _angleOffset
    // Clicking an object selects it and focuses the canvas so the arrow keys
    // move it directly (matches the original focusable draggable objects).
    state.activeObject = target;
    state.canvasFocused = true;
    el.diagram.focus({ preventScroll: true });
    try { el.diagram.setPointerCapture(evt.pointerId); } catch (e) {}
    el.diagram.style.cursor = 'grabbing';
    render();
    evt.preventDefault();
  }

  function onPointerMove(evt) {
    if (!drag) {
      // hover cursor feedback
      const pt = canvasToStage(evt);
      el.diagram.style.cursor = (hitMoon(pt) || hitSunlight(pt)) ? 'grab' : 'default';
      return;
    }
    const pt = canvasToStage(evt);
    let a = angleFromStage(pt) + drag.offset;
    if (evt.shiftKey) a = SNAP * Math.round(a / SNAP);   // shift-snap to PI/4
    if (drag.target === 'moon') setMoonAngle(a);
    else setSunlightAngle(a);
    render();
    evt.preventDefault();
  }

  function onPointerUp(evt) {
    if (!drag) return;
    const t = drag.target;
    drag = null;
    try { el.diagram.releasePointerCapture(evt.pointerId); } catch (e) {}
    el.diagram.style.cursor = 'grab';
    announceAfterChange(t === 'moon' ? 'Moon' : 'Sunlight');
  }

  // ---- Canvas keyboard focus: arrow keys move the selected object ----------
  function canFocusTarget(target) {
    if (target === 'moon') return state.moonAlpha > 0.5;      // Moon is visible
    if (target === 'sun') return state.shadowAlpha > 0.5;     // sunlight is visible
    return false;
  }

  function onCanvasFocus() {
    state.canvasFocused = true;
    if (!state.activeObject || !canFocusTarget(state.activeObject)) {
      state.activeObject = canFocusTarget('moon') ? 'moon'
        : (canFocusTarget('sun') ? 'sun' : null);
    }
    render();
  }

  function onCanvasBlur() {
    state.canvasFocused = false;
    render();
  }

  function onCanvasKeydown(evt) {
    // Self-heal the selection: the canvas may have received focus without a
    // focus event (some browsers skip it for programmatic focus), or the
    // selected object may have become hidden. Pick an available object.
    if (!state.activeObject || !canFocusTarget(state.activeObject)) {
      state.activeObject = canFocusTarget('moon') ? 'moon'
        : (canFocusTarget('sun') ? 'sun' : null);
    }
    state.canvasFocused = true;
    const t = state.activeObject;
    if (!t || !canFocusTarget(t)) return;
    let dir = 0;
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') dir = -1;
    else if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') dir = 1;
    else return;
    evt.preventDefault();

    const cur = t === 'moon' ? state.moonAngle : state.sunlightAngle;
    let next;
    if (evt.shiftKey) {                       // snap to nearest primary +/- one
      next = SNAP * (Math.round(cur / SNAP) + dir);
    } else {
      next = cur + dir * INCREMENT_STEP;      // fine step (matches AS source)
    }
    if (t === 'moon') setMoonAngle(next); else setSunlightAngle(next);
    render();
  }

  function onCanvasKeyup(evt) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(evt.key) === -1) return;
    announceAfterChange(state.activeObject === 'moon' ? 'Moon' : 'Sunlight');
  }

  // =========================================================================
  //  NATIVE SLIDERS (keyboard + pointer, cyclic wrap on arrow keys)
  // =========================================================================
  function onMoonSliderInput() {
    setMoonAngle(Number(el.moonSlider.value) * Math.PI / 180);
    render();
  }
  function onSunSliderInput() {
    setSunlightAngle(Number(el.sunSlider.value) * Math.PI / 180);
    render();
  }
  function onPhaseSliderInput() {
    // value(deg) -> value(rad); phaseAngle = PI - value
    setPhaseAngle(Math.PI - Number(el.phaseSlider.value) * Math.PI / 180);
    render();
  }

  // Cyclic wrap: Left at min -> max, Right at max -> min (angles are cyclic)
  function wrapKeydown(slider, onInput) {
    return function (evt) {
      const min = Number(slider.min), max = Number(slider.max);
      const v = Number(slider.value);
      if ((evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') && v <= min) {
        slider.value = String(max); onInput(); evt.preventDefault();
      } else if ((evt.key === 'ArrowRight' || evt.key === 'ArrowUp') && v >= max) {
        slider.value = String(min); onInput(); evt.preventDefault();
      }
    };
  }

  // =========================================================================
  //  MODE CHANGES / SHOW ANSWER / RESET
  // =========================================================================
  function onModeChanged(evt) {
    state.selectedMode = evt.target.value;
    setMode(state.selectedMode);
    announceModeChange();
  }

  function onToggleAnswer() {
    if (state.mode === SHOW_ALL) {
      setMode(state.selectedMode);
      announce('Answer hidden. ' + questionPrompt());
    } else {
      setMode(SHOW_ALL);
      announce('Answer shown. ' + answerText());
    }
  }

  function questionPrompt() {
    if (state.selectedMode === HIDE_SUNLIGHT) return 'Where is the Sun?';
    if (state.selectedMode === HIDE_MOON) return 'Where is the Moon?';
    return 'What is the Moon’s phase?';
  }

  function answerText() {
    if (state.selectedMode === HIDE_SUNLIGHT) {
      return 'Sunlight comes from the ' + compass(state.sunlightAngle) +
        ', at ' + Math.round(radToDeg(state.sunlightAngle)) + ' degrees.';
    }
    if (state.selectedMode === HIDE_MOON) {
      return 'The Moon is toward the ' + compass(state.moonAngle) +
        ' of Earth, at ' + Math.round(radToDeg(state.moonAngle)) + ' degrees around its orbit.';
    }
    return 'The Moon’s phase is ' + phaseDescription() + '.';
  }

  function announceModeChange() {
    announce(questionPrompt() + ' Set the other properties, then choose show answer.');
  }

  function announceAfterChange(whatMoved) {
    // Announce on commit (not every tick), with units + the pedagogical payoff.
    const parts = [];
    if (whatMoved === 'Moon') {
      parts.push('Moon position ' + Math.round(radToDeg(state.moonAngle)) + ' degrees');
    } else if (whatMoved === 'Sunlight') {
      parts.push('Sunlight direction ' + Math.round(radToDeg(state.sunlightAngle)) + ' degrees');
    } else if (whatMoved === 'Phase') {
      parts.push('Moon phase ' + phaseDescription());
    }
    // Include the derived (revealed) quantity only when it is not the hidden answer.
    const shown = state.mode === SHOW_ALL;
    if (!(state.selectedMode === HIDE_MOON_APPEARANCE && !shown) && whatMoved !== 'Phase') {
      parts.push('phase now ' + phaseDescription());
    }
    announce(parts.join('. ') + '.');
  }

  function reset() {
    // Ported from LunarPhaseQuizzer_1.reset()
    el.radios.forEach((r) => { r.checked = (r.value === HIDE_MOON_APPEARANCE); });
    state.selectedMode = HIDE_MOON_APPEARANCE;
    state.moonAngle = Math.PI / 4;
    state.sunlightAngle = Math.PI;
    setMode(HIDE_MOON_APPEARANCE, true);   // immediate (noTransition = true)
    // set angles AFTER mode (matches reset order); recompute derived phase
    setMoonAngle(Math.PI / 4);
    setSunlightAngle(Math.PI);
    render();
    announce('Simulation reset. ' + questionPrompt());
  }

  // =========================================================================
  //  PHASE TICK DISCS (decorative eight-phase strip under the phase slider)
  // =========================================================================
  function buildPhaseTicks() {
    // Eight primary phases; i-th disc uses phaseAngle = PI - i/8 * TAU
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const ctx = c.getContext('2d');
      const R = 14;
      ctx.fillStyle = '#b8b8b8';
      ctx.beginPath(); ctx.arc(16, 16, R, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000000';
      phaseDiscDarkPath(ctx, 16, 16, R, Math.PI - i / 8 * TAU);
      ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(16, 16, R, 0, TAU); ctx.stroke();
      el.phaseTicks.appendChild(c);
    }
  }

  // =========================================================================
  //  WIRE UP
  // =========================================================================
  function init() {
    cacheDom();
    buildPhaseTicks();

    // Pointer drag on the diagram
    el.diagram.addEventListener('pointerdown', onPointerDown);
    el.diagram.addEventListener('pointermove', onPointerMove);
    el.diagram.addEventListener('pointerup', onPointerUp);
    el.diagram.addEventListener('pointercancel', onPointerUp);
    el.diagram.addEventListener('focus', onCanvasFocus);
    el.diagram.addEventListener('blur', onCanvasBlur);
    el.diagram.addEventListener('keydown', onCanvasKeydown);
    el.diagram.addEventListener('keyup', onCanvasKeyup);

    // Sliders
    el.moonSlider.addEventListener('input', onMoonSliderInput);
    el.moonSlider.addEventListener('keydown', wrapKeydown(el.moonSlider, onMoonSliderInput));
    el.moonSlider.addEventListener('change', () => announceAfterChange('Moon'));
    el.sunSlider.addEventListener('input', onSunSliderInput);
    el.sunSlider.addEventListener('keydown', wrapKeydown(el.sunSlider, onSunSliderInput));
    el.sunSlider.addEventListener('change', () => announceAfterChange('Sunlight'));
    el.phaseSlider.addEventListener('input', onPhaseSliderInput);
    el.phaseSlider.addEventListener('keydown', wrapKeydown(el.phaseSlider, onPhaseSliderInput));
    el.phaseSlider.addEventListener('change', () => announceAfterChange('Phase'));

    // Mode radios + show/hide answer
    el.radios.forEach((r) => r.addEventListener('change', onModeChanged));
    el.toggleAnswer.addEventListener('click', onToggleAnswer);

    // Masthead Reset (bubbling, composed CustomEvent)
    document.addEventListener('sim-reset', reset);

    // React to reduced-motion changes (snap to targets)
    if (window.matchMedia) {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        state.shadowAlpha = state.tShadow;
        state.moonAlpha = state.tMoon;
        state.appearanceAlpha = state.tAppearance;
        render();
      });
    }

    // Initial state = reset state
    reset();
  }

  // The kl-unl.js "klunlInitEqn" is meant to be redefined per-sim to init
  // components on load. This sim shows no mathematical notation, so no MathJax
  // equations are created; we simply use the hook to boot the simulation.
  window.klunlInitEqn = function () { init(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof klunlInitEqn === 'function') klunlInitEqn();
    });
  } else {
    if (typeof klunlInitEqn === 'function') klunlInitEqn();
  }
})();
