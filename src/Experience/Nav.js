import { galleryPlaneData } from '@/data/galleryData'

class Nav {
  constructor() {
    this.isOpen = false
    this.navElement = null
    this.listElement = null
    this.toggleElement = null
    this.navigateTo = null
    this.downloadPhoto = null
  }

  init(navigateTo, downloadPhoto) {
    this.navigateTo = navigateTo
    this.downloadPhoto = downloadPhoto
    this.navElement = document.querySelector('.gallery-nav')
    this.listElement = document.querySelector('.gallery-nav__list')
    this.toggleElement = document.querySelector('.frame__menu-toggle')
    const closeElement = document.querySelector('.gallery-nav__close')

    this.buildList()

    this.toggleElement?.addEventListener('click', () => this.open())
    closeElement?.addEventListener('click', () => this.close())

    this.navElement?.addEventListener('click', (event) => {
      if (event.target === this.navElement) this.close()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) this.close()
    })
  }

  buildList() {
    if (!this.listElement) return
    this.listElement.innerHTML = ''

    galleryPlaneData.forEach((plane, index) => {
      const li = document.createElement('li')
      li.className = 'gallery-nav__item'
      li.style.setProperty('--i', index)

      const number = document.createElement('span')
      number.className = 'gallery-nav__number'
      number.textContent = String(index + 1).padStart(2, '0')

      const title = document.createElement('span')
      title.className = 'gallery-nav__title'
      title.textContent = plane.label?.navTitle || plane.label?.word || `Photo ${index + 1}`

      const downloadBtn = document.createElement('button')
      downloadBtn.className = 'gallery-nav__download'
      downloadBtn.setAttribute('aria-label', `Download ${title.textContent}`)
      downloadBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.downloadPhoto?.(index)
      })

      li.append(number, title, downloadBtn)
      li.addEventListener('click', () => {
        this.navigateTo?.(index)
        this.close()
      })

      this.listElement.append(li)
    })

    const footer = document.createElement('p')
    footer.className = 'gallery-nav__footer'
    footer.innerHTML = `Created by <a href="https://lachiethurlow.com" target="_blank" rel="noopener noreferrer">Lachie Thurlow</a>. Check out <a href="https://heyacosta.com" target="_blank" rel="noopener noreferrer">Acosta AI</a> and <a href="https://transnology.co" target="_blank" rel="noopener noreferrer">Transnology</a>.`
    this.navElement?.appendChild(footer)
  }

  open() {
    this.isOpen = true
    this.navElement?.setAttribute('aria-hidden', 'false')
    this.navElement?.classList.add('is-open')
  }

  close() {
    this.isOpen = false
    this.navElement?.setAttribute('aria-hidden', 'true')
    this.navElement?.classList.remove('is-open')
  }

  dispose() {
    this.navElement = null
    this.listElement = null
    this.toggleElement = null
  }
}

export { Nav }
