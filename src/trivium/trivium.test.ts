import { describe, expect, it } from 'vitest'
import { AND_TAPS, clock, hex, INIT_ROUNDS, keyBits, keyBytes, keystreamBits, loadState, packBytes, parse80 } from './trivium'
import { VECTORS, checkVectors } from './vectors'
import { buildSystem, recoverZeroRound } from './zero-round'
import { berlekampMasseyTrace, forecast } from '../lfsr/bm'

describe('published eSTREAM Trivium vectors', () => {
  for (const v of VECTORS) it(`set ${v.set} vector ${v.number}: all four slices and whole-stream XOR digest`, () => {
    const stream = packBytes(keystreamBits(parse80(v.key), parse80(v.iv), 4096))
    for (const slice of v.slices) expect(hex(stream.slice(slice.offset, slice.offset + 64))).toBe(slice.hex)
    const digest = new Uint8Array(64)
    for (let i = 0; i < 512; i++) digest[i % 64] ^= stream[i]
    expect(hex(digest)).toBe(v.xorDigest)
  })
  it('runs all 15 published checks and defaults to the full warm-up', () => {
    expect(checkVectors()).toEqual({ passed: 15, total: 15 })
    expect(INIT_ROUNDS).toBe(1152)
    const k = parse80(VECTORS[0].key), iv = parse80(VECTORS[0].iv)
    expect(keystreamBits(k, iv, 128)).toEqual(keystreamBits(k, iv, 128, 1152))
    expect(keystreamBits(k, iv, 128, 1151)).not.toEqual(keystreamBits(k, iv, 128))
  })
  it('loads exactly 288 bits and exposes the actual three AND tap pairs', () => {
    const key = parse80('1234567890abcdef1357'), iv = parse80('76543210fedcba987654'), s = loadState(key, iv)
    expect(s.length).toBe(288); expect(AND_TAPS).toEqual([[91, 92], [175, 176], [286, 287]])
    expect(s.slice(0, 80)).toEqual(keyBits(key)); expect(s.slice(93, 173)).toEqual(keyBits(iv))
    expect(s.slice(285)).toEqual(Uint8Array.of(1, 1, 1))
    expect(keyBytes(s.slice(0, 80))).toEqual(key)
    const before = new Uint8Array(s), step = clock(s)
    expect(s).toEqual(before); expect(step.next).not.toBe(s)
    expect(step.z).toBe(s[65] ^ s[92] ^ s[161] ^ s[176] ^ s[242] ^ s[287])
  })
  it('the first 66 zero-round bits are linear in original state, across 100 random key/IV pairs', () => {
    for (let n = 0; n < 100; n++) {
      const key = crypto.getRandomValues(new Uint8Array(10)), iv = crypto.getRandomValues(new Uint8Array(10)), s = loadState(key, iv)
      const bits = keystreamBits(key, iv, 66, 0)
      for (let t = 0; t < 66; t++) expect(bits[t]).toBe([66, 93, 162, 177, 243, 288].reduce((b, p) => b ^ s[p - t - 1], 0))
    }
  })
  it('rejects malformed fields, states, lengths, warm-up counts and byte packing', () => {
    expect(() => parse80('00')).toThrow('20 hex'); expect(() => parse80('x'.repeat(20), 'IV')).toThrow('IV')
    const k = new Uint8Array(10)
    expect(() => loadState(new Uint8Array(9), k)).toThrow('10 bytes')
    expect(() => clock(k)).toThrow('288')
    for (const n of [-1, 1.2, 65537]) expect(() => keystreamBits(k, k, n)).toThrow('Bit count')
    for (const n of [-1, 1153, 0.5]) expect(() => keystreamBits(k, k, 1, n)).toThrow('Initialization')
    expect(() => packBytes(Uint8Array.of(1))).toThrow('multiple'); expect(() => keyBytes(k)).toThrow('80')
  })
})

describe('public zero-round recovery', () => {
  it('recovers eight random keys from IV/output alone and checks every affine assignment', async () => {
    for (let trial = 0; trial < 8; trial++) {
      const key = crypto.getRandomValues(new Uint8Array(10)), iv = crypto.getRandomValues(new Uint8Array(10)), observed = keystreamBits(key, iv, 256, 0)
      const before = new Uint8Array(observed), system = buildSystem(iv, observed), recovered = await recoverZeroRound(iv, observed)
      expect(system.rank).toBe(66); expect(system.free.length).toBe(14)
      expect(recovered.tested).toBe(16384); expect(recovered.candidates).toEqual([key]); expect(observed).toEqual(before)
      for (const choice of [0, 1, 2, 1023, 16383]) {
        const bits = keyBits(system.candidate(choice))
        for (const equation of system.equations) expect(equation.positions.reduce((b, p) => b ^ bits[p - 1], 0)).toBe(equation.rhs)
      }
    }
  }, 20000)
  it('full warm-up yields solvable first equations but no consistent zero-round key in three trials', async () => {
    for (let t = 0; t < 3; t++) {
      const key = crypto.getRandomValues(new Uint8Array(10)), iv = crypto.getRandomValues(new Uint8Array(10)), output = keystreamBits(key, iv, 256)
      expect(buildSystem(iv, output).rank).toBe(66)
      const result = await recoverZeroRound(iv, output)
      expect(result.tested).toBe(16384); expect(result.candidates).toEqual([])
    }
  }, 10000)
  it('only 66 observed bits leaves all 16,384 candidates; cancellation does not return a verdict', async () => {
    const bytes = new Uint8Array(10), output = keystreamBits(bytes, bytes, 66, 0)
    expect((await recoverZeroRound(bytes, output)).candidates.length).toBe(16384)
    await expect(recoverZeroRound(bytes, output, () => {}, () => true)).rejects.toThrow('cancelled')
    expect(() => buildSystem(bytes, output.slice(1))).toThrow('66')
  }, 10000)
  it('measures BM and a frozen forecast for both full and broken warm-up, without asserting global complexity', () => {
    const k = parse80('0053a6f94c9ff24598eb'), iv = parse80('0d74db42a91077de45ac')
    for (const rounds of [0, 288, 1152]) {
      const output = Array.from(keystreamBits(k, iv, 1088, rounds)), prefix = output.slice(0, 1024), result = berlekampMasseyTrace(prefix)
      expect(result.length).toBeGreaterThan(450); expect(result.length).toBeLessThan(580)
      expect(forecast(prefix, result.coefficients, result.length, 64)).not.toEqual(output.slice(1024))
    }
  })
})
