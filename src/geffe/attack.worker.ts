import { correlationAttack, type AttackBudget } from './correlation'
import type { Bit } from '../lfsr/lfsr'

const cancelled = new Set<number>()
self.onmessage = async (event: MessageEvent<{ kind: 'run' | 'cancel'; runId: number; observed?: Bit[]; budget?: AttackBudget }>) => {
  const { kind, runId } = event.data
  if (kind === 'cancel') { cancelled.add(runId); return }
  if (kind !== 'run' || !Array.isArray(event.data.observed) || !event.data.budget) return
  try {
    const result = await correlationAttack(event.data.observed, event.data.budget,
      (phase, done, total) => self.postMessage({ kind: 'progress', runId, phase, done, total }),
      () => cancelled.has(runId))
    if (!cancelled.has(runId)) self.postMessage({ kind: 'result', runId, result })
  } catch (error) {
    if (!cancelled.has(runId)) self.postMessage({ kind: 'error', runId, message: error instanceof Error ? error.message : String(error) })
  } finally { cancelled.delete(runId) }
}
