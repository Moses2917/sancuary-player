import { onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

/**
 * Global keyboard shortcuts:
 * - Space: play/pause (when not typing in a field)
 * - ArrowRight / ArrowLeft: next / prev track (with Shift)
 * - M: toggle master mute via piano/choir? no — M = stop
 * - Esc: stop
 */
export function useKeyboardShortcuts() {
  const player = usePlayerStore()

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // Always allow Escape even from inputs (cancel/play)
    if (e.key === 'Escape') {
      if (player.isPlaying) {
        player.stop()
        e.preventDefault()
      }
      return
    }

    if (isEditableTarget(e.target)) return

    switch (e.key) {
      case ' ':
      case 'Spacebar':
        if (player.currentSong) {
          e.preventDefault()
          player.toggle()
        }
        break
      case 'ArrowRight':
        if (e.shiftKey) {
          e.preventDefault()
          void player.next()
        }
        break
      case 'ArrowLeft':
        if (e.shiftKey) {
          e.preventDefault()
          void player.prev()
        }
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onUnmounted(() => window.removeEventListener('keydown', onKey))
}
