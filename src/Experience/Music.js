/**
 * Music.js — background audio player with smooth volume fade.
 * Drop an audio file at public/audio/background.mp3 to activate.
 */
class Music {
  constructor() {
    this.audio = null
    this.isMuted = true
    this.isLoaded = false
    this.targetVolume = 0
    this.currentVolume = 0
    this.masterVolume = 0.55
    this.src = '/audio/background.mp3'
    this.onMuteChange = null // optional callback(isMuted)
  }

  init() {
    this.audio = new Audio()
    this.audio.loop = true
    this.audio.volume = 0
    this.audio.preload = 'auto'

    this.audio.addEventListener('canplaythrough', () => {
      this.isLoaded = true
    })

    // Silently swallow load errors (file might not exist yet)
    this.audio.addEventListener('error', () => {
      this.isLoaded = false
    })

    this.audio.src = this.src
    this.audio.load()
  }

  toggle() {
    if (this.isMuted) {
      this.unmute()
    } else {
      this.mute()
    }
    return !this.isMuted
  }

  unmute() {
    if (!this.audio) return
    this.isMuted = false
    this.targetVolume = this.masterVolume
    if (this.audio.paused) {
      this.audio.play().catch(() => {
        // Autoplay policy blocked — silently revert
        this.isMuted = true
        this.targetVolume = 0
        this.onMuteChange?.(true)
      })
    }
    this.onMuteChange?.(false)
  }

  mute() {
    if (!this.audio) return
    this.isMuted = true
    this.targetVolume = 0
    this.onMuteChange?.(true)
  }

  update() {
    if (!this.audio) return

    // Smooth exponential fade toward target
    const delta = this.targetVolume - this.currentVolume
    if (Math.abs(delta) > 0.0005) {
      this.currentVolume += delta * 0.04
      this.audio.volume = Math.max(0, Math.min(1, this.currentVolume))
    } else {
      this.currentVolume = this.targetVolume
      this.audio.volume = this.targetVolume
      // Pause when fully faded to free decoder resources
      if (this.targetVolume === 0 && !this.audio.paused) {
        this.audio.pause()
      }
    }
  }

  dispose() {
    if (!this.audio) return
    this.audio.pause()
    this.audio.src = ''
    this.audio = null
  }
}

export { Music }
