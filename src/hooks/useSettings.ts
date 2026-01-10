import { useState, useEffect, useCallback } from 'react'

export function useSettings<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.mirrorControl.getSetting(key).then((stored: T | null) => {
      if (stored !== null && stored !== undefined) {
        setValue(stored)
      }
      setLoading(false)
    })
  }, [key])

  const set = useCallback(async (newValue: T) => {
    setValue(newValue)
    await window.mirrorControl.setSetting(key, newValue)
  }, [key])

  return [value, set, loading] as const
}
