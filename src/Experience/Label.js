class Label {
  constructor(gallery) {
    this.gallery = gallery

    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.descriptionElement = null
    this.chipElement = null
    this.cameraValueElement = null
    this.isoValueElement = null
    this.avValueElement = null
    this.tvValueElement = null
    this.focalValueElement = null
    this.tagsElement = null
    this.activePlaneIndex = -1
  }

  createElement() {
    const element = document.createElement('section')
    element.className = 'plane-label-overlay'
    element.innerHTML = `
      <div class="plane-label-overlay__left">
        <p class="plane-label-overlay__index"></p>
        <p class="plane-label-card__word"></p>
        <p class="plane-label-card__description"></p>
        <div class="plane-label-overlay__tags"></div>
        <span class="plane-label-overlay__chip"></span>
      </div>
      <article class="plane-label-card plane-label-overlay__right">
        <dl class="plane-label-card__specs">
          <div class="plane-label-card__row">
            <dt>CAMERA</dt>
            <dd class="plane-label-card__value plane-label-card__value--camera"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>ISO</dt>
            <dd class="plane-label-card__value plane-label-card__value--iso"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>AV</dt>
            <dd class="plane-label-card__value plane-label-card__value--av"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>TV</dt>
            <dd class="plane-label-card__value plane-label-card__value--tv"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>FOCAL</dt>
            <dd class="plane-label-card__value plane-label-card__value--focal"></dd>
          </div>
        </dl>
      </article>
    `

    return {
      element,
      leftIndexElement: element.querySelector('.plane-label-overlay__index'),
      wordElement: element.querySelector('.plane-label-card__word'),
      descriptionElement: element.querySelector('.plane-label-card__description'),
      chipElement: element.querySelector('.plane-label-overlay__chip'),
      cameraValueElement: element.querySelector('.plane-label-card__value--camera'),
      isoValueElement: element.querySelector('.plane-label-card__value--iso'),
      avValueElement: element.querySelector('.plane-label-card__value--av'),
      tvValueElement: element.querySelector('.plane-label-card__value--tv'),
      focalValueElement: element.querySelector('.plane-label-card__value--focal'),
      tagsElement: element.querySelector('.plane-label-overlay__tags'),
    }
  }

  init() {
    if (this.overlayElement) return

    const {
      element,
      leftIndexElement,
      wordElement,
      descriptionElement,
      chipElement,
      cameraValueElement,
      isoValueElement,
      avValueElement,
      tvValueElement,
      focalValueElement,
      tagsElement,
    } = this.createElement()

    this.overlayElement = element
    this.leftIndexElement = leftIndexElement
    this.wordElement = wordElement
    this.descriptionElement = descriptionElement
    this.chipElement = chipElement
    this.cameraValueElement = cameraValueElement
    this.isoValueElement = isoValueElement
    this.avValueElement = avValueElement
    this.tvValueElement = tvValueElement
    this.focalValueElement = focalValueElement
    this.tagsElement = tagsElement
    this.overlayElement.style.opacity = '0'

    document.body.append(this.overlayElement)
  }

  normalizeHexColor(rawColor) {
    const fallbackColor = '#ffffff'
    if (typeof rawColor !== 'string') return fallbackColor

    let hexColor = rawColor.trim()
    if (!hexColor) return fallbackColor
    if (!hexColor.startsWith('#')) {
      hexColor = `#${hexColor}`
    }

    if (/^#[0-9a-fA-F]{3}$/.test(hexColor)) {
      const shortHex = hexColor.slice(1)
      hexColor = `#${shortHex
        .split('')
        .map((character) => `${character}${character}`)
        .join('')}`
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return fallbackColor
    return hexColor.toLowerCase()
  }

  getTargetPlaneIndex(cameraZ) {
    const blendData = this.gallery.getPlaneBlendData(cameraZ)
    if (!blendData) return -1
    return blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
  }

  // Scramble animation: random chars cycle, then resolve left-to-right
  scrambleValue(element, targetText, duration = 580, chars = '0123456789/fms.–') {
    const len = Math.max(targetText.length, 1)
    const start = performance.now()
    const resolveStart = duration * 0.3 // begin resolving characters at 30%

    const tick = () => {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)

      let result = ''
      for (let i = 0; i < len; i++) {
        const resolveProgress = Math.max(0, (elapsed - resolveStart) / (duration - resolveStart))
        if (resolveProgress * len > i) {
          result += targetText[i]
        } else {
          result += chars[Math.floor(Math.random() * chars.length)]
        }
      }
      element.textContent = result

      if (progress < 1) requestAnimationFrame(tick)
      else element.textContent = targetText
    }

    requestAnimationFrame(tick)
  }

  // Slide-up-fade-in via Web Animations API
  slideIn(element, newText, delayMs = 0) {
    element.textContent = newText
    element.animate(
      [
        { opacity: 0, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: 480,
        delay: delayMs,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'both',
      }
    )
  }

  // Spring-pop scale + fade for the colour chip
  animateChip(newColor) {
    this.chipElement.style.backgroundColor = newColor
    this.chipElement.animate(
      [
        { opacity: 0, transform: 'scale(0.2)' },
        { opacity: 1, transform: 'scale(1.25)' },
        { opacity: 1, transform: 'scale(0.9)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      {
        duration: 600,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        fill: 'forwards',
      }
    )
  }

  applyPlaneContent(planeIndex) {
    const plane = this.gallery.planes[planeIndex]
    if (!plane || this.activePlaneIndex === planeIndex) return

    const labelData = plane.userData.label || {}
    const chipHex = this.normalizeHexColor(plane.userData.accentColor)
    const isFirstLoad = this.activePlaneIndex === -1

    // Slide-in: index (instant on first load, animated on change)
    this.slideIn(this.leftIndexElement, String(planeIndex + 1).padStart(2, '0'), isFirstLoad ? 0 : 40)

    // Slide-in: title and description with slight stagger
    this.slideIn(this.wordElement, labelData.word || '', isFirstLoad ? 0 : 80)
    this.slideIn(this.descriptionElement, labelData.description || '', isFirstLoad ? 0 : 130)

    // Tags
    if (this.tagsElement) {
      this.tagsElement.innerHTML = ''
      const tags = labelData.tags || []
      tags.forEach((tag, i) => {
        const span = document.createElement('span')
        span.className = 'plane-label-overlay__tag'
        span.textContent = tag
        span.animate(
          [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 380, delay: isFirstLoad ? i * 40 : 160 + i * 40, easing: 'ease-out', fill: 'both' }
        )
        this.tagsElement.append(span)
      })
    }

    // Chip spring-pop
    this.animateChip(chipHex)

    // Camera: scramble with alphanumeric charset
    if (isFirstLoad) {
      this.cameraValueElement.textContent = labelData.camera || '—'
    } else {
      this.scrambleValue(this.cameraValueElement, labelData.camera || '—', 520, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
    }

    // Scramble: ISO, AV, TV, FOCAL with slight stagger
    if (isFirstLoad) {
      this.isoValueElement.textContent = labelData.iso || '—'
      this.avValueElement.textContent = labelData.av || '—'
      this.tvValueElement.textContent = labelData.tv || '—'
      this.focalValueElement.textContent = labelData.focal || '—'
    } else {
      this.scrambleValue(this.isoValueElement, labelData.iso || '—', 520)
      setTimeout(() => this.scrambleValue(this.avValueElement, labelData.av || '—', 520), 60)
      setTimeout(() => this.scrambleValue(this.tvValueElement, labelData.tv || '—', 520), 120)
      setTimeout(() => this.scrambleValue(this.focalValueElement, labelData.focal || '—', 520), 180)
    }

    this.overlayElement.style.color = labelData.color || ''
    this.activePlaneIndex = planeIndex
  }

  resize() {}

  update(camera = null) {
    if (!camera || !this.overlayElement) return

    const targetPlaneIndex = this.getTargetPlaneIndex(camera.position.z)
    if (targetPlaneIndex < 0) {
      this.overlayElement.style.opacity = '0'
      return
    }

    this.applyPlaneContent(targetPlaneIndex)
    this.overlayElement.style.opacity = '' // Let CSS class rules control opacity
  }

  render() {}

  dispose() {
    this.overlayElement?.remove()
    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.descriptionElement = null
    this.chipElement = null
    this.cameraValueElement = null
    this.isoValueElement = null
    this.avValueElement = null
    this.tvValueElement = null
    this.focalValueElement = null
    this.tagsElement = null
    this.activePlaneIndex = -1
  }
}

export { Label }
