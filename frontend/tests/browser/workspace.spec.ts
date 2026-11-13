import { expect, test } from '@playwright/test';
import { installMockHttp } from './fixture';

test('m01-h06-controls native selection and distinct density spacing', async ({ page }, info) => {
  const state = await installMockHttp(page, info.outputPath('synthetic-media'));
  await page.goto('/ui-assets/');
  const density = page.getByLabel('Density', { exact: true });
  const measure = () => page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Density"]')!;
    const style = getComputedStyle(select);
    return {
      paddingRight: parseFloat(style.paddingRight),
      borderRight: parseFloat(style.borderRightWidth),
      appearance: style.appearance,
      height: select.getBoundingClientRect().height,
      panel: parseFloat(getComputedStyle(document.querySelector('[aria-label="Separate human feedback"]')!).paddingTop),
      workspace: parseFloat(getComputedStyle(document.querySelector('.workspace')!).paddingLeft),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await density.selectOption('comfortable');
  await expect(page.getByRole('region', { name: 'Separate human feedback' })).toBeVisible();
  const comfortable = await measure();
  expect(comfortable.paddingRight).toBeGreaterThanOrEqual(24);
  expect(comfortable.borderRight).toBeGreaterThanOrEqual(10);
  expect(comfortable.appearance).toBe('auto');
  await density.focus();
  await expect(density).toBeFocused();
  await page.keyboard.type('compact');
  await expect(density).toHaveValue('compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(density).toBeFocused();
  const compact = await measure();
  expect(comfortable.panel - compact.panel).toBeGreaterThanOrEqual(8);
  expect(comfortable.workspace - compact.workspace).toBeGreaterThanOrEqual(8);
  for (const result of [comfortable, compact]) {
    expect(result.height).toBeGreaterThanOrEqual(44);
    expect(result.overflow).toBe(0);
  }
  await page.screenshot({ path: info.outputPath('compact-controls.png') });
  await page.keyboard.press('Tab');
  await expect(density).not.toBeFocused();
  await density.selectOption('comfortable');
  await expect(density).toHaveValue('comfortable');
  await page.screenshot({ path: info.outputPath('comfortable-controls.png') });
  expect(state.unhandled).toEqual([]);
});

// These are real Chromium/DOM/codec journeys with an HTTP test double.
// They do not claim Django, PostgreSQL, capture, integrity or persisted-DB E2E.
test('HTTP-mocked workspace renders native synthetic video under self-only CSP', async ({ page, browser }, info) => {
  const state = await installMockHttp(page, info.outputPath('synthetic-media'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/ui-assets/');
  const video = page.getByLabel('Unredacted recorded evidence clip');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((element: HTMLVideoElement) => element.duration)).toBeCloseTo(8, 1);
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(.25);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Run-pinned deadline unavailable')).toBeVisible();
  await expect(page.getByText('Early-removal interval unavailable')).toBeVisible();
  await page.screenshot({ path: info.outputPath('first-render-light-1440.png'), fullPage: true });
  console.log(`Browser ${browser.version()} / synthetic HTTP mock, no database`);
  console.log(`Video top: ${(await video.boundingBox())?.y}; screenshot: ${info.outputPath('first-render-light-1440.png')}`);
  expect((await video.boundingBox())!.y).toBeLessThan(900);
  await expect(page.locator('.evidence-footer dt').first()).toHaveCSS('color', 'rgb(192, 206, 214)');
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect((await video.boundingBox())!.y).toBeLessThan(900);
  await page.screenshot({ path: info.outputPath('compact-light-1024.png'), fullPage: true });
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await expect(page.locator('.evidence-footer dt').first()).toHaveCSS('color', 'rgb(192, 206, 214)');
  await page.screenshot({ path: info.outputPath('compact-dark-1024.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('viewport-compact-dark-1024.png') });
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1024 ? 900 : 1080 });
    for (const theme of ['light', 'dark']) for (const density of ['comfortable', 'compact']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.getByLabel('Density', { exact: true }).selectOption(density);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-density', density);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      expect((await page.getByRole('button', { name: 'Refresh evidence', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('.evidence-footer dt').first()).toHaveCSS('color', 'rgb(192, 206, 214)');
      await page.screenshot({ path: info.outputPath(`viewport-${theme}-${density}-${width}.png`) });
    }
  }
  expect(state.unhandled).toEqual([]);
  expect(errors).toEqual([]);
  if (process.env.UI_VISUAL_HOLD) {
    // Bounded manual inspection lifetime, not an assertion-timeout workaround.
    test.setTimeout(350_000);
    console.log('VISUAL FIXTURE READY / bounded 300s hold for chrome-devtools-axi');
    await page.waitForTimeout(300_000);
  }
});
