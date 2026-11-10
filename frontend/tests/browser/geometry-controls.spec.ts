import { expect, test } from '@playwright/test';
import { installMockHttp } from './fixture';

test('edge vertex targets, keyboard coordinates, pointer mapping and moved-camera guard remain usable', async ({ page }, info) => {
  const state = await installMockHttp(page, info.outputPath('synthetic-media'));
  await page.goto('/ui-assets/');
  await page.getByRole('tab', { name: 'Sources & zones' }).click();
  const trigger = page.getByRole('button', { name: 'Zones & exclusions', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Zones & exclusions/ });
  const image = dialog.locator('.zone-stage > img');
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(320);
  const corner = dialog.locator('button[data-vertex="2"]');
  const hit = await corner.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.right - 4, rect.bottom - 4);
    return { width: rect.width, height: rect.height, fullTarget: target === element || !!target && element.contains(target) };
  });
  expect(hit.width).toBeGreaterThanOrEqual(44);
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.fullTarget).toBe(true);
  const first = dialog.locator('button[data-vertex="0"]');
  await first.focus();
  await first.press('ArrowRight');
  await expect(dialog.getByLabel('X (%)', { exact: true })).toHaveValue('0.1');
  await first.press('Shift+ArrowRight');
  await expect(dialog.getByLabel('X (%)', { exact: true })).toHaveValue('1.1');
  await dialog.getByLabel('X (%)', { exact: true }).fill('101');
  await expect(dialog.getByText(/Both coordinates must be finite/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save & assign new revision', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('X (%)', { exact: true })).toHaveValue('101');
  await dialog.getByLabel('X (%)', { exact: true }).fill('5');
  await dialog.locator('.zone-stage').evaluate((element: HTMLElement) => element.addEventListener('pointermove', event => {
    element.dataset.testPointerX = String(event.clientX); element.dataset.testPointerY = String(event.clientY);
  }));
  const bounds = await dialog.locator('.zone-stage > svg').boundingBox();
  const handle = await first.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * .2, bounds!.y + bounds!.height * .5);
  await page.mouse.up();
  const delivered = await dialog.locator('.zone-stage').evaluate((element: HTMLElement) => {
    const viewport = element.querySelector('svg')!.getBoundingClientRect();
    return { x: (Number(element.dataset.testPointerX) - viewport.left) / viewport.width * 100, y: (Number(element.dataset.testPointerY) - viewport.top) / viewport.height * 100 };
  });
  expect(Number(await dialog.getByLabel('X (%)', { exact: true }).inputValue())).toBeCloseTo(delivered.x, 3);
  expect(Number(await dialog.getByLabel('Y (%)', { exact: true }).inputValue())).toBeCloseTo(delivered.y, 3);
  await dialog.getByLabel('Camera moved / reference geometry is unverified', { exact: true }).check();
  await expect(dialog.getByText('Moved camera / save blocked')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save & assign new revision', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('geometry-controls-moved-guard.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(state.calls.filter(call => call.path.endsWith('/configurations') && call.method === 'POST')).toHaveLength(0);
  expect(state.unhandled).toEqual([]);
});
