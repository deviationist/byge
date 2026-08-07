/* byge — foundation.
 *
 * One file here for the design prototype's sake (helmet scripts load in one
 * request). In the app this is three modules:
 *   foundation/palette.js   BANDS, NO_DATA, NOTICEABLE      (mirrors scale.py)
 *   foundation/verdict.js   spells(), verdict(), describe()  (mirrors forecast.py)
 *   foundation/fixtures.js  the design fixtures below
 *
 * Every number a component prints is DERIVED from a frames array here. Nothing
 * is hardcoded copy sitting beside its data.
 */
(function () {
  'use strict';

  /* ---------------------------------------------- palette (mirrors scale.py) */
  /* LIGHT is yr's fitted values, unchanged, and is strictly monotonic downward
     (0.833 -> 0.140): darker means more intense.
     DARK inverts that rule -- luminance RISES with intensity -- because on black
     the pale bands out-shout the heavy ones and the scale silently reverses.
     Band 6 dark was #C77BD6 (lum 0.571), which DIPPED 0.144 below heavy rain and
     reintroduced that inversion at the top of the scale. Now #E8BCF4 (0.790,
     +0.074 over band 5). The ~288 deg purple is kept as a categorical marker for
     "this is a different kind of weather" -- but hue is the SECOND signal, never
     the only one: it is the signal a colour-blind reader may not receive, on the
     band where being noticed matters most. Both ramps are monotonic across all
     six bands; assert that, not bands 1-5.
     Deliver as EXPLICIT VALUES. These are read from JS to fill canvas, SVG and
     inline styles, so no class-name scan can find them and any usage-based
     tree-shake will drop live bands. */
  var BANDS = [
    { i: 1, floor: 0.03,  light: '#91E4FF', dark: '#1F4A5A', label: 'trace',          feels: 'barely detectable',    range: '0.03–0.055' },
    { i: 2, floor: 0.055, light: '#5ED7FF', dark: '#2A6B82', label: 'drizzle',        feels: 'mist on your glasses', range: '0.055–0.195' },
    { i: 3, floor: 0.195, light: '#00AAFF', dark: '#3A9BC4', label: 'light rain',     feels: 'umbrella optional',    range: '0.195–1' },
    { i: 4, floor: 1,     light: '#0080FF', dark: '#55AEF5', label: 'moderate rain',  feels: "you'll want a jacket", range: '1–5.7' },
    { i: 5, floor: 5.7,   light: '#0055FF', dark: '#7EC0FF', label: 'heavy rain',     feels: 'soaked in minutes',    range: '5.7–23.7' },
    { i: 6, floor: 23.7,  light: '#7A0087', dark: '#E8BCF4', label: 'torrential',     feels: 'seek shelter',         range: '23.7+' }
  ];
  // Never folded into BANDS: "we cannot see here" is not an intensity.
  var NO_DATA = { light: '#FFFFFF', dark: '#2A2E31' };
  /* CSS DEPENDENCY -- repeating-linear-gradient (web only). LOAD-BEARING.
     React Native has no backgroundImage, so this must be composed from rotated
     views on native. Both renderings derive from these numbers, never from the
     gradient string: 45 deg, 1.5 px stroke, 5 px period, grey at .42 alpha.
     A flat pale square instead would read as a band or as dry -- the two things
     "not observed" must never be mistaken for. */
  var HATCH_GEOMETRY = { angle: 45, stroke: 1.5, period: 5, color: 'rgba(128,128,128,.42)' };
  var HATCH = 'repeating-linear-gradient(' + HATCH_GEOMETRY.angle + 'deg,' + HATCH_GEOMETRY.color +
    ' 0 ' + HATCH_GEOMETRY.stroke + 'px,transparent ' + HATCH_GEOMETRY.stroke + 'px ' + HATCH_GEOMETRY.period + 'px)';
  var NOTICEABLE = 0.195;   // band 3 — the first level a person notices
  var HORIZON = 115;
  var STEP = 5;
  var BRIDGE_FRAMES = 2;    // dry gaps ≤10 min are drizzle flicker, not an end

  function bandOf(rate) { var hit = null; for (var i = 0; i < BANDS.length; i++) if (rate >= BANDS[i].floor) hit = BANDS[i]; return hit; }
  function colorOf(rate, theme) { var b = bandOf(rate); if (!b) return 'var(--dry)'; return theme === 'dark' ? b.dark : b.light; }
  function noData(theme) { return theme === 'dark' ? NO_DATA.dark : NO_DATA.light; }

  /* ------------------------------------------- spells (mirrors forecast.py) */
  // end_min is the FIRST OBSERVED DRY FRAME, not the last wet one: each frame
  // stands for the five minutes after it, so we never claim rain stopped
  // earlier than we saw it stop.
  function spells(frames) {
    var wet = frames.map(function (f) { return f.rate >= NOTICEABLE; });
    var runs = [], i = 0;
    while (i < wet.length) {
      if (!wet[i]) { i++; continue; }
      var a = i; while (i < wet.length && wet[i]) i++;
      runs.push([a, i - 1]);
    }
    var merged = [];
    runs.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && (r[0] - last[1] - 1) <= BRIDGE_FRAMES) last[1] = r[1];
      else merged.push(r.slice());
    });
    return merged.map(function (r) {
      var open = r[1] === frames.length - 1;
      var rates = frames.slice(r[0], r[1] + 1).map(function (f) { return f.rate; });
      return {
        start_min: r[0] * STEP,
        end_min: open ? null : (r[1] + 1) * STEP,
        open: open,
        peak_rate: Math.max.apply(null, rates),
        mean_rate: rates.reduce(function (s, x) { return s + x; }, 0) / rates.length,
        // an open spell's duration is a LOWER BOUND, never a measurement
        duration: open ? (HORIZON - r[0] * STEP) : ((r[1] + 1) * STEP - r[0] * STEP)
      };
    });
  }

  function byLead(min) { return min <= 30 ? 'high' : min <= 70 ? 'moderate' : 'low'; }

  /* Confidence describes the weakest link in what we are ASSERTING.
     Observations are certain; only forecast leads decay. (FEEDBACK-01 §1) */
  function verdict(fx) {
    var frames = fx.frames;
    var obs = frames.reduce(function (s, f) { return s + f.observed; }, 0) / frames.length;
    var blind = obs === 0;
    var sp = blind ? [] : spells(frames);
    var centreWet = frames[0].centre >= NOTICEABLE;
    var discWet = frames[0].rate >= NOTICEABLE;
    var raining = !blind && discWet;
    var current = raining ? sp[0] : null;
    var next = raining ? (sp[1] || null) : (sp[0] || null);
    var conf = blind ? null
      : raining ? (current.open ? 'high' : byLead(current.end_min))
      : next ? byLead(next.start_min) : 'high';
    return {
      raining_now: raining, now_rate: frames[0].rate, centre_rate: frames[0].centre,
      edge_only: raining && !centreWet, nearest_km: fx.nearest_km || null,
      current: current, next: next, spells: sp,
      lead_min: next ? next.start_min : 0,
      confidence: conf, horizon_min: HORIZON,
      observed: obs, blind: blind, partial: obs > 0 && obs < 1,
      analysis_age_min: fx.age, radius_km: fx.radius, frames: frames,
      peak_rate: blind ? 0 : Math.max.apply(null, frames.map(function (f) { return f.rate; }))
    };
  }

  /* ------------------------------------------------------------------ copy */
  var BASE_MIN = 17 * 60 + 50;   // fixtures' "now" = 17:50
  function clock(offset) {
    var t = BASE_MIN + offset, h = Math.floor(t / 60) % 24, m = t % 60;
    return h + ':' + (m < 10 ? '0' + m : m);
  }
  function about(min) { return 'about ' + min + '\u00A0min'; }   // nbsp: never orphan the unit

  /* Returns the pieces LocationStatusText renders. bound !== '' is the signal
     that a duration is a lower bound and must not be printed as a number. */
  function describe(v, place) {
    // CLOCK CONVENTION (round 3): relative time is PRIMARY -- it is what a person
  // acts on over a two-hour horizon -- and the clock is SECONDARY, because it is
  // what they plan around. Never either/or, and never the clock alone.
  // An open-ended spell has NO clock, and that absence is load-bearing: it is a
  // fifth redundant signal that we cannot name an end. Do not synthesise one.
  var o = { lead: '', bodyA: '', bound: '', bodyC: '', second: '', secondBound: '', secondC: '', secondClock: '', note: '', clock: '' };
    if (v.blind) {
      o.lead = 'No radar here.';
      o.bodyA = (place || 'This place') + ' sits outside the Nordic radar mosaic.';
      o.note = 'This is not “dry”. We have no observation at all for this coordinate — so byge makes no claim. Dry means we looked, and saw nothing falling.';
      return o;
    }
    var c = v.current, n = v.next;
    if (v.raining_now) {
      o.lead = v.edge_only ? 'Rain within ' + v.nearest_km + ' km.' : 'Raining.';
      if (v.edge_only) o.bodyA = 'Not on you yet — the wet edge of your ' + v.radius_km + ' km circle. ';
      if (c.open) {
        o.bound = 'No end in sight';
        o.bodyC = ' within the next 2 hours.';
        o.note = 'Still raining in the last frame we have. The spell outlives our ' + v.horizon_min + '-minute horizon, so we cannot tell you when it stops — only that it has not by then.';
      } else {
        o.bodyA += (n ? 'Eases in ' : 'Stops in ') + about(c.end_min) + '.';
        o.clock = 'stops around ' + clock(c.end_min);
      }
    } else if (n) {
      o.lead = 'Dry.';
      if (n.open) {
        o.bodyA = 'Rain in ' + about(n.start_min) + ', lasting ';
        o.bound = 'at least ' + n.duration + '\u00A0min';
        o.bodyC = '.';
        o.note = n.duration + ' min is a floor, not a forecast: the band is still overhead when our 2-hour view ends. It could be twice that.';
      } else {
        o.bodyA = 'Rain in ' + about(n.start_min) + ', lasting ' + about(n.duration) + '.';
        o.clock = clock(n.start_min) + '–' + clock(n.end_min);
      }
    } else {
      o.lead = 'Dry.';
      o.bodyA = 'Nothing approaching.';
      // §1: confidence is high on the observation, so the prose must carry the
      // decay of the forecast half of the claim.
      o.note = 'Certain for the next half hour — the field is clear and we can see it. Past that the window is indicative only: this forecast slides today’s rain along, it cannot see showers that have not formed yet.';
    }
    // A second spell gets a secondary line, never equal billing (§3): the first
    // spell is what you act on. But the gap must not be invisible — "it'll clear
    // at six" is exactly the sentence someone plans around.
    var s = v.spells[1];
    if (s) {
      o.second = 'Then more in ' + about(s.start_min);
      if (s.open) { o.secondBound = ', no end in sight'; o.secondC = '.'; }
      else { o.secondC = ', ' + about(s.duration) + '.'; }
      o.secondClock = s.open ? 'from ' + clock(s.start_min)
        : clock(s.start_min) + '\u2013' + clock(s.end_min);
      o.gap = s.start_min - (v.raining_now ? v.current.end_min : n.end_min);
    }
    return o;
  }

  function statusLine(v) {
    if (v.blind) return 'No radar coverage — we cannot see here';
    var c = v.current, n = v.next, s = v.spells[1];
    var tail = s ? ' · then more +' + s.start_min : '';
    if (v.raining_now && v.edge_only) return 'Rain within ' + v.nearest_km + ' km · not on you yet' + tail;
    if (v.raining_now && c.open) return 'Raining · no end in sight';
    if (v.raining_now) return 'Raining · ' + (s ? 'eases' : 'stops') + ' in about ' + c.end_min + ' min' + tail;
    if (n && n.open) return 'Dry · rain in about ' + n.start_min + ' min, at least ' + n.duration + ' min →';
    if (n) return 'Dry · rain in about ' + n.start_min + ' min, ' + n.duration + ' min' + tail;
    return 'Dry · nothing approaching';
  }

  /* -------------------------------------------------------------- fixtures */
  // coverage = share of the circle under rain (expressive, no longer a gate)
  function F(rates, opts) {
    opts = opts || {};
    return rates.map(function (r, i) {
      var cov = opts.cov ? opts.cov[i] : (r < NOTICEABLE ? 0 : Math.min(1, 0.28 + r * 0.14));
      return {
        minutes: i * STEP, rate: r,
        centre: opts.centre ? opts.centre[i] : r,
        coverage: cov,
        observed: opts.observed === undefined ? 1 : opts.observed
      };
    });
  }
  var Z = function (n) { var a = []; while (a.length < n) a.push(0.02); return a; };

  var FIXTURES = {
    s1: { state: 1, tag: 'raining · end visible', name: 'Home', place: 'Grünerløkka, Oslo', coords: '59.9273, 10.7607', radius: 3, age: 7,
          frames: F([6.0, 5.6, 5.0, 4.1, 2.7, 0.12].concat(Z(18))) },
    s2: { state: 2, tag: 'raining · no end in sight', name: 'Cabin', place: 'Hemsedal', coords: '60.8620, 8.5560', radius: 3, age: 4,
          frames: F([2.4, 2.8, 3.1, 2.6, 2.2, 2.9, 3.4, 3.0, 2.5, 2.1, 2.6, 3.2, 3.6, 3.1, 2.7, 2.4, 2.9, 3.3, 2.8, 2.5, 2.2, 2.6, 3.0, 2.8]) },
    s3: { state: 3, tag: 'dry · rain coming, end visible', name: 'Work', place: 'Skøyen, Oslo', coords: '59.9220, 10.6790', radius: 3, age: 6,
          frames: F(Z(8).concat([0.8, 2.4, 3.1, 1.6, 0.9], Z(11))) },
    s4: { state: 4, tag: 'dry · rain coming, open-ended', name: 'Studio', place: 'Møhlenpris, Bergen', coords: '60.3830, 5.3260', radius: 3, age: 9,
          frames: F(Z(8).concat([0.9, 2.2, 3.4, 2.8, 3.1, 2.6, 3.5, 4.1, 3.8, 3.2, 2.9, 3.4, 3.0, 2.7, 3.1, 2.8])) },
    s5: { state: 5, tag: 'dry · nothing approaching', name: 'Mum & Dad', place: 'Ålesund', coords: '62.4720, 6.1550', radius: 3, age: 3,
          frames: F(Z(15).concat([0.04, 0.045, 0.038], Z(6))) },
    s6: { state: 6, tag: 'blind · outside radar coverage', name: 'Longyearbyen', place: 'Svalbard', coords: '78.2230, 15.6270', radius: 3, age: 5,
          frames: F(Z(24), { observed: 0 }) },
    s8: { state: 8, tag: 'raining · eases, then a second band', name: 'Boathouse', place: 'Hitra, Trøndelag', coords: '63.5560, 8.7980', radius: 3, age: 6,
          frames: F([3.2, 3.6, 4.1, 3.8, 4.4, 4.0, 3.5, 3.0, 2.4, 1.8, 1.2, 0.7, 0.5, 0.4, 0.3, 0.24, 0.21, 0.08, 0.04, 0.05, 0.9, 1.8, 2.6, 3.1],
            { cov: [0.81, 0.83, 0.86, 0.87, 0.87, 0.84, 0.78, 0.70, 0.61, 0.52, 0.44, 0.38, 0.32, 0.26, 0.20, 0.14, 0.09, 0.06, 0.03, 0.04, 0.16, 0.28, 0.41, 0.53] }) },
    s9: { state: 9, tag: 'dry · rain, a clear gap, then more', name: 'Allotment', place: 'Sandnes, Rogaland', coords: '58.8520, 5.7350', radius: 3, age: 8,
          frames: F(Z(8).concat([0.9, 2.4, 3.1, 1.6, 0.9, 0.1, 0.05, 0.04, 0.8, 1.9, 2.2, 1.4, 0.6, 0.15, 0.05, 0.04])) },
    partial: { state: 10, tag: 'partially observed · straddles the mosaic edge', name: 'Harbour', place: 'Værøy, Lofoten', coords: '67.6580, 12.6720', radius: 15, age: 5,
          frames: F(Z(6).concat([0.7, 2.1, 2.8, 2.2, 1.1, 0.6], Z(12)), { observed: 0.6 }) },
    edge: { state: 11, tag: 'wet edge · rain inside the circle, not on you', name: 'Valley watch', place: 'Sjusjøen, Innlandet', coords: '61.2100, 10.7900', radius: 15, age: 4, nearest_km: 8,
          frames: F([2.4, 2.6, 3.0, 2.8, 2.4, 2.0, 1.6, 1.1, 0.7, 0.4, 0.22, 0.1].concat(Z(12)),
            { centre: [0.03, 0.04, 0.06, 0.12, 0.4, 1.2, 2.1, 1.8, 1.2, 0.6, 0.2, 0.08].concat(Z(12)),
              cov: [0.12, 0.15, 0.19, 0.24, 0.31, 0.38, 0.34, 0.27, 0.19, 0.12, 0.06, 0.03].concat(Z(12).map(function () { return 0; })) }) }
  };
  var ORDER = ['s1', 's2', 's3', 's4', 's5', 's8', 's9', 'partial', 'edge', 's6'];
  var LIST = ['s1', 's3', 's8', 's2', 's5', 's6'];   // the saved-places list

  window.BYGE = {
    BANDS: BANDS, NO_DATA: NO_DATA, HATCH: HATCH, HATCH_GEOMETRY: HATCH_GEOMETRY, NOTICEABLE: NOTICEABLE, HORIZON: HORIZON, STEP: STEP,
    bandOf: bandOf, colorOf: colorOf, noData: noData,
    spells: spells, verdict: verdict, describe: describe, statusLine: statusLine, clock: clock,
    FIXTURES: FIXTURES, ORDER: ORDER, LIST: LIST,
    of: function (key) { return verdict(FIXTURES[key]); }
  };
})();
