class Label {
  constructor(gallery) {
    this.gallery = gallery

    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.descriptionElement = null
    this.chipElement = null
    this.isoValueElement = null
    this.avValueElement = null
    this.tvValueElement = null
    this.focalValueElement = null
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
        <span class="plane-label-overlay__chip"></span>
      </div>
      <article class="plane-label-card plane-label-overlay__right">
        <dl class="plane-label-card__specs">
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
      isoValueElement: element.querySelector('.plane-label-card__value--iso'),
      avValueElement: element.querySelector('.plane-label-card__value--av'),
      tvValueElement: element.querySelector('.plane-label-card__value--tv'),
      focalValueElement: element.querySelector('.plane-label-card__value--focal'),
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
      isoValueElement,
      avValueElement,
      tvValueElement,
      focalValueElement,
    } = this.createElement()

    this.overlayElement = element
    this.leftIndexElement = leftIndexElement
    this.wordElement = wordElement
    this.descriptionElement = descriptionElement
    this.chipElement = chipElement
    this.isoValueElement = isoValueElement
    this.avValueElement = avValueElement
    this.tvValueElement = tvValueElement
    this.focalValueElement = focalValueElement
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

  applyPlaneContent(planeIndex) {
    const plane = this.gallery.planes[planeIndex]
    if (!plane || this.activePlaneIndex === planeIndex) return

    const labelData = plane.userData.label || {}
    const chipHex = this.normalizeHexColor(plane.userData.accentColor)

    this.leftIndexElement.textContent = String(planeIndex + 1).padStart(2, '0')
    this.wordElement.textContent = labelData.word || ''
    this.descriptionElement.textContent = labelData.description || ''
    this.chipElement.style.backgroundColor = chipHex
    this.isoValueElement.textContent = labelData.iso || '—'
    this.avValueElement.textContent = labelData.av || '—'
    this.tvValueElement.textContent = labelData.tv || '—'
    this.focalValueElement.textContent = labelData.focal || '—'
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
    this.overlayElement.style.opacity = '1'
  }

  render() {}

  dispose() {
    this.overlayElement?.remove()
    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.descriptionElement = null
    this.chipElement = null
    this.isoValueElement = null
    this.avValueElement = null
    this.tvValueElement = null
    this.focalValueElement = null
    this.activePlaneIndex = -1
  }
}

export { Label }
