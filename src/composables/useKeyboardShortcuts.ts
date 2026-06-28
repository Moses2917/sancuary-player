import { onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

/**
 * Global keyboard shortcuts:
 *   Space              play/pause (when not typing in a field)
 *   ArrowRight/Left    seek ±5s
 *   Shift+Arrow→/←     next / prev track
 *   M                  mute both tracks (toggle)
 *   P                  toggle piano mute
 *   C                  toggle choir mute
 *   L                  toggle A↔B loop
 *   F                  drop a fade region at the playhead
 *   1..9               jump to the Nth cue marker
 *   Esc                stop
 */
export function useKeyboardShortcuts() {
  const player = usePlayerStore()
  const SEEK_STEP_SEC = 5

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

    // Single-letter shortcuts: require a song loaded.
    if (player.currentSong && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'm':
          e.preventDefault()
          if (player.pianoMuted && player.choirMuted) {
            player.togglePianoMute()
            player.toggleChoirMute()
          } else {
            player.muteAll()
          }
          return
        case 'p':
          e.preventDefault()
          player.togglePianoMute()
          return
        case 'c':
          e.preventDefault()
          player.toggleChoirMute()
          return
        case 'l':
          e.preventDefault()
          player.toggleLoop()
          return
        case 'f':
          e.preventDefault()
          void player.addFadeHere()
          return
      }

      // Numeric shortcuts jump to the Nth cue marker.
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        const marker = player.currentMarkers[idx]
        if (marker) {
          e.preventDefault()
          void player.seek(marker.time)
        }
        return
      }
    }

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
        } else if (player.currentSong && Number.isFinite(player.duration)) {
          e.preventDefault()
          void player.seek(Math.min(player.duration, player.currentTime + SEEK_STEP_SEC))
        }
        break
      case 'ArrowLeft':
        if (e.shiftKey) {
          e.preventDefault()
          void player.prev()
        } else if (player.currentSong) {
          e.preventDefault()
          void player.seek(Math.max(0, player.currentTime - SEEK_STEP_SEC))
        }
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onUnmounted(() => window.removeEventListener('keydown', onKey))
}
