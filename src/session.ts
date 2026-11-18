// Remembers your seat so a refresh or a dropped phone connection puts you back in the lobby.
const KEY = 'toh.session';

export interface SavedSession {
  code: string;
  token: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: SavedSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode etc. — not fatal */
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem('toh.name') ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('toh.name', name);
  } catch {
    /* ignore */
  }
}
