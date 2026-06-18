import { describe, it, expect } from 'vitest'
import { uid, formatTime, formatDate } from '@/utils'

describe('uid', () => {
  it('generates a non-empty string', () => {
    expect(typeof uid()).toBe('string')
    expect(uid().length).toBeGreaterThan(0)
  })

  it('produces unique values across many calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()))
    expect(ids.size).toBe(500)
  })

  it('honours the prefix argument', () => {
    expect(uid('song')).toMatch(/^song_/)
    expect(uid('svc')).toMatch(/^svc_/)
  })
})

describe('formatTime', () => {
  it('formats zero and small values as M:SS', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(65)).toBe('1:05')
  })

  it('pads seconds to two digits', () => {
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(59)).toBe('0:59')
  })

  it('switches to H:MM:SS once an hour is reached', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3661)).toBe('1:01:01')
  })

  it('treats non-finite and negative values as 0:00', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
    expect(formatTime(-1)).toBe('0:00')
  })

  it('rounds down fractional seconds', () => {
    expect(formatTime(12.9)).toBe('0:12')
  })
})

describe('formatDate', () => {
  it('returns empty string for undefined input', () => {
    expect(formatDate(undefined)).toBe('')
  })

  it('returns the raw string when it cannot be parsed as a date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('formats an ISO date string compactly', () => {
    const out = formatDate('2026-06-22')
    expect(out).toContain('Jun')
    expect(out).toContain('22')
  })

  it('passes through free-form short text like "June 22"', () => {
    // New Date('June 22') parses to a valid date in current year
    const out = formatDate('June 22')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })
})
