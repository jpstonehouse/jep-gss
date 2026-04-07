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
      console.log('[API Detail] Raw response:', raw.slice(0, 1000));

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
      console.log('[Courses] First result sample:', JSON.stringify(list[0]).slice(0, 800));
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
function addShot(club, rating, lat, lng) {
  const hole = currentHoleData();
  if (!hole) return;

  hole.shots.push({
    id:        hole.shots.length + 1,
    club,
    rating,
    ratingVal: JEP_RATINGS[rating] ?? 0,
    lat:       lat ?? null,
    lng:       lng ?? null,
  });

  persist();
}

function undoLastShot() {
  const hole = currentHoleData();
  if (!hole || hole.shots.length === 0) return;
  hole.shots.pop();
  persist();
  drawShots(hole);
  updateHoleDrawer();
}

// =============================================================
// NAVIGATION
// =============================================================

function navigateTo(screen) {
  if (screen === 'course') destroyHoleMap();
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
// LEAFLET MAP
// =============================================================

let leafletMap    = null;
let shotLayer     = null;
let tempMarker    = null;
let pendingLL     = null;    // real GPS coords of the tapped shot position
let pickerClub    = null;
let drawerExpanded  = false;
let mapInitHole     = null;  // holeNumber the map is currently initialized for
let holeTransform   = null;  // coordinate transform for current hole (see computeHoleTransform)

/**
 * Compass bearing from point 1 to point 2, in degrees (0=North).
 */
function computeBearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Build a coordinate transform for a hole so the tee→green axis maps to north.
 *
 * The map is displayed north-up (no CSS rotation). Instead, all GPS coordinates
 * — shots, tee, green — are mathematically rotated around the hole centre by the
 * tee→green bearing so that, in the transformed space, the tee is directly south
 * of the green. The map tiles displayed are for the rotated coordinates (nearby
 * terrain) rather than CSS-rotating the tiles themselves, which is unreliable.
 *
 * Returns { fwd(lat,lng) → display {lat,lng}, inv(lat,lng) → real {lat,lng} }
 * or null when the hole lacks tee or green GPS data.
 */
function computeHoleTransform(hole) {
  if (!hole.tee || !hole.green) return null;

  const cLat  = (hole.tee.lat  + hole.green.lat)  / 2;
  const cLng  = (hole.tee.lng  + hole.green.lng)  / 2;
  const mLat  = 111320;                                      // metres per degree latitude
  const mLng  = mLat * Math.cos(cLat * Math.PI / 180);      // metres per degree longitude

  // Rotate the coordinate system counterclockwise by the bearing so that the
  // tee→green direction (bearing B) maps to north (the +y / north axis).
  const bearing = computeBearing(hole.tee.lat, hole.tee.lng, hole.green.lat, hole.green.lng);
  const α   = bearing * Math.PI / 180;
  const cosA = Math.cos(α);
  const sinA = Math.sin(α);

  // Forward: real GPS → display (rotated) coordinates
  const fwd = (lat, lng) => {
    const dx  = (lng - cLng) * mLng;        // east offset (metres)
    const dy  = (lat - cLat) * mLat;        // north offset (metres)
    const rdx = dx * cosA - dy * sinA;      // rotated east
    const rdy = dx * sinA + dy * cosA;      // rotated north
    return { lat: cLat + rdy / mLat, lng: cLng + rdx / mLng };
  };

  // Inverse: display (rotated) coordinates → real GPS
  const inv = (lat, lng) => {
    const rdx = (lng - cLng) * mLng;
    const rdy = (lat - cLat) * mLat;
    const dx  =  rdx * cosA + rdy * sinA;   // transpose of rotation matrix
    const dy  = -rdx * sinA + rdy * cosA;
    return { lat: cLat + dy / mLat, lng: cLng + dx / mLng };
  };

  return { fwd, inv };
}

function destroyHoleMap() {
  if (leafletMap) {
    leafletMap.remove();
    leafletMap    = null;
    shotLayer     = null;
    tempMarker    = null;
    pendingLL     = null;
    mapInitHole   = null;
    holeTransform = null;
  }
}

// Dot color scheme per JEP rating
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

function initHoleMap(hole) {
  const container = document.getElementById('hole-map-leaflet');
  if (!container) return;

  // Tear down any existing map first
  if (leafletMap) {
    leafletMap.remove();
    leafletMap    = null;
    shotLayer     = null;
    tempMarker    = null;
    holeTransform = null;
  }

  // Hide the "no GPS data" overlay by default; shown below if needed
  const mapMsgEl = document.getElementById('map-no-gps-msg');
  if (mapMsgEl) mapMsgEl.hidden = true;

  const hasTeeGreen = !!(hole.tee && hole.green);

  // Compute the coordinate transform (only when both tee and green GPS known).
  holeTransform = computeHoleTransform(hole);

  // Map centre: real midpoint (transform pivot = midpoint, so it maps to itself).
  // For API courses with no hole GPS, fall back to user GPS position.
  const center = hasTeeGreen
    ? [(hole.tee.lat + hole.green.lat) / 2, (hole.tee.lng + hole.green.lng) / 2]
    : hole.green
    ? [hole.green.lat, hole.green.lng]
    : state.gpsPosition
    ? [state.gpsPosition.lat, state.gpsPosition.lng]
    : [36.5685, -121.9498];

  leafletMap = L.map('hole-map-leaflet', {
    center,
    zoom: 17,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
  }).addTo(leafletMap);

  if (hasTeeGreen) {
    // Force zoom 18 centred on the hole midpoint.
    // The coordinate transform aligns tee→green with north so the hole
    // appears vertical: tee at bottom, green at top.
    leafletMap.invalidateSize();
    leafletMap.setView(center, 18);

    // ── Debug markers: RED = tee, GREEN = green ──────────────
    // Placed at their transformed (display) coordinates so we can verify
    // the tee-at-bottom / green-at-top orientation is correct.
    const teeFwd   = holeTransform.fwd(hole.tee.lat,   hole.tee.lng);
    const greenFwd = holeTransform.fwd(hole.green.lat, hole.green.lng);

    L.circleMarker([teeFwd.lat,   teeFwd.lng],   {
      radius: 10, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9, weight: 3,
    }).addTo(leafletMap);
    L.circleMarker([greenFwd.lat, greenFwd.lng], {
      radius: 10, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9, weight: 3,
    }).addTo(leafletMap);

  } else {
    // API course with no hole GPS — show message and centre on user GPS
    if (mapMsgEl) mapMsgEl.hidden = false;
    if (state.gpsPosition) {
      leafletMap.invalidateSize();
      leafletMap.setView([state.gpsPosition.lat, state.gpsPosition.lng], 17);
    }
  }

  // Layer for shots — cleared and redrawn after each logged shot
  shotLayer = L.layerGroup().addTo(leafletMap);

  // Tap handler
  leafletMap.on('click', handleMapTap);

  drawShots(hole);
  mapInitHole = hole.holeNumber;
}

/**
 * Clear and redraw all shot markers + path lines for a hole.
 * All real GPS coordinates are run through holeTransform.fwd() before
 * being plotted so shots appear correctly on the rotated coordinate system.
 */
function drawShots(hole) {
  if (!shotLayer) return;
  shotLayer.clearLayers();

  const gpsShots = hole.shots.filter(s => s.lat != null && s.lng != null);
  if (gpsShots.length === 0) return;

  // Pre-compute display (transformed) coordinates for every shot
  const disp = gpsShots.map(s =>
    holeTransform ? holeTransform.fwd(s.lat, s.lng) : { lat: s.lat, lng: s.lng }
  );

  // ── Path lines (drawn first, below dots) ────────────────────
  for (let i = 1; i < gpsShots.length; i++) {
    const a = disp[i - 1];
    const b = disp[i];

    if (isPenaltyShot(gpsShots[i - 1])) {
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: '#c4b5fd', weight: 2, dashArray: '5 4', opacity: 0.8,
      }).addTo(shotLayer);
    } else {
      const isPutt = gpsShots[i - 1].club === 'P';
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color:  isPutt ? '#7dd3fc' : '#6b7280',
        weight: isPutt ? 2.5 : 2,
      }).addTo(shotLayer);
    }
  }

  // ── Shot dots ─────────────────────────────────────────────────
  gpsShots.forEach((shot, i) => {
    const pos  = disp[i];
    const clr  = SHOT_COLORS[shot.rating] ?? { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };
    const size = shot.club === 'P' ? 26 : 30;
    const dash = isPenaltyShot(shot) ? 'border-style:dashed;' : '';

    const icon = L.divIcon({
      className:  '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div class="shot-dot" style="width:${size}px;height:${size}px;background:${clr.bg};border-color:${clr.border};color:${clr.text};${dash}">${shot.rating}<div class="shot-num-badge">${i + 1}</div></div>`,
    });

    L.marker([pos.lat, pos.lng], { icon, interactive: false }).addTo(shotLayer);
  });
}

function handleMapTap(e) {
  // Ignore taps while shot picker is open
  if (!document.getElementById('shot-picker').hidden) return;

  const displayLL = e.latlng;

  // Convert the tapped display coordinate back to real GPS for storage.
  // (The map shows rotated coordinates; shots must be stored as real GPS.)
  pendingLL = holeTransform
    ? holeTransform.inv(displayLL.lat, displayLL.lng)
    : { lat: displayLL.lat, lng: displayLL.lng };

  // Place the temp marker at the display (rotated) position
  placeTempMarker([displayLL.lat, displayLL.lng]);

  const hole    = currentHoleData();
  const shotNum = (hole?.shots.length ?? 0) + 1;
  showShotConfirm(shotNum);
}

function placeTempMarker(latlng) {
  removeTempMarker();
  const icon = L.divIcon({
    className:  '',
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
    html: '<div class="temp-marker-dot"></div>',
  });
  tempMarker = L.marker(latlng, { icon, interactive: false }).addTo(leafletMap);
}

function removeTempMarker() {
  if (tempMarker && leafletMap) {
    leafletMap.removeLayer(tempMarker);
    tempMarker = null;
  }
}

// =============================================================
// SHOT FLOW — confirm → picker → log
// =============================================================

function showShotConfirm(shotNum) {
  document.getElementById('confirm-num').textContent = shotNum;
  document.getElementById('shot-confirm').hidden = false;
}

function hideShotConfirm() {
  document.getElementById('shot-confirm').hidden = true;
}

function cancelConfirm() {
  hideShotConfirm();
  removeTempMarker();
  pendingLL = null;
}

function confirmYes() {
  hideShotConfirm();
  const hole    = currentHoleData();
  const shotNum = (hole?.shots.length ?? 0) + 1;
  showShotPicker(shotNum);
}

function showShotPicker(shotNum) {
  document.getElementById('picker-num').textContent = shotNum;

  // Always start at club selection
  document.getElementById('picker-clubs').hidden   = false;
  document.getElementById('picker-ratings').hidden = true;
  pickerClub = null;

  document.getElementById('shot-picker').hidden = false;
}

function hideShotPicker() {
  document.getElementById('shot-picker').hidden = true;
  pickerClub = null;
}

function cancelPicker() {
  hideShotPicker();
  removeTempMarker();
  pendingLL = null;
}

/**
 * A club was tapped in the picker — show the rating grid.
 */
function pickerSelectClub(club) {
  pickerClub = club;

  const CLUB_NAMES = {
    D: 'Driver', '3W': '3 Wood', '5W': '5 Wood',
    '3I': '3 Iron', '4I': '4 Iron', '5I': '5 Iron', '6I': '6 Iron',
    '7I': '7 Iron', '8I': '8 Iron', '9I': '9 Iron',
    PW: 'Pitching Wedge', SW: 'Sand Wedge', LW: 'Lob Wedge', P: 'Putter',
  };

  document.getElementById('picker-rate-label').textContent =
    `${CLUB_NAMES[club] ?? club} — Rate the shot`;
  document.getElementById('picker-clubs').hidden   = true;
  document.getElementById('picker-ratings').hidden = false;
}

/**
 * A rating was tapped — log the shot and close the picker.
 */
function logShotFromPicker(rating) {
  if (!pickerClub || !pendingLL) return;

  const club = pickerClub;
  const lat  = pendingLL.lat;
  const lng  = pendingLL.lng;

  addShot(club, rating, lat, lng);
  hideShotPicker();
  removeTempMarker();
  pendingLL  = null;
  pickerClub = null;

  const hole = currentHoleData();
  drawShots(hole);
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

  // Init or update map
  if (mapInitHole !== state.currentHole) {
    initHoleMap(hole);
  } else if (leafletMap) {
    leafletMap.invalidateSize();
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
    destroyHoleMap();
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

  // ── Shot confirmation overlay ────────────────────────────────
  document.getElementById('confirm-yes-btn').addEventListener('click', confirmYes);
  document.getElementById('confirm-retap-btn').addEventListener('click', cancelConfirm);

  // ── Shot picker: club grid ───────────────────────────────────
  document.getElementById('picker-clubs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-club]');
    if (!btn) return;
    pickerSelectClub(btn.dataset.club);
  });

  // ── Shot picker: rating grid ─────────────────────────────────
  document.getElementById('picker-ratings').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rating]');
    if (!btn) return;
    logShotFromPicker(btn.dataset.rating);
  });

  // ── Shot picker: cancel ──────────────────────────────────────
  document.getElementById('picker-cancel-btn').addEventListener('click', cancelPicker);

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
      destroyHoleMap();
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
