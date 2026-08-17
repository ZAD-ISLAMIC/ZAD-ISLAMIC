import React from 'react'
import { ScreenPlaceholder } from '../components/ui/ScreenPlaceholder.jsx'
import { SCREENS_META } from '../constants/app.mjs'

export default function SettingsScreen() {
  return <ScreenPlaceholder {...SCREENS_META.settings} />
}