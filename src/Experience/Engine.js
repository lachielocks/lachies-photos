import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { world } from '@/Experience/'
import { Scroll } from '@/Experience/Scroll'
import { Nav } from '@/Experience/Nav'
import { Cursor } from '@/Experience/Cursor'
import { Music } from '@/Experience/Music'
import { Intro } from '@/Experience/Intro'

class Engine {
  constructor(canvas, experience = world) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Engine requires a valid canvas element')
    }

    // Initialization
    this.canvas = canvas
    this.experience = experience
    this.debug = this.experience.debug
    this.isInitialized = false
    this.isRunning = false
    this.isDebugBound = false
    this.animationFrameRequestId = null
    this.preloadedTextures = new Map()
    this.stats = null
    this.showFps = true
    this.isDebugUiVisible = false
    this.scene = new THREE.Scene()

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    this.camera.position.set(0, 0, 6)

    // Scroll
    this.scroll = new Scroll(this.camera, this.experience.gallery, this.debug)

    // Nav
    this.nav = new Nav()

    // Cursor (custom circle cursor + click-to-expand)
    this.cursor = new Cursor({ gallery: this.experience.gallery, scroll: this.scroll })

    // Background music
    this.music = new Music()

    // Progress bar fill element (populated after DOM is ready)
    this.progressBarFill = null

    // Present mode
    this.isPresentMode = false

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.autoClear = false

    this.onResize = () => {
      this.resize()
    }
    this.onFullscreenChange = () => {
      if (!document.fullscreenElement && this.isPresentMode) {
        this.isPresentMode = false
        document.body.classList.remove('is-presenting')
        if (this.presentToggleBtn) this.presentToggleBtn.textContent = 'Present'
      }
    }
    this.onKeyDown = (event) => {
      if (event.repeat) return
      if (event.key.toLowerCase() === 'd') {
        this.setDebugUiVisible(!this.isDebugUiVisible)
        return
      }
      if (event.key.toLowerCase() === 'p') {
        this.togglePresentMode()
        return
      }
      if (event.key.toLowerCase() === 'm') {
        this.music.toggle()
        return
      }
      if (event.key === 'Escape') {
        if (this.shortcutsMenuOpen) {
          this.closeShortcutsMenu()
          return
        }
        if (this.cursor?.isExpanded) {
          this.cursor.collapse()
          return
        }
        if (this.isPresentMode) {
          this.togglePresentMode()
          return
        }
        if (this.nav?.isOpen) {
          this.nav.close()
          return
        }
        this.nav.open()
        return
      }
      if (event.key === '?') {
        this.toggleShortcutsMenu()
        return
      }
      if (event.key === ' ' || event.key === 'Enter') {
        if (!this.nav?.isOpen) {
          event.preventDefault()
          if (this.cursor?.isExpanded) {
            this.cursor.collapse()
          } else {
            this.cursor.expand(this.getCurrentPlaneIndex())
          }
        }
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        this.scroll.navigateToPlane(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        this.scroll.navigateToPlane(this.experience.gallery.planes.length - 1)
        return
      }
      if (event.key.toLowerCase() === 'r') {
        const total = this.experience.gallery.planes.length
        const current = this.getCurrentPlaneIndex()
        let next = Math.floor(Math.random() * (total - 1))
        if (next >= current) next++
        this.scroll.navigateToPlane(next)
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault()
        this.scroll.navigateRelative(1)
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault()
        this.scroll.navigateRelative(-1)
      }
    }

    this.animate = this.update.bind(this)
  }

  async init({ playIntro = false } = {}) {
    if (this.isInitialized) return

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

    try {
      // Step 1 — Loading Environment (minimum 1600ms)
      this.setLoadingStep('environment', 'active')
      const envStart = performance.now()
      await sleep(Math.max(0, 1600 - (performance.now() - envStart)))

      // Step 2 — Loading Photos (real progress, minimum 1600ms)
      this.setLoadingStep('environment', 'done')
      this.setLoadingStep('photos', 'active')
      const photosStart = performance.now()
      this.preloadedTextures = await this.preloadTextures()
      await sleep(Math.max(0, 1600 - (performance.now() - photosStart)))

      // Step 3 — Rendering (minimum 1600ms)
      this.setLoadingStep('photos', 'done')
      this.setLoadingStep('rendering', 'active')
      const renderStart = performance.now()
      this.experience.gallery.setPreloadedTextures(this.preloadedTextures)
      await this.experience.init(this.scene, this.camera)
      this.scroll.init()
      this.initStats()
      this.bindDebug()
      this.setDebugUiVisible(false)
      this.resize()
      window.addEventListener('resize', this.onResize)
      window.addEventListener('keydown', this.onKeyDown)
      document.addEventListener('fullscreenchange', this.onFullscreenChange)
      this.scroll.bindEvents()
      this.nav.init(
        (index) => this.scroll.navigateToPlane(index),
        (index) => this.downloadPhoto(index)
      )
      this.initArrows()
      this.initPresentToggle()
      this.cursor.init(this.camera)
      this.progressBarFill = document.querySelector('.progress-bar__fill')
      this.music.init()
      this.initMuteButton()
      this.initDownloadButton()
      this.initShareButton()
      this.initPhotoCounter()
      this.initShortcutsMenu()
      this.applyDeepLink()
      this.isInitialized = true
      this.start()
      await sleep(Math.max(0, 1600 - (performance.now() - renderStart)))

      // All done — brief pause showing all ticks
      this.setLoadingStep('rendering', 'done')
      await sleep(900)
    } finally {
      await this.playIntroReveal(playIntro)
    }
  }

  async playIntroReveal(playIntro) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

    const introScreen = document.getElementById('intro-screen')

    if (!playIntro) {
      // Returning visitor — skip intro, reveal gallery normally
      introScreen?.remove()
      this.experience.gallery?.startIntroAnimation()
      await nextFrame()
      await nextFrame()
      document.body.classList.add('is-ready')
      this.hideLoadingScreen()
      setTimeout(() => document.body.classList.add('is-intro-done'), 1200)
      return
    }

    // ── First-visit intro ──────────────────────────────────────────────────────
    // The intro-screen (dark overlay, z-index 20000) covers everything.
    // Remove the loading screen underneath immediately since it's hidden behind it.
    document.getElementById('loading-screen')?.remove()

    // Helper: show a line of text, hold, then fade it out
    const showHint = (text, holdMs = 1400) => {
      const el = document.createElement('p')
      el.className = 'intro-hint-overlay'
      el.textContent = text
      document.body.appendChild(el)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')))
      return new Promise((resolve) => {
        setTimeout(() => {
          el.classList.remove('is-visible')
          el.classList.add('is-out')
          el.addEventListener('transitionend', () => { el.remove(); resolve() }, { once: true })
        }, holdMs)
      })
    }

    // ── Phase 1: cinematic text on dark screen ─────────────────────────────────
    await sleep(600)
    await showHint('Use the arrow keys to explore.', 1400)
    await sleep(200)
    await showHint('Press space to expand.', 1400)
    await sleep(200)
    await showHint('Lachie Thurlow presents', 1400)
    await sleep(300)

    // Title card
    const titleEl = document.createElement('p')
    titleEl.className = 'intro-hint-overlay intro-hint-overlay--title'
    titleEl.textContent = "Lachie's Photos"
    document.body.appendChild(titleEl)
    requestAnimationFrame(() => requestAnimationFrame(() => titleEl.classList.add('is-visible')))
    await sleep(1800)
    titleEl.classList.remove('is-visible')
    titleEl.classList.add('is-out')
    await sleep(700)
    titleEl.remove()
    await sleep(200)

    // ── Phase 2: reveal gallery, trail sweeps forward ──────────────────────────
    // Fade the dark overlay to near-transparent so the gallery + trail are visible
    if (introScreen) {
      introScreen.style.transition = 'opacity 900ms cubic-bezier(0.4, 0, 1, 1)'
      introScreen.style.opacity = '0.08'
    }

    // Drive the trail with a forward scroll sweep
    const sweepAmount = 700 // ~1.4 photos forward — clear trail arc without direction reversal
    const startScroll = this.scroll.scrollCurrent ?? 0
    const sweepDuration = 2200 // ms

    let skipped = false
    const skipHandler = () => { skipped = true }
    window.addEventListener('keydown', skipHandler, { once: true })

    await new Promise((resolve) => {
      const sweepStart = performance.now()
      const tick = () => {
        if (skipped) { resolve(); return }
        const elapsed = performance.now() - sweepStart
        const t = Math.min(elapsed / sweepDuration, 1)
        // Ease-in-out, forward only — no direction reversal so trail never resets
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        this.scroll.scrollTarget = startScroll + eased * sweepAmount
        this.scroll.scrollCurrent = this.scroll.scrollTarget
        if (t < 1) { requestAnimationFrame(tick) } else { resolve() }
      }
      requestAnimationFrame(tick)
    })

    window.removeEventListener('keydown', skipHandler)

    // ── Phase 3: TV turn-off — trail "vanishes" into a bright collapsing line ──
    // Flash the intro-screen back to white, then play the CSS TV-off animation
    if (introScreen) {
      introScreen.style.transition = 'none'
      introScreen.style.opacity = '1'
      introScreen.style.background = '#ffffff'
      await nextFrame()
      await nextFrame()
      introScreen.classList.add('tv-off')
    }

    await sleep(680) // match tvTurnOff animation duration

    // ── Phase 4: snap scroll back to first photo, reveal gallery ──────────────
    this.scroll.scrollTarget = startScroll
    this.scroll.scrollCurrent = startScroll

    Intro.markPlayed()
    this.experience.gallery?.startIntroAnimation()
    await nextFrame()
    await nextFrame()
    document.body.classList.add('is-ready')
    setTimeout(() => {
      introScreen?.remove()
      document.body.classList.add('is-intro-done')
    }, 1200)
  }

  setLoadingStep(step, state) {
    const el = document.querySelector(`[data-step="${step}"]`)
    if (el) el.dataset.state = state
  }

  updateLoadingProgress(loaded, total) {
    const count = document.getElementById('loading-photo-count')
    if (count) count.textContent = `${loaded} / ${total}`
  }

  hideLoadingScreen() {
    const screen = document.getElementById('loading-screen')
    if (!screen) return
    screen.classList.add('is-hidden')
    screen.addEventListener('transitionend', () => screen.remove(), { once: true })
  }

  initPresentToggle() {
    this.presentToggleBtn = document.querySelector('.frame__present-toggle')
    this.presentToggleBtn?.addEventListener('click', () => this.togglePresentMode())
  }

  togglePresentMode() {
    this.isPresentMode = !this.isPresentMode
    if (this.isPresentMode && this.nav.isOpen) {
      this.nav.close()
    }
    document.body.classList.toggle('is-presenting', this.isPresentMode)
    if (this.presentToggleBtn) {
      this.presentToggleBtn.textContent = this.isPresentMode ? 'Exit' : 'Present'
    }
    if (this.isPresentMode) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.()
    }
  }

  initArrows() {
    const upBtn = document.querySelector('.gallery-arrows__btn--up')
    const downBtn = document.querySelector('.gallery-arrows__btn--down')
    if (!upBtn || !downBtn) return

    upBtn.addEventListener('click', () => this.scroll.navigateRelative(1))
    downBtn.addEventListener('click', () => this.scroll.navigateRelative(-1))

    this.arrowUpBtn = upBtn
    this.arrowDownBtn = downBtn
  }

  updateArrows() {
    if (!this.arrowUpBtn || !this.arrowDownBtn) return
    const total = this.experience.gallery.planes.length
    const blendData = this.experience.gallery.getPlaneBlendData(this.camera.position.z)
    if (!blendData) return
    const current =
      blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
    this.arrowUpBtn.disabled = current >= total - 1
    this.arrowDownBtn.disabled = current <= 0
  }

  getCurrentPlaneIndex() {
    const blendData = this.experience.gallery.getPlaneBlendData(this.camera.position.z)
    if (!blendData) return 0
    return blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
  }

  downloadPhoto(index) {
    const planeConfig = this.experience.gallery.planeConfig[index]
    if (!planeConfig?.textureSrc) return

    const name = planeConfig.label?.word || `photo-${index + 1}`
    const ext = planeConfig.textureSrc.split('.').pop().split('?')[0] || 'jpg'
    const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`

    const a = document.createElement('a')
    a.href = planeConfig.textureSrc
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  initDownloadButton() {
    const btn = document.querySelector('.download-btn')
    if (!btn) return
    this.downloadBtn = btn
    btn.addEventListener('click', () => this.downloadPhoto(this.getCurrentPlaneIndex()))
  }

  // ── Photo counter ────────────────────────────────────────────────
  initPhotoCounter() {
    this.photoCounterEl = document.querySelector('.photo-counter')
    this.updatePhotoCounter()
  }

  updatePhotoCounter() {
    if (!this.photoCounterEl) return
    const index = this.getCurrentPlaneIndex()
    const total = this.experience.gallery.planes.length
    this.photoCounterEl.textContent =
      `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
  }

  // ── Ambient color ────────────────────────────────────────────────
  updateAmbientColor() {
    const c = this.experience.background.backgroundColor
    if (!c) return
    document.body.style.backgroundColor =
      `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
  }

  // ── Share button ─────────────────────────────────────────────────
  initShareButton() {
    const btn = document.querySelector('.share-btn')
    if (!btn) return
    this.shareBtn = btn
    btn.addEventListener('click', () => this.shareCurrentPhoto())
  }

  async shareCurrentPhoto() {
    const index = this.getCurrentPlaneIndex()
    const planeConfig = this.experience.gallery.planeConfig[index]
    const title = planeConfig?.label?.word || `Photo ${index + 1}`
    const url = new URL(window.location.href)
    url.searchParams.set('photo', String(index + 1))
    const shareUrl = url.toString()

    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — Lachie's Photos`, url: shareUrl })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    this.copyShareLink(shareUrl)
  }

  copyShareLink(url) {
    navigator.clipboard?.writeText(url).then(() => this.showCopiedToast()).catch(() => {})
  }

  showCopiedToast() {
    const existing = document.querySelector('.copied-toast')
    existing?.remove()
    const toast = document.createElement('div')
    toast.className = 'copied-toast'
    toast.textContent = 'Link copied'
    document.body.appendChild(toast)
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-visible')))
    clearTimeout(this._copiedTimer)
    this._copiedTimer = setTimeout(() => {
      toast.classList.remove('is-visible')
      toast.addEventListener('transitionend', () => toast.remove(), { once: true })
    }, 2500)
  }

  applyDeepLink() {
    const param = new URLSearchParams(window.location.search).get('photo')
    if (!param) return
    const index = parseInt(param, 10) - 1
    const total = this.experience.gallery.planes.length
    if (index >= 0 && index < total) {
      this.scroll.navigateToPlane(index)
    }
  }

  // ── Shortcuts menu ───────────────────────────────────────────────
  initShortcutsMenu() {
    this.shortcutsMenuOpen = false
    const el = document.createElement('div')
    el.className = 'shortcuts-menu'
    el.setAttribute('aria-hidden', 'true')
    el.innerHTML = `
      <p class="shortcuts-menu__title">Keyboard Shortcuts</p>
      <dl class="shortcuts-menu__list">
        <div><dt>↑ ↓</dt><dd>Navigate</dd></div>
        <div><dt>Home / End</dt><dd>First / Last</dd></div>
        <div><dt>R</dt><dd>Random</dd></div>
        <div><dt>Space</dt><dd>Expand photo</dd></div>
        <div><dt>Esc</dt><dd>Back / Menu</dd></div>
        <div><dt>M</dt><dd>Mute</dd></div>
        <div><dt>P</dt><dd>Present</dd></div>
        <div><dt>?</dt><dd>Shortcuts</dd></div>
      </dl>
      <p class="shortcuts-menu__footer">
        Created by <a href="https://lachiethurlow.com" target="_blank" rel="noopener noreferrer">Lachie Thurlow</a>.
        Check out <a href="https://heyacosta.com" target="_blank" rel="noopener noreferrer">Acosta AI</a> and
        <a href="https://transnology.co" target="_blank" rel="noopener noreferrer">Transnology</a>.
      </p>
    `
    el.addEventListener('click', (e) => {
      if (e.target === el) this.closeShortcutsMenu()
    })
    document.body.appendChild(el)
    this.shortcutsMenuEl = el

    const btn = document.querySelector('.shortcuts-btn')
    btn?.addEventListener('click', () => this.toggleShortcutsMenu())
  }

  toggleShortcutsMenu() {
    this.shortcutsMenuOpen ? this.closeShortcutsMenu() : this.openShortcutsMenu()
  }

  openShortcutsMenu() {
    this.shortcutsMenuOpen = true
    this.shortcutsMenuEl.classList.add('is-open')
    this.shortcutsMenuEl.setAttribute('aria-hidden', 'false')
    document.querySelector('.shortcuts-btn')?.classList.add('is-active')
  }

  closeShortcutsMenu() {
    this.shortcutsMenuOpen = false
    this.shortcutsMenuEl.classList.remove('is-open')
    this.shortcutsMenuEl.setAttribute('aria-hidden', 'true')
    document.querySelector('.shortcuts-btn')?.classList.remove('is-active')
  }

  initMuteButton() {
    const btn = document.querySelector('.mute-btn')
    if (!btn) return
    this.muteBtn = btn

    const updateIcon = (isMuted) => {
      btn.dataset.muted = isMuted ? 'true' : 'false'
      btn.setAttribute('aria-label', isMuted ? 'Unmute music' : 'Mute music')
    }

    this.music.onMuteChange = updateIcon
    this.music.onTrackChange = (name) => this.showNowPlayingToast(name)
    updateIcon(true) // start muted

    btn.addEventListener('click', () => {
      this.music.toggle()
    })
  }

  showNowPlayingToast(trackName) {
    // Remove any existing toast immediately
    const existing = document.querySelector('.now-playing-toast')
    if (existing) existing.remove()

    const toast = document.createElement('div')
    toast.className = 'now-playing-toast'
    toast.innerHTML = `
      <span class="now-playing-toast__label">Now Playing</span>
      <span class="now-playing-toast__title">${trackName}</span>
      <span class="now-playing-toast__artist">by Lachie Thurlow</span>
    `
    document.body.appendChild(toast)

    // Trigger enter animation next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('is-visible'))
    })

    // Auto-dismiss after 4 s
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible')
      toast.addEventListener('transitionend', () => toast.remove(), { once: true })
    }, 4000)
  }

  updateProgressBar() {
    if (!this.progressBarFill) return
    const { minCameraZ, maxCameraZ } = this.scroll
    const range = maxCameraZ - minCameraZ
    if (range <= 0) return
    const progress = (maxCameraZ - this.camera.position.z) / range
    this.progressBarFill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`
  }

  start() {
    if (!this.isInitialized || this.isRunning) return

    this.isRunning = true
    this.update()
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth || 1
    const height = this.canvas.clientHeight || window.innerHeight || 1
    if (width <= 0 || height <= 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.experience.gallery.updatePlaneScale()
    this.experience.gallery.layoutPlanes()
    this.experience.label.resize(width, height)
  }

  async preloadTextures() {
    const textureSources = this.experience.gallery.getTextureSources()
    if (!textureSources.length) return new Map()

    const textureLoader = new THREE.TextureLoader()
    const loadedTextures = new Map()
    let loaded = 0

    this.updateLoadingProgress(0, textureSources.length)

    await Promise.all(
      textureSources.map(async (textureSource) => {
        try {
          const texture = await textureLoader.loadAsync(textureSource)
          texture.colorSpace = THREE.SRGBColorSpace
          loadedTextures.set(textureSource, texture)
        } catch (error) {
          console.warn(`Texture failed to load: ${textureSource}`, error)
        }
        loaded++
        this.updateLoadingProgress(loaded, textureSources.length)
      })
    )

    return loadedTextures
  }

  update() {
    if (!this.isRunning) return

    this.animationFrameRequestId = requestAnimationFrame(this.animate)
    this.stats?.begin()

    const time = performance.now()

    this.scroll.update()
    this.experience.update(time, this.camera, this.scroll)
    this.cursor.update()
    this.music.update()
    this.updateArrows()
    this.updateProgressBar()
    this.updatePhotoCounter()
    this.updateAmbientColor()

    this.renderer.clear(true, true, true)
    this.experience.background.render(this.renderer)
    this.renderer.clearDepth()
    this.renderer.render(this.scene, this.camera)
    this.experience.label.render()
    this.stats?.end()
  }

  initStats() {
    if (this.stats) return

    this.stats = new Stats()
    this.stats.showPanel(0)
    this.stats.dom.classList.add('fps-stats')
    document.body.append(this.stats.dom)
    this.setFpsVisible(this.showFps)
  }

  setFpsVisible(isVisible) {
    if (!this.stats) return
    const shouldShow = Boolean(isVisible) && this.isDebugUiVisible
    this.stats.dom.style.display = shouldShow ? 'block' : 'none'
  }

  setDebugUiVisible(isVisible) {
    this.isDebugUiVisible = Boolean(isVisible)
    this.debug?.setVisible(this.isDebugUiVisible)
    this.scroll?.setDebugUiVisible(this.isDebugUiVisible)
    this.setFpsVisible(this.showFps)
  }

  bindDebug() {
    if (!this.debug || this.isDebugBound) return

    this.debug.addBinding({
      folderTitle: 'Engine',
      targetObject: this,
      property: 'showFps',
      label: 'Show FPS',
      onChange: (value) => {
        this.setFpsVisible(value)
      },
    })

    this.isDebugBound = true
  }

  dispose() {
    this.isRunning = false

    if (this.animationFrameRequestId !== null) {
      cancelAnimationFrame(this.animationFrameRequestId)
      this.animationFrameRequestId = null
    }

    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    this.scroll.dispose()
    this.cursor.dispose()
    this.music.dispose()

    this.preloadedTextures.forEach((texture) => {
      texture.dispose()
    })
    this.preloadedTextures.clear()
    this.stats?.dom.remove()
    this.stats = null
    this.nav.dispose()
    this.experience.dispose?.()
  }
}

export { Engine }
