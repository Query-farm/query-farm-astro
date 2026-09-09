import { test, expect } from './fixtures';

const reference = `/products/haybarn/functions/`;

test('table signatures separate positional inputs and named arguments without repeating shared options', async ({ page }) => {
  await page.goto(`${reference}read_csv/`);
  await expect(page.locator('.signature-group-heading h3')).toHaveText('read_csv(col0, named arguments)');
  await expect(page.locator('[data-overload]')).toHaveCount(2);
  await expect(page.locator('[data-named-argument="header"]')).toHaveCount(1);
  await expect(page.locator('[data-named-argument="header"]')).toContainText('header :=');
  await expect(page.locator('[data-named-argument="header"]')).toContainText('BOOLEAN');
  await expect(page.locator('[data-named-argument="col0"]')).toHaveCount(0);
  await expect(page.locator('[data-overload]').first()).toContainText('VARCHAR');
  await expect(page.locator('[data-overload]').last()).toContainText('VARCHAR[]');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.cache/named-arguments-mobile.png', fullPage: true });
});

test('variadic forms include the ellipsis even without fixed arguments and place named arguments afterward', async ({ page }) => {
  for (const [name, heading] of [['concat', 'concat(value, …)'], ['struct_pack', 'struct_pack(…)'], ['repeat_row', 'repeat_row(…, named arguments)']]) {
    await page.goto(`${reference}${name}/`);
    await expect(page.locator('.signature-group-heading h3')).toHaveText(heading);
    await expect(page.locator('thead .varargs-cell')).toContainText('Varargs');
    await expect(page.locator('tbody .varargs-cell')).toContainText('ANY');
  }
  await expect(page.locator('[data-named-argument="num_rows"]')).toContainText('BIGINT');
});

test('operators have operand notation while unary and binary forms remain distinct', async ({ page }) => {
  await page.goto(`${reference}operator-2a/`);
  await expect(page.locator('h1')).toHaveText('*');
  await expect(page.locator('.function-heading .kind-badge')).toHaveText('Operator');
  await expect(page.locator('#arguments')).toHaveText('Operands & returns');
  await expect(page.locator('.signature-group-heading h3')).toHaveText('left * right');
  await page.screenshot({ path: '.cache/operator-reference.png', fullPage: true });
  await page.goto(`${reference}operator-2d/`);
  await expect(page.locator('.signature-group-heading h3')).toHaveText(['-operand', 'left - right']);
  await page.goto(`${reference}operator-215f5f706f7374666978/`);
  await expect(page.locator('.signature-group-heading h3')).toHaveText('x!');
});
