/**
 * Music.js — multi-track background audio player with smooth volume fade.
 * Tracks live at public/audio/{name}.mp3
 */
class Music {
  constructor() {
    this.audio = null
    this.isMuted = true
    this.targetVolume = 0
    this.currentVolume = 0
    this.masterVolume = 0.55
    this.currentTrackIndex = 0

    this.tracks = [
      { name: 'Anchor', src: '/audio/Anchor.mp3' },
      { name: 'Bypass', src: '/audio/Bypass.mp3' },
      { name: 'Cave In', src: '/audio/Cave%20In.mp3' },
    ]

    // Callbacks
    this.onMuteChange = null   // (isMuted: boolean) => void
    this.onTrackChange = null  // (trackName: string) => void
  }

  get currentTrack() {
    return this.tracks[this.currentTrackIndex]
  }

  init() {
    this.audio = new Audio()
    this.audio.loop = false
    this.audio.volume = 0
    this.audio.preload = 'auto'

    this.audio.addEventListener('ended', () => {
      this.advanceTrack()
    })

    this.audio.addEventListener('error', () => {
      // File missing or format unsupported — fail silently
    })

    this.loadTrack(this.currentTrackIndex, false)
  }

  loadTrack(index, andPlay = false) {
    this.currentTrackIndex = index % this.tracks.length
    if (!this.audio) return
    this.audio.src = this.currentTrack.src
    this.audio.load()
    if (andPlay) {
      this.audio.play().catch(() => {})
      this.onTrackChange?.(this.currentTrack.name)
    }
  }

  advanceTrack() {
    const next = (this.currentTrackIndex + 1) % this.tracks.length
    this.loadTrack(next, !this.isMuted)
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
        // Autoplay policy blocked — revert silently
        this.isMuted = true
        this.targetVolume = 0
        this.onMuteChange?.(true)
        return
      })
    }

    this.onMuteChange?.(false)
    this.onTrackChange?.(this.currentTrack.name)
  }

  mute() {
    if (!this.audio) return
    this.isMuted = true
    this.targetVolume = 0
    this.onMuteChange?.(true)
  }

  update() {
    if (!this.audio) return
    const delta = this.targetVolume - this.currentVolume
    if (Math.abs(delta) > 0.0005) {
      this.currentVolume += delta * 0.04
      this.audio.volume = Math.max(0, Math.min(1, this.currentVolume))
    } else {
      this.currentVolume = this.targetVolume
      this.audio.volume = this.targetVolume
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
