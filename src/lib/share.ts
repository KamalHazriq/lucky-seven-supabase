/**
 * Share utilities — v1.6
 * Generates shareable auto-join links and invite messages.
 * Links use /join?code=XXXXXX so recipients auto-join the game.
 */

/** Get the shareable auto-join link (uses joinCode, not gameId) */
export function getJoinLink(joinCode: string): string {
  const origin = window.location.origin
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
  // HashRouter: links are like https://host/path/#/join?code=XXXXXX
  return `${origin}${base}/#/join?code=${joinCode}`
}

/** Get the direct lobby link for a gameId (fallback, non-auto-join) */
export function getRoomLink(gameId: string): string {
  const origin = window.location.origin
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
  return `${origin}${base}/#/lobby/${gameId}`
}

/** Get a copyable invite message */
export function getInviteMessage(joinCode: string): string {
  const link = getJoinLink(joinCode)
  return `Join my Lucky Seven room!\nCode: ${joinCode}\n${link}`
}

/** Copy text to clipboard with fallback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers / insecure contexts
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}
