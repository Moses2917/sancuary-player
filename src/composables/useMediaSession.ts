import { onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'

/**
 * Bridge the player store to the OS-level Media Session API.
 *
 * Surfaces transport controls and "now playing" metadata to the browser
 * chrome (iOS lock screen, Android notification shade, macOS Now Playing,
 * Bluetooth media controllers). Safely no-ops when the API isn't present.
 */
export function useMediaSession() {
  const player = usePlayerStore()
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined

  function setMetadata() {
    if (!ms) return
    const song = player.currentSong
    const svc = player.service
    ms.metadata = new MediaMetadata({
      title: song?.title ?? 'Sanctuary Player',
      artist: svc?.name ?? 'No service loaded',
      album: 'Sanctuary Player',
    })
  }

  function setPositionState() {
    if (!ms) return
    if (
      'setPositionState' in ms &&
      Number.isFinite(player.duration) &&
      player.duration > 0 &&
      Number.isFinite(player.currentTime) &&
      player.currentTime >= 0
    ) {
      try {
        ms.setPositionState({
          duration: player.duration,
          playbackRate: 1,
          position: Math.min(player.currentTime, player.duration),
        })
      } catch {
        // Some browsers throw if the position is greater than the last
        // reported duration; ignore and let the next update retry.
      }
    }
  }

  function setPlaybackState() {
    if (!ms) return
    ms.playbackState = player.isPlaying ? 'playing' : 'paused'
  }

  function installHandlers() {
    if (!ms) return
    const trySet = (handler: MediaSessionActionHandler | null, action: MediaSessionAction) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // Action unsupported on this platform — ignore.
      }
    }
    trySet(() => void player.play(), 'play')
    trySet(() => player.pause(), 'pause')
    trySet(() => void player.prev(), 'previoustrack')
    trySet(() => void player.next(), 'nexttrack')
    trySet(() => player.stop(), 'stop')
    trySet(
      (details) => {
        // `seekTime` is an absolute target; if absent, fall back to the
        // current position so we still report an accurate position state.
        const target = Number.isFinite(details.seekTime as number)
          ? (details.seekTime as number)
          : player.currentTime
        void player.seek(target)
      },
      'seekto',
    )
    trySet(
      (details) => {
        const offset = details.seekOffset ?? 10
        void player.seek(Math.max(0, player.currentTime - offset))
      },
      'seekbackward',
    )
    trySet(
      (details) => {
        const offset = details.seekOffset ?? 10
        void player.seek(Math.min(player.duration, player.currentTime + offset))
      },
      'seekforward',
    )
  }

  const stopWatchMetadata = watch(() => player.currentSong?.id, setMetadata, { immediate: true })
  const stopWatchService = watch(() => player.service?.id, setMetadata)
  const stopWatchPlaying = watch(() => player.isPlaying, setPlaybackState, { immediate: true })
  const stopWatchPosition = watch(
    () => [player.currentTime, player.duration] as const,
    setPositionState,
  )

  onMounted(() => installHandlers())

  onUnmounted(() => {
    stopWatchMetadata()
    stopWatchService()
    stopWatchPlaying()
    stopWatchPosition()
    if (ms) {
      ms.metadata = null
      ms.playbackState = 'none'
    }
  })
}
