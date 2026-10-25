import { scanRegisterPair, scanSingleRegister } from './attacks'

type RunMessage = { kind: 'run'; runId: number; attack: 'single' | 'pair'; observed: number[] }

self.onmessage = (event: MessageEvent<RunMessage>) => {
  const message = event.data
  if (message.kind !== 'run') return
  try {
    if (message.attack !== 'single' && message.attack !== 'pair') throw new Error('Unknown bounded scan.')
    if (!Array.isArray(message.observed)) throw new Error('Observed output must be copied into an array.')
    const result = message.attack === 'single' ? scanSingleRegister(message.observed) : scanRegisterPair(message.observed)
    self.postMessage({ kind: 'result', runId: message.runId, attack: message.attack, result })
  } catch (error) {
    self.postMessage({ kind: 'error', runId: message.runId, message: error instanceof Error ? error.message : String(error) })
  }
}
