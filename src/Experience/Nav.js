import { galleryPlaneData } from '@/data/galleryData'

class Nav {
  constructor() {
    this.isOpen = false
    this.navElement = null
    this.listElement = null
    this.toggleElement = null
    this.navigateTo = null
  }

  init(navigateTo) {
    this.navigateTo = navigateTo
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

      li.append(number, title)
      li.addEventListener('click', () => {
        this.navigateTo?.(index)
        this.close()
      })

      this.listElement.append(li)
    })
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
