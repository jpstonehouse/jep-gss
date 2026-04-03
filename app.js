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
// RAPIDAPI — Golf Course API
// =============================================================
const RAPIDAPI = {
  key:  '2a24284d6fmsh8999c4e198b104ap10e751jsnc6bc52f9f4da',
  host: 'golf-course-api.p.rapidapi.com',
};

// =============================================================
// LOCAL COURSES — built-in course data with full GPS green coords
// These are checked first (by proximity) before calling the API.
// =============================================================
const LOCAL_COURSES = [
  {
    name: 'Zaca Creek Golf Course',
    totalHoles: 9,
    // Used for proximity detection — center of the course
    center: { lat: 34.608393, lng: -120.197016 },
    holes: [
      { par: 3, yardage: 166, green: { lat: 34.608393, lng: -120.197016 } },
      { par: 3, yardage: 104, green: { lat: 34.608374, lng: -120.196443 } },
      { par: 3, yardage: 166, green: { lat: 34.608256, lng: -120.194289 } },
      { par: 4, yardage: 214, green: { lat: 34.607687, lng: -120.196246 } },
      { par: 3, yardage: 193, green: { lat: 34.607619, lng: -120.197217 } },
      { par: 4, yardage: 257, green: { lat: 34.608580, lng: -120.199702 } },
      { par: 3, yardage:  82, green: { lat: 34.609021, lng: -120.198605 } },
      { par: 3, yardage: 145, green: { lat: 34.607812, lng: -120.197695 } },
      { par: 3, yardage: 185, green: { lat: 34.609064, lng: -120.198347 } },
    ],
  },
];

// Runtime cache of the last course search results (not persisted)
let courseSearchResults = [];
let courseSearchFired   = false; // prevent re-running local GPS check on every position update
let courseApiLoading    = false; // true while a name-search API call is in flight
let courseSearchDone    = false; // true after at least one name search has completed

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
  reviewingRound: null, // index into jep-gss-history array for the review screen
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

// =============================================================
// DISTANCE CALCULATION
// =============================================================

/**
 * Haversine distance between two GPS coordinates, returned in yards.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in yards, rounded to nearest yard
 */
function haversineDistanceYards(lat1, lng1, lat2, lng2) {
  const R  = 6371000; // Earth radius in metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2
           + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const metres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(metres * 1.09361);
}

// =============================================================
// MOCK GPS HELPERS
// =============================================================

/**
 * Offset a lat/lng by a distance in yards (north positive, east positive).
 */
function offsetGPS(lat, lng, northYards, eastYards) {
  const YARDS_PER_DEG_LAT = 121518;
  return {
    lat: lat + northYards / YARDS_PER_DEG_LAT,
    lng: lng + eastYards / (YARDS_PER_DEG_LAT * Math.cos(lat * Math.PI / 180)),
  };
}

/**
 * Estimate a realistic carry distance (yards) for a given club in mock mode.
 */
function estimateMockShotDist(club) {
  const DISTS = {
    D: 240, '3W': 215, '5W': 200,
    '3I': 185, '4I': 175, '5I': 165, '6I': 155, '7I': 145, '8I': 135, '9I': 125,
    PW: 110, SW: 80, LW: 60,
    P: 12,
  };
  const base = DISTS[club] ?? 120;
  // ±15% random variation
  return base * (0.85 + Math.random() * 0.30);
}

/**
 * Generate a mock GPS position for a shot in mock mode.
 * Positions shots along a realistic path from tee toward the green.
 * @param {HoleData} hole
 * @param {Shot[]} prevShots  shots already logged on this hole
 * @param {string} club
 * @returns {{lat:number, lng:number}}
 */
function mockShotPosition(hole, prevShots, club) {
  const green = hole.green;
  const tee   = hole.tee;
  if (!green) return { lat: 0, lng: 0 };

  // Direction vector from tee to green (in equirectangular metres)
  const refLat = green.lat;
  const mPerDegLat = 111320;
  const mPerDegLng = mPerDegLat * Math.cos(refLat * Math.PI / 180);
  const dy = (green.lat - tee.lat) * mPerDegLat; // metres north
  const dx = (green.lng - tee.lng) * mPerDegLng; // metres east
  const holeDist = Math.sqrt(dx * dx + dy * dy);   // metres tee→green
  const holeYards = holeDist * 1.09361;

  // Unit vector tee→green
  const ux = dx / holeDist;
  const uy = dy / holeDist;

  // Determine starting position for this shot
  let startLat, startLng;
  if (prevShots.length === 0) {
    // First shot: stand on the tee
    startLat = tee.lat;
    startLng = tee.lng;
  } else {
    // Subsequent shots: start from previous shot's GPS position
    const prev = prevShots[prevShots.length - 1];
    startLat = prev.lat;
    startLng = prev.lng;
  }

  const shotDist = estimateMockShotDist(club); // yards
  const shotDistM = shotDist / 1.09361;        // metres

  // Move along tee→green direction by shotDist
  const lateralSpreadM = (Math.random() - 0.5) * shotDistM * 0.18; // ±9% lateral scatter
  const forwardM = shotDistM;

  const northM = uy * forwardM + (-ux) * lateralSpreadM;
  const eastM  = ux * forwardM +   uy  * lateralSpreadM;

  const northYards = northM * 1.09361;
  const eastYards  = eastM  * 1.09361;

  const pos = offsetGPS(startLat, startLng, northYards, eastYards);

  // Clamp: don't fly past the green
  // Compute progress along tee→green axis after this shot
  const fromTeeLat = pos.lat - tee.lat;
  const fromTeeLng = pos.lng - tee.lng;
  const progressM  = (fromTeeLat * mPerDegLat) * uy + (fromTeeLng * mPerDegLng) * ux;
  if (progressM > holeDist * 0.97) {
    // Too close/past the green — snap near the green with small random offset
    const nearNorth = (Math.random() - 0.5) * 8;
    const nearEast  = (Math.random() - 0.5) * 8;
    return offsetGPS(green.lat, green.lng, nearNorth, nearEast);
  }

  return pos;
}

// =============================================================
// COURSE SELECTION
// =============================================================

/**
 * Start a round from a course object (local or API).
 * Courses with full hole data get green GPS coords; API-only courses get
 * default pars and no GPS data.
 * @param {{ name: string, totalHoles: number, holes: Array|null }} course
 */
function startRoundFromCourse(course) {
  let holes;

  if (course.holes && course.holes.length > 0) {
    // Local built-in course — has GPS green coords
    holes = course.holes.map((h, i) => ({
      holeNumber: i + 1,
      par:        h.par,
      yardage:    h.yardage ?? null,
      green:      h.green   ?? null,
      shots:      [],
      onGreen:    false,
      complete:   false,
    }));
  } else if (course.scorecard && course.scorecard.length > 0) {
    // API course — real pars + yardages from scorecard; no GPS coords
    holes = course.scorecard.map(h => {
      const tees    = h.tees ?? {};
      const teeKeys = Object.keys(tees);
      // Prefer a mid-range tee (teeBox3 = White, otherwise middle of the list)
      const tee = tees.teeBox3 ?? tees.teeBox2 ??
                  (teeKeys.length ? tees[teeKeys[Math.floor(teeKeys.length / 2)]] : null);
      return {
        holeNumber: h.Hole,
        par:        h.Par,
        yardage:    tee?.yards ?? null,
        green:      null,
        shots:      [],
        onGreen:    false,
        complete:   false,
      };
    });
  } else {
    holes = initHoles(course.totalHoles || 18);
  }

  setState({
    courseName:   course.name,
    totalHoles:   holes.length,
    holes,
    currentHole:  1,
    pendingClub:  null,
    mockMode:     false,
    activeScreen: 'hole-view',
  });
}

/**
 * Search for courses near the given GPS coordinates.
 * Checks LOCAL_COURSES by proximity first, then calls RapidAPI.
 * Updates courseSearchResults and re-renders the course list.
 * @param {number} lat
 * @param {number} lng
 */
/**
 * GPS-triggered: check only LOCAL_COURSES by proximity.
 * The RapidAPI has no coordinate search — name search is used instead.
 */
function searchNearbyCourses(lat, lng) {
  const RADIUS_YARDS = 17600; // 10 miles
  const results = [];

  LOCAL_COURSES.forEach(course => {
    const dist = haversineDistanceYards(lat, lng, course.center.lat, course.center.lng);
    if (dist <= RADIUS_YARDS) {
      results.push({ ...course, distanceYards: dist, source: 'local' });
    }
  });

  results.sort((a, b) => a.distanceYards - b.distanceYards);
  courseSearchResults = results;
  renderCourseList();
}

/**
 * Search the RapidAPI database by course name.
 * The API has no coordinate/radius endpoint — name search is the only method.
 * Results contain full scorecard data (real pars + yardages per hole).
 * @param {string} query  user-typed course name
 */
async function searchCoursesByName(query) {
  query = query.trim();
  if (query.length < 2) return;

  courseApiLoading  = true;
  courseSearchDone  = false;
  courseSearchResults = [];
  renderCourseList();

  try {
    const url = `https://${RAPIDAPI.host}/search?name=${encodeURIComponent(query)}`;
    console.log('[Courses] Searching:', url);

    const res     = await fetch(url, {
      headers: {
        'X-RapidAPI-Key':  RAPIDAPI.key,
        'X-RapidAPI-Host': RAPIDAPI.host,
      },
    });
    const rawText = await res.text();
    console.log('[Courses] Status:', res.status, '| Length:', rawText.length);

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { console.warn('[Courses] JSON parse error:', rawText.slice(0, 200)); data = []; }

    // API returns an array on success, or {"message":"No courses found"} on miss
    const list = Array.isArray(data) ? data : [];
    console.log('[Courses] Results:', list.length);

    courseSearchResults = list.map(c => {
      // Extract par + yardage from scorecard (prefer middle tee — teeBox3/White)
      const scorecard = Array.isArray(c.scorecard) ? c.scorecard : null;
      return {
        name:          c.name,
        totalHoles:    parseInt(c.holes) || 18,
        city:          c.city  ?? null,
        state:         c.state ?? null,
        scorecard,
        distanceYards: null, // API has no GPS coordinates
        source:        'api',
      };
    });
  } catch (err) {
    console.warn('[Courses] Search failed:', err.message);
  }

  courseApiLoading = false;
  courseSearchDone = true;
  renderCourseList();
}

/** Render the course list. Handles GPS local results and name-search API results. */
function renderCourseList() {
  const container = document.getElementById('course-list');
  if (!container) return;

  if (courseApiLoading) {
    container.innerHTML = `<p class="course-list__status">Searching…</p>`;
    return;
  }

  if (courseSearchResults.length === 0) {
    container.innerHTML = courseSearchDone
      ? `<p class="course-list__status">No courses found — try a different name.</p>`
      : '';
    return;
  }

  container.innerHTML = courseSearchResults.map((course, idx) => {
    const badge = course.source === 'local'
      ? `<span class="course-card__badge">Built-in</span>`
      : '';
    // Local courses show distance; API courses show City/State (no coordinates in API)
    const detail = course.distanceYards != null
      ? `${course.totalHoles} holes · ${(course.distanceYards / 1760).toFixed(1)} mi away`
      : [course.totalHoles + ' holes', course.city, course.state].filter(Boolean).join(' · ');
    return `
      <div class="course-card" data-course-idx="${idx}">
        <div class="course-card__name">${course.name} ${badge}</div>
        <div class="course-card__detail">${detail}</div>
      </div>`;
  }).join('');
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

  let shotLat = state.gpsPosition?.lat ?? null;
  let shotLng = state.gpsPosition?.lng ?? null;
  if (state.mockMode && hole.tee && hole.green) {
    const pos = mockShotPosition(hole, hole.shots, state.pendingClub);
    shotLat = pos.lat;
    shotLng = pos.lng;
  }

  const shot = {
    id: hole.shots.length + 1,
    club: state.pendingClub,
    rating,
    ratingVal: JEP_RATINGS[rating] ?? 0,
    lat: shotLat,
    lng: shotLng,
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
/**
 * Translate a GeolocationPositionError into a user-readable message.
 * Codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
 */
function gpsErrorMessage(err) {
  switch (err.code) {
    case 1: return 'Permission denied — allow location in Settings > Safari > Location';
    case 2: return 'Position unavailable — check that Location Services is on';
    case 3: return 'Timed out — move to an open area and try again';
    default: return `GPS error: ${err.message}`;
  }
}

// =============================================================
// WAKE LOCK
// =============================================================

let wakeLockSentinel = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch (e) {
    // Permission denied or not supported — silently ignore
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

function updateWakeLock() {
  const inRound = state.activeScreen === 'hole-view' || state.activeScreen === 'hole-map';
  if (inRound && !wakeLockSentinel) {
    acquireWakeLock();
  } else if (!inRound) {
    releaseWakeLock();
  }
}

/**
 * Start GPS with high accuracy. If that fails with a non-permission error,
 * automatically retry with enableHighAccuracy: false as a fallback
 * (helps on some iOS configurations where high-accuracy mode is blocked).
 */
function startGPS() {
  if (!('geolocation' in navigator)) {
    updateGPSStatus('error', 'Geolocation not supported by this browser');
    return;
  }

  updateGPSStatus('locating', 'Locating…');

  const onSuccess = (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setState({ gpsPosition: { lat, lng, accuracy: pos.coords.accuracy } });
    updateGPSStatus('active', `GPS Active — ±${Math.round(pos.coords.accuracy)}m`);

    // Trigger course search on the first GPS fix only
    if (!courseSearchFired) {
      courseSearchFired = true;
      searchNearbyCourses(lat, lng);
    }
  };

  const onError = (err) => {
    console.warn('[GPS] High-accuracy error:', err.code, err.message);

    // Permission denied — no point retrying, show the actionable message
    if (err.code === 1) {
      updateGPSStatus('error', gpsErrorMessage(err));
      return;
    }

    // Timeout or position unavailable — retry with low accuracy
    updateGPSStatus('locating', 'Retrying without high accuracy…');
    navigator.geolocation.watchPosition(
      onSuccess,
      (err2) => {
        console.warn('[GPS] Low-accuracy error:', err2.code, err2.message);
        updateGPSStatus('error', gpsErrorMessage(err2));
      },
      { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 }
    );
  };

  navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000,
  });
}

/**
 * Update the GPS status indicator on the Course screen.
 * @param {'locating'|'active'|'error'} status
 * @param {string} [message]  optional override for the display text
 */
function updateGPSStatus(status, message) {
  const text      = document.getElementById('gps-text');
  const container = document.getElementById('gps-status');
  if (!text || !container) return;

  const clsMap = {
    locating: 'gps-status--locating',
    active:   'gps-status--active',
    error:    'gps-status--error',
  };

  text.textContent  = message ?? status;
  container.className = `gps-status ${clsMap[status] ?? 'gps-status--error'}`;
}

// =============================================================
// RENDER
// All UI updates happen here. Called after every setState().
// =============================================================

function render() {
  renderScreenVisibility();
  renderNav();
  updateWakeLock();

  switch (state.activeScreen) {
    case 'course':        renderCourseScreen();  break;
    case 'hole-view':     renderHoleView();      break;
    case 'hole-map':      renderHoleMap();       break;
    case 'scorecard':     renderScorecard();     break;
    case 'history':       renderHistory();       break;
    case 'round-review':  renderRoundReview();   break;
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
  const hideNav = state.activeScreen === 'course' || state.activeScreen === 'round-review';
  nav.classList.toggle('nav--hidden', hideNav);

  // Highlight active nav button
  nav.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.classList.toggle('nav__btn--active', btn.dataset.screen === state.activeScreen);
  });
}

// ── Course Screen ────────────────────────────────────────────
function renderCourseScreen() {
  // Reset when returning to this screen without an active GPS position
  if (!state.gpsPosition) {
    courseSearchFired   = false;
    courseSearchResults = [];
    courseApiLoading    = false;
    courseSearchDone    = false;
    const container = document.getElementById('course-list');
    if (container) container.innerHTML = '';
  }
}

// ── Hole View ────────────────────────────────────────────────
/**
 * Set the active tab on all hole-tabs bars (Score/Map).
 * @param {'score'|'map'} tab
 */
function setHoleTabActive(tab) {
  document.querySelectorAll('.hole-tab').forEach((el) => {
    el.classList.toggle('hole-tab--active', el.dataset.tab === tab);
  });
}

function renderHoleView() {
  const hole = currentHoleData();
  if (!hole) return;

  setHoleTabActive('score');

  // Header
  document.getElementById('hole-number').textContent = `Hole ${hole.holeNumber}`;
  document.getElementById('hole-par').textContent =
    `Par ${hole.par}${hole.yardage ? ' · ' + hole.yardage + ' yds' : ''}`;

  // Live distance to green (only when hole has green GPS coords and we have a position)
  const distEl = document.getElementById('hole-distance');
  if (distEl) {
    if (hole.green && state.gpsPosition) {
      const yds = haversineDistanceYards(
        state.gpsPosition.lat, state.gpsPosition.lng,
        hole.green.lat, hole.green.lng
      );
      distEl.textContent = `${yds} yds to green`;
      distEl.hidden = false;
    } else {
      distEl.hidden = true;
    }
  }

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

  // "New Round" only appears after the player has logged at least one shot
  const hasStarted = state.holes.some(h => h.shots.length > 0 || h.complete);
  const newRoundBtn = document.getElementById('new-round-hole-btn');
  if (newRoundBtn) newRoundBtn.hidden = !hasStarted;

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

const MAP_W = 300, MAP_H = 500; // must match SVG viewBox

/**
 * Build a GPS → SVG projection function for a hole.
 *
 * Algorithm:
 *  1. Project all GPS points to local metres (equirectangular, centred on
 *     the centroid of all points — accurate enough for < 1 km range).
 *  2. Rotate the coordinate space so the tee→green vector points up (+y),
 *     which becomes the top of the SVG after the y-axis flip.
 *  3. Find the rotated bounding box, scale uniformly with 18% padding to
 *     fill MAP_W × MAP_H.
 *
 * Returns a projection function (lat, lng) → {x, y} in SVG space,
 * or null when no GPS-tagged shots exist.
 */
function buildGPSProjection(hole) {
  const gpsShots = hole.shots.filter(s => s.lat != null && s.lng != null);
  if (gpsShots.length === 0) return null;

  // All points that define the extent (shots + green if known)
  const allPts = gpsShots.map(s => ({ lat: s.lat, lng: s.lng }));
  if (hole.green) allPts.push({ lat: hole.green.lat, lng: hole.green.lng });

  // Centroid as local projection origin
  const cLat = allPts.reduce((s, p) => s + p.lat, 0) / allPts.length;
  const cLng = allPts.reduce((s, p) => s + p.lng, 0) / allPts.length;

  // Equirectangular → metres
  const DEG  = Math.PI / 180;
  const mLat = 6371000 * DEG;
  const mLng = 6371000 * DEG * Math.cos(cLat * DEG);
  const toXY = (lat, lng) => ({ x: (lng - cLng) * mLng, y: (lat - cLat) * mLat });

  // Rotation: align tee→green (or tee→last-shot) with +y axis
  let cosA = 1, sinA = 0;
  const teeXY = toXY(gpsShots[0].lat, gpsShots[0].lng);
  const endRef = hole.green
    ? toXY(hole.green.lat, hole.green.lng)
    : gpsShots.length > 1 ? toXY(gpsShots[gpsShots.length - 1].lat, gpsShots[gpsShots.length - 1].lng)
    : null;
  if (endRef) {
    const dx = endRef.x - teeXY.x, dy = endRef.y - teeXY.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const θ = Math.atan2(dx, dy); // rotates (dx,dy) onto +y axis
      cosA = Math.cos(θ); sinA = Math.sin(θ);
    }
  }
  const rotate = ({ x, y }) => ({ x: x * cosA - y * sinA, y: x * sinA + y * cosA });

  // Rotated bounding box
  const rPts = allPts.map(p => rotate(toXY(p.lat, p.lng)));
  const xs = rPts.map(p => p.x), ys = rPts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 5);
  const rangeY = Math.max(maxY - minY, 5);

  // Uniform scale — 18% padding on each side
  const PAD   = 0.18;
  const scale = Math.min(MAP_W * (1 - 2 * PAD) / rangeX, MAP_H * (1 - 2 * PAD) / rangeY);
  const offX  = (MAP_W - rangeX * scale) / 2;
  const offY  = (MAP_H - rangeY * scale) / 2;

  // Project: GPS → SVG (y-flip: large Cartesian y → small SVG y = top of screen)
  return (lat, lng) => {
    const r = rotate(toXY(lat, lng));
    return {
      x: offX + (r.x - minX) * scale,
      y: offY + (maxY - r.y) * scale,
    };
  };
}

function renderHoleMap() {
  const hole = currentHoleData();
  if (!hole) return;

  setHoleTabActive('map');

  document.getElementById('map-hole-label').textContent = `Hole ${hole.holeNumber}`;

  const svg = document.getElementById('hole-map-svg');
  if (!svg) return;

  hideShotPopup();

  const gpsShots = hole.shots.filter(s => s.lat != null && s.lng != null);

  // ── No GPS data ──────────────────────────────────────────
  if (gpsShots.length === 0) {
    svg.innerHTML = `
      <rect width="${MAP_W}" height="${MAP_H}" fill="#fff"/>
      <text x="150" y="228" text-anchor="middle" font-size="13"
            font-family="-apple-system,sans-serif" fill="#9ca3af">No GPS data yet.</text>
      <text x="150" y="250" text-anchor="middle" font-size="11"
            font-family="-apple-system,sans-serif" fill="#c4c9d4">GPS is captured automatically</text>
      <text x="150" y="266" text-anchor="middle" font-size="11"
            font-family="-apple-system,sans-serif" fill="#c4c9d4">when each shot is logged.</text>`;
    return;
  }

  const project = buildGPSProjection(hole);
  if (!project) return;

  // Pre-project all GPS shot positions
  const spts = gpsShots.map((shot, i) => ({ ...project(shot.lat, shot.lng), shot, i }));
  const firstPuttIdx = gpsShots.findIndex(s => s.club === 'P');

  const html = [];

  // ── Background ──────────────────────────────────────────
  html.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="#fff"/>`);

  // ── Fairway corridor ─────────────────────────────────────
  // Soft rounded polyline behind everything to suggest the course shape
  const corrPts = spts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  if (hole.green) {
    const g = project(hole.green.lat, hole.green.lng);
    corrPts.push(`${g.x.toFixed(1)},${g.y.toFixed(1)}`);
  }
  if (corrPts.length >= 2) {
    const pts = corrPts.join(' ');
    html.push(`<polyline points="${pts}" fill="none" stroke="#e8f3e0"
                stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>`);
    html.push(`<polyline points="${pts}" fill="none" stroke="#d4e8c0"
                stroke-width="46" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>`);
  }

  // ── Green ellipse ────────────────────────────────────────
  if (hole.green) {
    const g = project(hole.green.lat, hole.green.lng);
    html.push(`
      <ellipse cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" rx="26" ry="18"
               fill="#d1fae5" stroke="#6ee7b7" stroke-width="1.5"/>
      <text x="${g.x.toFixed(1)}" y="${(g.y + 4.5).toFixed(1)}"
            text-anchor="middle" font-size="8" font-weight="700"
            font-family="-apple-system,sans-serif" fill="#065f46">GREEN</text>`);
  }

  // ── Shot path lines ───────────────────────────────────────
  for (let i = 1; i < spts.length; i++) {
    const a = spts[i - 1], b = spts[i];

    if (isPenaltyShot(a.shot)) {
      // OB/L: don't connect to next shot (re-hit from same spot).
      // Instead draw a dashed "ball went this way" line extending from a.
      const prev = i >= 2 ? spts[i - 2] : null;
      const dx   = a.x - (prev ? prev.x : a.x + 0.01);
      const dy   = a.y - (prev ? prev.y : a.y + 10);
      const len  = Math.hypot(dx, dy) || 1;
      const ext  = 48;
      html.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}"
                       x2="${(a.x + dx / len * ext).toFixed(1)}"
                       y2="${(a.y + dy / len * ext).toFixed(1)}"
                       stroke="#c4b5fd" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.85"/>`);
    } else {
      const inPuttZone = firstPuttIdx !== -1 && i >= firstPuttIdx;
      html.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}"
                       x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
                       stroke="${inPuttZone ? '#7dd3fc' : '#6b7280'}"
                       stroke-width="${inPuttZone ? 2.5 : 2}"
                       stroke-linecap="round"/>`);
    }
  }

  // ── Shot dots + labels ────────────────────────────────────
  const COLORS = {
    '!':  { fill: '#fef3c7', stroke: '#b45309', text: '#92400e' },
    '++': { fill: '#d1fae5', stroke: '#059669', text: '#065f46' },
    '+':  { fill: '#dcfce7', stroke: '#16a34a', text: '#15803d' },
    '-':  { fill: '#f3f4f6', stroke: '#9ca3af', text: '#4b5563' },
    '--': { fill: '#fff7ed', stroke: '#ea580c', text: '#c2410c' },
    '#':  { fill: '#fee2e2', stroke: '#dc2626', text: '#b91c1c' },
    'OB': { fill: '#ede9fe', stroke: '#7c3aed', text: '#6d28d9' },
    'L':  { fill: '#ede9fe', stroke: '#7c3aed', text: '#6d28d9' },
  };

  spts.forEach((sp, i) => {
    const { shot } = sp;
    const clr  = COLORS[shot.rating] ?? { fill: '#f3f4f6', stroke: '#6b7280', text: '#374151' };
    const r    = shot.club === 'P' ? 9 : 11;
    const fs   = shot.rating.length > 1 ? 7 : 9;
    const dash = isPenaltyShot(shot) ? ' stroke-dasharray="3 2"' : '';

    // Shot-number label offset — push away from SVG centre
    const offN = r + 9;
    const nx   = sp.x > MAP_W / 2 ? sp.x - offN : sp.x + offN;
    const ny   = sp.y < MAP_H / 2 ? sp.y - 2    : sp.y + offN - 2;

    html.push(`
      <circle cx="${sp.x.toFixed(1)}" cy="${sp.y.toFixed(1)}" r="${r}"
              fill="${clr.fill}" stroke="${clr.stroke}" stroke-width="2"${dash}
              class="map-shot-dot" data-shot-idx="${i}" style="cursor:pointer"/>
      <text x="${sp.x.toFixed(1)}" y="${(sp.y + fs * 0.36).toFixed(1)}"
            text-anchor="middle" font-size="${fs}" font-weight="800"
            font-family="-apple-system,sans-serif" fill="${clr.text}"
            pointer-events="none">${shot.rating}</text>
      <text x="${nx.toFixed(1)}" y="${(ny + 3).toFixed(1)}"
            text-anchor="middle" font-size="8" font-weight="500"
            font-family="-apple-system,sans-serif" fill="#9ca3af"
            pointer-events="none">${i + 1}</text>`);
  });

  // ── TEE label ────────────────────────────────────────────
  const t = spts[0];
  html.push(`
    <text x="${t.x.toFixed(1)}" y="${(t.y < MAP_H * 0.85 ? t.y + 24 : t.y - 16).toFixed(1)}"
          text-anchor="middle" font-size="8" font-weight="700"
          font-family="-apple-system,sans-serif" fill="#9ca3af" letter-spacing="0.5">TEE</text>`);

  svg.innerHTML = html.join('\n');

  // ── Dot click handlers ────────────────────────────────────
  svg.querySelectorAll('.map-shot-dot').forEach(dotEl => {
    dotEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx  = parseInt(dotEl.dataset.shotIdx, 10);
      showShotPopup(gpsShots[idx], gpsShots[idx + 1] ?? null, spts[idx].x, spts[idx].y, svg);
    });
  });
}

/**
 * Show the shot info popup near a dot.
 * @param {Shot}       shot      - the tapped shot
 * @param {Shot|null}  nextShot  - next shot (used to calculate distance traveled)
 * @param {number}     svgX      - dot x in SVG viewBox space
 * @param {number}     svgY      - dot y in SVG viewBox space
 * @param {SVGElement} svgEl
 */
function showShotPopup(shot, nextShot, svgX, svgY, svgEl) {
  const popup = document.getElementById('shot-popup');
  if (!popup) return;

  // Distance this shot traveled = from here to where the next shot was taken
  let distStr = '—';
  if (nextShot && shot.lat != null && nextShot.lat != null) {
    distStr = `${haversineDistanceYards(shot.lat, shot.lng, nextShot.lat, nextShot.lng)} yds`;
  }

  const CLUB_NAMES = {
    D:'Driver', '3W':'3 Wood', '5W':'5 Wood',
    '3I':'3 Iron','4I':'4 Iron','5I':'5 Iron','6I':'6 Iron',
    '7I':'7 Iron','8I':'8 Iron','9I':'9 Iron',
    PW:'Pitching Wedge', SW:'Sand Wedge', LW:'Lob Wedge', P:'Putter',
  };

  popup.innerHTML = `
    <button class="shot-popup__close" aria-label="Close">&#215;</button>
    <div class="shot-popup__club">${CLUB_NAMES[shot.club] ?? shot.club}</div>
    <div class="shot-popup__rating">
      <span class="rating-chip rating-chip--${ratingCssClass(shot.rating)}">${shot.rating}</span>
      <span class="shot-popup__label">${ratingLabel(shot.rating)}</span>
    </div>
    <div class="shot-popup__dist">${distStr}</div>`;

  // Convert SVG viewBox coords → container-relative screen pixels
  const svgRect = svgEl.getBoundingClientRect();
  const cRect   = svgEl.closest('.hole-map-container').getBoundingClientRect();
  const sx = svgRect.width  / MAP_W;
  const sy = svgRect.height / MAP_H;
  const dotX = (svgRect.left - cRect.left) + svgX * sx;
  const dotY = (svgRect.top  - cRect.top)  + svgY * sy;

  const PW = 150;
  let left = dotX - PW / 2;
  let top  = dotY - 96;
  if (top < 6) top = dotY + 22;

  popup.style.left = `${Math.max(4, Math.min(left, cRect.width - PW - 4))}px`;
  popup.style.top  = `${top}px`;
  popup.hidden     = false;

  popup.querySelector('.shot-popup__close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideShotPopup();
  }, { once: true });
}

function hideShotPopup() {
  const el = document.getElementById('shot-popup');
  if (el) el.hidden = true;
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

// ── Round History ─────────────────────────────────────────────
function renderHistory() {
  const body = document.getElementById('history-body');
  if (!body) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('jep-gss-history') ?? '[]');
  } catch (e) { /* ignore */ }

  if (history.length === 0) {
    body.innerHTML = `<p class="history-empty">No completed rounds yet.<br>Finish a round to see it here.</p>`;
    return;
  }

  // Display most recent first
  const reversed = [...history].reverse();
  body.innerHTML = reversed.map((round, displayIdx) => {
    const storageIdx = history.length - 1 - displayIdx;
    const totalStrokes = round.holes.reduce((s, h) => s + calcStrokes(h), 0);
    const totalPutts   = round.holes.reduce((s, h) => s + h.shots.filter(sh => sh.club === 'P').length, 0);
    const totalRating  = round.holes.reduce((s, h) => s + calcRating(h), 0);
    const date         = new Date(round.date);
    const dateStr      = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const ratingCls    = totalRating > 0 ? 'rating--pos' : totalRating < 0 ? 'rating--neg' : '';

    return `
      <div class="history-card" data-round-idx="${storageIdx}">
        <div class="history-card__header">
          <span class="history-card__course">${round.courseName ?? 'Unnamed Course'}</span>
          <span class="history-card__date">${dateStr}</span>
        </div>
        <div class="history-card__stats">
          <div class="history-card__stat">
            <span class="history-card__stat-val">${totalStrokes || '—'}</span>
            <span class="history-card__stat-lbl">Strokes</span>
          </div>
          <div class="history-card__stat">
            <span class="history-card__stat-val">${totalStrokes ? totalPutts : '—'}</span>
            <span class="history-card__stat-lbl">Putts</span>
          </div>
          <div class="history-card__stat">
            <span class="history-card__stat-val ${ratingCls}">${totalStrokes ? fmtRating(totalRating) : '—'}</span>
            <span class="history-card__stat-lbl">Rating</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Round Review ──────────────────────────────────────────────
function renderRoundReview() {
  const titleEl = document.getElementById('review-title');
  const body    = document.getElementById('review-body');
  if (!body || !titleEl) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('jep-gss-history') ?? '[]');
  } catch (e) { /* ignore */ }

  const round = history[state.reviewingRound];
  if (!round) {
    body.innerHTML = `<p class="history-empty">Round not found.</p>`;
    return;
  }

  const date = new Date(round.date);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  titleEl.innerHTML = `${round.courseName ?? 'Unnamed Course'}<br><span class="round-review-date">${dateStr}</span>`;

  let frontStrokes = 0, frontPutts = 0, frontRating = 0, frontPar = 0;
  let backStrokes  = 0, backPutts  = 0, backRating  = 0, backPar  = 0;

  const rows = round.holes.map((hole, idx) => {
    const strokes = calcStrokes(hole);
    const putts   = hole.shots.filter(s => s.club === 'P').length;
    const rating  = calcRating(hole);

    if (idx < 9) {
      frontStrokes += strokes; frontPutts += putts;
      frontPar     += hole.par; frontRating += rating;
    } else {
      backStrokes += strokes; backPutts += putts;
      backPar     += hole.par; backRating += rating;
    }

    const ratingCls = rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : '';
    const summary   = shotSummary(hole);

    return `
      <tr>
        <td>${hole.holeNumber}</td>
        <td>${hole.par}</td>
        <td>${strokes || '—'}</td>
        <td>${strokes ? putts : '—'}</td>
        <td class="${ratingCls}">${strokes ? fmtRating(rating) : '—'}</td>
      </tr>
      <tr class="scorecard-shots-row">
        <td colspan="5">${summary}</td>
      </tr>
      ${idx === 8 ? subtotalRow('Out', frontPar, frontStrokes, frontPutts, frontRating) : ''}`;
  }).join('');

  const totalStrokes = frontStrokes + backStrokes;
  const totalPutts   = frontPutts   + backPutts;
  const totalRating  = frontRating  + backRating;
  const totalPar     = frontPar     + backPar;

  body.innerHTML = `
    <div class="scorecard-scroll">
      <table class="scorecard-table">
        <thead>
          <tr>
            <th>Hole</th><th>Par</th><th>Strokes</th><th>Putts</th><th>Rating</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          ${round.holes.length > 9 ? subtotalRow('In', backPar, backStrokes, backPutts, backRating) : ''}
          ${subtotalRow('Total', totalPar, totalStrokes, totalPutts, totalRating, true)}
        </tfoot>
      </table>
    </div>`;
}

/**
 * Build the shot summary string for a hole.
 * Format: "pre-green shots | putts"  e.g. "++ + - | - -"
 * @param {HoleData} hole
 * @returns {string}
 */
function shotSummary(hole) {
  if (!hole.shots.length) return '—';
  const preGreen = hole.shots.filter(s => s.club !== 'P').map(s => s.rating);
  const putts    = hole.shots.filter(s => s.club === 'P').map(s => s.rating);
  if (!putts.length)    return preGreen.join(' ');
  if (!preGreen.length) return `| ${putts.join(' ')}`;
  return `${preGreen.join(' ')} | ${putts.join(' ')}`;
}

// =============================================================
// DEVELOPER MODE
// =============================================================

function toggleDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) showToast('Dev mode on', document.querySelector('.app-logo'));
}

// =============================================================
// EVENT WIRING
// =============================================================

function wireEvents() {

  // ── Nav buttons ─────────────────────────────────────────
  document.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
  });

  // ── Logo: triple-tap activates developer mode ────────────
  // Tap the logo 3 times within 1.5 s to show/hide the dev panel.
  let logoTaps = 0;
  let logoTapTimer = null;
  document.querySelector('.app-logo').addEventListener('click', () => {
    logoTaps++;
    clearTimeout(logoTapTimer);
    if (logoTaps >= 3) {
      logoTaps = 0;
      toggleDevPanel();
    } else {
      logoTapTimer = setTimeout(() => { logoTaps = 0; }, 1500);
    }
  });

  // ── Dev panel close button ───────────────────────────────
  document.getElementById('dev-panel-close').addEventListener('click', () => {
    document.getElementById('dev-panel').hidden = true;
  });

  // ── Find My Location button ──────────────────────────────
  // Must be triggered by a tap — Safari denies auto geolocation on load
  document.getElementById('find-location-btn').addEventListener('click', () => {
    document.getElementById('find-location-btn').hidden = true;
    document.getElementById('gps-status').classList.remove('gps-status--hidden');
    startGPS();
  });

  // ── Course card selection ────────────────────────────────
  document.getElementById('course-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-course-idx]');
    if (!card) return;
    const course = courseSearchResults[parseInt(card.dataset.courseIdx, 10)];
    if (course) startRoundFromCourse(course);
  });

  // ── Mock GPS button ──────────────────────────────────────
  document.getElementById('mock-gps-btn').addEventListener('click', loadMockCourse);

  // ── Course screen: name search ───────────────────────────
  const courseInput     = document.getElementById('course-input');
  const courseSearchBtn = document.getElementById('course-search-btn');

  const triggerSearch = () => searchCoursesByName(courseInput.value);
  courseSearchBtn.addEventListener('click', triggerSearch);
  courseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); triggerSearch(); }
  });

  // ── Course screen: manual start (no API search) ───────────
  document.getElementById('start-round-btn').addEventListener('click', () => {
    const name  = document.getElementById('course-name-manual').value.trim() || 'Unnamed Course';
    const holes = parseInt(document.getElementById('course-holes').value, 10) || 18;
    setState({
      courseName:   name,
      totalHoles:   holes,
      holes:        initHoles(holes),
      currentHole:  1,
      activeScreen: 'hole-view',
    });
  });

  // ── Hole View: back to courses (keeps round intact) ───────
  document.getElementById('back-to-courses-btn').addEventListener('click', () => {
    navigateTo('course');
  });

  // ── Hole View: new round ──────────────────────────────────
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
  // Tapping the SVG background dismisses any open shot popup.
  // Dot click handlers call e.stopPropagation() so this doesn't
  // fire when a dot is tapped — it only fires on background taps.
  document.getElementById('hole-map-svg').addEventListener('click', hideShotPopup);

  document.getElementById('capture-gps-btn').addEventListener('click', () => {
    if (state.gpsPosition) {
      console.log('[GPS] Current position:', state.gpsPosition);
    }
  });

  // ── Hole View: end round ─────────────────────────────────
  document.getElementById('end-round-btn').addEventListener('click', endRound);

  // ── Scorecard: new round ─────────────────────────────────
  document.getElementById('new-round-btn').addEventListener('click', () => {
    if (confirm('Start a new round? Current round will be saved locally.')) {
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

  // ── History: tap a round card ────────────────────────────
  document.getElementById('history-body').addEventListener('click', (e) => {
    const card = e.target.closest('[data-round-idx]');
    if (!card) return;
    const idx = parseInt(card.dataset.roundIdx, 10);
    setState({ reviewingRound: idx, activeScreen: 'round-review' });
  });

  // ── Round Review: back button ────────────────────────────
  document.getElementById('review-back-btn').addEventListener('click', () => {
    navigateTo('history');
  });

  // ── Score / Map tab bar (present in both hole-view and hole-map headers) ──
  document.querySelectorAll('.hole-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'map') navigateTo('hole-map');
      else navigateTo('hole-view');
    });
  });
}

// =============================================================
// ROUND ARCHIVE & EXPORT
// =============================================================

/**
 * End the current round: save to history and return to Course Detection.
 */
function endRound() {
  if (confirm('End round and save to history?')) {
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
}

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
  render(); // startGPS() is now triggered by the Find My Location button tap

  // Re-acquire wake lock when the page becomes visible again (iOS releases it on hide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateWakeLock();
  });
}

document.addEventListener('DOMContentLoaded', init);
