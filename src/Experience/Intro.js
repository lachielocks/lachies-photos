const STORAGE_KEY = 'lachies-photos-intro-v1'

class Intro {
  static shouldPlay() {
    try { return !localStorage.getItem(STORAGE_KEY) } catch { return false }
  }
  static markPlayed() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
  }
  static reset() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }
}

export { Intro }
