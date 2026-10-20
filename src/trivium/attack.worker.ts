import { recoverZeroRound } from './zero-round'
let current = 0
self.onmessage = async (event: MessageEvent) => {
  const message = event.data
  if (message.kind === 'cancel') { current++; return }
  const runId = message.runId
  if (message.kind !== 'run') return
  current = runId
  try {
    if (Object.keys(message).sort().join(',') !== 'iv,kind,observed,runId') throw new Error('Worker accepts only public IV and copied observations.')
    const result = await recoverZeroRound(new Uint8Array(message.iv), new Uint8Array(message.observed), (done, total) => self.postMessage({ kind: 'progress', runId, done, total }), () => current !== runId)
    if (current === runId) self.postMessage({ kind: 'result', runId, result })
  } catch (error) { if (current === runId) self.postMessage({ kind: 'error', runId, message: error instanceof Error ? error.message : String(error) }) }
}
