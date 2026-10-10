import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  if (!installPrompt) return null

  async function install() {
    const promptEvent = installPrompt
    if (!promptEvent) return
    await promptEvent.prompt()
    await promptEvent.userChoice
    setInstallPrompt(null)
  }

  return <button type="button" onClick={() => void install()} className="mt-3 w-full rounded-xl border border-[var(--color-primary)] px-4 py-3 text-left text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-navigation-hover)]">Instalar aplicativo</button>
}
