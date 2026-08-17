import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeTimes,
  METHOD_BY_ID,
  formatHour,
  toHourMinute,
  hourToDate,
  ASR_FACTORS,
} from '../src/services/prayerTimes.mjs'

/*
 * Reference vectors generated from the authoritative PrayTimes v2.3
 * implementation (praytimes.org). Values are float hours of the day.
 */
const VECTORS = {"mwsl":{"2008-6-1@21.4225,39.8262|tz3":{"fajr":4.231179083548021,"sunrise":5.632504180605822,"dhuhr":12.309381628738906,"asr":15.579621777080604,"maghrib":18.98834419873907,"isha":20.30520094351641,"asrHanafi":16.91717301417117},"2024-6-21@21.4225,39.8262|tz3":{"fajr":4.233456818901869,"sunrise":5.656849227895101,"dhuhr":12.376640063485619,"asr":15.707106623785819,"maghrib":19.09637245689138,"isha":20.432296915637636,"asrHanafi":17.026220369624966},"2024-12-21@21.4225,39.8262|tz3":{"fajr":5.576502670386193,"sunrise":6.9006606654690525,"dhuhr":12.315809912320374,"asr":15.382562014774036,"maghrib":17.730960100886783,"isha":18.979066051456023,"asrHanafi":16.133329314236963},"2025-8-15@21.4225,39.8262|tz3":{"fajr":4.680311967005063,"sunrise":5.984463094456771,"dhuhr":12.41940095652392,"asr":15.788655226169757,"maghrib":18.849906593436636,"isha":20.07442108697726,"asrHanafi":16.959922267017944},"2008-6-1@30.0444,31.2357|tz2":{"fajr":3.3269378657419275,"sunrise":4.904739976463333,"dhuhr":11.882143521956593,"asr":15.483247464217916,"maghrib":18.86265540523746,"isha":20.34214828440569,"asrHanafi":16.74672251759568},"2024-6-21@30.0444,31.2357|tz2":{"fajr":3.2966098137980713,"sunrise":4.908126922749979,"dhuhr":11.949426495295695,"asr":15.541105671495096,"maghrib":18.99063499151609,"isha":20.498933472594793,"asrHanafi":16.836502262731962},"2024-12-21@30.0444,31.2357|tz2":{"fajr":5.356080961784931,"sunrise":6.782570915819866,"dhuhr":11.888707638569727,"asr":14.686229237462257,"maghrib":16.994849808441593,"isha":18.34027354949525,"asrHanafi":15.379150704292597},"2025-8-15@30.0444,31.2357|tz2":{"fajr":3.939631956960444,"sunrise":5.373971344981083,"dhuhr":11.992021266826864,"asr":15.599483833697038,"maghrib":18.60351408423738,"isha":19.94790256008087,"asrHanafi":16.694091160457162},"2008-6-1@59.9139,10.7522|tz1":{"fajr":0.25440050924194413,"sunrise":3.108529494336829,"dhuhr":12.247858016448651,"asr":16.8625978835307,"maghrib":21.40027152414706,"isha":24.254400509241943,"asrHanafi":18.14180307450942},"2024-6-21@59.9139,10.7522|tz1":{"fajr":0.3149710284451137,"sunrise":2.8981185675739853,"dhuhr":12.31519922395585,"asr":17.008664119478226,"maghrib":21.73182348931624,"isha":24.314971028445115,"asrHanafi":18.32538412073276},"2024-12-21@59.9139,10.7522|tz1":{"fajr":6.544248698899391,"sunrise":9.304288162436068,"dhuhr":12.254745792935568,"asr":13.127895079008406,"maghrib":15.205267692765688,"isha":17.826067593675045,"asrHanafi":13.43262947021365},"2025-8-15@59.9139,10.7522|tz1":{"fajr":0.34657971194901993,"sunrise":4.53641793390459,"dhuhr":12.357397581774753,"asr":16.44836703076429,"maghrib":20.15674148999345,"isha":24.34657971194902,"asrHanafi":17.524249645759458},"2008-6-1@-6.2088,106.8456|tz7":{"fajr":4.711110649546254,"sunrise":5.948505686491042,"dhuhr":11.840940877501342,"asr":15.209074799350851,"maghrib":17.732847421063685,"isha":18.898747630551217,"asrHanafi":16.0919056952912},"2024-6-21@-6.2088,106.8456|tz7":{"fajr":4.776577948102272,"sunrise":6.026368719355072,"dhuhr":11.908005522973006,"asr":15.273349226444044,"maghrib":17.789651036100075,"isha":18.966613372948654,"asrHanafi":16.147309515182375},"2024-12-21@-6.2088,106.8456|tz7":{"fajr":4.330410026605557,"sunrise":5.603070892489029,"dhuhr":11.84630754112094,"asr":15.301718000828803,"maghrib":18.089551468641243,"isha":19.286623376334855,"asrHanafi":16.323079103175683},"2025-8-15@-6.2088,106.8456|tz7":{"fajr":4.81639836381392,"sunrise":5.9992725142541925,"dhuhr":11.952059791489123,"asr":15.304435803908142,"maghrib":17.906003804649536,"isha":19.019544548623717,"asrHanafi":16.252495051772126}},"isna":{"2008-6-1@43.6532,-79.3832|tz-5":{"fajr":2.8747291708094727,"sunrise":4.644024556151609,"dhuhr":12.2575393053148,"asr":16.339513312529238,"maghrib":19.87639416730853,"isha":21.64969809092094,"asrHanafi":17.541020134680796},"2024-6-21@43.6532,-79.3832|tz-5":{"fajr":2.7602117413714042,"sunrise":4.603337469431624,"dhuhr":12.325132127872998,"asr":16.433371640295775,"maghrib":20.046677491615238,"isha":21.889448462300212,"asrHanafi":17.663323897752665},"2024-12-21@43.6532,-79.3832|tz-5":{"fajr":6.353911376579498,"sunrise":7.800981762709234,"dhuhr":12.265847518451224,"asr":14.438846074174691,"maghrib":16.73082032801761,"isha":18.17752434562887,"asrHanafi":15.027594746644702},"2025-8-15@43.6532,-79.3832|tz-5":{"fajr":3.886665957347934,"sunrise":5.375433310984832,"dhuhr":12.365581001079953,"asr":16.23664304964986,"maghrib":19.344684688830842,"isha":20.828922651944797,"asrHanafi":17.27692958803758}},"egypt":{"2008-6-1@36.7538,3.0588|tz1":{"fajr":3.5036676646072085,"sunrise":5.504091595968089,"dhuhr":12.760806962368171,"asr":16.611511982485325,"maghrib":20.021601234483175,"isha":21.775170614929888,"asrHanafi":17.83051651487615},"2024-6-21@36.7538,3.0588|tz1":{"fajr":3.423030804894154,"sunrise":5.4878777136837735,"dhuhr":12.828169941336641,"asr":16.687511747578757,"maghrib":20.168324872292423,"isha":21.970227765190888,"asrHanafi":17.936015814935818},"2024-12-21@36.7538,3.0588|tz1":{"fajr":6.266086258240702,"sunrise":7.9454563079484295,"dhuhr":12.767816220140531,"asr":15.293403159909387,"maghrib":17.590201964548182,"isha":19.096199772677934,"asrHanafi":15.939707523477061},"2025-8-15@36.7538,3.0588|tz1":{"fajr":4.340503560855112,"sunrise":6.085122004644442,"dhuhr":12.870219298401594,"asr":16.622250998476325,"maghrib":19.64678786335644,"isha":21.18562746178684,"asrHanafi":17.681236840519286}},"makkah":{"2008-6-1@21.4225,39.8262|tz3":{"fajr":4.188144138931932,"sunrise":5.632504180605822,"dhuhr":12.309381628738906,"asr":15.579621777080604,"maghrib":18.98834419873907,"isha":20.48834419873907,"asrHanafi":16.91717301417117},"2024-6-21@21.4225,39.8262|tz3":{"fajr":4.189529819071458,"sunrise":5.656849227895101,"dhuhr":12.376640063485619,"asr":15.707106623785819,"maghrib":19.09637245689138,"isha":20.59637245689138,"asrHanafi":17.026220369624966},"2024-12-21@21.4225,39.8262|tz3":{"fajr":5.538701652857654,"sunrise":6.9006606654690525,"dhuhr":12.315809912320374,"asr":15.382562014774036,"maghrib":17.730960100886783,"isha":19.230960100886783,"asrHanafi":16.133329314236963},"2025-8-15@21.4225,39.8262|tz3":{"fajr":4.641185914608658,"sunrise":5.984463094456771,"dhuhr":12.41940095652392,"asr":15.788655226169757,"maghrib":18.849906593436636,"isha":20.349906593436636,"asrHanafi":16.959922267017944}},"karachi":{"2008-6-1@24.8615,67.0099|tz5":{"fajr":4.246668800587116,"sunrise":5.706558652636763,"dhuhr":12.496939512626035,"asr":15.878847087047012,"maghrib":19.28979988087608,"isha":20.751089021403175,"asrHanafi":17.197547705110146},"2024-6-21@24.8615,67.0099|tz5":{"fajr":4.236789937421653,"sunrise":5.722509054484698,"dhuhr":12.564119846475455,"asr":15.921255801029972,"maghrib":19.405671391427163,"isha":20.891206291806256,"asrHanafi":17.27545089175782},"2024-12-21@24.8615,67.0099|tz5":{"fajr":5.846665290330654,"sunrise":7.205362960030154,"dhuhr":12.502937600395631,"asr":15.471963798892737,"maghrib":17.800502382558705,"isha":19.158855001095844,"asrHanafi":16.199335948966883},"2025-8-15@24.8615,67.0099|tz5":{"fajr":4.753278151123995,"sunrise":6.101970319605514,"dhuhr":12.607405908828042,"asr":16.079704503600134,"maghrib":19.10760681270095,"isha":20.454259065182,"asrHanafi":17.216114690451455}},"tehran":{"2008-6-1@35.6892,51.389|tz3.5":{"fajr":3.1004830515773683,"sunrise":4.830570694679121,"dhuhr":12.038445084188716,"asr":15.85147662769061,"maghrib":19.597518449965783,"isha":20.56473895360152,"asrHanafi":17.075330509830376},"2024-6-21@35.6892,51.389|tz3.5":{"fajr":3.037871731168424,"sunrise":4.816660341345338,"dhuhr":12.10567038188394,"asr":15.92462873817539,"maghrib":19.74800413301783,"isha":20.739393466001662,"asrHanafi":17.178611500351696},"2024-12-21@35.6892,51.389|tz3.5":{"fajr":5.672579850923912,"sunrise":7.173863791885367,"dhuhr":12.044690448708991,"asr":14.617634666250076,"maghrib":17.25394199300897,"isha":18.097501925759005,"asrHanafi":15.271714210206795},"2025-8-15@35.6892,51.389|tz3.5":{"fajr":3.855845296047453,"sunrise":5.390013452399792,"dhuhr":12.148654753553844,"asr":15.880278273182144,"maghrib":19.217827510728757,"isha":20.076565015689322,"asrHanafi":16.944310359827938}},"diyanet":{"2024-6-21@41.0082,28.9784|tz3":{"fajr":3.4048231300692993,"sunrise":5.535817330429955,"dhuhr":13.099935872202424,"asr":17.114911874937768,"maghrib":20.663909872274488,"isha":22.63750889659022},"2025-8-15@41.0082,28.9784|tz3":{"fajr":4.497112277784499,"sunrise":6.2320164386486265,"dhuhr":13.14248697982112,"asr":16.972591198417334,"maghrib":20.04296758279599,"isha":21.661810065570872}},"kuwait":{"2024-6-21@29.3759,47.9774|tz3":{"fajr":3.2262476575708323,"sunrise":4.818885788064579,"dhuhr":11.833144711722802,"asr":15.396158785745,"maghrib":18.847322628415085,"isha":20.38888212080557},"2025-8-15@29.3759,47.9774|tz3":{"fajr":3.850835269400024,"sunrise":5.27276488924525,"dhuhr":11.87606316051702,"asr":15.467391541560696,"maghrib":18.472985062660825,"isha":19.84910111413381}}}

function diffMin(a, b) {
  const da = Math.round(a * 60)
  const db = Math.round(b * 60)
  const d = ((((da - db) % 1440) + 1440) % 1440)
  return Math.min(d, 1440 - d)
}

test('computeTimes reproduces PrayTimes v2.3 reference vectors', () => {
  for (const [methodId, entries] of Object.entries(VECTORS)) {
    for (const [key, expect] of Object.entries(entries)) {
      const [dateKey, geo] = key.split('@')
      const [y, m, d] = dateKey.split('-').map(Number)
      const [lat, tz] = geo.split('|')
      const [latNum, lngNum] = lat.split(',').map(Number)
      const tzNum = Number(tz.replace('tz',''))
      const params = METHOD_BY_ID[methodId].params
      const times = computeTimes(new Date(y, m - 1, d), [latNum, lngNum, 0], tzNum, params, 1, 'NightMiddle')
      for (const [k, ref] of Object.entries(expect)) {
        const mine = times[k]
        if (k === 'asrHanafi') {
          const h = computeTimes(new Date(y, m - 1, d), [latNum, lngNum, 0], tzNum, params, ASR_FACTORS.hanafi, 'NightMiddle')
          assert.ok(diffMin(ref, h.asr) <= 1, methodId+'/'+key+' asrHanafi: got ' + h.asr + ", ref " + ref)
          continue
        }
        assert.ok(Number.isFinite(mine), methodId+'/'+key+' NaN')
        assert.ok(diffMin(ref, mine) <= 1, methodId+'/'+key+` ${k}: got ` + mine.toFixed(4) + `, ref ` + ref.toFixed(4))
      }
    }
  }
})

test('prayers are strictly ordered through the day', () => {
  const times = computeTimes(new Date(2024, 5, 21), [21.4225, 39.8262, 0], 3, METHOD_BY_ID.mwsl.params, 1, 'NightMiddle')
  const order = [times.fajr, times.sunrise, times.dhuhr, times.asr, times.maghrib, times.isha]
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1])
})

test('dhuhr sits near local solar noon', () => {
  const times = computeTimes(new Date(2024, 5, 21), [21.4225, 39.8262, 0], 3, METHOD_BY_ID.mwsl.params, 1, 'NightMiddle')
  // solar noon ≈ 12 + tz - lng/15 - equationOfTime (± a couple minutes)
  assert.ok(Math.abs((times.dhuhr % 24) - 12.29) < 0.12)
})

test('formatHour supports 24h and 12h Arabic-style', () => {
  assert.equal(formatHour(5.25, false), '05:15')
  assert.equal(formatHour(5.25, true), '5:15 ص')
  assert.equal(formatHour(12.5, true), '12:30 م')
  assert.equal(formatHour(23.75, true), '11:45 م')
  assert.equal(formatHour(NaN), '—')
})

test('hourToDate converts a local hour into the right epoch', () => {
  // 2024-06-21 07:30 local at UTC+3 => 04:30 UTC
  const d = hourToDate({ y: 2024, m: 6, d: 21 }, 3, 7.5)
  assert.equal(d.toISOString(), '2024-06-21T04:30:00.000Z')
  // 2024-06-21 22:45 local at UTC-5 => 2024-06-22 03:45 UTC
  const d2 = hourToDate({ y: 2024, m: 6, d: 21 }, -5, 22.75)
  assert.equal(d2.toISOString(), '2024-06-22T03:45:00.000Z')
})

test('custom method still computes finite times', () => {
  const params = { fajr: 20, isha: 18, maghrib: '0 min' }
  const times = computeTimes(new Date(2024, 5, 21), [21.4225, 39.8262, 0], 3, params, 2, 'AngleBased')
  for (const k of ['fajr','sunrise','dhuhr','asr','maghrib','isha']) {
    assert.ok(Number.isFinite(times[k]), k + ' finite')
  }
})

test('toHourMinute rounds to the nearest minute', () => {
  assert.deepEqual(toHourMinute(5.999), { h: 6, m: 0 })
  assert.deepEqual(toHourMinute(17.5333), { h: 17, m: 32 })
  assert.deepEqual(toHourMinute(-1), null)
})
