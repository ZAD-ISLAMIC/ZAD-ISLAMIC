import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from '../services/quiz.mjs'

/** لقطة حيّة لحالة تقدّم الأسئلة تتحدث تلقائياً مع كل تسجيل نتيجة. */
export function useQuiz() {
  return useSyncExternalStore(subscribe, getSnapshot)
}