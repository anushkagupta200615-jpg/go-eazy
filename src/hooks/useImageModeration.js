import { useEffect, useRef, useState, useCallback } from 'react'

export const useImageModeration = () => {
  const workerRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [resolves, setResolves] = useState({})
  
  // Track message IDs to map responses to promises
  const idCounter = useRef(0)

  useEffect(() => {
    // Vite loads workers as modules with ?worker
    import('../workers/moderation.worker.js?worker').then((WorkerModule) => {
      workerRef.current = new WorkerModule.default()
      
      workerRef.current.onmessage = (e) => {
        const { type, id, predictions, error } = e.data
        
        if (type === 'INIT_SUCCESS') {
          setIsReady(true)
        }
        
        if (type === 'MODERATE_RESULT' || type === 'MODERATE_ERROR') {
          setResolves(prev => {
            const currentResolves = { ...prev }
            const resolveFn = currentResolves[id]
            if (resolveFn) {
              resolveFn({ type, predictions, error })
              delete currentResolves[id]
            }
            return currentResolves
          })
        }
      }

      // Trigger initialization (downloads model)
      workerRef.current.postMessage({ type: 'INIT' })
    })

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  const extractImageData = (file) => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // Resize for faster processing (NSFWJS doesn't need high res)
        const scale = Math.min(1, 299 / Math.max(img.width, img.height))
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(imageData)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load image for processing'))
      }
      img.src = url
    })
  }

  const moderateImage = useCallback(async (file) => {
    if (!workerRef.current || !isReady) {
      console.warn('Moderation worker not ready, skipping.')
      return { isSafe: true, reason: 'Worker not ready' }
    }

    try {
      const imageData = await extractImageData(file)
      const messageId = idCounter.current++

      const result = await new Promise((resolve) => {
        setResolves(prev => ({ ...prev, [messageId]: resolve }))
        workerRef.current.postMessage({ type: 'MODERATE', id: messageId, payload: imageData })
      })

      if (result.type === 'MODERATE_ERROR') {
        console.error('Moderation error:', result.error)
        return { isSafe: true, reason: 'Moderation failed' } // Fail open so we don't block users if ML crashes
      }

      // NSFWJS categories: 'Porn', 'Sexy', 'Hentai', 'Neutral', 'Drawing'
      let unsafeProbability = 0
      
      result.predictions.forEach(p => {
        if (p.className === 'Porn' || p.className === 'Hentai' || p.className === 'Sexy') {
          unsafeProbability += p.probability
        }
      })

      // If combined probability of NSFW categories is > 60%, reject it
      if (unsafeProbability > 0.6) {
        return { isSafe: false, reason: 'Inappropriate content detected' }
      }

      return { isSafe: true }
    } catch (err) {
      console.error('Image extraction error:', err)
      return { isSafe: true, reason: 'Failed to extract' }
    }
  }, [isReady])

  return { moderateImage, isModerationReady: isReady }
}
