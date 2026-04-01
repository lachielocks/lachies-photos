import * as THREE from 'three'
import { galleryPlaneData } from '@/data/galleryData'

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 3×3 box-blur kernel driven by uBlur (0=sharp, 1=full blur)
// Used to fake depth-of-field as planes fade in/out
const PLANE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uHasTexture;
  uniform float uOpacity;
  uniform float uBlur;
  varying vec2 vUv;

  void main() {
    vec4 texColor;
    if (uHasTexture > 0.5) {
      if (uBlur > 0.001) {
        float r = uBlur * 0.030;
        texColor  = texture2D(uMap, vUv + vec2(-r, -r)) * 0.0625;
        texColor += texture2D(uMap, vUv + vec2( 0., -r)) * 0.125;
        texColor += texture2D(uMap, vUv + vec2( r, -r)) * 0.0625;
        texColor += texture2D(uMap, vUv + vec2(-r,  0.)) * 0.125;
        texColor += texture2D(uMap, vUv             ) * 0.25;
        texColor += texture2D(uMap, vUv + vec2( r,  0.)) * 0.125;
        texColor += texture2D(uMap, vUv + vec2(-r,  r)) * 0.0625;
        texColor += texture2D(uMap, vUv + vec2( 0.,  r)) * 0.125;
        texColor += texture2D(uMap, vUv + vec2( r,  r)) * 0.0625;
      } else {
        texColor = texture2D(uMap, vUv);
      }
    } else {
      texColor = vec4(uColor, 1.0);
    }
    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
  }
`

class Gallery {
  constructor(debug = null) {
    this.isInitialized = false
    this.isDebugBound = false
    this.debug = debug

    // Planes
    this.planes = []
    this.texturesBySource = new Map()
    this.useTextures = true
    this.planeGap = 5
    this.desktopPlaneScale = 1
    this.mobilePlaneScale = 0.65
    this.mobileXSpreadFactor = 0.25
    this.mobileBreakpoint = 768
    this.planeConfig = galleryPlaneData
    this.moodSampleOffset = 1

    // 1×1 white placeholder so ShaderMaterial always has a valid sampler
    const placeholderData = new Uint8Array([255, 255, 255, 255])
    this.placeholderTexture = new THREE.DataTexture(placeholderData, 1, 1, THREE.RGBAFormat)
    this.placeholderTexture.needsUpdate = true
    this.planeFadeSampleOffset = 1
    this.planeFadeSmoothing = 0.09

    // When >= 0, that plane is locked at full opacity (click-to-expand)
    this.expandedPlaneIndex = -1

    // Parallax
    this.parallaxEnabled = true
    this.parallaxAmountX = 0.16
    this.parallaxAmountY = 0.08
    this.parallaxSmoothing = 0.08
    this.pointerTarget = new THREE.Vector2(0, 0)
    this.pointerCurrent = new THREE.Vector2(0, 0)

    // Breath
    this.breathEnabled = true
    this.breathTiltAmount = 0.045
    this.breathScaleAmount = 0.03
    this.breathSmoothing = 0.14
    this.breathGain = 1.1
    this.breathIntensity = 0
    this.targetBreathIntensity = 0

    // Gesture drift
    this.gestureParallaxEnabled = true
    this.gestureParallaxAmountY = 0.05
    this.gestureParallaxSmoothing = 0.05
    this.driftCurrent = 0
    this.driftTarget = 0

    // Intro spring animation
    this.introActive = false
    this.introCurrentX = 0
    this.introVelocityX = 0
    this.introStartOffsetX = 6.5
    this.introStiffness = 22
    this.introDamping = 7
    this.introLastFrameTime = 0

    // Pointer events
    this.onPointerMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = (event.clientY / window.innerHeight) * 2 - 1
      this.pointerTarget.set(x, -y)
    }
    this.onPointerLeave = () => {
      this.pointerTarget.set(0, 0)
    }
  }

  startIntroAnimation() {
    if (!this.isInitialized) return
    this.introCurrentX = this.introStartOffsetX
    this.introVelocityX = 0
    this.introLastFrameTime = performance.now()
    this.introActive = true
  }

  async init(scene) {
    if (this.isInitialized) return

    this.setPlanes(scene)
    this.updatePlaneMaterialMode()
    this.updatePlaneScale()
    this.layoutPlanes()
    this.bindPointerEvents()
    this.bindDebug()

    this.isInitialized = true
  }

  setPlanes(scene) {
    const planeGeometry = new THREE.PlaneGeometry(3, 3)

    this.planeConfig.forEach((plane, index) => {
      const texture = this.texturesBySource.get(plane.textureSrc) || null
      const textureImage = texture?.image
      const aspectRatio =
        textureImage && textureImage.width > 0 && textureImage.height > 0
          ? textureImage.width / textureImage.height
          : 1
      const fallbackColor = plane.fallbackColor || '#ffffff'
      const accentColor = plane.accentColor || fallbackColor
      const backgroundColor = plane.backgroundColor || fallbackColor
      const blob1Color = plane.blob1Color || fallbackColor
      const blob2Color = plane.blob2Color || fallbackColor
      const labelData = this.getPlaneLabelData(plane, this.planes.length)
      const hasTexture = Boolean(this.useTextures && texture)
      const planeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: hasTexture ? texture : this.placeholderTexture },
          uColor: { value: new THREE.Color(fallbackColor) },
          uHasTexture: { value: hasTexture ? 1.0 : 0.0 },
          uOpacity: { value: index === 0 ? 1.0 : 0.0 },
          uBlur: { value: index === 0 ? 0.0 : 1.0 },
        },
        vertexShader: PLANE_VERTEX,
        fragmentShader: PLANE_FRAGMENT,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
      planeMesh.userData.basePosition = plane.position
      planeMesh.userData.baseColor = fallbackColor
      planeMesh.userData.accentColor = accentColor
      planeMesh.userData.backgroundColor = backgroundColor
      planeMesh.userData.blob1Color = blob1Color
      planeMesh.userData.blob2Color = blob2Color
      planeMesh.userData.label = labelData
      planeMesh.userData.texture = texture
      planeMesh.userData.aspectRatio = aspectRatio
      scene.add(planeMesh)
      this.planes.push(planeMesh)
    })
  }

  getPlaneLabelData(planeDefinition, index) {
    const fallback = {
      word: `photo ${String(index + 1).padStart(2, '0')}`,
      color: '',
    }
    const label = planeDefinition.label || fallback

    return {
      word: label.word || fallback.word,
      description: label.description || '',
      camera: label.camera || 'Canon EOS R50',
      iso: label.iso || '',
      av: label.av || '',
      tv: label.tv || '',
      focal: label.focal || '',
      color: label.color || fallback.color,
      tags: Array.isArray(label.tags) ? label.tags : [],
    }
  }

  updatePlaneScale() {
    const isMobileViewport = window.innerWidth <= this.mobileBreakpoint
    const scale = isMobileViewport ? this.mobilePlaneScale : this.desktopPlaneScale

    this.planes.forEach((plane) => {
      const aspectRatio = plane.userData.aspectRatio || 1
      plane.scale.set(scale * aspectRatio, scale, 1)
    })
  }

  layoutPlanes() {
    const xSpreadFactor = this.getXSpreadFactor()

    this.planes.forEach((plane, index) => {
      const basePosition = plane.userData.basePosition || { x: 0, y: 0 }
      const xPosition = basePosition.x * xSpreadFactor
      plane.position.set(xPosition, basePosition.y, -index * this.planeGap)
    })
  }

  getXSpreadFactor() {
    const isMobileViewport = window.innerWidth <= this.mobileBreakpoint
    return isMobileViewport ? this.mobileXSpreadFactor : 1
  }

  getDepthRange() {
    if (!this.planes.length) {
      return { nearestZ: 0, deepestZ: 0 }
    }

    const zPositions = this.planes.map((plane) => plane.position.z)
    return {
      nearestZ: Math.max(...zPositions),
      deepestZ: Math.min(...zPositions),
    }
  }

  getDepthProgress(cameraZ) {
    const { nearestZ, deepestZ } = this.getDepthRange()
    const depthSpan = nearestZ - deepestZ
    if (depthSpan <= 0) return 0

    return THREE.MathUtils.clamp((nearestZ - cameraZ) / depthSpan, 0, 1)
  }

  getActivePlaneIndex(cameraZ) {
    if (!this.planes.length) return -1

    let closestPlaneIndex = 0
    let smallestDistance = Infinity

    this.planes.forEach((plane, index) => {
      const distanceToPlane = Math.abs(cameraZ - plane.position.z)
      if (distanceToPlane < smallestDistance) {
        smallestDistance = distanceToPlane
        closestPlaneIndex = index
      }
    })

    return closestPlaneIndex
  }

  getMoodColorsByIndex(index) {
    if (index < 0 || index >= this.planes.length) return null

    const { backgroundColor, blob1Color, blob2Color } = this.planes[index].userData
    if (!backgroundColor) return null

    return { background: backgroundColor, blob1: blob1Color, blob2: blob2Color }
  }

  getMoodBlendData(cameraZ) {
    if (!this.planes.length) return null

    const safeCameraZ = Number.isFinite(cameraZ) ? cameraZ : this.planes[0].position.z
    const moodSampleZ = safeCameraZ - this.planeGap * this.moodSampleOffset
    const lastPlaneIndex = this.planes.length - 1

    if (lastPlaneIndex === 0 || this.planeGap <= 0) {
      const singleMood = this.getMoodColorsByIndex(0)
      if (!singleMood) return null

      return {
        currentMood: singleMood,
        nextMood: singleMood,
        blend: 0,
      }
    }

    const firstPlaneZ = this.planes[0].position.z
    const normalizedDepth = THREE.MathUtils.clamp(
      (firstPlaneZ - moodSampleZ) / this.planeGap,
      0,
      lastPlaneIndex
    )
    const currentPlaneIndex = Math.floor(normalizedDepth)
    const nextPlaneIndex = Math.min(currentPlaneIndex + 1, lastPlaneIndex)
    const blend = normalizedDepth - currentPlaneIndex

    const currentMood = this.getMoodColorsByIndex(currentPlaneIndex)
    const nextMood = this.getMoodColorsByIndex(nextPlaneIndex) || currentMood
    if (!currentMood || !nextMood) return null

    return {
      currentMood,
      nextMood,
      blend,
    }
  }

  getPlaneBlendData(cameraZ) {
    if (!this.planes.length) return null

    const planeGap = Math.max(this.planeGap, 0.0001)
    const firstPlaneZ = this.planes[0].position.z
    const lastPlaneIndex = this.planes.length - 1
    const sampledCameraZ = cameraZ - planeGap * this.planeFadeSampleOffset
    const normalizedDepth = THREE.MathUtils.clamp(
      (firstPlaneZ - sampledCameraZ) / planeGap,
      0,
      lastPlaneIndex
    )
    const currentPlaneIndex = Math.floor(normalizedDepth)
    const nextPlaneIndex = Math.min(currentPlaneIndex + 1, lastPlaneIndex)
    const blend = normalizedDepth - currentPlaneIndex

    return {
      currentPlaneIndex,
      nextPlaneIndex,
      blend,
    }
  }

  getActiveMoodColors(cameraZ) {
    const moodBlendData = this.getMoodBlendData(cameraZ)
    return moodBlendData?.currentMood || null
  }

  getTextureSources() {
    const textureSources = this.planeConfig
      .map((planeDefinition) => planeDefinition.textureSrc)
      .filter(Boolean)

    return [...new Set(textureSources)]
  }

  setPreloadedTextures(texturesBySource) {
    this.texturesBySource = texturesBySource instanceof Map ? texturesBySource : new Map()
  }

  updatePlaneMaterialMode() {
    this.planes.forEach((plane) => {
      const uni = plane.material.uniforms
      const texture = plane.userData.texture || null
      const showTexture = Boolean(this.useTextures && texture)

      uni.uMap.value = showTexture ? texture : this.placeholderTexture
      uni.uHasTexture.value = showTexture ? 1.0 : 0.0
      uni.uColor.value.set(showTexture ? '#ffffff' : plane.userData.baseColor)
    })
  }

  bindDebug() {
    if (!this.debug || this.isDebugBound) return

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'planeGap',
      label: 'Gap',
      options: {
        min: 0.4,
        max: 10,
        step: 0.1,
      },
      onChange: () => {
        this.layoutPlanes()
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'useTextures',
      label: 'Use Textures',
      onChange: () => {
        this.updatePlaneMaterialMode()
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'moodSampleOffset',
      label: 'Mood Offset',
      options: {
        min: 0,
        max: 1.5,
        step: 0.01,
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'parallaxEnabled',
      label: 'Plane Parallax',
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'parallaxAmountX',
      label: 'Parallax X',
      options: {
        min: 0,
        max: 0.5,
        step: 0.01,
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'parallaxAmountY',
      label: 'Parallax Y',
      options: {
        min: 0,
        max: 0.3,
        step: 0.01,
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'gestureParallaxEnabled',
      label: 'Gesture Parallax',
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'gestureParallaxAmountY',
      label: 'Gesture Y',
      options: {
        min: 0,
        max: 0.5,
        step: 0.01,
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'breathEnabled',
      label: 'Plane Breath',
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'breathTiltAmount',
      label: 'Breath Tilt',
      options: {
        min: 0,
        max: 0.2,
        step: 0.005,
      },
    })

    this.debug.addBinding({
      folderTitle: 'Gallery',
      targetObject: this,
      property: 'breathScaleAmount',
      label: 'Breath Scale',
      options: {
        min: 0,
        max: 0.1,
        step: 0.001,
      },
    })

    this.isDebugBound = true
  }

  updatePlaneVisibility(cameraZ) {
    // Expanded mode: pin the chosen plane at full opacity, fade everyone else out
    if (this.expandedPlaneIndex >= 0) {
      this.planes.forEach((plane, index) => {
        const targetOpacity = index === this.expandedPlaneIndex ? 1 : 0
        const uni = plane.material.uniforms
        uni.uOpacity.value = THREE.MathUtils.lerp(
          uni.uOpacity.value,
          targetOpacity,
          this.planeFadeSmoothing
        )
        uni.uBlur.value = THREE.MathUtils.lerp(
          uni.uBlur.value,
          Math.pow(1.0 - targetOpacity, 2),
          this.planeFadeSmoothing
        )
      })
      return
    }

    const blendData = this.getPlaneBlendData(cameraZ)
    if (!blendData) return

    const { currentPlaneIndex, nextPlaneIndex, blend } = blendData

    this.planes.forEach((plane, index) => {
      let targetOpacity = 0

      if (index === currentPlaneIndex) {
        targetOpacity = 1 - blend
      }
      if (index === nextPlaneIndex) {
        targetOpacity = Math.max(targetOpacity, blend)
      }

      const uni = plane.material.uniforms
      uni.uOpacity.value = THREE.MathUtils.lerp(
        uni.uOpacity.value,
        targetOpacity,
        this.planeFadeSmoothing
      )
      // Blur inversely follows opacity with a power curve so blur is
      // only noticeable when a plane is nearly off-screen (DoF effect)
      const targetBlur = Math.pow(1.0 - targetOpacity, 2)
      uni.uBlur.value = THREE.MathUtils.lerp(uni.uBlur.value, targetBlur, this.planeFadeSmoothing)
    })
  }

  bindPointerEvents() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
  }

  updatePlaneMotion(scroll = null) {
    // Smooth pointer toward target
    this.pointerCurrent.lerp(this.pointerTarget, this.parallaxSmoothing)

    // Velocity → breath + drift
    const velocityMax = Math.max(scroll?.velocityMax || 1, 0.0001)
    const velocityNormalized = THREE.MathUtils.clamp(
      Math.abs(scroll?.velocity || 0) / velocityMax,
      0,
      1
    )
    const scrollDrift = THREE.MathUtils.clamp((scroll?.velocity || 0) / velocityMax, -1, 1)
    this.targetBreathIntensity = this.breathEnabled
      ? THREE.MathUtils.clamp(velocityNormalized * this.breathGain, 0, 1)
      : 0
    this.breathIntensity = THREE.MathUtils.lerp(
      this.breathIntensity,
      this.targetBreathIntensity,
      this.breathSmoothing
    )
    this.driftTarget = this.gestureParallaxEnabled ? scrollDrift : 0
    this.driftCurrent = THREE.MathUtils.lerp(
      this.driftCurrent,
      this.driftTarget,
      this.gestureParallaxSmoothing
    )

    // Per-plane: position, rotation, scale
    const xSpreadFactor = this.getXSpreadFactor()
    const isExpanded = this.expandedPlaneIndex >= 0

    this.planes.forEach((plane, index) => {
      const basePosition = plane.userData.basePosition || { x: 0, y: 0 }
      const xPosition = basePosition.x * xSpreadFactor
      const yPosition = basePosition.y
      const zPosition = -index * this.planeGap
      const opacity = plane.material.uniforms?.uOpacity?.value ?? 0

      // In expand mode: lerp the active plane to centre (0,0), kill parallax/breath
      if (isExpanded && index === this.expandedPlaneIndex) {
        plane.position.x = THREE.MathUtils.lerp(plane.position.x, 0, 0.08)
        plane.position.y = THREE.MathUtils.lerp(plane.position.y, 0, 0.08)
        plane.position.z = zPosition
        plane.rotation.set(0, 0, 0)
        const aspectRatio = plane.userData.aspectRatio || 1
        const baseScale =
          window.innerWidth <= this.mobileBreakpoint ? this.mobilePlaneScale : this.desktopPlaneScale
        plane.scale.set(baseScale * aspectRatio, baseScale, 1)
        return
      }

      if (this.introActive && index === 0) {
        const now = performance.now()
        const dt = Math.min((now - this.introLastFrameTime) / 1000, 0.05)
        this.introLastFrameTime = now

        // Spring: F = -k*x - c*v
        const springForce = -this.introStiffness * this.introCurrentX
        const dampingForce = -this.introDamping * this.introVelocityX
        this.introVelocityX += (springForce + dampingForce) * dt
        this.introCurrentX += this.introVelocityX * dt

        if (Math.abs(this.introCurrentX) < 0.0008 && Math.abs(this.introVelocityX) < 0.0008) {
          this.introCurrentX = 0
          this.introActive = false
        }

        plane.position.x += this.introCurrentX
      }

      const depthInfluence = 1 + index * 0.05
      const parallaxInfluence = this.parallaxEnabled ? opacity * depthInfluence : 0

      const parallaxOffsetX = this.pointerCurrent.x * this.parallaxAmountX * parallaxInfluence
      const parallaxOffsetY = this.pointerCurrent.y * this.parallaxAmountY * parallaxInfluence
      const gestureOffsetY = this.driftCurrent * this.gestureParallaxAmountY

      plane.position.x = THREE.MathUtils.lerp(plane.position.x, xPosition + parallaxOffsetX, 0.15)
      plane.position.y = THREE.MathUtils.lerp(plane.position.y, yPosition + parallaxOffsetY + gestureOffsetY, 0.15)
      plane.position.z = zPosition

      const breathInfluence = this.breathEnabled ? this.breathIntensity * opacity : 0
      const tiltX = -this.pointerCurrent.y * this.breathTiltAmount * breathInfluence
      const tiltY = this.pointerCurrent.x * this.breathTiltAmount * breathInfluence
      plane.rotation.x = tiltX
      plane.rotation.y = tiltY
      plane.rotation.z = 0

      const aspectRatio = plane.userData.aspectRatio || 1
      const baseScale =
        window.innerWidth <= this.mobileBreakpoint ? this.mobilePlaneScale : this.desktopPlaneScale
      const scalePulse = 1 + this.breathScaleAmount * breathInfluence
      plane.scale.x = baseScale * aspectRatio * scalePulse
      plane.scale.y = baseScale * scalePulse
      plane.scale.z = 1
    })
  }

  update(camera = null, scroll = null) {
    if (!camera) return
    this.updatePlaneVisibility(camera.position.z)
    this.updatePlaneMotion(scroll)
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerleave', this.onPointerLeave)
  }
}

export { Gallery }
