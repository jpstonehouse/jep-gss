// =============================================================
// JEP GSS — Main Application
// =============================================================

// ── SERVICE WORKER REGISTRATION ──────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => console.log('[SW] Registered:', reg.scope))
    .catch((err) => console.warn('[SW] Registration failed:', err));
}

// =============================================================
// STATE
// Central app state — all mutations go through setState().
// Persisted to localStorage on every change.
// =============================================================

/**
 * @typedef {Object} Shot
 * @property {number}  id        - Shot index on the hole (1-based)
 * @property {string}  club      - Club code e.g. "7I", "D", "P"
 * @property {string}  rating    - JEP rating symbol: "!", "++", "+", "-", "--", "#", "OB", "L"
 * @property {number}  ratingVal - Numeric value of the rating
 * @property {number|null} lat   - GPS latitude at point of shot (nullable)
 * @property {number|null} lng   - GPS longitude at point of shot (nullable)
 */

/**
 * @typedef {Object} HoleData
 * @property {number}   holeNumber
 * @property {number}   par
 * @property {Shot[]}   shots
 * @property {number}   putts
 * @property {boolean}  complete
 */

/**
 * @typedef {Object} AppState
 * @property {string|null}  courseName
 * @property {number}       totalHoles   - 9 or 18
 * @property {HoleData[]}   holes        - Array of hole data, index 0 = hole 1
 * @property {number}       currentHole  - 1-based index of the hole being played
 * @property {string}       activeScreen - 'course' | 'hole-view' | 'hole-map' | 'scorecard'
 * @property {Object|null}  gpsPosition  - Last known GPS position {lat, lng, accuracy}
 */

const DEFAULT_PARS = [4,4,3,4,5,3,4,5,4, 4,3,5,4,4,3,5,4,4]; // generic 18-hole par layout

// =============================================================
// MOCK COURSE — Pebble Beach Golf Links
// Used for desktop testing when GPS is unavailable (no HTTPS).
// Pars are real. GPS coordinates are approximate/fake but
// geographically plausible for the Monterey Peninsula.
// =============================================================

const MOCK_COURSE = {
  name: 'Pebble Beach Golf Links (Mock)',
  totalHoles: 18,

  // Center of Pebble Beach: 36.5685° N, 121.9498° W
  // Holes laid out clockwise along the coastline.
  // Each entry: { par, yardage, tee: [lat, lng], green: [lat, lng] }
  holes: [
    { par: 4, yardage: 380,  tee: [36.5693, -121.9510], green: [36.5678, -121.9495] },
    { par: 5, yardage: 502,  tee: [36.5677, -121.9492], green: [36.5660, -121.9478] },
    { par: 4, yardage: 390,  tee: [36.5659, -121.9475], green: [36.5645, -121.9460] },
    { par: 4, yardage: 331,  tee: [36.5644, -121.9458], green: [36.5632, -121.9444] },
    { par: 3, yardage: 188,  tee: [36.5630, -121.9440], green: [36.5621, -121.9429] },
    { par: 5, yardage: 516,  tee: [36.5620, -121.9426], green: [36.5602, -121.9448] },
    { par: 3, yardage: 106,  tee: [36.5600, -121.9452], green: [36.5595, -121.9460] },
    { par: 4, yardage: 418,  tee: [36.5593, -121.9463], green: [36.5607, -121.9478] },
    { par: 4, yardage: 464,  tee: [36.5608, -121.9480], green: [36.5623, -121.9494] },
    { par: 4, yardage: 446,  tee: [36.5625, -121.9497], green: [36.5638, -121.9513] },
    { par: 4, yardage: 380,  tee: [36.5640, -121.9515], green: [36.5652, -121.9528] },
    { par: 3, yardage: 202,  tee: [36.5654, -121.9530], green: [36.5663, -121.9542] },
    { par: 4, yardage: 399,  tee: [36.5665, -121.9544], green: [36.5677, -121.9556] },
    { par: 5, yardage: 573,  tee: [36.5679, -121.9558], green: [36.5695, -121.9540] },
    { par: 4, yardage: 397,  tee: [36.5697, -121.9538], green: [36.5710, -121.9523] },
    { par: 4, yardage: 402,  tee: [36.5712, -121.9520], green: [36.5722, -121.9506] },
    { par: 3, yardage: 178,  tee: [36.5724, -121.9503], green: [36.5713, -121.9492] },
    { par: 5, yardage: 543,  tee: [36.5711, -121.9489], green: [36.5697, -121.9508] },
  ],

  // Mock GPS position = standing on the 1st tee
  mockPosition: { lat: 36.5693, lng: -121.9510, accuracy: 8 },
};

/**
 * Load the mock Pebble Beach course and start a round.
 * Sets realistic GPS position and pre-fills all hole pars/yardages.
 */
function loadMockCourse() {
  const holes = MOCK_COURSE.holes.map((h, i) => ({
    holeNumber: i + 1,
    par:        h.par,
    yardage:    h.yardage,
    tee:        { lat: h.tee[0],   lng: h.tee[1]   },
    green:      { lat: h.green[0], lng: h.green[1] },
    shots:      [],
    onGreen:    false,
    complete:   false,
  }));

  setState({
    courseName:   MOCK_COURSE.name,
    totalHoles:   MOCK_COURSE.totalHoles,
    holes,
    currentHole:  1,
    gpsPosition:  MOCK_COURSE.mockPosition,
    activeScreen: 'hole-view',
    mockMode:     true,
  });

  // Simulate GPS active indicator
  updateGPSStatus('active');
}

/** @type {AppState} */
const state = {
  courseName: null,
  totalHoles: 18,
  holes: [],
  currentHole: 1,
  activeScreen: 'course',
  gpsPosition: null,
  pendingClub: null,   // club selected but not yet rated; cleared after each shot
  mockMode: false,
};

// =============================================================
// JEP RATING SYSTEM
// =============================================================

/**
 * JEP Rating values map.
 * Higher is better — these are ADDED to the GSS score.
 */
const JEP_RATINGS = {
  '!':  3,   // Phenomenal
  '++': 2,   // Excellent
  '+':  1,   // Good
  '-':  0,   // OK (baseline)
  '--': -1,  // Bad
  '#':  -2,  // Chunker
  'OB': -3,  // Out of bounds
  'L':  -3,  // Lost ball
};

/**
 * Calculate the Rating for a hole = sum of all JEP shot ratings.
 * This is the only scoring metric. No par, no strokes, no putt factor.
 *
 * Example: shots rated ++, +, and a putt rated + → 2 + 1 + 1 = +4 Rating
 *
 * @param {HoleData} hole
 * @returns {number}
 */
function calcRating(hole) {
  return hole.shots.reduce((sum, s) => sum + s.ratingVal, 0);
}

/**
 * Calculate the stroke count for a hole, including penalty strokes.
 * OB and L each add 1 extra stroke (stroke-and-distance penalty) on top of
 * the shot itself, so a single OB shot costs 2 strokes in the total.
 *
 * @param {HoleData} hole
 * @returns {number}
 */
function calcStrokes(hole) {
  const penalties = hole.shots.filter(s => s.rating === 'OB' || s.rating === 'L').length;
  return hole.shots.length + penalties;
}

/** Returns true if a shot carries a penalty stroke. */
function isPenaltyShot(shot) {
  return shot.rating === 'OB' || shot.rating === 'L';
}

/** Format a rating number as "+4", "-2", or "0". */
function fmtRating(n) {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Get a human-readable label for a JEP rating symbol.
 * @param {string} rating
 * @returns {string}
 */
function ratingLabel(rating) {
  const labels = {
    '!':  'Phenomenal',
    '++': 'Excellent',
    '+':  'Good',
    '-':  'OK',
    '--': 'Bad',
    '#':  'Chunker',
    'OB': 'Out of Bounds',
    'L':  'Lost Ball',
  };
  return labels[rating] ?? rating;
}

// =============================================================
// STATE MANAGEMENT
// =============================================================

/**
 * Merge updates into app state and persist to localStorage.
 * @param {Partial<AppState>} updates
 */
function setState(updates) {
  Object.assign(state, updates);
  persist();
  render();
}

/** Serialize state to localStorage. */
function persist() {
  try {
    localStorage.setItem('jep-gss-state', JSON.stringify(state));
  } catch (e) {
    console.warn('[GSS] Could not persist state:', e);
  }
}

/** Load state from localStorage on app start. */
function loadPersistedState() {
  try {
    const raw = localStorage.getItem('jep-gss-state');
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(state, saved);
    }
  } catch (e) {
    console.warn('[GSS] Could not load persisted state:', e);
  }
}

// =============================================================
// HOLE MANAGEMENT
// =============================================================

/**
 * Initialize the holes array for a new round.
 * Pars default to DEFAULT_PARS; can be overridden later.
 * @param {number} totalHoles
 */
function initHoles(totalHoles) {
  const holes = [];
  for (let i = 0; i < totalHoles; i++) {
    holes.push({
      holeNumber: i + 1,
      par: DEFAULT_PARS[i] ?? 4,
      shots: [],
      onGreen: false,   // unlocked when golfer taps "On the Green"
      complete: false,
    });
  }
  return holes;
}

/** Get the HoleData object for the current hole (1-based). */
function currentHoleData() {
  return state.holes[state.currentHole - 1] ?? null;
}

/**
 * Select a club as the pending club for the next shot.
 * JEP rating buttons become active only after this is called.
 * @param {string} club  e.g. "D", "7I", "P"
 */
function selectClub(club) {
  setState({ pendingClub: club });
}

/**
 * Add a shot to the current hole using the pending club + given rating.
 * Clears pendingClub after logging so the golfer must re-select for the next shot.
 * @param {string} rating  JEP rating symbol
 */
function addShot(rating) {
  const hole = currentHoleData();
  if (!hole || !state.pendingClub) return;

  const shot = {
    id: hole.shots.length + 1,
    club: state.pendingClub,
    rating,
    ratingVal: JEP_RATINGS[rating] ?? 0,
    lat: state.gpsPosition?.lat ?? null,
    lng: state.gpsPosition?.lng ?? null,
  };

  hole.shots.push(shot);
  setState({ pendingClub: null }); // must re-select club for next shot
}

/**
 * Remove the last shot from the current hole.
 * Also re-locks the Putter if the undo removes all putter shots and onGreen
 * was set by putter use (not by explicit "On the Green" button).
 */
function undoLastShot() {
  const hole = currentHoleData();
  if (!hole || hole.shots.length === 0) return;
  hole.shots.pop();
  setState({ pendingClub: null });
}

/**
 * Mark the hole as "on the green", unlocking the Putter club.
 */
function setOnGreen() {
  const hole = currentHoleData();
  if (!hole) return;
  hole.onGreen = true;
  setState({ pendingClub: null }); // reset any pending club
}

/**
 * Mark the current hole as complete and advance to the next.
 */
function finishHole() {
  const hole = currentHoleData();
  if (!hole) return;

  hole.complete = true;

  if (state.currentHole < state.totalHoles) {
    setState({ currentHole: state.currentHole + 1, pendingClub: null });
  } else {
    setState({ pendingClub: null });
    navigateTo('scorecard');
  }
}

// =============================================================
// NAVIGATION
// =============================================================

/**
 * Navigate to a named screen.
 * @param {'course'|'hole-view'|'hole-map'|'scorecard'} screen
 */
function navigateTo(screen) {
  setState({ activeScreen: screen });
}

// =============================================================
// GPS
// =============================================================

/**
 * Request GPS permission and start watching position.
 * Updates state.gpsPosition on each fix.
 */
function startGPS() {
  if (!('geolocation' in navigator)) {
    updateGPSStatus('unavailable');
    return;
  }

  updateGPSStatus('locating');

  navigator.geolocation.watchPosition(
    (pos) => {
      const gpsPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      setState({ gpsPosition });
      updateGPSStatus('active');
    },
    (err) => {
      console.warn('[GPS] Error:', err.message);
      updateGPSStatus('error');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    }
  );
}

/**
 * Update the GPS status indicator on the Course screen.
 * @param {'locating'|'active'|'error'|'unavailable'} status
 */
function updateGPSStatus(status) {
  const icon = document.getElementById('gps-icon');
  const text = document.getElementById('gps-text');
  if (!icon || !text) return;

  const labels = {
    locating:    { text: 'Locating…',         cls: 'gps-status--locating' },
    active:      { text: 'GPS Active',         cls: 'gps-status--active' },
    error:       { text: 'GPS Error',          cls: 'gps-status--error' },
    unavailable: { text: 'GPS Unavailable',    cls: 'gps-status--error' },
  };

  const { text: label, cls } = labels[status] ?? labels.locating;
  text.textContent = label;

  const container = document.getElementById('gps-status');
  if (container) {
    container.className = `gps-status ${cls}`;
  }
}

// =============================================================
// RENDER
// All UI updates happen here. Called after every setState().
// =============================================================

function render() {
  renderScreenVisibility();
  renderNav();

  switch (state.activeScreen) {
    case 'course':     renderCourseScreen();    break;
    case 'hole-view':  renderHoleView();        break;
    case 'hole-map':   renderHoleMap();         break;
    case 'scorecard':  renderScorecard();       break;
  }
}

/** Show/hide screens based on activeScreen. */
function renderScreenVisibility() {
  const screens = document.querySelectorAll('.screen');
  screens.forEach((el) => {
    const id = el.id.replace('screen-', '');
    el.classList.toggle('screen--active', id === state.activeScreen);
  });
}

/** Show/hide nav bar. */
function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.classList.toggle('nav--hidden', state.activeScreen === 'course');

  // Highlight active nav button
  nav.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.classList.toggle('nav__btn--active', btn.dataset.screen === state.activeScreen);
  });
}

// ── Course Screen ────────────────────────────────────────────
function renderCourseScreen() {
  // GPS status is updated separately via updateGPSStatus()
  // TODO: populate course-list from GPS + local course database
}

// ── Hole View ────────────────────────────────────────────────
function renderHoleView() {
  const hole = currentHoleData();
  if (!hole) return;

  // Header
  document.getElementById('hole-number').textContent = `Hole ${hole.holeNumber}`;
  document.getElementById('hole-par').textContent =
    `Par ${hole.par}${hole.yardage ? ' · ' + hole.yardage + ' yds' : ''}`;

  // Prev/next button states
  document.getElementById('prev-hole-btn').disabled = state.currentHole <= 1;
  document.getElementById('next-hole-btn').disabled = state.currentHole >= state.totalHoles;

  // Three independent live stats
  const strokes = calcStrokes(hole);
  const putts   = hole.shots.filter(s => s.club === 'P').length;
  const rating  = calcRating(hole);

  document.getElementById('stat-strokes').textContent = strokes || '—';
  document.getElementById('stat-putts').textContent   = strokes ? putts : '—';
  document.getElementById('stat-rating').textContent  = strokes ? fmtRating(rating) : '—';

  // Color the rating value
  const ratingEl = document.getElementById('stat-rating');
  ratingEl.className = `hole-stats__value hole-stats__value--rating${
    rating > 0 ? ' rating--pos' : rating < 0 ? ' rating--neg' : ''}`;

  // Stroke count badge in shot log header
  document.getElementById('stroke-count').textContent = strokes;

  // Undo button
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) undoBtn.disabled = hole.shots.length === 0;

  // ── Club grid ─────────────────────────────────────────────
  // Highlight selected club; show/hide Putter based on onGreen
  document.querySelectorAll('.club-btn').forEach(btn => {
    btn.classList.toggle('club-btn--selected', btn.dataset.club === state.pendingClub);
  });

  const putterBtn  = document.getElementById('putter-btn');
  const onGreenBtn = document.getElementById('on-green-btn');
  if (putterBtn && onGreenBtn) {
    putterBtn.hidden = !hole.onGreen;
    onGreenBtn.hidden = hole.onGreen;
  }

  // Pending club label ("tap a club below" vs "Driver armed")
  const pendingLabel = document.getElementById('pending-club-label');
  if (pendingLabel) {
    if (state.pendingClub) {
      const names = {
        D:'Driver', '3W':'3-Wood', '5W':'5-Wood',
        '3I':'3-Iron','4I':'4-Iron','5I':'5-Iron','6I':'6-Iron',
        '7I':'7-Iron','8I':'8-Iron','9I':'9-Iron',
        PW:'Pitching Wedge', SW:'Sand Wedge', LW:'Lob Wedge', P:'Putter'
      };
      pendingLabel.textContent = `${names[state.pendingClub] ?? state.pendingClub} — now rate it`;
      pendingLabel.className   = 'pending-club-label pending-club-label--armed';
    } else {
      pendingLabel.textContent = 'tap a club below';
      pendingLabel.className   = 'pending-club-label pending-club-label--empty';
    }
  }

  // ── Rating buttons ────────────────────────────────────────
  // Enabled only when a club is selected. Putter shots get only positive ratings.
  const hasClub = !!state.pendingClub;
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.disabled = !hasClub;
  });

  // Shot log
  renderShotLog(hole);
}


/**
 * Render the shot log rows for a hole.
 * @param {HoleData} hole
 */
function renderShotLog(hole) {
  const container = document.getElementById('shot-log');
  if (!container) return;

  if (hole.shots.length === 0) {
    container.innerHTML = '<p class="shot-log__empty">No shots logged yet.</p>';
    return;
  }

  const valClass = (v) => v > 0 ? 'shot-row__val--pos' : v < 0 ? 'shot-row__val--neg' : 'shot-row__val--zero';
  const valStr   = (v) => (v > 0 ? '+' : '') + v;
  const firstPuttIdx = hole.shots.findIndex(s => s.club === 'P');

  // Running stroke number accounts for penalty strokes on prior OB/L shots
  let strokeNum = 0;

  container.innerHTML = hole.shots.map((shot, idx) => {
    strokeNum += 1;
    const penalty = isPenaltyShot(shot);
    if (penalty) strokeNum += 1; // OB/L costs an extra stroke

    const divider = (idx === firstPuttIdx)
      ? `<div class="shot-log__divider"><span>│ Putting</span></div>`
      : '';

    return `${divider}
    <div class="shot-row${shot.club === 'P' ? ' shot-row--putt' : ''}${penalty ? ' shot-row--penalty' : ''}">
      <span class="shot-row__num">${strokeNum}</span>
      <span class="shot-row__club">${shot.club}</span>
      <span class="rating-chip rating-chip--${ratingCssClass(shot.rating)}"
            title="${ratingLabel(shot.rating)}">
        ${shot.rating}
      </span>
      <span class="shot-row__desc">${ratingLabel(shot.rating)}</span>
      ${penalty ? `<span class="penalty-badge">Penalty +1</span>` : ''}
      <span class="shot-row__val ${valClass(shot.ratingVal)}">${valStr(shot.ratingVal)}</span>
    </div>`;
  }).join('');
}

/**
 * Map a JEP rating symbol to a CSS modifier class.
 * @param {string} rating
 * @returns {string}
 */
function ratingCssClass(rating) {
  const map = {
    '!':  'great',
    '++': 'good2',
    '+':  'good1',
    '-':  'ok',
    '--': 'bad1',
    '#':  'bad2',
    'OB': 'penalty',
    'L':  'penalty',
  };
  return map[rating] ?? 'ok';
}

// ── Hole Map ─────────────────────────────────────────────────
function renderHoleMap() {
  const hole = currentHoleData();
  if (!hole) return;

  document.getElementById('map-hole-label').textContent = `Hole ${hole.holeNumber}`;

  // TODO: Plot GPS shot points on the SVG canvas.
  // Shots with lat/lng will be projected onto the SVG coordinate space
  // using a simple bounding-box transform once we have ≥2 GPS points.
}

// ── Scorecard ────────────────────────────────────────────────
function renderScorecard() {
  const tbody = document.getElementById('scorecard-body');
  const tfoot = document.getElementById('scorecard-foot');
  if (!tbody || !tfoot) return;

  document.getElementById('scorecard-course-name').textContent =
    state.courseName ?? 'Unnamed Course';

  let frontStrokes = 0, frontPutts = 0, frontRating = 0, frontPar = 0;
  let backStrokes  = 0, backPutts  = 0, backRating  = 0, backPar  = 0;

  tbody.innerHTML = state.holes.map((hole, idx) => {
    const strokes = calcStrokes(hole);
    const putts   = hole.shots.filter(s => s.club === 'P').length;
    const rating  = hole.complete ? calcRating(hole) : null;

    // Running front/back totals
    if (idx < 9) {
      frontStrokes += strokes;
      frontPutts   += putts;
      frontPar     += hole.par;
      if (rating !== null) frontRating += rating;
    } else {
      backStrokes  += strokes;
      backPutts    += putts;
      backPar      += hole.par;
      if (rating !== null) backRating  += rating;
    }

    const ratingCell = rating !== null
      ? `<td class="${rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : ''}">${fmtRating(rating)}</td>`
      : `<td>—</td>`;

    const rowClass = hole.complete ? '' : 'scorecard-row--pending';
    return `
      <tr class="${rowClass}">
        <td>${hole.holeNumber}</td>
        <td>${hole.par}</td>
        <td>${strokes || '—'}</td>
        <td>${strokes ? putts : '—'}</td>
        ${ratingCell}
      </tr>
      ${idx === 8 ? subtotalRow('Out', frontPar, frontStrokes, frontPutts, frontRating) : ''}
    `;
  }).join('');

  const totalStrokes = frontStrokes + backStrokes;
  const totalPutts   = frontPutts   + backPutts;
  const totalRating  = frontRating  + backRating;
  const totalPar     = frontPar     + backPar;

  tfoot.innerHTML = `
    ${subtotalRow('In',    backPar,   backStrokes,   backPutts,   backRating)}
    ${subtotalRow('Total', totalPar,  totalStrokes,  totalPutts,  totalRating, true)}
  `;
}

/**
 * Generate a subtotal/total row for the scorecard.
 * Columns: label | par | strokes | putts | rating
 */
function subtotalRow(label, par, strokes, putts, rating, isBold = false) {
  const cls = isBold ? 'scorecard-row--total' : 'scorecard-row--subtotal';
  const ratingStr = strokes ? fmtRating(rating) : '—';
  const ratingCls = rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : '';
  return `
    <tr class="${cls}">
      <td>${label}</td>
      <td>${par}</td>
      <td>${strokes || '—'}</td>
      <td>${strokes ? putts : '—'}</td>
      <td class="${ratingCls}">${ratingStr}</td>
    </tr>
  `;
}

// =============================================================
// EVENT WIRING
// =============================================================

function wireEvents() {

  // ── Nav buttons ─────────────────────────────────────────
  document.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
  });

  // ── Mock GPS button ──────────────────────────────────────
  document.getElementById('mock-gps-btn').addEventListener('click', loadMockCourse);

  // ── Course Screen ────────────────────────────────────────
  document.getElementById('start-round-btn').addEventListener('click', () => {
    const name   = document.getElementById('course-input').value.trim() || 'Unnamed Course';
    const holes  = parseInt(document.getElementById('course-holes').value, 10) || 18;
    setState({
      courseName:  name,
      totalHoles:  holes,
      holes:       initHoles(holes),
      currentHole: 1,
      activeScreen: 'hole-view',
    });
  });

  // ── Hole View: new round ─────────────────────────────────
  document.getElementById('new-round-hole-btn').addEventListener('click', () => {
    if (confirm('Are you sure? This will end your current round.')) {
      archiveRound();
      setState({
        courseName:   null,
        totalHoles:   18,
        holes:        [],
        currentHole:  1,
        pendingClub:  null,
        mockMode:     false,
        activeScreen: 'course',
      });
    }
  });

  // ── Hole View: hole navigation ───────────────────────────
  document.getElementById('prev-hole-btn').addEventListener('click', () => {
    if (state.currentHole > 1) setState({ currentHole: state.currentHole - 1, pendingClub: null });
  });

  document.getElementById('next-hole-btn').addEventListener('click', () => {
    if (state.currentHole < state.totalHoles) setState({ currentHole: state.currentHole + 1, pendingClub: null });
  });

  // ── Hole View: undo last shot ────────────────────────────
  document.getElementById('undo-btn').addEventListener('click', undoLastShot);

  // ── Hole View: club selection ────────────────────────────
  // Delegated on the club grid container (covers putter button too)
  document.getElementById('club-btns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-club]');
    if (!btn || btn.hidden) return;
    selectClub(btn.dataset.club);
  });

  // Putter is outside the grid but uses same data-club pattern
  document.getElementById('putter-btn').addEventListener('click', () => {
    selectClub('P');
  });

  // ── Hole View: On the Green ──────────────────────────────
  document.getElementById('on-green-btn').addEventListener('click', setOnGreen);

  // ── Hole View: JEP rating buttons ────────────────────────
  document.getElementById('rating-btns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rating]');
    if (!btn || btn.disabled) return;

    addShot(btn.dataset.rating);

    // Brief flash for tactile feedback
    btn.classList.add('rating-btn--flash');
    setTimeout(() => btn.classList.remove('rating-btn--flash'), 150);

    // Skeptical father toast for phenomenal shots
    if (btn.dataset.rating === '!') showToast('Was it really that good?', btn);
  });

  // ── Hole View: finish hole ───────────────────────────────
  document.getElementById('finish-hole-btn').addEventListener('click', finishHole);

  // ── Hole Map: navigation ─────────────────────────────────
  document.getElementById('map-prev-hole-btn').addEventListener('click', () => {
    if (state.currentHole > 1) setState({ currentHole: state.currentHole - 1 });
  });

  document.getElementById('map-next-hole-btn').addEventListener('click', () => {
    if (state.currentHole < state.totalHoles) setState({ currentHole: state.currentHole + 1 });
  });

  // ── Hole Map: capture GPS ────────────────────────────────
  document.getElementById('capture-gps-btn').addEventListener('click', () => {
    // TODO: Attach current GPS position to the most recent shot on this hole
    if (state.gpsPosition) {
      console.log('[GPS] Current position:', state.gpsPosition);
      // Future: assign position to shot, then re-render map
    }
  });

  // ── Scorecard: new round ─────────────────────────────────
  document.getElementById('new-round-btn').addEventListener('click', () => {
    if (confirm('Start a new round? Current round will be saved locally.')) {
      // Archive current round to localStorage before resetting
      archiveRound();
      setState({
        courseName:  null,
        totalHoles:  18,
        holes:       [],
        currentHole: 1,
        activeScreen: 'course',
      });
    }
  });

  // ── Scorecard: export ────────────────────────────────────
  document.getElementById('export-btn').addEventListener('click', exportRound);
}

// =============================================================
// ROUND ARCHIVE & EXPORT
// =============================================================

/**
 * Save the completed round to a separate localStorage key for history.
 */
function archiveRound() {
  try {
    const history = JSON.parse(localStorage.getItem('jep-gss-history') ?? '[]');
    history.push({
      date:       new Date().toISOString(),
      courseName: state.courseName,
      holes:      state.holes,
    });
    localStorage.setItem('jep-gss-history', JSON.stringify(history));
  } catch (e) {
    console.warn('[GSS] Could not archive round:', e);
  }
}

/**
 * Export the current round as a plain-text / CSV blob and trigger download.
 */
/**
 * Show a brief non-blocking toast message anchored above a target element.
 * Auto-dismisses after 2 seconds.
 * @param {string}      message
 * @param {HTMLElement} anchor  - element to appear above
 */
function showToast(message, anchor) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;

  // Position above the anchor button
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    toast.style.left   = `${rect.left + rect.width / 2}px`;
    toast.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  }

  toast.classList.add('toast--visible');

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2000);
}

function exportRound() {
  const rows = [['Hole', 'Par', 'Strokes', 'Putts', 'Rating', 'Shots']];

  state.holes.forEach((hole) => {
    const strokes = calcStrokes(hole);
    const putts   = hole.shots.filter(s => s.club === 'P').length;
    const rating  = hole.complete ? fmtRating(calcRating(hole)) : '';
    const shots   = hole.shots.map((s) => `${s.club}:${s.rating}`).join(' ');
    rows.push([hole.holeNumber, hole.par, strokes, putts, rating, shots]);
  });

  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href     = url;
  a.download = `jep-gss-${state.courseName ?? 'round'}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================
// INIT
// =============================================================

function init() {
  loadPersistedState();
  wireEvents();
  startGPS();
  render();
}

document.addEventListener('DOMContentLoaded', init);
