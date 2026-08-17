/**
 * geo.json helpers (located at src/resources/data/geo.json).
 * Lazy-loaded so the ~7MB JSON stays out of the critical bundle.
 *
 * Schema:
 *   { generated, countries: [{ c, n, en, lat, lon, tz,
 *      cities: [[ar, en, lat, lon], ...] }] }
 */
let cache = null
let loading = null

export async function loadGeo() {
  if (cache) return cache
  if (!loading) {
    loading = import('../resources/data/geo.json').then((mod) => {
      cache = mod.default
      return cache
    })
  }
  return loading
}

export const PRAYER_COUNTRY_CODE = 'SA'

export async function getCountries() {
  const { countries } = await loadGeo()
  return [...countries].sort((a, b) => a.n.localeCompare(b.n, 'ar'))
}

export async function getCities(code) {
  const { countries } = await loadGeo()
  const c = countries.find((x) => x.c === code)
  if (!c) return []
  return c.cities.map(([ar, en, lat, lon]) => ({ ar, en, lat, lon }))
}

const R = 6371.0088 // km

export function haversineKm(aLat, aLon, bLat, bLon) {
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Reverse-geocode coordinates to the nearest city in geo.json.
 * maxKm caps how far a match can be; returns null when nothing is close.
 */
export async function findNearestCity(lat, lon, maxKm = 200) {
  const { countries } = await loadGeo()
  let best = null
  for (const c of countries) {
    const cDist = haversineKm(lat, lon, c.lat, c.lon)
    for (const [ar, en, clat, clon] of c.cities) {
      const d = haversineKm(lat, lon, clat, clon)
      if (!best || d < best.d) {
        best = {
          d,
          countryCode: c.c,
          countryAr: c.n,
          countryEn: c.en,
          cityAr: ar,
          cityEn: en,
          lat: clat,
          lon: clon,
          tz: c.tz,
        }
      }
      // If the country capital is close but the city list is huge, early-exit
      if (d < 1) break
    }
    if (cDist < 2 && best && best.d < 5) break
  }
  return best && best.d <= maxKm ? best : null
}