import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { auditContrast, formatContrastFailures } from './contrast'
import { auditNonText, formatNonTextFailures } from './nontext'
import { NONTEXT_BASELINE } from './nontext-baseline'

// Adapted from the Crypto Lab Schnorr Forge gate. Scan actual reached states.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
export const NARROW = { width: 380, height: 800 }

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  return errors
}

export async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(20000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('.')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('main#app')).toHaveCount(1)
  await expect(page.locator('section.panel')).toHaveCount(9)
  await expect(page.locator('#panel-trivium > .card')).toHaveCount(3)
  await expect(page.locator('#panel-boolean > .card')).toHaveCount(3)
  await expect(page.locator('#panel-cube > .card')).toHaveCount(3)
  await expect(page.locator('#panel-a51 > .card')).toHaveCount(3)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app')
  await expect(page.locator('details[open]')).toHaveCount(0)
  await expect(page.locator('header[role="banner"]')).toHaveCount(1)
  await expect(page.locator('[data-theme-toggle], #theme-toggle')).toHaveCount(0)
}

export async function scan(page: Page, state: string): Promise<void> {
  await expect(page.locator('#visible-view')).not.toBeEmpty()
  await expect(page.locator('#bm-view')).not.toBeEmpty()
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
    const ownText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim())
    return ownText && (element as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }) && getComputedStyle(element).opacity === '0'
  }).length), `visible text at zero opacity in ${state}`).toBe(0)
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const landmarks = await new AxeBuilder({ page }).withRules(['landmark-no-duplicate-banner', 'landmark-unique', 'landmark-one-main', 'landmark-complementary-is-top-level']).analyze()
  const violations = [...wcag.violations, ...landmarks.violations].map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target.join(' ')) }))
  expect(violations, `axe violations in ${state}`).toEqual([])
  const incomplete = [...wcag.incomplete, ...landmarks.incomplete].filter(issue => issue.id !== 'color-contrast').map(issue => issue.id)
  expect(incomplete, `unresolved axe results in ${state}`).toEqual([])
  expect(formatContrastFailures(await auditContrast(page)), `text contrast in ${state}`).toEqual([])
  const nontext = await auditNonText(page)
  const unbaselined = nontext.filter(issue => !NONTEXT_BASELINE[`${issue.kind}|${issue.selector}`])
  expect(formatNonTextFailures(unbaselined), `non-text contrast in ${state}`).toEqual([])
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow, `horizontal overflow in ${state}`).toBeLessThanOrEqual(1)
  const unreachableScrollers = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter(element => element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible' && element.tabIndex < 0 && !element.matches('table')).map(element => element.className || element.tagName))
  expect(unreachableScrollers, `unreachable horizontal scrollers in ${state}`).toEqual([])
}

export async function driveTrivium(page: Page): Promise<void> {
  await page.locator('#tri-init').click(); await page.locator('#tri-step').click()
  await page.locator('#tri-bm').click(); await page.locator('#tri-lfsr').click()
  await page.locator('#tri-freeze').click(); await page.locator('#tri-reveal').click()
  await page.locator('[data-tri="trivium-fit"] summary').click()
  await scan(page, 'Trivium stepper and both measured forecasts')
  await page.locator('#tri-observe').click(); await page.locator('#tri-recover').click()
  await expect(page.locator('[data-tri="candidate-count"]')).toHaveCount(1)
  await scan(page, 'Trivium full-warm-up candidate rejection')
  await page.locator('input[name="tri-rounds"][value="0"]').check()
  await page.locator('#tri-observe').click(); await page.locator('#tri-recover').click()
  await expect(page.locator('[data-tri="candidate-count"]')).toHaveCount(1)
  await page.locator('#tri-compare').click()
  await page.locator('#tri-recovery summary').click()
  await scan(page, 'Trivium zero-round recovery and equations')
  await page.locator('#tri-key').fill('bad'); await page.locator('#tri-step').click()
  await scan(page, 'Trivium validation error and retired results')
}

export async function driveBoolean(page: Page): Promise<void> {
  await page.locator('#bool-preset').selectOption('bent')
  await page.locator('#bool-subset').selectOption('3')
  await page.locator('#bool-table-card details summary').click()
  await scan(page, 'Boolean truth table, Walsh spectrum and restrictions')
  await page.locator('#bool-single').click()
  await expect(page.locator('[data-verdict="ONE LEADING STATE"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare original R4 state' }).click()
  await scan(page, 'Boolean single-register correlation scan')
  await page.locator('#bool-pair').click()
  await expect(page.locator('[data-verdict="ONE LEADING PAIR"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare original R1/R2 states' }).click()
  await page.locator('#bool-attacks-card details summary').click()
  await scan(page, 'Boolean pair scan and explicit limitations')
}

export async function driveCube(page: Page): Promise<void> {
  await page.locator('#cube-preprocess').click()
  await expect(page.locator('[data-cube="pre-raw"]')).toHaveText('128')
  await page.getByText('Show all 128 preprocessing outputs', { exact: true }).click()
  const cubeTables = page.locator('#cube-preprocess-view > details').first().locator('details > summary')
  await expect(cubeTables).toHaveCount(4)
  for (let index = 0; index < 4; index++) await cubeTables.nth(index).click()
  await scan(page, 'all cube preprocessing outputs')
  await page.getByText('Show monomial cancellation', { exact: true }).click()
  await scan(page, 'cube monomial cancellation')
  await page.locator('#cube-online').click()
  await expect(page.locator('[data-cube="candidate"]')).toHaveText('110')
  await page.locator('#cube-heldout').click()
  await expect(page.locator('[data-verdict="HELD-OUT OUTPUTS MATCH"]')).toBeVisible()
  await page.locator('#cube-compare').click()
  await page.locator('#cube-flip').click()
  await expect(page.locator('[data-verdict="HELD-OUT CHECK REJECTED 000"]')).toBeVisible()
  await page.locator('#cube-limits-card > details > summary').click()
  await scan(page, 'cube preprocessing, recovery, held-outs, and rejected corruption')
}

export async function driveA51(page: Page): Promise<void> {
  await expect(page.locator('[data-verdict="HISTORICAL BGW VECTOR PASSED"]')).toBeVisible()
  await page.locator('#a51-predict-r1').check(); await page.locator('#a51-predict-r2').check()
  await page.locator('#a51-check-prediction').click()
  await expect(page.locator('[data-verdict="MAJORITY PREDICTION MATCHED"]')).toBeVisible()
  await page.locator('#a51-regular').click()
  await expect(page.locator('[data-verdict="COUNTERFACTUAL ONLY"]')).toBeVisible()
  await page.locator('#a51-step').click()
  await expect(page.locator('[data-a51="step-output"]')).toHaveText('0')
  await page.locator('#a51-reset').click()
  await page.locator('#a51-checkpoints > summary').click()
  await scan(page, 'historical A5/1 vector, prediction, and counterfactual step')

  await page.locator('#a51-run').click()
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveText('1425')
  await page.locator('#a51-heldout').click(); await page.locator('#a51-compare').click()
  await expect(page.locator('[data-verdict="POST-100 STATE CONFIRMED"]')).toBeVisible()
  await scan(page, 'bounded A5/1 state completion and separate verification')

  await page.locator('#a51-ambiguous').click()
  await expect(page.locator('[data-a51="ambiguous-count"]')).toHaveText('11')
  await page.locator('#a51-wrong-model').click()
  await expect(page.locator('[data-verdict="REGULAR MODEL REJECTED"]')).toBeVisible()
  await page.locator('#a51-corrupt').click()
  await expect(page.locator('[data-verdict="HELD-OUT CONTINUATION REJECTED 1409"]')).toBeVisible()
  await page.locator('#a51-failures-card > details > summary').click()
  await scan(page, 'A5/1 ambiguity, wrong-model, corruption, sources, and limits')
}
