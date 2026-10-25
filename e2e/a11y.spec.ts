import { expect, test } from '@playwright/test'
import { boot, driveBoolean, driveTrivium, NARROW, scan, watchPageErrors } from './gate'

for (const width of [1280, NARROW.width]) {
  test(`WCAG 2.1 A/AA across the seven panels at ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    const errors = watchPageErrors(page)
    await page.setViewportSize({ width, height: 900 })
    await boot(page)
    await scan(page, 'arrival')
    await page.getByRole('button', { name: 'Clock one step' }).click()
    await page.getByRole('button', { name: 'Collect 8 bits' }).click()
    await scan(page, 'register and BM trace')
    await page.getByRole('button', { name: 'Freeze hidden forecast' }).click()
    await page.getByRole('button', { name: 'Reveal original next 64 bits' }).click()
    await scan(page, 'prediction checked')
    await page.getByRole('button', { name: 'Compare original parameters' }).click()
    await page.getByRole('button', { name: 'Early failure' }).click()
    await scan(page, 'parameter comparison and early failure')
    await page.getByRole('button', { name: 'Clock disclosed registers' }).click()
    await page.getByRole('button', { name: 'Measure 466-bit profile' }).click()
    await scan(page, 'Geffe inspection')
    await page.getByRole('button', { name: 'Reproducible claim fixture' }).click()
    await expect(page.locator('[data-verdict="ONE TRIPLE WITHIN SEARCH BUDGET"]')).toBeVisible()
    await page.getByRole('button', { name: 'Reveal original next 64 bits' }).click()
    await page.getByRole('button', { name: 'Compare original states' }).click()
    await page.getByRole('button', { name: 'Measure later complexity with 466 bits' }).click()
    await scan(page, 'Geffe state recovery')
    await driveTrivium(page)
    await driveBoolean(page)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('Trivium and Boolean extensions accessibility at 320px', async ({ page }) => {
  test.setTimeout(180000)
  const errors = watchPageErrors(page)
  await page.setViewportSize({ width: 320, height: 900 }); await boot(page)
  await driveTrivium(page)
  await driveBoolean(page)
  expect(errors).toEqual([])
})
