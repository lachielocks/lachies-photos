import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { world } from '@/Experience/'
import { Scroll } from '@/Experience/Scroll'
import { Nav } from '@/Experience/Nav'
import { Cursor } from '@/Experience/Cursor'
import { Music } from '@/Experience/Music'

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
        if (this.cursor?.isExpanded) {
          this.cursor.collapse()
          return
        }
        if (this.isPresentMode) {
          this.togglePresentMode()
          return
        }
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

  async init() {
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
      this.applyDeepLink()
      this.isInitialized = true
      this.start()
      await sleep(Math.max(0, 1600 - (performance.now() - renderStart)))

      // All done — brief pause showing all ticks
      this.setLoadingStep('rendering', 'done')
      await sleep(900)
    } finally {
      // Start the intro offset BEFORE the loading screen fades so there's
      // no flash of the plane at its final position
      this.experience.gallery?.startIntroAnimation()
      await nextFrame()
      await nextFrame()
      document.body.classList.add('is-ready')
      this.hideLoadingScreen()
      // Clear intro animation fill-modes after they complete so that
      // CSS transitions on body.is-expanded can override opacity correctly.
      // Longest intro animation: plane-label-overlay at 400ms delay + 600ms = 1000ms.
      setTimeout(() => document.body.classList.add('is-intro-done'), 1200)
    }
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
