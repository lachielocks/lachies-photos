import '@/css/base.css'
import '@/css/canvas.css'

import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { Engine } from '@/Experience/Engine'
import { Intro } from '@/Experience/Intro'

inject()
injectSpeedInsights()

// Debug helper: run `__resetIntro()` in the console to replay the intro
window.__resetIntro = () => { Intro.reset(); location.reload() }

const canvas = document.querySelector('.webgl')

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing .webgl canvas element in index.html')
}

const engine = new Engine(canvas)

let introPromise = Promise.resolve()
if (Intro.shouldPlay()) {
  document.body.classList.add('intro-playing')
  introPromise = new Intro().run().then(() => {
    document.body.classList.remove('intro-playing')
  })
}

engine.init(introPromise).catch((error) => {
  console.error('Engine initialization failed', error)
})
