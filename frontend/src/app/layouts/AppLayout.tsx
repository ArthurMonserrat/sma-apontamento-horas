import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { DesktopSidebar, MobileDrawer } from './Sidebar'
import { closeDrawerAfterNavigation, focusDrawerInitialElement, scheduleDrawerTriggerFocus, shouldCloseDrawerForKey } from './drawer'

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AppLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const closeSidebar = (returnFocus = false) => {
    setSidebarOpen(false)
    if (returnFocus) scheduleDrawerTriggerFocus(menuButtonRef.current)
  }

  useEffect(() => {
    if (!isSidebarOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!shouldCloseDrawerForKey(event.key)) return
      event.preventDefault()
      closeSidebar(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    focusDrawerInitialElement()
    const focusFrame = requestAnimationFrame(() => focusDrawerInitialElement())
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      cancelAnimationFrame(focusFrame)
    }
  }, [isSidebarOpen])

  const trapDrawerFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!isSidebarOpen || event.key !== 'Tab' || window.matchMedia('(min-width: 768px)').matches) return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector))
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--color-background)] text-[var(--color-text)]">
      <a href="#main-content" className="ui-card fixed left-3 top-3 z-50 -translate-y-20 rounded-lg px-4 py-2 font-bold text-[var(--color-primary)] focus:translate-y-0">Ir para o conteúdo principal</a>
      <Header ref={menuButtonRef} isMenuOpen={isSidebarOpen} onMenuToggle={() => setSidebarOpen((current) => !current)} />
      <div data-layout-body className="relative grid min-h-[calc(100vh-5rem)] min-w-0 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
        <DesktopSidebar />
        <main id="main-content" className="w-full min-w-0 overflow-x-hidden" tabIndex={-1}>
          <Outlet />
        </main>
        {isSidebarOpen && (
          <button
            type="button"
            className="fixed inset-x-0 bottom-0 top-20 z-20 bg-[var(--color-overlay)] md:hidden"
            onClick={() => closeSidebar(true)}
            aria-label="Fechar navegação"
          />
        )}
        <MobileDrawer isOpen={isSidebarOpen} onClose={() => closeSidebar(true)} onNavigate={() => closeDrawerAfterNavigation(closeSidebar)} onKeyDown={trapDrawerFocus} />
      </div>
    </div>
  )
}
