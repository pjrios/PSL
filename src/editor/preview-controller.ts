interface PreviewControllerOptions {
  onStart: () => boolean | void
  onStop: () => void
}

export function createPreviewController({ onStart, onStop }: PreviewControllerOptions) {
  let active = false

  return {
    isActive: () => active,
    start() {
      if (active) return true
      if (onStart() === false) return false
      active = true
      return true
    },
    stop() {
      if (!active) return false
      active = false
      onStop()
      return true
    },
    toggle() {
      if (active) this.stop()
      else this.start()
    },
  }
}

interface PreviewNavigationOptions {
  controller: { isActive: () => boolean }
  navigate: (pageId: string) => void
  pageExists: (pageId: string) => boolean
}

export function navigatePreviewToPage(
  pageId: string,
  { controller, navigate, pageExists }: PreviewNavigationOptions,
) {
  if (!controller.isActive() || !pageExists(pageId)) return false
  navigate(pageId)
  return true
}
