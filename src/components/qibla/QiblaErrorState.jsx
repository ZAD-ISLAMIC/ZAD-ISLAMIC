import React from 'react'
import * as qibla from '../../services/qibla.mjs'
import { Icon } from '../ui/Icon.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import { cardinalName, formatDistance } from '../../utils/qiblaMath.mjs'

const COPY = {
  'sensor-unavailable': {
    icon: 'wifi-off',
    title: 'مستشعر البوصلة غير متاح',
    message: 'هذا الجهاز لا يحتوي على بوصلة مغناطيسية. يمكنك الاعتماد على اتجاه القبلة الثابت أدناه أو البحث عن أقرب مسجد للتأكد.',
  },
  'websensor-unavailable': {
    icon: 'wifi-off',
    title: 'البوصلة غير متاحة في هذا المتصفح',
    message: 'المتصفح لا يدعم قراءة اتجاه الجهاز. اعتمد على الاتجاه الثابت أدناه أو افتح التطبيق على جهاز Android.',
  },
  error: {
    icon: 'alert',
    title: 'تعذّرت قراءة الاتجاه',
    message: 'حدثت مشكلة اثناء قراءة مستشعر الجهاز. أعد المحاولة.',
  },
}

/**
 * Full-card fallback rendered instead of the compass when the sensor cannot
 * be used: explains why, shows a static bearing from the current location,
 * and offers a retry.
 */
export function QiblaErrorState({ status, error, qiblaBearing, distanceKm }) {
  const copy = COPY[status === 'error' ? 'error' : status] || COPY.error
  const bearingDeg = Math.round(qiblaBearing)

  return (
    <div className="qibla-broken" role="status">
      <span className="qibla-broken__icon">
        <Icon name={copy.icon} size={24} />
      </span>
      <h3>{copy.title}</h3>
      <p>{copy.message}</p>

      {Number.isFinite(qiblaBearing) && (
        <div className="qibla-broken__static">
          <span>اتجاه القبلة من موقعك</span>
          <strong dir="ltr">{arabicDigits(bearingDeg)}°</strong>
          <em>
            {cardinalName(qiblaBearing)}
            {distanceKm ? ` · على بعد ${formatDistance(distanceKm)}` : ''}
          </em>
        </div>
      )}

      {status === 'error' && error && <p className="qibla-broken__detail">{error.message}</p>}

      <button className="qibla-broken__retry" onClick={() => qibla.start()} type="button">
        <Icon name="refresh" size={15} />
        إعادة المحاولة
      </button>
    </div>
  )
}