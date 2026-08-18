/**
 * Qibla direction math — pure functions, no DOM, testable in Node.
 *
 * All angles are compass degrees (0 = North, increasing clockwise).
 * The Qibla bearing is the initial great-circle bearing from the observer
 * to the Kaaba (21.4225°N, 39.8262°E) — identical coordinates to the
 * prayer-times fallback in location.mjs.
 */

export const KAABA = { lat: 21.4225, lon: 39.8262 }

const R = 6371.0088 // km

const toRad = (d) => (d * Math.PI) / 180
const toDeg = (r) => (r * 180) / Math.PI

/** Normalize any angle into [0, 360). */
export function normalizeDeg(deg) {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/**
 * Initial great-circle bearing from (lat1, lon1) to (lat2, lon2).
 * Returns degrees in [0, 360); 0 = North.
 */
export function bearingTo(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  return normalizeDeg(toDeg(Math.atan2(y, x)))
}

/** Bearing from the observer to the Kaaba, in [0, 360). */
export function qiblaBearing(lat, lon) {
  return bearingTo(lat, lon, KAABA.lat, KAABA.lon)
}

/**
 * Shortest signed angular difference from `heading` to `target`, in [-180, 180].
 * Positive = the target lies clockwise (to the right) of the current heading.
 */
export function signedDelta(target, heading) {
  let d = normalizeDeg(target - heading)
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

const CARDINALS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']

/** Nearest 45° cardinal name for a compass degree. */
export function cardinalName(deg) {
  const idx = Math.round(normalizeDeg(deg) / 45) % 8
  return CARDINALS[idx]
}

/** Arabic instruction phrasing for a signed delta. */
export function directionName(delta) {
  if (Math.abs(delta) < 3) return 'أمامك'
  return delta > 0 ? 'يمينك' : 'يسارك'
}

/** Haversine distance (km) from the observer to the Kaaba. */
export function distanceKm(lat, lon) {
  const dLat = toRad(KAABA.lat - lat)
  const dLon = toRad(KAABA.lon - lon)
  const la1 = toRad(lat)
  const la2 = toRad(KAABA.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Human distance: metres under 1 km, kilometres above. */
export function formatDistance(km) {
  if (!Number.isFinite(km) || km <= 0) return ''
  if (km < 1) return `${Math.round(km * 1000)} م`
  if (km < 100) return `${km.toFixed(1)} كم`
  return `${Math.round(km)} كم`
}

/* ------------------------------------------------------------------ *
 * Magnetic declination (WMM2025, truncated to spherical-harmonic
 * degree 6). Copied from the NOAA/NCEI WMM reference implementation
 * (public domain): Schmidt-normalized associated Legendre functions,
 * geodetic→geocentric conversion with the WGS84 ellipsoid, and the
 * standard field synthesis B = −∇V on the reference sphere.
 *
 * Returned declination D is east-positive degrees: add it to a
 * magnetic azimuth (AH) to convert to true north (D = atan2(Y, X)).
 * Truncating the model at degree 6 keeps < ~0.5° error in declination
 * away from the polar regions — far below phone-sensor noise.
 * ------------------------------------------------------------------ */

const WMM_A = 6378.137      // WGS84 semi-major axis (km)
const WMM_B = 6356.7523142  // WGS84 semi-minor axis (km)
const WMM_RE = 6371.2       // WMM reference radius (km)
const NMAX = 6              // spherical-harmonic truncation degree

const WMM_G = { /* [n][m] g_nm (nT), WMM2025 epoch 2025.0 */
  1: [0, -29351.7976, -1410.7694],
  2: [0, -2556.6143, 2951.1266, 1649.2918],
  3: [0, 1361.001, -2404.1317, 1243.7667, 453.6466],
  4: [0, 894.9612, 799.544, 55.7274, -281.0878, 12.0546],
  5: [0, -233.1862, 368.8561, 187.1931, -138.727, -141.9821, 20.8846],
  6: [0, 64.3509, 63.7744, 76.8697, -115.7171, -40.8959, 14.8566, -60.7286],
}

const WMM_H = { /* [n][m] h_nm (nT) */
  1: [0, 0, 4545.3934],
  2: [0, 0, -3133.635, -815.0624],
  3: [0, 0, -56.5875, 237.5101, -549.4721],
  4: [0, 0, 278.5889, -133.897, 212.0024, -375.5678],
  5: [0, 0, 45.3865, 220.1588, -122.9064, 42.9685, 106.0766],
  6: [0, 0, -18.4364, 16.7828, 48.779, -59.7541, 10.9015, 72.6934],
}

// Precompute the Schmidt normalization factors and the Legendre
// recursion coefficient k[m][n], exactly as the NOAA reference does.
const WMM_DIM = NMAX + 2
const schmidtSeed = new Float64Array(WMM_DIM * WMM_DIM)
const kk = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1))
const gc = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1))
const hc = Array.from({ length: NMAX + 1 }, () => new Float64Array(NMAX + 1))

schmidtSeed[0] = 1
for (let n = 1; n <= NMAX; n++) {
  let j = 2
  schmidtSeed[n] = schmidtSeed[n - 1] * ((2 * n - 1) / n)
  for (let m = 0; m <= n; m++) {
    kk[m][n] = (((n - 1) * (n - 1)) - m * m) / ((2 * n - 1) * (2 * n - 3))
    if (m > 0) {
      const flnmj = (((n - m + 1) * j) / (n + m))
      schmidtSeed[n + m * WMM_DIM] = schmidtSeed[n + (m - 1) * WMM_DIM] * Math.sqrt(flnmj)
      j = 1
      hc[n][m - 1] = schmidtSeed[n + m * WMM_DIM] * (WMM_H[n]?.[m + 1] || 0)
    }
    gc[m][n] = schmidtSeed[n + m * WMM_DIM] * (WMM_G[n]?.[m + 1] || 0)
  }
}
kk[1][1] = 0

/**
 * Magnetic declination (degrees, east-positive) at (lat, lon) using the
 * WMM2025 model truncated to degree 6. Latitude/longitude are geodetic
 * degrees; height is assumed to be sea level.
 */
export function magneticDeclination(lat, lon) {
  const rlon = (lon * Math.PI) / 180
  const rlat = (lat * Math.PI) / 180
  const srlon = Math.sin(rlon)
  const crlon = Math.cos(rlon)
  const srlat = Math.sin(rlat)
  const crlat = Math.cos(rlat)
  const srlat2 = srlat * srlat
  const crlat2 = crlat * crlat

  const alt = 0
  const q = Math.sqrt(WMM_A * WMM_A - (WMM_A * WMM_A - WMM_B * WMM_B) * srlat2)
  const q1 = alt * q
  const q2 = ((q1 + WMM_A * WMM_A) / (q1 + WMM_B * WMM_B)) ** 2
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2)
  const st = Math.sqrt(Math.max(0, 1 - ct * ct))
  const r = Math.sqrt(
    alt * alt + 2 * q1 + ((WMM_A ** 4 - (WMM_A ** 4 - WMM_B ** 4) * srlat2) / (q * q))
  )
  const d = Math.sqrt(WMM_A * WMM_A * crlat2 + WMM_B * WMM_B * srlat2)
  const ca = (alt + d) / r
  const sa = (((WMM_A * WMM_A - WMM_B * WMM_B) * crlat * srlat) / (r * d))

  const sp = new Float64Array(WMM_DIM)
  const cp = new Float64Array(WMM_DIM)
  sp[1] = srlon
  cp[1] = crlon
  for (let m = 2; m <= NMAX; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1]
  }

  // Working Legendre values + derivatives, seeded with the Schmidt factors.
  const P = Float64Array.from(schmidtSeed)
  const dP = new Float64Array(P.length)

  let br = 0
  let bt = 0
  let bp = 0
  let bpp = 0
  const aor = WMM_RE / r
  let ar = aor * aor
  for (let n = 1; n <= NMAX; n++) {
    ar *= aor
    for (let m = 0; m <= n; m++) {
      const idx = n + m * WMM_DIM
      if (n === m) {
        const prev = P[n - 1 + (m - 1) * WMM_DIM]
        P[idx] = st * prev
        dP[idx] = st * dP[n - 1 + (m - 1) * WMM_DIM] + ct * prev
      } else if (n === 1 && m === 0) {
        P[idx] = ct * P[0]
        dP[idx] = ct * dP[0] - st * P[0]
      } else {
        if (m > n - 2) {
          P[n - 2 + m * WMM_DIM] = 0
          dP[n - 2 + m * WMM_DIM] = 0
        }
        P[idx] = ct * P[n - 1 + m * WMM_DIM] - kk[m][n] * P[n - 2 + m * WMM_DIM]
        dP[idx] =
          ct * dP[n - 1 + m * WMM_DIM] -
          st * P[n - 1 + m * WMM_DIM] -
          kk[m][n] * dP[n - 2 + m * WMM_DIM]
      }

      const par = ar * P[idx]
      const g = gc[m][n]
      const h = m > 0 ? hc[n][m - 1] : 0
      const temp1 = m === 0 ? g : g * cp[m] + h * sp[m]
      const temp2 = m === 0 ? 0 : g * sp[m] - h * cp[m]

      bt -= ar * temp1 * dP[idx]
      bp += m * temp2 * par
      br += (n + 1) * temp1 * par

      if (st === 0 && m === 1) {
        bpp = 0 // exact-pole headless branch; bp below falls back to bpp
      }
    }
  }

  if (st < 1e-12) bp = bpp
  else bp /= st

  const bx = -bt * ca - br * sa // geodetic North
  const by = bp                 // East
  return (Math.atan2(by, bx) * 180) / Math.PI
}

/**
 * Compass heading (0..360, clockwise from true north) of the TOP edge of a
 * device, from its rotation matrix `R` (flat row-major 3×3, device→world in
 * the Android frame: +X east, +Y north, +Z up). Equivalent to projecting the
 * body +Y axis onto the horizontal plane. Tilt-agnostic: works flat on a
 * table and held upright without the classic remap/singularity wobble.
 */
export function headingFromDeviceTop(R) {
  return normalizeDeg(Math.atan2(R[1], R[4]) * (180 / Math.PI))
}