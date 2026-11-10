import { expect, test } from '@playwright/test';
import { installMockHttp } from './fixture';

test('compact desktop keeps the full reference and coordinate fallback visible together', async ({ page }, info) => {
  const state = await installMockHttp(page, info.outputPath('synthetic-media'));
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/ui-assets/');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  await page.getByRole('tab', { name: 'Sources & zones', exact: true }).click();
  await page.getByRole('button', { name: 'Zones & exclusions', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Zones & exclusions/ });
  const image = dialog.locator('.zone-stage > img');
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(320);
  const body = (await dialog.locator('.dialog-body').boundingBox())!;
  const reference = (await image.boundingBox())!;
  const x = (await dialog.getByLabel('X (%)', { exact: true }).boundingBox())!;
  expect(reference.y).toBeGreaterThanOrEqual(body.y);
  expect(reference.y + reference.height).toBeLessThanOrEqual(body.y + body.height);
  expect(x.y + x.height).toBeLessThanOrEqual(body.y + body.height);
  expect(reference.width / reference.height).toBeCloseTo(4 / 3, 5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path: info.outputPath('compact-reference-and-coordinates.png') });
  expect(state.calls.filter(call => call.method === 'POST')).toHaveLength(0);
  expect(state.unhandled).toEqual([]);
});
