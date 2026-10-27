import { test, expect } from '@playwright/test';
import { parse } from 'parse5';
function hasId(node: { attrs?: {name: string; value: string}[]; childNodes?: unknown[] }, id: string): boolean {
  return Boolean(node.attrs?.some(a => a.name === 'id' && a.value === id) || node.childNodes?.some(child => hasId(child as typeof node, id)));
}
const root = '/products/crossfield';
const routes = ['', '/how-it-works', '/agents', '/ossie', '/engine', '/docs', '/docs/quickstart', '/docs/trading', '/docs/fulfillment', '/docs/models', '/docs/model-versions', '/docs/querying', '/docs/discovery', '/docs/validation', '/docs/time-and-measurements', '/docs/providers', '/docs/examples', '/docs/compatibility'];

test('product explanation leads to the matching runnable examples and model history', async ({ page }) => {
  await page.goto(root + '/how-it-works');
  await expect(page.locator('main pre:visible')).toContainText('FROM SEMANTIC operations.fulfillment');
  const explanation = page.locator('details.sql-example').filter({has: page.locator('summary', {hasText:'Inspect this report and its generated SQL'})});
  await explanation.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(explanation).toContainText('warehouse.main.order_facts');
  await expect(page.locator('#query-modes-how-it-works .mode-diagram')).toBeVisible();
  await page.getByRole('link', {name:'model versions guide',exact:true}).click();
  await expect(page).toHaveURL(root + '/docs/model-versions');
  await expect(page.locator('main')).toContainText('FROM SEMANTIC revised.fulfillment');
  await expect(page.locator('.revision-diagram .current .catalog-result')).toContainText('50%');
  await expect(page.locator('.revision-diagram .proposed .catalog-result')).toContainText('75%');
  await page.getByRole('link',{name:'fulfillment setup',exact:true}).click();
  await expect(page).toHaveURL(root + '/docs/fulfillment#load-the-example');
  await page.goto(root + '/ossie');
  const definition = page.locator('details.sql-example').filter({has:page.locator('summary',{hasText:'Read the execution-price definition'})});
  await definition.locator('summary').click();
  await expect(definition.locator('pre')).toContainText('SUM(fills.shares * fills.price) / NULLIF(SUM(fills.shares), 0)');
  await expect(page.locator('main')).toContainText('$101.80');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('pages, internal references, metadata and responsive reading', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const references = new Map<string, Set<string>>();
  for (const suffix of routes) {
    const response = await page.goto(root + suffix);
    expect(response?.status(), suffix).toBe(200);
    await expect(page.locator('main h1')).toHaveCount(1);
    if (suffix === '') await expect(page.locator('main pre:visible')).toHaveCount(1);
    if (suffix === '/how-it-works') await expect(page.locator('main pre:visible')).toHaveCount(1);
    if (['/agents', '/ossie'].includes(suffix)) await expect(page.locator('main pre:visible')).toHaveCount(0);
    if (suffix === '') {
      await expect(page.locator('.hero-art figcaption')).toHaveCSS('display', 'flex');
      await expect(page.locator('.editorial-art img')).toHaveCount(2);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://query.farm' + root + suffix);
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', '');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow, suffix + ' viewport overflow').toBe(false);
    const links = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
    const images = await page.locator('main img[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src));
    links.push(...images);
    for (const value of links) {
      const url = new URL(value);
      if (url.origin !== new URL(page.url()).origin || !(url.pathname.startsWith(root) || url.pathname.startsWith('/crossfield/'))) continue;
      const fragments = references.get(url.pathname) || new Set<string>();
      if (url.hash) fragments.add(decodeURIComponent(url.hash.slice(1)));
      references.set(url.pathname, fragments);
    }
    if (['', '/engine', '/docs/models', '/docs/time-and-measurements'].includes(suffix)) {
      await page.screenshot({ path: `.cache/crossfield-content-review/${info.project.name}-${suffix.replaceAll('/', '-') || 'home'}.png`, fullPage: true });
    }
  }
  for (const [path, fragments] of references) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    if (fragments.size) {
      const html = await response.text();
      for (const fragment of fragments) {
        const found = hasId(parse(html), fragment);
        expect(found, `${path}#${fragment}`).toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('compact SQL example, generated SQL disclosure and keyboard operation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { document.documentElement.dataset.copiedSql = text; } }, configurable: true });
  });
  await page.goto(root + '?scenario=investment');
  await expect(page.locator('main pre:visible')).toHaveCount(1);
  await expect(page.locator('.hero-art img')).toBeVisible();
  const example = page.locator('#scenario-query-investment .semantic-example');
  await expect(example.locator('pre')).toBeVisible();
  await example.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-copied-sql', /ATTACH 'exposure-current\.package\.json' AS portfolio/);
  await expect(page.locator('html')).toHaveAttribute('data-copied-sql', /FROM SEMANTIC portfolio\.exposure/);
  const modeSetup = page.locator('#query-modes-investment .mode-setup');
  await expect(modeSetup.locator('pre')).toBeHidden();
  await modeSetup.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(modeSetup.locator('pre')).toBeVisible();
  await modeSetup.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-copied-sql', /USE portfolio\.semantic;\s*SET crossfield_mode = 'strict';/);
  await modeSetup.locator('summary').click();
  const explanation = page.locator('#explain-investment');
  await expect(explanation).not.toHaveAttribute('open', '');
  await expect(explanation.locator('.explain-step')).toBeHidden();
  await explanation.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(explanation.locator('.explain-query pre')).toBeVisible();
  await expect(explanation.locator('.explain-query pre')).toContainText('EXPLAIN (SEMANTIC)');
  const generated = explanation.locator('details.sql-example');
  await generated.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(generated).toHaveAttribute('open', '');
  await expect(generated).toContainText('warehouse.main.positions');
  await expect(page.locator('#scenario-query-investment').getByRole('link', { name: 'Download the full explanation as JSON' })).toHaveAttribute('href', '/crossfield/examples/finance/explain-semantic.json');
});

test('reading and diagrams work without JavaScript', async ({ browser }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: info.project.use.viewport, baseURL: info.project.use.baseURL });
  const page = await context.newPage();
  await page.goto(root);
  await expect(page.locator('[data-scenario-controls]')).toBeHidden();
  await expect(page.locator('#scenario-investment')).toBeHidden();
  await expect(page.locator('#scenario-revision-fulfillment')).toBeVisible();
  await expect(page.locator('#scenario-revision-investment')).toBeHidden();
  await page.locator('.peer-comparison > summary').click();
  await expect(page.locator('.peer-comparison table')).toBeVisible();
  await page.locator('.peer-comparison > summary').click();
  await expect(page.getByRole('link', { name: 'read the investment reporting example' })).toBeVisible();
  if (info.project.use.isMobile) {
    const menu = page.locator('.compact-menu');
    await menu.locator('summary').click();
    await expect(menu.getByRole('link', { name: 'Fulfillment walkthrough', exact: true })).toBeVisible();
    await menu.locator('summary').click();
  }
  await expect(page.locator('#scenario-query-fulfillment .semantic-example pre')).toBeVisible();
  await expect(page.locator('#scenario-query-fulfillment .semantic-example pre')).toContainText('FROM SEMANTIC operations.fulfillment');
  await expect(page.locator('#query-modes-fulfillment .mode-diagram')).toBeVisible();
  await page.locator('#query-modes-fulfillment .mode-setup summary').click();
  await expect(page.locator('#query-modes-fulfillment .mode-setup pre')).toContainText('USE operations.semantic;');
  await page.locator('#explain-fulfillment > summary').click();
  await expect(page.locator('#explain-fulfillment .explain-query pre')).toBeVisible();
  await page.goto(root + '/engine');
  await expect(page.locator('figure')).toContainText('Crossfield');
  await page.goto(root + '/docs/time-and-measurements');
  await expect(page.locator('.measurement-timeline')).toContainText('January 1');
  await context.close();
});

test('product navigation and narrow-screen controls', async ({ page }, info) => {
  await page.goto(root + '?scenario=investment');
  const navigation = page.getByRole('navigation', { name: 'Crossfield section' });
  const mobileMenu = navigation.locator('.compact-menu');
  if (!info.project.use.isMobile) {
    await expect(mobileMenu).toBeHidden();
    const docs = navigation.locator('.section-menu').filter({ has: page.locator('summary', { hasText: 'Documentation' }) });
    await docs.locator('summary').click();
    await expect(docs.getByRole('link', { name: 'Fulfillment walkthrough', exact: true })).toBeVisible();
    await docs.locator('summary').press('Escape');
    await expect(docs).not.toHaveAttribute('open', '');
    return;
  }

  const toggle = mobileMenu.locator('summary');
  await expect(toggle).toBeVisible();
  expect((await navigation.boundingBox())!.height).toBeLessThan(60);
  await toggle.tap();
  const panel = mobileMenu.locator('.compact-panel');
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await toggle.press('Escape');
  await expect(mobileMenu).not.toHaveAttribute('open', '');
  await expect(toggle).toBeFocused();
  await toggle.tap();
  await page.touchscreen.tap(2, page.viewportSize()!.height - 10);
  await expect(mobileMenu).not.toHaveAttribute('open', '');

  const example = page.locator('#scenario-query-investment .semantic-example');
  expect((await example.getByRole('button', { name: 'Copy code', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(example.locator('pre')).toContainText('FROM SEMANTIC portfolio.exposure');

  await toggle.tap();
  await mobileMenu.getByRole('link', { name: 'Availability and limits', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/compatibility$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});


test('scenario selection, share links, browser history and accessible controls', async ({ page }, info) => {
  await page.goto(root);
  const fulfillment = page.getByRole('radio', {name:'Order fulfillment', exact:true});
  const investment = page.getByRole('radio', {name:'Investment reporting', exact:true});
  await expect(fulfillment).toBeChecked();
  const fulfillmentChoice = page.locator('label[for="scenario-choice-fulfillment"]');
  const investmentChoice = page.locator('label[for="scenario-choice-investment"]');
  await expect(page.getByRole('group', {name:'Choose an example', exact:true})).toBeVisible();
  await expect(page.locator('#scenario-instructions')).toContainText('Select either option');
  await expect(fulfillmentChoice.locator('.choice-selected')).toBeVisible();
  await expect(investmentChoice.locator('.choice-select')).toBeVisible();
  await expect(page.locator('#scenario-fulfillment')).toBeVisible();
  await expect(page.locator('#scenario-investment')).toBeHidden();
  await expect(page.locator('#scenario-query-investment')).toBeHidden();
  await expect(page.locator('#scenario-query-fulfillment')).toBeVisible();
  await expect(page.locator('#scenario-fulfillment')).toContainText('50%');
  const deliveryRevision = page.locator('#scenario-revision-fulfillment');
  const investmentRevision = page.locator('#scenario-revision-investment');
  await expect(deliveryRevision.locator('.current .catalog-result')).toContainText('50%');
  await expect(deliveryRevision.locator('.proposed .catalog-result')).toContainText('75%');
  await expect(deliveryRevision.locator('.revision-impact')).toContainText('+25');
  await expect(investmentRevision).toBeHidden();
  await deliveryRevision.screenshot({path:`.cache/crossfield-content-review/${info.project.name}-delivery-revisions.png`});
  await expect(page.locator('#scenario-query-fulfillment .semantic-example pre')).toContainText('FROM SEMANTIC operations.fulfillment');
  await page.locator('#explain-fulfillment > summary').click();
  const generated = page.locator('#explain-fulfillment details.sql-example');
  await generated.locator('summary').click();
  await expect(generated).toContainText('warehouse.main.order_facts');
  await generated.locator('summary').click();
  await page.locator('#explain-fulfillment > summary').click();
  if(info.project.use.isMobile) {
    expect((await investmentChoice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await investmentChoice.locator('.choice-select').tap();
  } else {
    await fulfillment.focus();
    await page.keyboard.press('ArrowRight');
    await expect(investment).toBeFocused();
  }
  await expect(investment).toBeChecked();
  await expect(investmentChoice.locator('.choice-selected')).toBeVisible();
  await expect(fulfillmentChoice.locator('.choice-select')).toBeVisible();
  await expect(page).toHaveURL(/scenario=investment/);
  await expect(page.locator('#scenario-investment')).toBeVisible();
  await expect(page.locator('#scenario-fulfillment')).toBeHidden();
  await expect(page.locator('#scenario-query-fulfillment')).toBeHidden();
  await expect(page.locator('#scenario-query-investment')).toBeVisible();
  await expect(deliveryRevision).toBeHidden();
  await expect(investmentRevision.locator('.current .catalog-result')).toContainText('$23m');
  await expect(investmentRevision.locator('.proposed .catalog-result')).toContainText('$28m');
  await expect(investmentRevision.locator('.revision-impact')).toContainText('+$5m');
  await investmentRevision.screenshot({path:`.cache/crossfield-content-review/${info.project.name}-investment-revisions.png`});
  await expect(page.locator('#scenario-investment [data-scenario-link]')).toHaveAttribute('href','?scenario=investment#walkthrough');
  await page.screenshot({path:`.cache/crossfield-content-review/${info.project.name}-investment-scenario.png`,fullPage:true});
  await page.reload();
  await expect(investment).toBeChecked();
  await page.goBack();
  await expect(fulfillment).toBeChecked();
  await expect(deliveryRevision).toBeVisible();
  await expect(investmentRevision).toBeHidden();
  await page.goForward();
  await expect(investment).toBeChecked();
  await investment.focus();
  await page.keyboard.press('Home');
  await expect(fulfillment).toBeFocused();
  await expect(fulfillment).toBeChecked();
  await page.keyboard.press('End');
  await expect(investment).toBeFocused();
  await expect(investment).toBeChecked();
  await page.goto(root+'?scenario=unknown');
  await expect(fulfillment).toBeChecked();
  await page.goto(root+'?scenario=investment#walkthrough');
  await expect(investment).toBeChecked();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://query.farm'+root);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});


test('business outcome precedes the category and adoption answers remain accessible', async ({page}, info) => {
  await page.goto(root);
  await expect(page.locator('h1')).toHaveText(/Spend less time\s*reconciling reports\./);
  const story=page.locator('#scenario-fulfillment');
  await expect(story.locator('.interpretations')).toContainText('83.3%');
  await expect(story.locator('.interpretations')).toContainText('50%');
  await expect(story.locator('.interpretations')).toContainText('75%');
  await expect(story.locator('.agreed-result')).toContainText('50%');
  expect(await page.evaluate(() => Boolean(document.querySelector('#scenario-fulfillment')!.compareDocumentPosition(document.querySelector('#what-is-a-semantic-layer')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('#what-is-a-semantic-layer .model-path li')).toHaveCount(3);
  const peers=page.locator('.peer-comparison');
  await expect(peers.locator('table')).toBeHidden();
  await peers.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(peers.locator('tbody tr')).toHaveCount(4);
  await expect(peers.getByRole('link',{name:'Cube development workflow'})).toHaveAttribute('href','https://docs.cube.dev/docs/data-modeling/dev-mode');
  const peerScroll=peers.getByRole('region',{name:'Semantic model revision workflows'});
  if(info.project.use.isMobile) {
    await peerScroll.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));
    await expect.poll(()=>peerScroll.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  }
  const faq=page.locator('#questions details').filter({has:page.locator('summary',{hasText:'Can we require AI agents'})});
  await faq.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(faq).toHaveAttribute('open','');
  await expect(faq).toContainText('In an unsealed connection, callers can change the mode.');
  await expect(page.locator('#evidence')).toContainText('reproducible synthetic demonstrations');
  const comparison=page.getByRole('region',{name:'Comparison with existing reporting practices',exact:true});
  await expect(comparison).toBeVisible();
  await expect(comparison).toHaveCSS('overflow-x','auto');
  if(info.project.use.isMobile) {
    await comparison.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));
    await expect.poll(()=>comparison.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1)).toBe(false);
});
