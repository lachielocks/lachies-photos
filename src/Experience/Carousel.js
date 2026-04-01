import { galleryPlaneData } from '@/data/galleryData'

class Carousel {
  constructor() {
    this.currentIndex = 0
    this.el = null
    this.imgEl = null
    this.titleEl = null
    this.descEl = null
    this.counterEl = null
    this.prevBtn = null
    this.nextBtn = null
    this.metaCamera = null
    this.metaIso = null
    this.metaAv = null
    this.metaTv = null
    this.metaFocal = null
    this.metaTags = null
    this.isOpen = false
    this.onKeyDown = null
  }

  open(startIndex = 0) {
    this.currentIndex = startIndex

    const el = document.createElement('div')
    el.className = 'carousel-overlay'
    el.innerHTML = `
      <button class="carousel-close" aria-label="Exit slideshow">Exit</button>
      <div class="carousel-main">
        <div class="carousel-image-wrap">
          <img class="carousel-img" alt="" />
        </div>
        <aside class="carousel-meta">
          <dl class="carousel-specs">
            <div class="carousel-specs__row">
              <dt>Camera</dt>
              <dd class="carousel-specs__camera"></dd>
            </div>
            <div class="carousel-specs__row">
              <dt>ISO</dt>
              <dd class="carousel-specs__iso"></dd>
            </div>
            <div class="carousel-specs__row">
              <dt>AV</dt>
              <dd class="carousel-specs__av"></dd>
            </div>
            <div class="carousel-specs__row">
              <dt>TV</dt>
              <dd class="carousel-specs__tv"></dd>
            </div>
            <div class="carousel-specs__row">
              <dt>Focal</dt>
              <dd class="carousel-specs__focal"></dd>
            </div>
          </dl>
          <div class="carousel-tags"></div>
        </aside>
      </div>
      <div class="carousel-info">
        <p class="carousel-title"></p>
        <p class="carousel-desc"></p>
      </div>
      <div class="carousel-nav">
        <button class="carousel-prev" aria-label="Previous photo">&#8592;</button>
        <span class="carousel-counter"></span>
        <button class="carousel-next" aria-label="Next photo">&#8594;</button>
      </div>
    `
    document.body.appendChild(el)
    this.el = el

    this.imgEl = el.querySelector('.carousel-img')
    this.titleEl = el.querySelector('.carousel-title')
    this.descEl = el.querySelector('.carousel-desc')
    this.counterEl = el.querySelector('.carousel-counter')
    this.prevBtn = el.querySelector('.carousel-prev')
    this.nextBtn = el.querySelector('.carousel-next')
    this.metaCamera = el.querySelector('.carousel-specs__camera')
    this.metaIso = el.querySelector('.carousel-specs__iso')
    this.metaAv = el.querySelector('.carousel-specs__av')
    this.metaTv = el.querySelector('.carousel-specs__tv')
    this.metaFocal = el.querySelector('.carousel-specs__focal')
    this.metaTags = el.querySelector('.carousel-tags')

    this.prevBtn.addEventListener('click', () => this.prev())
    this.nextBtn.addEventListener('click', () => this.next())
    el.querySelector('.carousel-close').addEventListener('click', () => this.close())

    this.onKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.next() }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.prev() }
      if (e.key === 'Escape') this.close()
    }
    window.addEventListener('keydown', this.onKeyDown)

    this.isOpen = true
    this.render()
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')))
  }

  render() {
    const photo = galleryPlaneData[this.currentIndex]
    const label = photo.label || {}
    const total = galleryPlaneData.length

    this.imgEl.src = photo.textureSrc
    this.imgEl.alt = label.word || ''
    this.titleEl.textContent = label.word || ''
    this.descEl.textContent = label.description || ''
    this.counterEl.textContent = `${String(this.currentIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
    this.prevBtn.disabled = this.currentIndex <= 0
    this.nextBtn.disabled = this.currentIndex >= total - 1

    this.metaCamera.textContent = label.camera || 'Canon EOS R50'
    this.metaIso.textContent = label.iso || '—'
    this.metaAv.textContent = label.av || '—'
    this.metaTv.textContent = label.tv || '—'
    this.metaFocal.textContent = label.focal || '—'
    this.metaTags.innerHTML = (label.tags || [])
      .map((tag) => `<span class="carousel-tag">${tag}</span>`)
      .join('')
    this.metaTags.querySelectorAll('.carousel-tag').forEach((el, i) => {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(5px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 380,
          delay: i * 60,
          easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          fill: 'both',
        }
      )
    })
  }

  next() {
    if (this.currentIndex < galleryPlaneData.length - 1) {
      this.currentIndex++
      this.render()
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--
      this.render()
    }
  }

  close() {
    if (!this.isOpen) return
    this.isOpen = false
    window.removeEventListener('keydown', this.onKeyDown)
    this.el?.classList.remove('is-visible')
    this.el?.addEventListener('transitionend', () => this.el?.remove(), { once: true })
  }
}

export { Carousel }
