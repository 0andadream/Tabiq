import type { Currency, Group } from '@shared/types.ts'

const PREFIX = 'tabiq:'

export type Preferences = {
  displayName: string
  defaultCurrency: Currency
}

const defaultPreferences: Preferences = {
  displayName: '',
  defaultCurrency: 'NIM',
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Ignore quota / private mode.
  }
}

export function loadPreferences(): Preferences {
  return { ...defaultPreferences, ...read('preferences', defaultPreferences) }
}

export function savePreferences(prefs: Preferences) {
  write('preferences', prefs)
}

export function cacheGroups(groups: Group[]) {
  write('cache:groups', { at: Date.now(), groups })
}

export function loadCachedGroups(): { at: number; groups: Group[] } | null {
  return read('cache:groups', null)
}

export function cacheGroup(group: Group) {
  write(`cache:group:${group.id}`, { at: Date.now(), group })
}

export function loadCachedGroup(id: string): Group | null {
  return read<{ at: number; group: Group } | null>(`cache:group:${id}`, null)?.group ?? null
}
