// =============================================================
// JEP GSS — Main Application v14
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
// =============================================================

/**
 * @typedef {Object} Shot
 * @property {number}      id        - Shot index on the hole (1-based)
 * @property {string}      club      - Club code e.g. "7I", "D", "P"
 * @property {string}      rating    - JEP rating symbol
 * @property {number}      ratingVal - Numeric value of the rating
 * @property {number|null} lat       - GPS latitude at point of shot
 * @property {number|null} lng       - GPS longitude at point of shot
 */

/**
 * @typedef {Object} HoleData
 * @property {number}   holeNumber
 * @property {number}   par
 * @property {Shot[]}   shots
 * @property {boolean}  complete
 */

/**
 * @typedef {Object} AppState
 * @property {string|null}  courseName
 * @property {number}       totalHoles
 * @property {HoleData[]}   holes
 * @property {number}       currentHole
 * @property {string}       activeScreen
 * @property {Object|null}  gpsPosition
 * @property {boolean}      mockMode
 * @property {number|null}  reviewingRound
 */

const DEFAULT_PARS = [4,4,3,4,5,3,4,5,4, 4,3,5,4,4,3,5,4,4];

// =============================================================
// RAPIDAPI — Golf Course API
// =============================================================
const RAPIDAPI = {
  key:  '2a24284d6fmsh8999c4e198b104ap10e751jsnc6bc52f9f4da',
  host: 'golf-course-api.p.rapidapi.com',
};

// =============================================================
// LOCAL COURSES
// =============================================================
const LOCAL_COURSES = [
  {
    name: 'Zaca Creek Golf Course',
    totalHoles: 9,
    center: { lat: 34.608393, lng: -120.197016 },
    holes: [
      { par: 3, yardage: 166, tee: { lat: 34.609427, lng: -120.197999 }, green: { lat: 34.608393, lng: -120.197016 } },
      { par: 3, yardage: 104, tee: { lat: 34.607893, lng: -120.197248 }, green: { lat: 34.608374, lng: -120.196443 } },
      { par: 3, yardage: 166, tee: { lat: 34.608294, lng: -120.195853 }, green: { lat: 34.608256, lng: -120.194289 } },
      { par: 4, yardage: 214, tee: { lat: 34.608013, lng: -120.194155 }, green: { lat: 34.607687, lng: -120.196246 } },
      { par: 3, yardage: 193, tee: { lat: 34.608145, lng: -120.195653 }, green: { lat: 34.607619, lng: -120.197217 } },
      { par: 4, yardage: 257, tee: { lat: 34.607520, lng: -120.197731 }, green: { lat: 34.608580, lng: -120.199702 } },
      { par: 3, yardage:  82, tee: { lat: 34.608516, lng: -120.198881 }, green: { lat: 34.609021, lng: -120.198605 } },
      { par: 3, yardage: 145, tee: { lat: 34.608754, lng: -120.198508 }, green: { lat: 34.607812, lng: -120.197695 } },
      { par: 3, yardage: 185, tee: { lat: 34.607826, lng: -120.197340 }, green: { lat: 34.609064, lng: -120.198347 } },
    ],
  },
];

let courseSearchResults = [];
let nearbyResults       = []; // GPS-found or default local courses; merged under API results
let courseSearchFired   = false;
let courseApiLoading    = false;
let courseSearchDone    = false;

// =============================================================
// MOCK COURSE — Pebble Beach Golf Links
// =============================================================
const MOCK_COURSE = {
  name: 'Pebble Beach Golf Links (Mock)',
  totalHoles: 18,
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
  mockPosition: { lat: 36.5693, lng: -121.9510, accuracy: 8 },
};

function loadMockCourse() {
  const holes = MOCK_COURSE.holes.map((h, i) => ({
    holeNumber: i + 1,
    par:        h.par,
    yardage:    h.yardage,
    tee:        { lat: h.tee[0],   lng: h.tee[1]   },
    green:      { lat: h.green[0], lng: h.green[1] },
    shots:      [],
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

  updateGPSStatus('active');
}

/** @type {AppState} */
const state = {
  courseName:     null,
  totalHoles:     18,
  holes:          [],
  currentHole:    1,
  activeScreen:   'course',
  gpsPosition:    null,
  mockMode:       false,
  reviewingRound: null,
};

// =============================================================
// JEP RATING SYSTEM
// =============================================================

const JEP_RATINGS = {
  '!':  3,
  '++': 2,
  '+':  1,
  '-':  0,
  '--': -1,
  '#':  -2,
  'OB': -3,
  'L':  -3,
};

function calcRating(hole) {
  return hole.shots.reduce((sum, s) => sum + s.ratingVal, 0);
}

function calcStrokes(hole) {
  const penalties = hole.shots.filter(s => s.rating === 'OB' || s.rating === 'L').length;
  return hole.shots.length + penalties;
}

function isPenaltyShot(shot) {
  return shot.rating === 'OB' || shot.rating === 'L';
}

// =============================================================
// DISTANCE CALCULATION
// =============================================================

function haversineDistanceYards(lat1, lng1, lat2, lng2) {
  const R  = 6371000;
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

function offsetGPS(lat, lng, northYards, eastYards) {
  const YARDS_PER_DEG_LAT = 121518;
  return {
    lat: lat + northYards / YARDS_PER_DEG_LAT,
    lng: lng + eastYards / (YARDS_PER_DEG_LAT * Math.cos(lat * Math.PI / 180)),
  };
}

function estimateMockShotDist(club) {
  const DISTS = {
    D: 240, '3W': 215, '5W': 200,
    '3I': 185, '4I': 175, '5I': 165, '6I': 155, '7I': 145, '8I': 135, '9I': 125,
    PW: 110, SW: 80, LW: 60,
    P: 12,
  };
  const base = DISTS[club] ?? 120;
  return base * (0.85 + Math.random() * 0.30);
}

function mockShotPosition(hole, prevShots, club) {
  const green = hole.green;
  const tee   = hole.tee;
  if (!green) return { lat: 0, lng: 0 };

  if (club === 'P') {
    const puttNum = prevShots.filter(s => s.club === 'P').length;
    const spread  = Math.max(1, 5 - puttNum * 2);
    return offsetGPS(green.lat, green.lng,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread);
  }

  const mPerDegLat = 111320;
  const mPerDegLng = mPerDegLat * Math.cos(green.lat * Math.PI / 180);
  const dy = (green.lat - tee.lat) * mPerDegLat;
  const dx = (green.lng - tee.lng) * mPerDegLng;
  const holeDist = Math.sqrt(dx * dx + dy * dy);

  const ux = dx / holeDist;
  const uy = dy / holeDist;

  let startLat, startLng;
  if (prevShots.length === 0) {
    startLat = tee.lat;
    startLng = tee.lng;
  } else {
    const prev = prevShots[prevShots.length - 1];
    startLat = prev.lat;
    startLng = prev.lng;
  }

  const shotDistM = estimateMockShotDist(club) / 1.09361;
  const lateralM  = (Math.random() - 0.5) * shotDistM * 0.18;
  const northM = uy * shotDistM + (-ux) * lateralM;
  const eastM  = ux * shotDistM +   uy  * lateralM;
  const pos = offsetGPS(startLat, startLng, northM * 1.09361, eastM * 1.09361);

  const fromTeeLat = pos.lat - tee.lat;
  const fromTeeLng = pos.lng - tee.lng;
  const progressM  = (fromTeeLat * mPerDegLat) * uy + (fromTeeLng * mPerDegLng) * ux;
  if (progressM > holeDist * 0.97) {
    return offsetGPS(green.lat, green.lng,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4);
  }

  return pos;
}

// =============================================================
// COURSE SELECTION
// =============================================================

async function startRoundFromCourse(course) {
  let holes;

  if (course.holes && course.holes.length > 0) {
    // Local built-in course — full GPS data already present
    holes = course.holes.map((h, i) => ({
      holeNumber: i + 1,
      par:        h.par,
      yardage:    h.yardage ?? null,
      tee:        h.tee   ?? null,
      green:      h.green ?? null,
      shots:      [],
      complete:   false,
    }));
  } else if (course.source === 'api') {
    // API course — fetch detail endpoint and parse GPS coordinates
    holes = await fetchAndBuildApiHoles(course);
  } else {
    holes = initHoles(course.totalHoles || 18);
  }

  setState({
    courseName:   course.name,
    totalHoles:   holes.length,
    holes,
    currentHole:  1,
    mockMode:     false,
    activeScreen: 'hole-view',
  });
}

/** Display raw API JSON in the on-screen debug overlay. */
function showApiDebug(raw) {
  const overlay = document.getElementById('api-debug-overlay');
  const pre     = document.getElementById('api-debug-pre');
  if (!overlay || !pre) return;
  try {
    pre.textContent = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    pre.textContent = raw;
  }
  overlay.hidden = false;
}

/**
 * Fetch the full course detail from the API and build a holes array with GPS.
 * Logs the raw API response so we can inspect the exact data structure.
 */
async function fetchAndBuildApiHoles(course) {
  // Try parsing GPS from the scorecard already embedded in the search result first
  if (course.scorecard && course.scorecard.length > 0) {
    console.log('[API Detail] Scorecard from search result (first hole):',
      JSON.stringify(course.scorecard[0]));
    const fromSearch = parseApiScorecard(course.scorecard);
    const hasGPS = fromSearch.some(h => h.tee || h.green);
    if (hasGPS) {
      console.log('[API Detail] GPS found in search result scorecard');
      return fromSearch;
    }
  }

  // Try the detail endpoint using whatever ID field the API uses
  const courseId = course.id ?? course._id ?? course.courseId ?? course.slug ?? null;
  console.log('[API Detail] Course object keys:', Object.keys(course));
  console.log('[API Detail] Resolved ID:', courseId);

  if (courseId) {
    try {
      const url = `https://${RAPIDAPI.host}/course?id=${encodeURIComponent(courseId)}`;
      console.log('[API Detail] Fetching:', url);

      const res  = await fetch(url, {
        headers: {
          'X-RapidAPI-Key':  RAPIDAPI.key,
          'X-RapidAPI-Host': RAPIDAPI.host,
        },
      });
      const raw  = await res.text();
      console.log('[API Detail] Status:', res.status);
      console.log('[API Detail] Raw response:', raw);
      showApiDebug(raw);

      const data = JSON.parse(raw);
      console.log('[API Detail] Parsed keys:', Object.keys(data));

      const scorecard = data.scorecard ?? (Array.isArray(data) ? data : null);
      if (scorecard && scorecard.length > 0) {
        console.log('[API Detail] Scorecard first hole:', JSON.stringify(scorecard[0]));
        return parseApiScorecard(scorecard);
      }
    } catch (err) {
      console.warn('[API Detail] Fetch failed:', err.message);
    }
  }

  // Fallback: use scorecard from search (pars + yardages, no GPS)
  if (course.scorecard) return parseApiScorecard(course.scorecard);
  return initHoles(course.totalHoles || 18);
}

/**
 * Convert a raw API scorecard array into the internal holes format.
 * Attempts to extract tee and green GPS from every plausible field name.
 */
function parseApiScorecard(scorecard) {
  return scorecard.map(h => {
    const tees    = h.tees ?? {};
    const teeKeys = Object.keys(tees);

    // Prefer teeBox3 (white tees) for yardage; fall back to middle tee
    const bestTee = tees.teeBox3 ?? tees.teeBox2 ??
                    (teeKeys.length ? tees[teeKeys[Math.floor(teeKeys.length / 2)]] : null);

    // Try every tee box for GPS coordinates
    let teeGPS = null;
    for (const key of teeKeys) {
      const tb = tees[key];
      if (!tb) continue;
      const lat = parseFloat(tb.lat ?? tb.latitude ?? tb.Lat ?? '');
      const lng = parseFloat(tb.lng ?? tb.lon ?? tb.longitude ?? tb.Lng ?? '');
      if (isFinite(lat) && isFinite(lng)) {
        teeGPS = { lat, lng };
        break;
      }
    }

    // Try multiple field names for the green / hole location
    const gSrc = h.green ?? h.hole ?? h.pin ?? h.holeLocation ?? null;
    let greenGPS = null;
    if (gSrc) {
      const lat = parseFloat(gSrc.lat ?? gSrc.latitude ?? gSrc.Lat ?? '');
      const lng = parseFloat(gSrc.lng ?? gSrc.lon ?? gSrc.longitude ?? gSrc.Lng ?? '');
      if (isFinite(lat) && isFinite(lng)) greenGPS = { lat, lng };
    }

    return {
      holeNumber: h.Hole ?? h.hole ?? h.holeNumber ?? h.number,
      par:        h.Par  ?? h.par,
      yardage:    bestTee?.yards ?? h.yards ?? null,
      tee:        teeGPS,
      green:      greenGPS,
      shots:      [],
      complete:   false,
    };
  });
}

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
  nearbyResults       = results;
  courseSearchResults = [...nearbyResults];
  renderCourseList();
}

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

    const list = Array.isArray(data) ? data : [];
    console.log('[Courses] Results:', list.length);
    if (list.length > 0) {
      console.log('[Courses] First result keys:', Object.keys(list[0]));
      console.log('[Courses] First result sample:', JSON.stringify(list[0]));
    }

    const apiResults = list.map(c => {
      const scorecard = Array.isArray(c.scorecard) ? c.scorecard : null;
      return {
        // Capture every plausible ID field for the detail endpoint fetch
        id:            c.id ?? c._id ?? c.courseId ?? c.slug ?? null,
        name:          c.name,
        totalHoles:    parseInt(c.holes) || 18,
        city:          c.city  ?? null,
        state:         c.state ?? null,
        scorecard,
        distanceYards: null,
        source:        'api',
      };
    });
    // Merge: nearby/local first so they're always visible, API results below
    courseSearchResults = [...nearbyResults, ...apiResults];
  } catch (err) {
    console.warn('[Courses] Search failed:', err.message);
    courseSearchResults = [...nearbyResults];
  }

  courseApiLoading = false;
  courseSearchDone = true;
  renderCourseList();
}

/** Reset search results back to nearby/local courses and clear the input. */
function clearCourseSearch() {
  courseSearchResults = [...nearbyResults];
  courseApiLoading    = false;
  courseSearchDone    = false;
  const inp = document.getElementById('course-input');
  if (inp) inp.value = '';
  renderCourseList();
}

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

  const hasApiResults = courseSearchResults.some(c => c.source === 'api');
  const clearHtml = hasApiResults
    ? `<button class="course-clear-btn" id="course-clear-btn">&#8592; Clear Search</button>`
    : '';

  container.innerHTML = clearHtml + courseSearchResults.map((course, idx) => {
    const badge = course.source === 'local'
      ? `<span class="course-card__badge">Nearby</span>`
      : `<span class="course-card__badge course-card__badge--search">Search</span>`;
    const detail = course.distanceYards != null
      ? `${course.totalHoles} holes · ${(course.distanceYards / 1760).toFixed(1)} mi away`
      : [course.totalHoles + ' holes', course.city, course.state].filter(Boolean).join(' · ');
    return `
      <div class="course-card" data-course-idx="${idx}">
        <div class="course-card__name">${course.name} ${badge}</div>
        <div class="course-card__detail">${detail}</div>
      </div>`;
  }).join('');

  if (hasApiResults) {
    document.getElementById('course-clear-btn')?.addEventListener('click', clearCourseSearch);
  }
}

// =============================================================
// UTILITIES
// =============================================================

function fmtRating(n) {
  return n > 0 ? `+${n}` : String(n);
}

function ratingLabel(rating) {
  const labels = {
    '!':  'Phenomenal', '++': 'Excellent', '+': 'Good',
    '-':  'OK', '--': 'Bad', '#': 'Chunker',
    'OB': 'Out of Bounds', 'L': 'Lost Ball',
  };
  return labels[rating] ?? rating;
}

function ratingCssClass(rating) {
  const map = {
    '!':  'great', '++': 'good2', '+': 'good1', '-': 'ok',
    '--': 'bad1',  '#':  'bad2',  'OB': 'penalty', 'L': 'penalty',
  };
  return map[rating] ?? 'ok';
}

// =============================================================
// STATE MANAGEMENT
// =============================================================

function setState(updates) {
  Object.assign(state, updates);
  persist();
  render();
}

function persist() {
  try {
    localStorage.setItem('jep-gss-state', JSON.stringify(state));
  } catch (e) {
    console.warn('[GSS] Could not persist state:', e);
  }
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem('jep-gss-state');
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) {
    console.warn('[GSS] Could not load persisted state:', e);
  }
}

// =============================================================
// HOLE MANAGEMENT
// =============================================================

function initHoles(totalHoles) {
  const holes = [];
  for (let i = 0; i < totalHoles; i++) {
    holes.push({
      holeNumber: i + 1,
      par:        DEFAULT_PARS[i] ?? 4,
      shots:      [],
      complete:   false,
      onGreen:    false,
    });
  }
  return holes;
}

function currentHoleData() {
  return state.holes[state.currentHole - 1] ?? null;
}

/**
 * Add a shot tapped on the map. Called after club + rating are selected.
 * Uses direct persist() (not setState()) to avoid re-initializing the map.
 */
function addShot(club, rating, lat, lng, svgXPct = null, svgYPct = null) {
  const hole = currentHoleData();
  if (!hole) return;

  hole.shots.push({
    id:        hole.shots.length + 1,
    club,
    rating,
    ratingVal: JEP_RATINGS[rating] ?? 0,
    isPutt:    club === 'P',
    lat:       lat    ?? null,
    lng:       lng    ?? null,
    svgXPct:   svgXPct ?? null,
    svgYPct:   svgYPct ?? null,
  });

  persist();
}

function undoLastShot() {
  const hole = currentHoleData();
  if (!hole || hole.shots.length === 0) return;
  hole.shots.pop();
  persist();
  drawShotsSVG(hole);
  updateHoleDrawer();
}

// =============================================================
// NAVIGATION
// =============================================================

function navigateTo(screen) {
  if (screen === 'course') destroyHoleSVG();
  setState({ activeScreen: screen });
}

// =============================================================
// GPS
// =============================================================

function gpsErrorMessage(err) {
  switch (err.code) {
    case 1: return 'Permission denied — allow location in Settings > Safari > Location';
    case 2: return 'Position unavailable — check that Location Services is on';
    case 3: return 'Timed out — move to an open area and try again';
    default: return `GPS error: ${err.message}`;
  }
}

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

    if (!courseSearchFired) {
      courseSearchFired = true;
      searchNearbyCourses(lat, lng);
    }
  };

  const onError = (err) => {
    console.warn('[GPS] High-accuracy error:', err.code, err.message);
    if (err.code === 1) {
      updateGPSStatus('error', gpsErrorMessage(err));
      return;
    }
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

function updateGPSStatus(status, message) {
  const text      = document.getElementById('gps-text');
  const container = document.getElementById('gps-status');
  if (!text || !container) return;

  const clsMap = {
    locating: 'gps-status--locating',
    active:   'gps-status--active',
    error:    'gps-status--error',
  };

  text.textContent    = message ?? status;
  container.className = `gps-status ${clsMap[status] ?? 'gps-status--error'}`;
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
  } catch (e) { /* silently ignore */ }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

function updateWakeLock() {
  const inRound = state.activeScreen === 'hole-view';
  if (inRound && !wakeLockSentinel) acquireWakeLock();
  else if (!inRound) releaseWakeLock();
}

// =============================================================
// SVG HOLE RENDERER
// =============================================================

const SVG_W       = 320;   // fixed viewBox width
const PX_PER_YARD = 3;     // vertical scale: 3 SVG units per yard

let pendingLL     = null;  // { lat, lng } real GPS of pending tap (null for no-GPS courses)
let pendingSvgPt  = null;  // { x, y } SVG-space coords of pending tap
let pickerClub    = null;
let drawerExpanded    = false;
let svgInitHole       = null;  // holeNumber the SVG is currently drawn for
let svgProjection     = null;  // GPS↔SVG projection for the current hole
let svgResizeHandler  = null;  // resize listener for re-drawing fixed-position dots

// Dot color scheme per JEP rating (also used by the drawer shot-chip list)
const SHOT_COLORS = {
  '!':  { bg: '#fef3c7', border: '#b45309', text: '#92400e' },
  '++': { bg: '#d1fae5', border: '#059669', text: '#065f46' },
  '+':  { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
  '-':  { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' },
  '--': { bg: '#fff7ed', border: '#ea580c', text: '#c2410c' },
  '#':  { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' },
  'OB': { bg: '#ede9fe', border: '#7c3aed', text: '#6d28d9' },
  'L':  { bg: '#ede9fe', border: '#7c3aed', text: '#6d28d9' },
};

/** SVG height in viewBox units from hole yardage. */
function getSvgHeight(hole) {
  return Math.max((hole.yardage || 150) * PX_PER_YARD, 350);
}

/**
 * Build the GPS↔SVG projection for a hole.
 *
 * Coordinate system: along-axis = 0 at tee (SVG bottom), holeLen at green (SVG top).
 * Across-axis = metres to the right of the tee→green line.
 * scale = SVG units per metre (derived from svgH / physical hole length).
 */
function getHoleProjection(hole, svgH) {
  if (!hole.tee || !hole.green) return null;
  const mLat = 111320;
  const mLng = mLat * Math.cos(hole.tee.lat * Math.PI / 180);
  const gx   = (hole.green.lng - hole.tee.lng) * mLng;   // metres east to green
  const gy   = (hole.green.lat - hole.tee.lat) * mLat;   // metres north to green
  const holeLen = Math.sqrt(gx * gx + gy * gy);
  if (holeLen < 1) return null;
  const uAlong  = { x: gx / holeLen, y: gy / holeLen };      // unit vec tee→green
  const uAcross = { x: gy / holeLen, y: -gx / holeLen };     // unit vec rightward ⊥
  return { mLat, mLng, holeLen, uAlong, uAcross, scale: svgH / holeLen };
}

/** GPS → SVG coordinate space. */
function gpsToSvgCoord(lat, lng, hole, svgH, proj) {
  if (!proj) return { x: SVG_W / 2, y: svgH / 2 };
  const dx    = (lng - hole.tee.lng) * proj.mLng;
  const dy    = (lat - hole.tee.lat) * proj.mLat;
  const along  = dx * proj.uAlong.x  + dy * proj.uAlong.y;
  const across = dx * proj.uAcross.x + dy * proj.uAcross.y;
  return {
    x: SVG_W / 2 + across * proj.scale,
    y: svgH      - along  * proj.scale,
  };
}

/** SVG coordinate space → GPS. */
function svgToGpsCoord(svgX, svgY, hole, svgH, proj) {
  if (!proj) return null;
  const along  = (svgH - svgY) / proj.scale;
  const across = (svgX - SVG_W / 2) / proj.scale;
  const dx = along * proj.uAlong.x + across * proj.uAcross.x;
  const dy = along * proj.uAlong.y + across * proj.uAcross.y;
  return {
    lat: hole.tee.lat + dy / proj.mLat,
    lng: hole.tee.lng + dx / proj.mLng,
  };
}

/**
 * Build (or rebuild) the SVG hole diagram inside #hole-svg-wrap.
 * Green background, white ellipse at top (green), white rect at bottom (tee).
 * Height scales with yardage (3 px/yd). Container scrolls if taller than viewport.
 */
function initHoleSVG(hole) {
  const wrap = document.getElementById('hole-svg-wrap');
  if (!wrap) return;

  const svgH        = getSvgHeight(hole);
  const hasTeeGreen = !!(hole.tee && hole.green);
  svgProjection = getHoleProjection(hole, svgH);
  svgInitHole   = hole.holeNumber;
  pendingSvgPt  = null;
  pendingLL     = null;

  const teeY      = svgH - 70;
  const noGpsMsg  = hasTeeGreen ? '' :
    `<text x="160" y="${(svgH / 2).toFixed(0)}" text-anchor="middle"
           font-size="14" fill="rgba(255,255,255,0.7)">Tap to plot shots</text>`;
  // Bear sits on the tee box; hide it if shots already exist (e.g. returning to hole)
  const bearHide  = hole.shots.length > 0 ? ' display="none"' : '';

  wrap.innerHTML = `
    <div id="hole-svg-container" style="position:relative;width:100%;">
      <svg id="hole-svg" viewBox="0 0 ${SVG_W} ${svgH}" width="100%"
           style="display:block;touch-action:manipulation;">
        <!-- fairway background -->
        <rect width="${SVG_W}" height="${svgH}" fill="#1e5c38"/>
        <!-- fairway strip -->
        <rect x="110" y="72" width="100" height="${svgH - 152}" fill="#2a7a4a" rx="45"/>
        <!-- green (white ellipse, top) -->
        <ellipse cx="160" cy="52" rx="65" ry="40" fill="white" opacity="0.92"/>
        <!-- hole cup -->
        <circle cx="160" cy="52" r="5" fill="#444"/>
        <!-- tee box (white rect, bottom) -->
        <rect x="115" y="${teeY}" width="90" height="45" fill="white" opacity="0.92" rx="5"/>
        <text x="160" y="${teeY + 28}" text-anchor="middle" font-size="13" fill="#444" font-weight="bold">TEE</text>
        ${noGpsMsg}
        <!-- shot path lines (scale with SVG) -->
        <g id="svg-lines"></g>
        <!-- pending tap indicator -->
        <circle id="svg-temp" cx="-200" cy="-200" r="12"
                fill="rgba(255,255,255,0.25)" stroke="white" stroke-width="2.5"
                stroke-dasharray="5 3" pointer-events="none"/>
        <!-- Pants Bear on the tee box — tap to dismiss and start plotting -->
        <image id="svg-bear" href="golf-golfing.gif"
               x="125" y="${teeY - 30}" width="70" height="70"
               preserveAspectRatio="xMidYMid meet"
               style="cursor:pointer;"${bearHide}/>
      </svg>
      <!-- Shot dots as HTML elements — fixed screen size regardless of SVG scale -->
      <div id="shot-dot-overlay"
           style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;"></div>
    </div>`;

  document.getElementById('hole-svg').addEventListener('click', handleSVGTap);

  // Bear tap: dismiss the bear (shot plotting already works at any time)
  const bearEl = document.getElementById('svg-bear');
  if (bearEl) {
    bearEl.addEventListener('click', (e) => {
      e.stopPropagation();
      bearEl.setAttribute('display', 'none');
    });
  }

  // Re-draw fixed-position dots whenever the layout changes (resize, orientation)
  if (svgResizeHandler) window.removeEventListener('resize', svgResizeHandler);
  svgResizeHandler = () => { const h = currentHoleData(); if (h) drawShotsSVG(h); };
  window.addEventListener('resize', svgResizeHandler);

  drawShotsSVG(hole);
}

function destroyHoleSVG() {
  if (svgResizeHandler) {
    window.removeEventListener('resize', svgResizeHandler);
    svgResizeHandler = null;
  }
  const wrap = document.getElementById('hole-svg-wrap');
  if (wrap) wrap.innerHTML = '';
  svgInitHole   = null;
  svgProjection = null;
  pendingSvgPt  = null;
  pendingLL     = null;
}

/** Convert a browser client coordinate to SVG viewBox space (handles CSS scaling). */
function clientToSvgPt(clientX, clientY) {
  const svg = document.getElementById('hole-svg');
  if (!svg) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function handleSVGTap(e) {
  if (document.getElementById('shot-sheet').classList.contains('shot-sheet--open')) return;

  const svgPt = clientToSvgPt(e.clientX, e.clientY);
  if (!svgPt) return;

  const hole = currentHoleData();
  if (!hole)  return;

  const svgH   = getSvgHeight(hole);
  pendingSvgPt = { x: svgPt.x, y: svgPt.y };
  pendingLL    = svgProjection
    ? svgToGpsCoord(svgPt.x, svgPt.y, hole, svgH, svgProjection)
    : null;

  placeTempDot(svgPt.x, svgPt.y);
  openShotSheet((hole.shots.length ?? 0) + 1);
}

function placeTempDot(x, y) {
  const el = document.getElementById('svg-temp');
  if (el) { el.setAttribute('cx', String(x)); el.setAttribute('cy', String(y)); }
}

function removeTempDot() {
  const el = document.getElementById('svg-temp');
  if (el) { el.setAttribute('cx', '-200'); el.setAttribute('cy', '-200'); }
  // pendingSvgPt is NOT cleared here — the shot flow manages that
}

/**
 * Redraw all shot dots and connecting lines.
 * Lines stay in SVG (scale with view).
 * Dots are HTML elements in an overlay — fixed ~20px screen size regardless of SVG scale.
 */
function drawShotsSVG(hole) {
  const linesG  = document.getElementById('svg-lines');
  const overlay = document.getElementById('shot-dot-overlay');
  if (!linesG || !overlay) return;
  linesG.innerHTML   = '';
  overlay.innerHTML  = '';

  const shots = hole.shots;

  // Hide the bear once any shot is logged
  if (shots.length > 0) {
    const bearEl = document.getElementById('svg-bear');
    if (bearEl) bearEl.setAttribute('display', 'none');
  }

  if (shots.length === 0) return;

  const svgH = getSvgHeight(hole);
  const ns   = 'http://www.w3.org/2000/svg';

  // Resolve SVG-space position for each shot
  const pos = shots.map(s => {
    if (s.lat != null && svgProjection) {
      return gpsToSvgCoord(s.lat, s.lng, hole, svgH, svgProjection);
    }
    if (s.svgXPct != null) {
      return { x: s.svgXPct * SVG_W, y: s.svgYPct * svgH };
    }
    return { x: SVG_W / 2, y: svgH / 2 };
  });

  // ── Connecting lines (SVG, scale with view) ───────────────────
  // Prepend tee box centre so the first line runs tee → shot 1.
  const teeCenter = { x: SVG_W / 2, y: svgH - 48 };
  const linePos   = [teeCenter, ...pos];

  for (let i = 1; i < linePos.length; i++) {
    const a    = linePos[i - 1];
    const b    = linePos[i];
    const shot = shots[i - 1];
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
    const isPutt = shot.club === 'P';
    const isPen  = isPenaltyShot(shot);
    line.setAttribute('stroke', isPen ? '#c4b5fd' : isPutt ? '#7dd3fc' : 'rgba(255,255,255,0.8)');
    line.setAttribute('stroke-width', isPutt ? '2.5' : '2');
    if (isPen) line.setAttribute('stroke-dasharray', '5 4');
    linesG.appendChild(line);
  }

  // ── Shot dots (fixed-position, won't scale with SVG zoom) ────
  // Use getBoundingClientRect to map SVG viewBox coords → viewport pixels.
  const svgEl  = document.getElementById('hole-svg');
  const svgRect = svgEl ? svgEl.getBoundingClientRect() : null;

  shots.forEach((shot, i) => {
    const p   = pos[i];
    const clr = SHOT_COLORS[shot.rating] ?? { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };

    const dot = document.createElement('div');
    dot.className = 'shot-dot-html';

    if (svgRect) {
      // Map SVG-space coords to CSS viewport pixels, then pin with position:fixed
      const screenX = svgRect.left + (p.x / SVG_W) * svgRect.width;
      const screenY = svgRect.top  + (p.y / svgH)  * svgRect.height;
      dot.style.position = 'fixed';
      dot.style.left     = screenX + 'px';
      dot.style.top      = screenY + 'px';
    } else {
      // Fallback: percentage over overlay
      dot.style.left = (p.x / SVG_W) * 100 + '%';
      dot.style.top  = (p.y / svgH)  * 100 + '%';
    }

    dot.style.background  = clr.bg;
    dot.style.borderColor = clr.border;
    dot.style.color       = clr.text;
    if (isPenaltyShot(shot)) dot.style.borderStyle = 'dashed';

    const ratingSpan = document.createElement('span');
    ratingSpan.textContent = shot.rating;
    dot.appendChild(ratingSpan);

    const badge = document.createElement('span');
    badge.className   = 'shot-dot-html__badge';
    badge.textContent = String(i + 1);
    dot.appendChild(badge);

    overlay.appendChild(dot);
  });
}

// =============================================================
// SHOT FLOW — tap map → bottom sheet → club → rating → log
// =============================================================

const CLUB_NAMES = {
  D: 'Driver', '3W': '3 Wood', '5W': '5 Wood',
  '3I': '3 Iron', '4I': '4 Iron', '5I': '5 Iron', '6I': '6 Iron',
  '7I': '7 Iron', '8I': '8 Iron', '9I': '9 Iron',
  PW: 'Pitching Wedge', SW: 'Sand Wedge', LW: 'Lob Wedge', P: 'Putter',
};

/** Open the sheet at Step 1 (club selection). pendingLL/pendingSvgPt already set. */
function openShotSheet(shotNum) {
  document.getElementById('sheet-title').textContent = `Shot ${shotNum} — Select Club`;
  pickerClub = null;
  document.getElementById('sheet-step-clubs').classList.remove('shot-sheet__step--hidden');
  document.getElementById('sheet-step-ratings').classList.add('shot-sheet__step--hidden');
  document.getElementById('shot-sheet').classList.add('shot-sheet--open');
}

function closeShotSheet() {
  document.getElementById('shot-sheet').classList.remove('shot-sheet--open');
  pickerClub = null;
}

/** Cancel — close sheet, remove temp dot, clear pending state. */
function cancelSheet() {
  closeShotSheet();
  removeTempDot();
  pendingSvgPt = null;
  pendingLL    = null;
}

/** Club tapped — advance to Step 2 (rating). */
function sheetSelectClub(club) {
  pickerClub = club;
  const label = CLUB_NAMES[club] ?? club;
  document.getElementById('sheet-rate-title').textContent = `Rate the ${label}`;
  document.getElementById('sheet-rate-label').textContent = `${label} — Rate the shot`;
  document.getElementById('sheet-step-clubs').classList.add('shot-sheet__step--hidden');
  document.getElementById('sheet-step-ratings').classList.remove('shot-sheet__step--hidden');
}

/** Back button — return to Step 1 (club selection). */
function sheetBackToClubs() {
  pickerClub = null;
  const hole    = currentHoleData();
  const shotNum = (hole?.shots.length ?? 0) + 1;
  document.getElementById('sheet-title').textContent = `Shot ${shotNum} — Select Club`;
  document.getElementById('sheet-step-ratings').classList.add('shot-sheet__step--hidden');
  document.getElementById('sheet-step-clubs').classList.remove('shot-sheet__step--hidden');
}

/** Rating tapped — log the shot, close sheet, clear pending state. */
function logShotFromSheet(rating) {
  if (!pickerClub)                  return;
  if (!pendingLL && !pendingSvgPt)  return;

  const hole    = currentHoleData();
  const svgH    = getSvgHeight(hole);
  const lat     = pendingLL?.lat  ?? null;
  const lng     = pendingLL?.lng  ?? null;
  const svgXPct = pendingSvgPt ? pendingSvgPt.x / SVG_W : null;
  const svgYPct = pendingSvgPt ? pendingSvgPt.y / svgH  : null;

  addShot(pickerClub, rating, lat, lng, svgXPct, svgYPct);

  // Close and clear AFTER the shot is safely logged
  closeShotSheet();
  removeTempDot();
  pendingSvgPt = null;
  pendingLL    = null;

  drawShotsSVG(hole);
  updateHoleDrawer();

  if (rating === '!') {
    showToast('Was it really that good?', document.getElementById('drawer-bar'));
  } else if (rating === 'OB' || rating === 'L') {
    showToast(`${rating} — penalty stroke added`, document.getElementById('drawer-bar'));
  }
}

// =============================================================
// BOTTOM DRAWER
// =============================================================

function updateHoleDrawer() {
  const hole = currentHoleData();
  if (!hole) return;

  const strokes = calcStrokes(hole);
  const putts   = hole.shots.filter(s => s.club === 'P').length;
  const rating  = calcRating(hole);

  // Collapsed bar
  document.getElementById('drawer-title').textContent =
    `Hole ${hole.holeNumber} · Par ${hole.par}`;
  document.getElementById('drawer-quick-stats').textContent =
    `${strokes} stroke${strokes !== 1 ? 's' : ''} · GSS ${fmtRating(rating)}`;

  // Expanded detail
  document.getElementById('drawer-strokes').textContent = strokes || '—';
  document.getElementById('drawer-putts').textContent   = strokes ? putts : '—';
  document.getElementById('drawer-gss').textContent     = strokes ? fmtRating(rating) : '—';

  // Shot list
  const shotsEl = document.getElementById('drawer-shots');
  if (hole.shots.length === 0) {
    shotsEl.textContent = '—';
  } else {
    shotsEl.innerHTML = hole.shots.map((s, i) => {
      const clr = SHOT_COLORS[s.rating] ?? { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };
      return `<span class="drawer-shot-chip" style="background:${clr.bg};border-color:${clr.border};color:${clr.text};">${i + 1}·${s.club}·${s.rating}</span>`;
    }).join('');
  }

  // Undo button state
  const undoBtn = document.getElementById('drawer-undo-btn');
  if (undoBtn) undoBtn.disabled = hole.shots.length === 0;

  // "On the Green" button (in drawer): only after 2+ shots, before onGreen is set
  const onGreenBtn = document.getElementById('on-green-btn');
  if (onGreenBtn) onGreenBtn.hidden = !(hole.shots.length >= 2 && !hole.onGreen);

  // "In the Hole!" button: only after onGreen flag set AND at least one putt logged
  const inHoleBtn = document.getElementById('in-hole-btn');
  if (inHoleBtn) inHoleBtn.hidden = !hole.onGreen || !hole.shots.some(s => s.isPutt);
}

function expandDrawer() {
  drawerExpanded = true;
  document.getElementById('hole-drawer').classList.add('hole-drawer--expanded');
}

function collapseDrawer() {
  drawerExpanded = false;
  document.getElementById('hole-drawer').classList.remove('hole-drawer--expanded');
}

function toggleDrawer() {
  if (drawerExpanded) collapseDrawer();
  else expandDrawer();
}

// =============================================================
// RENDER
// =============================================================

function render() {
  renderScreenVisibility();
  renderNav();
  updateWakeLock();

  switch (state.activeScreen) {
    case 'course':       renderCourseScreen(); break;
    case 'hole-view':    renderHoleView();     break;
    case 'scorecard':    renderScorecard();    break;
    case 'history':      renderHistory();      break;
    case 'round-review': renderRoundReview();  break;
    case 'yardage':      renderYardage();      break;
  }
}

function renderScreenVisibility() {
  document.querySelectorAll('.screen').forEach((el) => {
    const id = el.id.replace('screen-', '');
    el.classList.toggle('screen--active', id === state.activeScreen);
  });
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  // Hide nav on course screen only when no round is active, and always on round-review
  const inRound = state.holes.length > 0;
  const hideNav = (state.activeScreen === 'course' && !inRound) || state.activeScreen === 'round-review';
  nav.classList.toggle('nav--hidden', hideNav);

  nav.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.classList.toggle('nav__btn--active', btn.dataset.screen === state.activeScreen);
  });
}

// ── Course screen ─────────────────────────────────────────────
function renderCourseScreen() {
  // Always pre-populate nearbyResults with local courses so they show without GPS
  if (nearbyResults.length === 0) {
    nearbyResults = LOCAL_COURSES.map(c => ({ ...c, distanceYards: null, source: 'local' }));
  }

  // Reset GPS search trigger when no fix yet
  if (!state.gpsPosition) {
    courseSearchFired = false;
  }

  // Ensure something is shown (local courses at minimum)
  if (courseSearchResults.length === 0) {
    courseSearchResults = [...nearbyResults];
  }

  renderCourseList();
}

// ── Hole View ─────────────────────────────────────────────────
function renderHoleView() {
  const hole = currentHoleData();
  if (!hole) return;

  // Thin header
  document.getElementById('hole-header-num').textContent  = `Hole ${hole.holeNumber}`;
  document.getElementById('hole-header-meta').textContent =
    `Par ${hole.par}${hole.yardage ? ' · ' + hole.yardage + ' yds' : ''}`;

  document.getElementById('prev-hole-btn').disabled = state.currentHole <= 1;
  document.getElementById('next-hole-btn').disabled = state.currentHole >= state.totalHoles;

  // Init or re-init SVG when switching holes
  if (svgInitHole !== state.currentHole) {
    initHoleSVG(hole);
  }

  updateHoleDrawer();
}

// ── Yardage ───────────────────────────────────────────────────
function renderYardage() {
  const body = document.getElementById('yardage-body');
  if (!body) return;

  document.getElementById('yardage-course-name').textContent =
    state.courseName ?? 'Unnamed Course';

  if (state.holes.length === 0) {
    body.innerHTML = '<p class="history-empty">No hole data available.</p>';
    return;
  }

  body.innerHTML = state.holes.map((hole) => {
    let distStr = '';
    if (hole.green && state.gpsPosition) {
      const yds = haversineDistanceYards(
        state.gpsPosition.lat, state.gpsPosition.lng,
        hole.green.lat, hole.green.lng
      );
      distStr = `<span class="yardage-row__dist">${yds} yds to pin</span>`;
    }

    const strokes   = calcStrokes(hole);
    const rating    = calcRating(hole);
    const rCls      = rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : '';
    const scoreStr  = strokes ? fmtRating(rating) : '—';
    const active    = hole.holeNumber === state.currentHole ? ' yardage-row--active' : '';

    return `
      <div class="yardage-row${active}" data-hole="${hole.holeNumber}">
        <span class="yardage-row__hole">H${hole.holeNumber}</span>
        <span class="yardage-row__par">Par ${hole.par}</span>
        <span class="yardage-row__yardage">${hole.yardage ? hole.yardage + ' yds' : '—'}</span>
        ${distStr}
        <span class="yardage-row__score ${rCls}">${scoreStr}</span>
      </div>`;
  }).join('');
}

// ── Scorecard ─────────────────────────────────────────────────
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
    const rating  = hole.shots.length > 0 ? calcRating(hole) : null;

    if (idx < 9) {
      frontStrokes += strokes; frontPutts += putts; frontPar += hole.par;
      if (rating !== null) frontRating += rating;
    } else {
      backStrokes += strokes; backPutts += putts; backPar += hole.par;
      if (rating !== null) backRating += rating;
    }

    const ratingCell = rating !== null
      ? `<td class="${rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : ''}">${fmtRating(rating)}</td>`
      : `<td>—</td>`;

    const rowCls = hole.holeNumber === state.currentHole ? 'scorecard-row--current' : '';
    return `
      <tr class="${rowCls}" data-hole="${hole.holeNumber}" style="cursor:pointer">
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
    ${state.totalHoles > 9 ? subtotalRow('In', backPar, backStrokes, backPutts, backRating) : ''}
    ${subtotalRow('Total', totalPar, totalStrokes, totalPutts, totalRating, true)}
  `;
}

function subtotalRow(label, par, strokes, putts, rating, isBold = false) {
  const cls        = isBold ? 'scorecard-row--total' : 'scorecard-row--subtotal';
  const ratingStr  = strokes ? fmtRating(rating) : '—';
  const ratingCls  = rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : '';
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
  try { history = JSON.parse(localStorage.getItem('jep-gss-history') ?? '[]'); }
  catch (e) { /* ignore */ }

  if (history.length === 0) {
    body.innerHTML = `<p class="history-empty">No completed rounds yet.<br>Finish a round to see it here.</p>`;
    return;
  }

  const reversed = [...history].reverse();
  body.innerHTML = reversed.map((round, displayIdx) => {
    const storageIdx    = history.length - 1 - displayIdx;
    const totalStrokes  = round.holes.reduce((s, h) => s + calcStrokes(h), 0);
    const totalPutts    = round.holes.reduce((s, h) => s + h.shots.filter(sh => sh.club === 'P').length, 0);
    const totalRating   = round.holes.reduce((s, h) => s + calcRating(h), 0);
    const date          = new Date(round.date);
    const dateStr       = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const ratingCls     = totalRating > 0 ? 'rating--pos' : totalRating < 0 ? 'rating--neg' : '';

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
  try { history = JSON.parse(localStorage.getItem('jep-gss-history') ?? '[]'); }
  catch (e) { /* ignore */ }

  const round = history[state.reviewingRound];
  if (!round) {
    body.innerHTML = `<p class="history-empty">Round not found.</p>`;
    return;
  }

  const date    = new Date(round.date);
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

    const rCls    = rating > 0 ? 'rating--pos' : rating < 0 ? 'rating--neg' : '';
    const summary = shotSummary(hole);

    return `
      <tr>
        <td>${hole.holeNumber}</td>
        <td>${hole.par}</td>
        <td>${strokes || '—'}</td>
        <td>${strokes ? putts : '—'}</td>
        <td class="${rCls}">${strokes ? fmtRating(rating) : '—'}</td>
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
          <tr><th>Hole</th><th>Par</th><th>Strokes</th><th>Putts</th><th>Rating</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          ${round.holes.length > 9 ? subtotalRow('In', backPar, backStrokes, backPutts, backRating) : ''}
          ${subtotalRow('Total', totalPar, totalStrokes, totalPutts, totalRating, true)}
        </tfoot>
      </table>
    </div>`;
}

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
// ROUND ARCHIVE & EXPORT
// =============================================================

function endRound() {
  if (confirm('End round and save to history?')) {
    archiveRound();
    destroyHoleSVG();
    setState({
      courseName:     null,
      totalHoles:     18,
      holes:          [],
      currentHole:    1,
      mockMode:       false,
      activeScreen:   'course',
    });
  }
}

/** Mark the current hole as reached the green. Enables putt logging and In the Hole! */
function setOnGreen() {
  const hole = currentHoleData();
  if (!hole) return;
  hole.onGreen = true;
  persist();
  updateHoleDrawer();
}

/**
 * Mark the current hole complete and advance to the next.
 * Called by the "In the Hole!" button.
 */
function completeHole() {
  const hole = currentHoleData();
  if (!hole) return;
  const strokes = calcStrokes(hole);
  if (!confirm(`Hole ${hole.holeNumber} complete? (${strokes} stroke${strokes !== 1 ? 's' : ''})`)) return;
  hole.complete = true;
  persist();
  if (state.currentHole < state.totalHoles) {
    setState({ currentHole: state.currentHole + 1 });
  } else {
    endRound();
  }
}

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

function exportRound() {
  const rows = [['Hole', 'Par', 'Strokes', 'Putts', 'Rating', 'Shots']];
  state.holes.forEach((hole) => {
    const strokes = calcStrokes(hole);
    const putts   = hole.shots.filter(s => s.club === 'P').length;
    const rating  = hole.shots.length ? fmtRating(calcRating(hole)) : '';
    const shots   = hole.shots.map((s) => `${s.club}:${s.rating}`).join(' ');
    rows.push([hole.holeNumber, hole.par, strokes, putts, rating, shots]);
  });

  const csv  = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jep-gss-${state.courseName ?? 'round'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(message, anchor) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;

  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    toast.style.left   = `${rect.left + rect.width / 2}px`;
    toast.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  }

  toast.classList.add('toast--visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('toast--visible'), 2000);
}

// =============================================================
// EVENT WIRING
// =============================================================

function wireEvents() {

  // ── Nav buttons ──────────────────────────────────────────────
  document.querySelectorAll('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
  });

  // ── Logo: triple-tap → dev mode ──────────────────────────────
  let logoTaps = 0, logoTapTimer = null;
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

  // ── Dev panel ────────────────────────────────────────────────
  document.getElementById('dev-panel-close').addEventListener('click', () => {
    document.getElementById('dev-panel').hidden = true;
  });

  document.getElementById('mock-gps-btn').addEventListener('click', loadMockCourse);

  // ── GPS button ───────────────────────────────────────────────
  document.getElementById('find-location-btn').addEventListener('click', () => {
    document.getElementById('find-location-btn').hidden = true;
    document.getElementById('gps-status').classList.remove('gps-status--hidden');
    startGPS();
  });

  // ── Course list: select course ───────────────────────────────
  document.getElementById('course-list').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-course-idx]');
    if (!card) return;
    const course = courseSearchResults[parseInt(card.dataset.courseIdx, 10)];
    if (course) await startRoundFromCourse(course);
  });

  // ── Course name search ───────────────────────────────────────
  const courseInput     = document.getElementById('course-input');
  const courseSearchBtn = document.getElementById('course-search-btn');
  const triggerSearch   = () => searchCoursesByName(courseInput.value);
  courseSearchBtn.addEventListener('click', triggerSearch);
  courseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); triggerSearch(); }
  });

  // ── Manual start ─────────────────────────────────────────────
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

  // ── Hole header: back to course screen (round data preserved) ──
  document.getElementById('back-btn').addEventListener('click', () => navigateTo('course'));

  // ── Hole header: prev / next hole ───────────────────────────
  document.getElementById('prev-hole-btn').addEventListener('click', () => {
    if (state.currentHole > 1) setState({ currentHole: state.currentHole - 1 });
  });

  document.getElementById('next-hole-btn').addEventListener('click', () => {
    if (state.currentHole < state.totalHoles) setState({ currentHole: state.currentHole + 1 });
  });

  // ── Shot sheet: club grid (Step 1) ──────────────────────────
  document.getElementById('sheet-step-clubs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-club]');
    if (!btn) return;
    sheetSelectClub(btn.dataset.club);
  });

  // ── Shot sheet: rating grid (Step 2) ────────────────────────
  document.getElementById('sheet-step-ratings').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rating]');
    if (!btn) return;
    logShotFromSheet(btn.dataset.rating);
  });

  // ── Shot sheet: cancel / back ────────────────────────────────
  document.getElementById('sheet-cancel-btn').addEventListener('click', cancelSheet);
  document.getElementById('sheet-back-btn').addEventListener('click', sheetBackToClubs);

  // ── Drawer: tap bar or handle to toggle ──────────────────────
  document.getElementById('drawer-bar').addEventListener('click', toggleDrawer);
  document.querySelector('.hole-drawer__handle').addEventListener('click', toggleDrawer);

  // ── Drawer: swipe up/down to expand/collapse ─────────────────
  let drawerTouchY = 0;
  const drawerEl   = document.getElementById('hole-drawer');
  drawerEl.addEventListener('touchstart', (e) => {
    drawerTouchY = e.touches[0].clientY;
  }, { passive: true });
  drawerEl.addEventListener('touchend', (e) => {
    const dy = drawerTouchY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 20) {
      if (dy > 0) expandDrawer();
      else collapseDrawer();
    }
  }, { passive: true });

  // ── Drawer: undo / end round ─────────────────────────────────
  document.getElementById('drawer-undo-btn').addEventListener('click', undoLastShot);
  document.getElementById('drawer-end-btn').addEventListener('click', endRound);

  // ── Scorecard: tap row → go to that hole ────────────────────
  document.getElementById('scorecard-body').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-hole]');
    if (!row) return;
    const holeNum = parseInt(row.dataset.hole, 10);
    setState({ currentHole: holeNum, activeScreen: 'hole-view' });
  });

  // ── Scorecard: export / new round ───────────────────────────
  document.getElementById('export-btn').addEventListener('click', exportRound);
  document.getElementById('new-round-btn').addEventListener('click', () => {
    if (confirm('Start a new round? Current round will be saved locally.')) {
      archiveRound();
      destroyHoleSVG();
      setState({
        courseName:  null,
        totalHoles:  18,
        holes:       [],
        currentHole: 1,
        activeScreen: 'course',
      });
    }
  });

  // ── Yardage: tap row → go to that hole ──────────────────────
  document.getElementById('yardage-body').addEventListener('click', (e) => {
    const row = e.target.closest('[data-hole]');
    if (!row) return;
    const holeNum = parseInt(row.dataset.hole, 10);
    setState({ currentHole: holeNum, activeScreen: 'hole-view' });
  });

  // ── History: tap round → review ─────────────────────────────
  document.getElementById('history-body').addEventListener('click', (e) => {
    const card = e.target.closest('[data-round-idx]');
    if (!card) return;
    const idx = parseInt(card.dataset.roundIdx, 10);
    setState({ reviewingRound: idx, activeScreen: 'round-review' });
  });

  // ── Round review: back ───────────────────────────────────────
  document.getElementById('review-back-btn').addEventListener('click', () => {
    navigateTo('history');
  });

  // ── "On the Green" / "In the Hole!" ─────────────────────────
  document.getElementById('on-green-btn').addEventListener('click', setOnGreen);
  document.getElementById('in-hole-btn').addEventListener('click', completeHole);

  // ── API debug overlay: close ─────────────────────────────────
  document.getElementById('api-debug-close').addEventListener('click', () => {
    document.getElementById('api-debug-overlay').hidden = true;
  });
}

// =============================================================
// INIT
// =============================================================

function init() {
  loadPersistedState();
  state.activeScreen = 'course'; // always open on course selection, not mid-round
  wireEvents();
  render();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateWakeLock();
  });
}

document.addEventListener('DOMContentLoaded', init);
