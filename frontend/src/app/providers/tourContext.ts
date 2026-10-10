import { createContext, useContext } from 'react'

type TourContextValue = { startTour: () => void }

export const TourContext = createContext<TourContextValue>({ startTour: () => undefined })

export function useTour() {
  return useContext(TourContext)
}
