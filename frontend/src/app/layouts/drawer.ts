export function shouldCloseDrawerForKey(key: string) {
  return key === 'Escape'
}

export function focusDrawerInitialElement(root: ParentNode = document) {
  const initialFocus = root.querySelector<HTMLElement>('[data-drawer-initial-focus]')
  if (!initialFocus) return false
  initialFocus.focus()
  return true
}

export function restoreDrawerTriggerFocus(trigger: HTMLElement | null) {
  if (!trigger) return false
  trigger.focus()
  return true
}

export function scheduleDrawerTriggerFocus(
  trigger: HTMLElement | null,
  schedule: (callback: () => void) => void = (callback) => setTimeout(callback, 0),
) {
  if (!trigger) return false
  schedule(() => restoreDrawerTriggerFocus(trigger))
  return true
}

export function closeDrawerAfterNavigation(close: (returnFocus: boolean) => void) {
  close(true)
}
