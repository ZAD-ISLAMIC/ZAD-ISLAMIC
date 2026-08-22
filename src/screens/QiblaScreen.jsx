import React, { useEffect, useSyncExternalStore } from 'react'
import * as qibla from '../services/qibla.mjs'
import { QiblaCompass } from '../components/qibla/QiblaCompass.jsx'
import { QiblaDelta } from '../components/qibla/QiblaDelta.jsx'
import { QiblaStatusCard } from '../components/qibla/QiblaStatusCard.jsx'
import { QiblaLocationCard } from '../components/qibla/QiblaLocationCard.jsx'
import { QiblaErrorState } from '../components/qibla/QiblaErrorState.jsx'
import '../styles/qibla.css'

export default function QiblaScreen() {
  const q = useSyncExternalStore(qibla.subscribe, qibla.getSnapshot)

  // Live only while the screen is mounted and the app is visible: the sensor
  // is released on unmount/hide so it never drains the battery in the
  // background.
  useEffect(() => {
    qibla.start()
    const onVisibility = () => {
      if (document.hidden) qibla.stop()
      else qibla.start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      qibla.stop()
    }
  }, [])

  const active = q.status === 'running' || q.status === 'calib-required'
  const broken = ['sensor-unavailable', 'websensor-unavailable', 'error'].includes(q.status)

  return (
    <section className="screen qibla">
      <p className="qibla__verse">﴿فَوَلِّ وَجْهَكَ شَطْرَ الْمَسْجِدِ الْحَرَامِ﴾</p>

      <div className="qibla__card">
        <QiblaCompass
          status={q.status}
          heading={q.heading}
          qiblaBearing={q.qiblaBearing}
          delta={q.delta}
          aligned={q.aligned}
        />

        {active && (
          <>
            <QiblaDelta delta={q.delta} aligned={q.aligned} />
            <QiblaStatusCard
              heading={q.heading}
              qiblaBearing={q.qiblaBearing}
              headingAccuracy={q.headingAccuracy}
              distanceKm={q.distanceKm}
            />
          </>
        )}

        {broken && (
          <QiblaErrorState
            status={q.status}
            error={q.error}
            qiblaBearing={q.qiblaBearing}
            distanceKm={q.distanceKm}
          />
        )}
      </div>

      <QiblaLocationCard
        location={q.location}
        locationStatus={q.locationStatus}
        locationError={q.locationError}
        watching={q.watching}
      />
    </section>
  )
}