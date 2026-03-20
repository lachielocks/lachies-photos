import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { world } from '@/Experience/'
import { Scroll } from '@/Experience/Scroll'
import { Nav } from '@/Experience/Nav'

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
      if (event.key === 'Escape' && this.isPresentMode) {
        this.togglePresentMode()
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

    try {
      this.preloadedTextures = await this.preloadTextures()
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

      this.nav.init((index) => this.scroll.navigateToPlane(index))
      this.initArrows()
      this.initPresentToggle()

      this.isInitialized = true
      this.start()
    } finally {
      this.hideLoadingScreen()
    }
  }

  updateLoadingProgress(loaded, total) {
    const counter = document.getElementById('loading-counter')
    const fill = document.getElementById('loading-bar-fill')
    if (counter) counter.textContent = `${loaded} / ${total}`
    if (fill) fill.style.width = `${total > 0 ? (loaded / total) * 100 : 0}%`
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
    this.updateArrows()

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
