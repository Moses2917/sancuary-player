import type { Command, Operation, PlaybackState } from '../protocol'

export function state(): PlaybackState {
  return {
    context: { revision: 1, songId: 'song', itemId: 'item' },
    service: { id: 'service', name: 'Sunday' },
    song: { id: 'song', title: 'Hymn' },
    queue: [{ id: 'item', title: 'Hymn' }],
    services: [{ id: 'service', name: 'Sunday' }],
    markers: [{ id: 'cue', label: 'Verse', time: 10 }],
    status: 'paused',
    isPlaying: false,
    error: null,
    position: 20,
    duration: 120,
    master: 0.9,
    piano: 1,
    choir: 0.5,
    pianoMuted: false,
    choirMuted: false,
    solo: null,
    loop: null,
    hasNext: false,
    hasPrev: false,
  }
}
export function command(operation: Operation = { action: 'play' }): Command {
  return { version: 1, requestId: crypto.randomUUID(), context: state().context, operation }
}
