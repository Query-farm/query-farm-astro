import { test, expect } from './fixtures';

test('other-engine examples extend beyond strftime and are discoverable by the source function', async ({ page }) => {
  await page.goto(`/products/haybarn/functions/bit_xor/`);
  const bigquery = page.locator('#other-engines .translation').filter({ hasText: 'BigQuery' });
  await expect(bigquery.getByRole('link', { name: 'Same function', exact: true })).toBeVisible();
  await expect(bigquery.locator('pre')).toHaveCount(0);
  const snowflake = page.locator('#other-engines .translation').filter({ hasText: 'Snowflake' });
  await expect(snowflake.locator('pre')).toHaveCount(2);
  await expect(snowflake).toContainText('BITXOR_AGG');
  await expect(snowflake).toContainText('BIT_XOR');

  await page.goto(`/products/haybarn/functions/json_group_object/`);
  const section = page.locator('#other-engines');
  await expect(section).toContainText('PostgreSQL');
  await expect(section).toContainText('JSON_OBJECT_AGG(k, v)');
  await expect(section).toContainText('JSON_GROUP_OBJECT(k, v)');
  await expect(section.locator('img[src="/products/haybarn/functions/engines/postgresql.png"]')).toBeVisible();
  await expect(page.getByText('Coming from PostgreSQL?')).toHaveCount(0);
  await expect(section.locator('.translation-tokens')).toHaveCount(0);

  await page.locator('.header-search').click();
  const dialog = page.getByRole('dialog', { name: 'Search functions', exact: true });
  await dialog.getByRole('searchbox').fill('json_object_agg');
  await expect(dialog.locator(`a[href="/products/haybarn/functions/json_group_object/"]`)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto(`/products/haybarn/functions/catalog/?q=json_object_agg`);
  await expect(page.locator('[data-function-row]:visible[data-name="json_group_object"]')).toBeVisible();

  await page.goto('/products/haybarn/functions/releases/duckdb-1.5.5/date_diff/');
  await expect(page.locator('#other-engines h3')).toHaveCount(6);
  await expect(page.locator('#other-engines')).toContainText('Snowflake');
  // BigQuery also calls this DATE_DIFF, but changes its arguments in DuckDB.
  const dateDiff = page.locator('#other-engines .translation').filter({ hasText: 'BigQuery' });
  await expect(dateDiff.getByText('Same function', { exact: true })).toHaveCount(0);
  await expect(dateDiff.locator('pre')).toHaveCount(2);
  await expect(page.locator('#other-engines .translation-label').first()).toHaveText('In DuckDB');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#other-engines').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
