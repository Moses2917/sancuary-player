/** Generate a reasonably unique id without pulling in a uuid dep. */
export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${rnd}` : rnd
}

/** Format seconds as M:SS or H:MM:SS. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Create a short, human-friendly date label. */
export function formatDate(input?: string): string {
  if (!input) return ''
  let parsed: Date
  // Date-only ISO strings ("YYYY-MM-DD") are parsed as UTC by the spec,
  // which shifts the calendar day in non-UTC timezones. Treat them as
  // local instead so the displayed day matches what the user entered.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (dateOnly) {
    parsed = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    )
  } else {
    parsed = new Date(input)
  }
  if (Number.isNaN(parsed.getTime())) return input
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: input.length >= 8 ? 'numeric' : undefined,
  })
}
