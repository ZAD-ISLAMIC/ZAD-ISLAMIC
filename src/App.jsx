import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell.jsx'
import { Loader } from './components/ui/Loader.jsx'

const HomeScreen = lazy(() => import('./screens/HomeScreen.jsx'))
const QuranScreen = lazy(() => import('./screens/QuranScreen.jsx'))
const QuranSurahScreen = lazy(() => import('./screens/QuranSurahScreen.jsx'))
const AdhkarScreen = lazy(() => import('./screens/AdhkarScreen.jsx'))
const AdhkarCategoryScreen = lazy(() => import('./screens/AdhkarCategoryScreen.jsx'))
const HisnMuslimScreen = lazy(() => import('./screens/HisnMuslimScreen.jsx'))
const HisnMuslimCategoryScreen = lazy(() => import('./screens/HisnMuslimCategoryScreen.jsx'))
const PrayerScreen = lazy(() => import('./screens/PrayerScreen.jsx'))
const TasbihScreen = lazy(() => import('./screens/TasbihScreen.jsx'))
const RadioScreen = lazy(() => import('./screens/RadioScreen.jsx'))
const RecitersScreen = lazy(() => import('./screens/RecitersScreen.jsx'))
const ReciterScreen = lazy(() => import('./screens/ReciterScreen.jsx'))
const QuizScreen = lazy(() => import('./screens/QuizScreen.jsx'))
const QuizCategoryScreen = lazy(() => import('./screens/QuizCategoryScreen.jsx'))
const QuizSessionScreen = lazy(() => import('./screens/QuizSessionScreen.jsx'))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.jsx'))
const NotFoundScreen = lazy(() => import('./screens/NotFoundScreen.jsx'))

export function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/quran" element={<QuranScreen />} />
          <Route path="/quran/:surahIndex" element={<QuranSurahScreen />} />
          <Route path="/adhkar" element={<AdhkarScreen />} />
          <Route path="/adhkar/:categoryKey" element={<AdhkarCategoryScreen />} />
          <Route path="/hisn" element={<HisnMuslimScreen />} />
          <Route path="/hisn/:categoryId" element={<HisnMuslimCategoryScreen />} />
          <Route path="/prayer" element={<PrayerScreen />} />
          <Route path="/tasbih" element={<TasbihScreen />} />
          <Route path="/radio" element={<RadioScreen />} />
          <Route path="/reciters" element={<RecitersScreen />} />
          <Route path="/reciters/:reciterId" element={<ReciterScreen />} />
          <Route path="/quiz" element={<QuizScreen />} />
          <Route path="/quiz/:categoryEnglish" element={<QuizCategoryScreen />} />
          <Route path="/quiz/:categoryEnglish/:topicSlug/:level" element={<QuizSessionScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </Suspense>
  )
}