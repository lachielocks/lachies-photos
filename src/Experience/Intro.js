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

  constructor() {
    this._el = null
    this._canvas = null
    this._ctx = null
    this._hintEl = null
    this._raf = null
    this._start = 0
    this._dpr = 1
    this._resolve = null
    this._exited = false
  }

  // Returns a Promise that resolves when the intro fade begins
  run() {
    return new Promise((resolve) => {
      this._resolve = resolve
      this._el = document.getElementById('intro-screen')
      if (!this._el) { resolve(); return }

      this._canvas = this._el.querySelector('.intro-canvas')
      this._ctx = this._canvas.getContext('2d')
      this._hintEl = this._el.querySelector('.intro-hint')

      this._resize()
      this._onResize = () => this._resize()
      window.addEventListener('resize', this._onResize)

      // Skip on click or keydown
      this._onSkip = () => this._exit()
      this._el.addEventListener('pointerdown', this._onSkip, { once: true })
      document.addEventListener('keydown', this._onSkip, { once: true })

      this._start = performance.now()
      this._tick()

      this._hint1Timer = setTimeout(() => this._showHint('Scroll to explore'), 2200)
      this._hint2Timer = setTimeout(() => this._showHint('Click to expand a photo'), 3900)
      this._exitTimer  = setTimeout(() => this._exit(), 6200)
    })
  }

  _resize() {
    this._dpr = Math.min(window.devicePixelRatio || 1, 2)
    this._canvas.width  = window.innerWidth  * this._dpr
    this._canvas.height = window.innerHeight * this._dpr
  }

  _tick() {
    const t = (performance.now() - this._start) / 1000
    this._draw(t)
    this._raf = requestAnimationFrame(() => this._tick())
  }

  // ── Drawing ───────────────────────────────────────────────────────

  _draw(t) {
    const ctx = this._ctx
    const W = this._canvas.width
    const H = this._canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#08080c'
    ctx.fillRect(0, 0, W, H)

    // Gradient blobs bloom in over 0–1.8s
    const blobAlpha = Math.min(t / 1.8, 1)
    this._drawBlobs(ctx, W, H, t, blobAlpha)

    // Comet 1: warm orange, sweeps lower-left → upper-right (1.0s–3.8s)
    if (t > 1.0) this._drawComet(ctx, W, H, t - 1.0, 2.8, 0.28, 0.65, 0.55, 0.18, 1.05, 0.32, [255, 170, 80])

    // Comet 2: cool violet, sweeps upper-right → lower-left (3.0s–5.4s)
    if (t > 3.0) this._drawComet(ctx, W, H, t - 3.0, 2.4, 1.05, 0.28, 0.45, 0.78, -0.05, 0.65, [160, 110, 255])
  }

  _drawBlobs(ctx, W, H, t, alpha) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'

    // Blob 1 – warm amber (upper-left quadrant)
    const b1x = W * (0.22 + Math.sin(t * 0.38) * 0.04)
    const b1y = H * (0.32 + Math.cos(t * 0.31) * 0.04)
    const g1  = ctx.createRadialGradient(b1x, b1y, 0, b1x, b1y, W * 0.52)
    g1.addColorStop(0, `rgba(195, 85, 30, ${alpha * 0.55})`)
    g1.addColorStop(1, 'rgba(195, 85, 30, 0)')
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, W, H)

    // Blob 2 – deep purple (lower-right quadrant)
    const b2x = W * (0.74 + Math.sin(t * 0.27 + 1.5) * 0.05)
    const b2y = H * (0.64 + Math.cos(t * 0.24 + 2.1) * 0.05)
    const g2  = ctx.createRadialGradient(b2x, b2y, 0, b2x, b2y, W * 0.46)
    g2.addColorStop(0, `rgba(95, 40, 110, ${alpha * 0.52})`)
    g2.addColorStop(1, 'rgba(95, 40, 110, 0)')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)

    // Blob 3 – subtle cool teal (lower-left)
    const b3x = W * (0.08 + Math.sin(t * 0.22 + 3.0) * 0.04)
    const b3y = H * (0.80 + Math.cos(t * 0.29 + 1.2) * 0.04)
    const g3  = ctx.createRadialGradient(b3x, b3y, 0, b3x, b3y, W * 0.32)
    g3.addColorStop(0, `rgba(35, 80, 100, ${alpha * 0.38})`)
    g3.addColorStop(1, 'rgba(35, 80, 100, 0)')
    ctx.fillStyle = g3
    ctx.fillRect(0, 0, W, H)

    ctx.restore()
  }

  // sx/sy = normalised start, cx/cy = control point, ex/ey = end, [r,g,b] = color
  _drawComet(ctx, W, H, localT, dur, sx, sy, cx, cy, ex, ey, rgb) {
    const progress = Math.min(localT / dur, 1)
    const eased    = this._easeInOut(progress)

    const x = this._quad(eased, sx * W, cx * W, ex * W)
    const y = this._quad(eased, sy * H, cy * H, ey * H)
    const [r, g, b] = rgb

    // Fading trail (sample 70 past positions)
    for (let i = 1; i <= 70; i++) {
      const pp = Math.max(0, eased - i * 0.01)
      const tx = this._quad(pp, sx * W, cx * W, ex * W)
      const ty = this._quad(pp, sy * H, cy * H, ey * H)
      const fade  = 1 - i / 70
      const alpha = fade * fade * fade * 0.65
      const size  = Math.max(fade * 2.2 * this._dpr, 0.5)
      ctx.beginPath()
      ctx.arc(tx, ty, size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.fill()
    }

    // Glow head (while still in flight)
    if (progress < 0.97) {
      const gr = 20 * this._dpr
      const glow = ctx.createRadialGradient(x, y, 0, x, y, gr)
      glow.addColorStop(0,   `rgba(${r},${g},${b},0.9)`)
      glow.addColorStop(0.3, `rgba(${r},${g},${b},0.35)`)
      glow.addColorStop(1,   `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, gr, 0, Math.PI * 2)
      ctx.fill()

      // Bright core
      ctx.beginPath()
      ctx.arc(x, y, 2.5 * this._dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fill()
    }
  }

  // ── Hints ─────────────────────────────────────────────────────────

  _showHint(text) {
    if (!this._hintEl || this._exited) return
    this._hintEl.textContent = text
    this._hintEl.classList.remove('is-visible', 'is-out')
    // Force reflow so the transition fires
    void this._hintEl.offsetWidth
    this._hintEl.classList.add('is-visible')
    setTimeout(() => {
      this._hintEl.classList.remove('is-visible')
      this._hintEl.classList.add('is-out')
    }, 1600)
  }

  // ── Exit ──────────────────────────────────────────────────────────

  _exit() {
    if (this._exited) return
    this._exited = true

    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('keydown', this._onSkip)
    clearTimeout(this._hint1Timer)
    clearTimeout(this._hint2Timer)
    clearTimeout(this._exitTimer)

    Intro.markPlayed()

    // Resolve the promise now (so engine can start gallery reveal)
    // The CSS fade (0.7s) plays out concurrently
    this._el.classList.add('is-exiting')
    setTimeout(() => this._el.remove(), 900)
    this._resolve()
  }

  // ── Helpers ───────────────────────────────────────────────────────

  _quad(t, p0, p1, p2) {
    return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

export { Intro }
