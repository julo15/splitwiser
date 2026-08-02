import { useEffect, useState, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function UpdateNotification() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const updateSWRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    updateSWRef.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        console.log('App ready to work offline')
      },
      immediate: true
    })
  }, [])

  if (!needRefresh) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-96">
      <div className="rounded-sw-card-lg bg-sw-surface text-sw-text p-4 shadow-[0_0_0_1px_var(--sw-line),0_6px_20px_rgb(0_0_0/0.28)] font-sans">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="block h-5 w-5 mt-px animate-spin rounded-full border-2 border-sw-line border-t-sw-accent" />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium">
              Update available
            </p>
            <p className="mt-1 text-[12.5px] text-sw-muted">
              Applying the latest version…
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
