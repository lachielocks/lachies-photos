import '@/css/base.css'
import '@/css/canvas.css'

import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { Engine } from '@/Experience/Engine'

inject()
injectSpeedInsights()

const canvas = document.querySelector('.webgl')

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing .webgl canvas element in index.html')
}

const engine = new Engine(canvas)

engine.init().catch((error) => {
  console.error('Engine initialization failed', error)
})
