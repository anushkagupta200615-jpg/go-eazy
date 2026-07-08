import * as tf from '@tensorflow/tfjs'
import * as nsfwjs from 'nsfwjs'

let model = null
let modelLoadingPromise = null

// Force CPU or WebGL based on environment (workers sometimes struggle with WebGL depending on browser)
tf.setBackend('cpu').then(() => console.log('TFJS Worker Backend initialized: CPU'))

const getModel = async () => {
  if (model) return model
  if (!modelLoadingPromise) {
    // Load model from public unpkg CDN (InceptionV3)
    modelLoadingPromise = nsfwjs.load('https://unpkg.com/nsfwjs@2.4.1/model/')
  }
  model = await modelLoadingPromise
  return model
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  if (type === 'INIT') {
    try {
      await getModel()
      self.postMessage({ type: 'INIT_SUCCESS' })
    } catch (err) {
      console.error('NSFWJS Worker Init Error:', err)
      self.postMessage({ type: 'INIT_ERROR', error: err.message })
    }
  }

  if (type === 'MODERATE') {
    try {
      const m = await getModel()
      // payload is an ImageData object from the main thread
      const numChannels = 3
      // Convert ImageData to Tensor3D
      const tensor = tf.browser.fromPixels(payload, numChannels)
      const predictions = await m.classify(tensor)
      
      // Cleanup tensor to prevent memory leaks in the worker!
      tensor.dispose()

      self.postMessage({ type: 'MODERATE_RESULT', id, predictions })
    } catch (err) {
      console.error('NSFWJS Worker Moderation Error:', err)
      self.postMessage({ type: 'MODERATE_ERROR', id, error: err.message })
    }
  }
}
