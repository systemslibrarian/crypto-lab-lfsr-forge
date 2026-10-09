import { connection, generate, type Bit, type State } from '../lfsr/lfsr'

export const GEFFE = {
  r1: connection(7, [1, 7]),
  r2: connection(11, [2, 11]),
  r3: connection(13, [1, 3, 4, 13]),
} as const

export interface GeffeStates { r1: State; r2: State; r3: State }

export function combine(x1: Bit, x2: Bit, x3: Bit): Bit {
  return ((x1 & x2) ^ ((1 ^ x2) & x3)) as Bit
}

export function geffeBits(states: GeffeStates, count: number): Bit[] {
  const a = generate(GEFFE.r1, states.r1, count).bits
  const b = generate(GEFFE.r2, states.r2, count).bits
  const c = generate(GEFFE.r3, states.r3, count).bits
  return a.map((bit, index) => combine(bit, b[index], c[index]))
}

// [extension] A future combiner gets a separate verified profile and attack contract.
export const GEFFE_LENGTHS = { r1: 7, r2: 11, r3: 13 } as const
