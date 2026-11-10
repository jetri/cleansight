import { expect, test } from '@playwright/test';
import { installMockHttp } from './fixture';

// Real browser + product client; deliberate HTTP-mock commit/acknowledgement fault.
// No actual camera or database is used or claimed.
test('registration reconciles a lost acknowledgement instead of duplicating a source', async ({ page }, info) => {
  const state = await installMockHttp(page, info.outputPath('synthetic-media'));
  state.loseCameraAcknowledgement = true;
  await page.goto('/ui-assets/');
  await page.getByRole('tab', { name: 'Sources & zones' }).click();
  await page.getByRole('button', { name: '+ Register source', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Register local source' });
  await dialog.getByLabel('Source name', { exact: true }).fill('UI synthetic secondary / acknowledgement test');
  await dialog.getByLabel('Source type', { exact: true }).selectOption('file_fixture');
  await dialog.getByLabel('Protected source reference', { exact: true }).fill('synthetic-secondary');
  await dialog.getByLabel('Permission evidence reference', { exact: true }).fill('synthetic-permission');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Register source', exact: true }).click();
  await expect(dialog.getByText(/acknowledgement was not received/)).toBeVisible();
  expect(state.cameras).toHaveLength(2);
  expect(state.calls.filter(call => call.path === '/api/cameras' && call.method === 'POST')).toHaveLength(1);
  await expect(dialog.getByRole('button', { name: 'Register source', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('source-unknown-ack-retained.png') });
  await expect(dialog.getByLabel('Source name', { exact: true })).toHaveValue('UI synthetic secondary / acknowledgement test');
  await dialog.getByRole('button', { name: 'Close / retain draft', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Resume retained source draft', exact: true }).click();
  await expect(dialog.getByLabel('Source name', { exact: true })).toHaveValue('UI synthetic secondary / acknowledgement test');
  await expect(dialog.getByRole('button', { name: 'Register source', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Recheck stored sources', exact: true }).click();
  await dialog.getByRole('button', { name: /Use matching stored source/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/Matching stored source:/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('source-read-reconciled.png') });
  expect(state.calls.filter(call => call.path === '/api/cameras' && call.method === 'POST')).toHaveLength(1);
  expect(state.unhandled).toEqual([]);
});
