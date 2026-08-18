import React from 'react'
import { HomeHero } from '../components/home/HomeHero.jsx'
import { PrayerCard } from '../components/home/PrayerCard.jsx'
import { DailyVerse } from '../components/home/DailyVerse.jsx'
import { DailyAdhkar } from '../components/home/DailyAdhkar.jsx'
import { ContinueRow } from '../components/home/ContinueRow.jsx'
import { FeatureGrid } from '../components/home/FeatureGrid.jsx'

export default function HomeScreen() {
  return (
    <section className="screen home">
      <HomeHero />
      <PrayerCard />
      <DailyVerse />
      <DailyAdhkar />
      <ContinueRow />
      <FeatureGrid />
    </section>
  )
}