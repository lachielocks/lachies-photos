import * as THREE from 'three'

class Cursor {
  constructor({ gallery, scroll }) {
    this.gallery = gallery
    this.scroll = scroll
    this.camera = null
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2(-10, -10)

    this.hoveredPlaneIndex = -1
    this.isExpanded = false
    this.clientX = -10
    this.clientY = -10

    this.el = null
    this.ringEl = null
    this.labelEl = null

    this.onMouseMove = (e) => {
      this.clientX = e.clientX
      this.clientY = e.clientY
      if (!this.el) return
      this.el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      this.el.classList.remove('is-offscreen')
      this.mouse.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      )
    }

    this.onMouseLeave = () => {
      this.el?.classList.add('is-offscreen')
    }

    this.onClick = (e) => {
      // Don't intercept clicks on actual UI elements
      if (e.target.closest('button, a, input, select, nav')) return
      if (this.isExpanded) {
        this.collapse()
      } else if (this.hoveredPlaneIndex >= 0) {
        this.expand(this.hoveredPlaneIndex)
      }
    }
  }

  init(camera) {
    this.camera = camera

    const el = document.createElement('div')
    el.className = 'custom-cursor is-offscreen'
    el.innerHTML = `
      <div class="custom-cursor__ring"></div>
      <span class="custom-cursor__label"></span>
    `
    document.body.appendChild(el)
    this.el = el
    this.ringEl = el.querySelector('.custom-cursor__ring')
    this.labelEl = el.querySelector('.custom-cursor__label')

    document.addEventListener('mousemove', this.onMouseMove)
    document.documentElement.addEventListener('mouseleave', this.onMouseLeave)
    document.addEventListener('click', this.onClick)
  }

  expand(planeIndex) {
    const plane = this.gallery.planes[planeIndex]
    if (!plane) return
    this.isExpanded = true
    // Tell Gallery to pin this plane at full opacity (bypasses visibility blending)
    this.gallery.expandedPlaneIndex = planeIndex
    // Move camera close to the plane — 3.8 units away fills ~95% of screen height
    this.scroll.setExpandZ(plane.position.z + 3.8)
    document.body.classList.remove('is-collapsing')
    document.body.classList.add('is-expanded')
  }

  collapse() {
    this.isExpanded = false
    this.gallery.expandedPlaneIndex = -1
    this.scroll.clearExpand()
    document.body.classList.add('is-collapsing')
    document.body.classList.remove('is-expanded')
    clearTimeout(this._collapseTimer)
    this._collapseTimer = setTimeout(() => document.body.classList.remove('is-collapsing'), 550)
  }

  /** Returns true if the DOM element under the cursor is a UI overlay (nav, buttons, etc.) */
  isOverUI() {
    const el = document.elementFromPoint(this.clientX, this.clientY)
    if (!el) return false
    return Boolean(
      el.closest(
        '.gallery-nav, .gallery-arrows, .frame, .mute-btn, .plane-label-overlay, button, a, input, select'
      )
    )
  }

  updateHover() {
    if (!this.camera || this.isExpanded || this.isOverUI()) {
      this.hoveredPlaneIndex = -1
      return
    }

    this.raycaster.setFromCamera(this.mouse, this.camera)

    const visiblePlanes = this.gallery.planes.filter(
      (p) => (p.material.uniforms?.uOpacity?.value ?? 0) > 0.05
    )
    const hits = this.raycaster.intersectObjects(visiblePlanes)
    this.hoveredPlaneIndex =
      hits.length > 0 ? this.gallery.planes.indexOf(hits[0].object) : -1
  }

  update() {
    this.updateHover()
    if (!this.el) return

    const hovering = this.hoveredPlaneIndex >= 0 && !this.isExpanded
    this.el.classList.toggle('is-hovering', hovering)
    this.el.classList.toggle('is-expanded-mode', this.isExpanded)

    if (this.isExpanded) {
      this.labelEl.textContent = 'Close'
    } else if (hovering) {
      this.labelEl.textContent = 'Expand'
    } else {
      this.labelEl.textContent = ''
    }
  }

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.documentElement.removeEventListener('mouseleave', this.onMouseLeave)
    document.removeEventListener('click', this.onClick)
    this.el?.remove()
    this.el = null
    this.ringEl = null
    this.labelEl = null
  }
}

export { Cursor }
