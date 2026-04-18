import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helper: drag a source element into a target using pointer events.
// page.dragTo() uses HTML5 drag events which @dnd-kit does not listen to;
// we must simulate pointer events so dnd-kit's PointerSensor fires.
// ---------------------------------------------------------------------------
async function dragInto(page: Page, sourceSelector: string, targetSelector: string) {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('Could not get bounding boxes for drag');

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const tgtX = tgtBox.x + tgtBox.width / 2;
  const tgtY = tgtBox.y + tgtBox.height / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // Move in steps so PointerSensor's activationConstraint (distance:5) is satisfied
  await page.mouse.move(srcX + 3, srcY - 3, { steps: 3 });
  await page.mouse.move(tgtX, tgtY, { steps: 20 });
  await page.mouse.up();
}

test.describe('GroupableTable', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/groupable-table');
    // Wait for the virtualizer to render at least one row
    await page.waitForSelector('table tbody tr');
  });

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------

  test('screenshot: before and after nesting by Status then Category', async ({ page }) => {
    await page.screenshot({ path: 'tests/screenshots/01-before-grouping.png', fullPage: false });

    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="group-band"]')).toContainText('Status');
    await page.screenshot({ path: 'tests/screenshots/02-grouped-by-status.png', fullPage: false });

    await dragInto(page, '[data-testid="col-drag-category"]', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="group-band"]')).toContainText('Category');
    await page.screenshot({ path: 'tests/screenshots/03-nested-status-category.png', fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Functional tests — grouping
  // -------------------------------------------------------------------------

  test('renders 500 total rows with no grouping', async ({ page }) => {
    // Virtualizer renders only the visible slice — check the footer readout for total
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
    // DOM has far fewer rows than 500 — confirm virtualization is active
    const domRowCount = await page.locator('table tbody tr').count();
    expect(domRowCount).toBeLessThan(500);
    expect(domRowCount).toBeGreaterThan(0);
  });

  test('dragging a header to the band creates a grouping chip', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).not.toContainText('Drag a column header here');
  });

  test('grouping shows group headers with correct labels', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    // Active is always the first row — check it and its count badge
    await expect(page.locator('table tbody')).toContainText('Status: Active');
    await expect(page.locator('table tbody')).toContainText(/\(\d+\)/);

    // Each group has 167 leaf rows, so Pending and Closed start far below the fold.
    // Collapse Active → Pending header enters viewport.
    await page.locator('table tbody tr').first().click();
    await expect(page.locator('table tbody')).toContainText('Status: Pending');
    // Collapse Pending → Closed header enters viewport.
    await page.locator('table tbody tr:has-text("Status: Pending")').click();
    await expect(page.locator('table tbody')).toContainText('Status: Closed');
  });

  test('row-total updates to reflect visible rows after grouping', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    // 3 group headers + 500 leaf rows = 503 visible rows in the flat model
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');
  });

  test('clicking a group header collapses and expands its rows', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    const totalBefore = await page.locator('[data-testid="row-total"]').innerText();

    // Collapse the first visible group header
    await page.locator('table tbody tr').first().click();

    // Total rows in the flat model decreases when a group collapses
    const totalAfter = await page.locator('[data-testid="row-total"]').innerText();
    expect(totalAfter).not.toBe(totalBefore);

    // Re-expand
    await page.locator('table tbody tr').first().click();
    await expect(page.locator('[data-testid="row-total"]')).toHaveText(totalBefore);
  });

  test('two-level nesting: group by Status then Category', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await dragInto(page, '[data-testid="col-drag-category"]', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).toContainText('Category');

    // 3 status groups × 4 category groups + 500 leaf rows = 12 + 3 + 500 = 515
    await expect(page.locator('[data-testid="row-total"]')).toContainText('515 rows');
  });

  test('removing a grouping chip restores flat rows', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');

    await page.locator('[data-testid="group-band"] button[aria-label="Remove Status grouping"]').click();

    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  test('ID and Amount headers are not draggable into the band', async ({ page }) => {
    // ID and Amount have no drag handle (enableGrouping: false)
    await expect(page.locator('[data-testid="col-drag-id"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="col-drag-amount"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
  });

  test('grouped column header gets visual indicator', async ({ page }) => {
    // Before grouping: no column shows the ⊟ (remove) toggle — all show ⊞ (add)
    await expect(page.locator('[data-testid="col-group-toggle-status"]')).toContainText('⊞');

    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    // After grouping: Status toggle flips to ⊟, signalling it is the active group column
    await expect(page.locator('[data-testid="col-group-toggle-status"]')).toContainText('⊟');
  });

  // -------------------------------------------------------------------------
  // Mobile tap-to-group
  // -------------------------------------------------------------------------

  test('tap ⊞ button on mobile to add a grouping', async ({ page }) => {
    await page.locator('[data-testid="col-group-toggle-status"]').click();

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');
  });

  test('tap ⊟ button removes the grouping', async ({ page }) => {
    await page.locator('[data-testid="col-group-toggle-status"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');

    // After grouping, the button label flips to ⊟ (remove)
    await page.locator('[data-testid="col-group-toggle-status"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  test('clicking a column label sorts ascending then descending', async ({ page }) => {
    // Click Customer label to sort ascending
    await page.locator('button[aria-label="Sort by Customer"]').click();
    // First visible leaf row should be "Acme Corp" (alphabetically first)
    await expect(page.locator('table tbody tr').first()).toContainText('Acme Corp');

    // Click again to sort descending
    await page.locator('button[aria-label="Sort by Customer"]').click();
    // First visible row should be "Waystar" (alphabetically last)
    await expect(page.locator('table tbody tr').first()).toContainText('Waystar');
  });

  test('sort indicator appears on sorted column', async ({ page }) => {
    // No sort indicators initially (only ⇅ neutral)
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('⇅');

    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('↑');

    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('↓');
  });

  test('sorting works alongside grouping', async ({ page }) => {
    await page.locator('[data-testid="col-group-toggle-status"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');

    // Sort by amount descending — group headers remain present and total unchanged
    await page.locator('button[aria-label="Sort by Amount"]').click();
    await page.locator('button[aria-label="Sort by Amount"]').click();
    await expect(page.locator('table tbody')).toContainText('Status:');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  test('filter toggle button shows and hides filter row', async ({ page }) => {
    await expect(page.locator('[data-testid="filter-status"]')).toHaveCount(0);

    await page.locator('[data-testid="toggle-filters"]').click();
    await expect(page.locator('[data-testid="filter-status"]')).toBeVisible();

    await page.locator('[data-testid="toggle-filters"]').click();
    await expect(page.locator('[data-testid="filter-status"]')).toHaveCount(0);
  });

  test('filtering by status reduces row count', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();

    await page.locator('[data-testid="filter-status"]').fill('Active');
    // Only Active rows (167) should remain
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');
  });

  test('filter badge shows active filter count', async ({ page }) => {
    await expect(page.locator('[data-testid="filter-badge"]')).toHaveCount(0);

    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-status"]').fill('Active');

    await expect(page.locator('[data-testid="filter-badge"]')).toContainText('1');

    await page.locator('[data-testid="filter-customer"]').fill('Acme');
    await expect(page.locator('[data-testid="filter-badge"]')).toContainText('2');
  });

  test('clearing a filter restores rows', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-status"]').fill('Active');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');

    await page.locator('[data-testid="filter-status"]').fill('');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
  });

  test('filtering combined with grouping updates group counts', async ({ page }) => {
    await page.locator('[data-testid="col-group-toggle-status"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('503 rows');

    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-customer"]').fill('Acme');

    // Acme Corp appears every 8 rows → 500/8 = 62 or 63 rows, distributed across groups
    // Row total < 503 and group headers still visible
    const total = await page.locator('[data-testid="row-total"]').innerText();
    expect(parseInt(total)).toBeLessThan(503);
    await expect(page.locator('table tbody')).toContainText('Status:');
  });
});
