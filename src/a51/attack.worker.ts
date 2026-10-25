import { recoverCompletions, type DisclosedState } from './recovery'
import type { A51ClockMode } from './a51'

type RunMessage = Readonly<{
  kind: 'run'
  runId: number
  disclosed: DisclosedState
  observed: number[]
  model: A51ClockMode
}>
type CancelMessage = Readonly<{ kind: 'cancel'; runId: number }>

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const isRunId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0

let currentRun = 0
self.onmessage = async (event: MessageEvent<unknown>) => {
  const incoming = event.data
  const possibleRunId = isRecord(incoming) && isRunId(incoming.runId) ? incoming.runId : 0
  let recoveryStarted = false
  try {
    if (!isRecord(incoming) || typeof incoming.kind !== 'string' || !isRunId(incoming.runId)) throw new Error('Worker message must be a run or cancel object with a positive integer runId.')
    if (incoming.kind === 'cancel') {
      if (!hasExactKeys(incoming, ['kind', 'runId'])) throw new Error('Cancel accepts only kind and runId.')
      const message = incoming as unknown as CancelMessage
      if (message.runId === currentRun) currentRun++
      return
    }
    if (incoming.kind !== 'run' || !hasExactKeys(incoming, ['disclosed', 'kind', 'model', 'observed', 'runId'])) throw new Error('Worker accepts only the masked state, copied observations, and public clock model.')
    if (incoming.model !== 'majority' && incoming.model !== 'regular') throw new Error('Worker clock model must be majority or regular.')
    if (!Array.isArray(incoming.observed) || incoming.observed.some(bit => bit !== 0 && bit !== 1)) throw new Error('Worker observations must be a binary array.')
    const message = incoming as unknown as RunMessage
    const runId = message.runId
    currentRun = runId
    recoveryStarted = true
    const result = await recoverCompletions(
      message.disclosed,
      message.observed,
      message.model,
      update => self.postMessage({ kind: 'progress', runId, ...update }),
      () => currentRun !== runId,
    )
    if (currentRun === runId) self.postMessage({ kind: 'result', runId, result })
  } catch (error) {
    if (!recoveryStarted || currentRun === possibleRunId) self.postMessage({ kind: 'error', runId: possibleRunId, message: error instanceof Error ? error.message : String(error) })
  }
}
