import { test, expect } from '@playwright/test'

test('same-site approval, browser audio persistence, command acknowledgment, reconnect and revocation', async ({
  page: phone,
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
  const host = await hostContext.newPage()
  try {
    await host.goto('/library')
    await host.getByRole('button', { name: 'Add song', exact: true }).click()
    await host.locator('input[type=file]').nth(0).setInputFiles('e2e/fixtures/piano-noise.wav')
    await host.locator('input[type=file]').nth(1).setInputFiles('e2e/fixtures/choir-noise.wav')
    await host.getByPlaceholder(/amazing grace/i).fill('Remote Hymn')
    await host.getByRole('button', { name: 'Save song' }).click()
    await expect(host.getByText('Remote Hymn')).toBeVisible()
    await host.reload()
    await host.getByRole('link', { name: 'Player', exact: true }).click()
    await host.getByRole('button', { name: 'New service' }).click()
    await host.getByPlaceholder(/sunday morning/i).fill('Remote Sunday')
    await host.getByRole('button', { name: 'Create', exact: true }).click()
    await host.getByRole('button', { name: 'Add songs', exact: true }).first().click()
    await host.getByText('Remote Hymn').click()
    await host.getByRole('button', { name: /^Add 1$/ }).click()

    await host.getByRole('button', { name: 'Enable Remote Control' }).click()
    await expect(host.locator('.pairing-code')).toHaveText(/^\d{6}$/)
    const code = await host.locator('.pairing-code').innerText()
    await phone.addInitScript(() => {
      const audio = window.Audio
      const open = indexedDB.open.bind(indexedDB)
      Object.assign(window, { localAudioCreated: 0, localStorageOpened: 0 })
      window.Audio = new Proxy(audio, {
        construct(target, args) {
          Object.assign(window, {
            localAudioCreated:
              (window as unknown as { localAudioCreated: number }).localAudioCreated + 1,
          })
          return Reflect.construct(target, args)
        },
      })
      indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
        Object.assign(window, {
          localStorageOpened:
            (window as unknown as { localStorageOpened: number }).localStorageOpened + 1,
        })
        return open(...args)
      }
    })
    await phone.goto(`/remote#code=${code}`)
    await expect(phone).toHaveURL(/\/remote$/)
    await phone.getByRole('button', { name: 'Connect to player' }).click()
    await expect(
      phone.getByText('Waiting for approval on the player', { exact: true }),
    ).toBeVisible()
    await expect(phone.getByRole('heading', { name: 'Remote Hymn' })).toHaveCount(0)
    await host.getByRole('button', { name: 'Approve controller' }).click()
    await expect(phone.getByText('Connected to player', { exact: true })).toBeVisible()
    await phone.getByText('Services', { exact: true }).click()
    await phone.getByRole('button', { name: 'Remote Sunday' }).click()
    await expect(phone.getByRole('heading', { name: 'Remote Hymn' })).toBeVisible()
    await expect(host.locator('.pod__title')).toContainText('Remote Hymn')
    await expect(phone.locator('.transport')).toContainText('stopped')
    // Unlock browser audio on the host, then control that same engine from the phone.
    await host.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(phone.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await phone.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(phone.locator('.transport')).toContainText('paused')
    await phone.getByText('Mix', { exact: true }).click()
    await phone.getByRole('button', { name: 'Mute choir' }).click()
    await expect(phone.getByRole('button', { name: 'Mute choir' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await phone.getByRole('button', { name: 'Panic Stop', exact: true }).click()
    await expect(phone.getByText('Acknowledged — host completed Panic Stop')).toBeVisible()
    await phone.reload()
    await expect(phone.getByText('Connected to player', { exact: true })).toBeVisible()
    expect(
      await phone.evaluate(
        () => (window as unknown as { localAudioCreated: number }).localAudioCreated,
      ),
    ).toBe(0)
    expect(
      await phone.evaluate(
        () => (window as unknown as { localStorageOpened: number }).localStorageOpened,
      ),
    ).toBe(0)
    await phone.setViewportSize({ width: 844, height: 390 })
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    )
    const target = await phone
      .getByRole('button', { name: 'Panic Stop', exact: true })
      .boundingBox()
    expect(target!.height).toBeGreaterThanOrEqual(44)
    await host.getByRole('button', { name: 'Disconnect controller' }).click()
    await expect(phone.getByText('Access revoked. Pair again on the player.')).toBeVisible()
    await expect(phone.getByRole('button', { name: 'Play', exact: true })).toBeDisabled()
  } finally {
    await hostContext.close()
  }
})
