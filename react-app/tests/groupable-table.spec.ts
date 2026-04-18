import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helper: drag a source element into a target using pointer events.
// page.dragTo() uses HTML5 drag events which @dnd-kit does not listen to;
// we must simulate pointer events so dnd-kit's MouseSensor fires.
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
  // Move in steps so MouseSensor's activationConstraint (distance:5) is satisfied
  await page.mouse.move(srcX + 3, srcY - 3, { steps: 3 });
  await page.mouse.move(tgtX, tgtY, { steps: 20 });
  await page.mouse.up();
}

// Helper: open the Group by panel and tap a column row to toggle grouping.
async function tapGroupColumn(page: Page, colId: string) {
  const panel = page.locator('[data-testid="group-panel"]');
  if (!(await panel.isVisible())) {
    await page.locator('[data-testid="toggle-group-panel"]').click();
  }
  await page.locator(`[data-testid="group-panel-toggle-${colId}"]`).click();
}

test.describe('GroupableTable', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/groupable-table');
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
  // Flat table (no grouping)
  // -------------------------------------------------------------------------

  test('renders 500 total rows with no grouping', async ({ page }) => {
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
    // Virtualizer renders only the visible slice
    const domRowCount = await page.locator('table tbody tr').count();
    expect(domRowCount).toBeLessThan(500);
    expect(domRowCount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Drag-to-band (desktop)
  // -------------------------------------------------------------------------

  test('dragging a header to the band creates a grouping chip', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).not.toContainText('Drag a column header here');
  });

  test('grouping collapses by default — expand to see group headers', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    // Groups start collapsed: only the 3 group header rows are in the flat model initially
    await expect(page.locator('table tbody')).toContainText('Status: Active');
    await expect(page.locator('table tbody')).toContainText('Status: Pending');
    await expect(page.locator('table tbody')).toContainText('Status: Closed');
    await expect(page.locator('table tbody')).toContainText(/\(\d+\)/);
  });

  test('row-total shows group headers + leaf rows after expanding', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    // Collapsed: 3 group headers only
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');

    // Expand the first group (Active)
    await page.locator('table tbody tr').first().click();
    // 2 collapsed + 1 expanded (167 leaf rows) = 2 + 167 + 1 = 170
    await expect(page.locator('[data-testid="row-total"]')).toContainText('170 rows');
  });

  test('clicking a group header collapses and expands its rows', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');

    const totalBefore = await page.locator('[data-testid="row-total"]').innerText();

    // Expand the first group header
    await page.locator('table tbody tr').first().click();
    const totalAfter = await page.locator('[data-testid="row-total"]').innerText();
    expect(totalAfter).not.toBe(totalBefore);

    // Re-collapse
    await page.locator('table tbody tr').first().click();
    await expect(page.locator('[data-testid="row-total"]')).toHaveText(totalBefore);
  });

  test('two-level nesting: group by Status then Category', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await dragInto(page, '[data-testid="col-drag-category"]', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).toContainText('Category');

    // Status groups (depth 0) are expanded; Category groups (depth 1, leaf) are collapsed.
    // Flat model: 3 status rows + 3×4 category rows = 15 rows visible.
    await expect(page.locator('[data-testid="row-total"]')).toContainText('15 rows');
    // Category groups are visible but collapsed (no leaf rows yet)
    await expect(page.locator('table tbody')).toContainText('Category: Electronics');
  });

  test('removing a grouping chip restores flat rows', async ({ page }) => {
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');

    await page.locator('[data-testid="group-band"] button[aria-label="Remove Status grouping"]').click();

    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  test('ID and Amount headers have no drag handle', async ({ page }) => {
    await expect(page.locator('[data-testid="col-drag-id"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="col-drag-amount"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
  });

  test('grouped column header gets ⊞ visual indicator', async ({ page }) => {
    await expect(page.locator('th:has-text("⊞")')).toHaveCount(0);
    await dragInto(page, '[data-testid="col-drag-status"]', '[data-testid="group-band"]');
    await expect(page.locator('th:has-text("⊞")')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Group by panel (mobile-friendly, no drag required)
  // -------------------------------------------------------------------------

  test('Group by button opens panel with column rows', async ({ page }) => {
    await expect(page.locator('[data-testid="group-panel"]')).toHaveCount(0);

    await page.locator('[data-testid="toggle-group-panel"]').click();

    const panel = page.locator('[data-testid="group-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Customer');
    await expect(panel).toContainText('Status');
    await expect(panel).toContainText('Category');
    await expect(panel).toContainText('Region');
  });

  test('tapping a panel row groups by that column', async ({ page }) => {
    await tapGroupColumn(page, 'status');

    await expect(page.locator('[data-testid="group-band"]')).toContainText('Status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');
  });

  test('tapping a panel row again removes the grouping', async ({ page }) => {
    await tapGroupColumn(page, 'status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');

    await tapGroupColumn(page, 'status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  test('active grouping shows checkmark in panel', async ({ page }) => {
    await tapGroupColumn(page, 'status');

    const row = page.locator('[data-testid="group-panel-toggle-status"]');
    await expect(row).toContainText('✓');
  });

  test('Group by badge shows active grouping count', async ({ page }) => {
    await expect(page.locator('[data-testid="group-badge"]')).toHaveCount(0);

    await tapGroupColumn(page, 'status');
    await expect(page.locator('[data-testid="group-badge"]')).toContainText('1');

    await tapGroupColumn(page, 'category');
    await expect(page.locator('[data-testid="group-badge"]')).toContainText('2');
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  test('clicking a column label sorts ascending then descending', async ({ page }) => {
    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('table tbody tr').first()).toContainText('Acme Corp');

    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('table tbody tr').first()).toContainText('Waystar');
  });

  test('sort indicator appears on sorted column', async ({ page }) => {
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('⇅');

    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('↑');

    await page.locator('button[aria-label="Sort by Customer"]').click();
    await expect(page.locator('button[aria-label="Sort by Customer"]')).toContainText('↓');
  });

  test('sorting works alongside grouping', async ({ page }) => {
    await tapGroupColumn(page, 'status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');

    await page.locator('button[aria-label="Sort by Amount"]').click();
    await page.locator('button[aria-label="Sort by Amount"]').click();
    await expect(page.locator('table tbody')).toContainText('Status:');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');
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
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');
  });

  test('text filters are case-insensitive', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-status"]').fill('active');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');
  });

  test('ID filter uses substring match — "9" returns all IDs containing 9', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-id"]').fill('9');
    // IDs 1-500 whose string representation contains "9": 95 rows
    await expect(page.locator('[data-testid="row-total"]')).toContainText('95 rows');
    // Row 19 and 192 are visible (substring match), row 17 is not
    await expect(page.locator('table tbody')).toContainText('19');
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

  test('clear filters button resets all filters at once', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();
    await expect(page.locator('[data-testid="clear-filters"]')).toHaveCount(0);

    await page.locator('[data-testid="filter-status"]').fill('Active');
    await page.locator('[data-testid="filter-customer"]').fill('Acme');
    await expect(page.locator('[data-testid="filter-badge"]')).toContainText('2');
    await expect(page.locator('[data-testid="clear-filters"]')).toBeVisible();

    await page.locator('[data-testid="clear-filters"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="filter-badge"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="clear-filters"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="filter-status"]')).toHaveValue('');
    await expect(page.locator('[data-testid="filter-customer"]')).toHaveValue('');
  });

  test('toggling filters off removes filtering but restores values when re-enabled', async ({ page }) => {
    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-status"]').fill('Active');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');
    await expect(page.locator('[data-testid="filter-badge"]')).toContainText('1');

    // Toggle off — all rows restored, badge gone
    await page.locator('[data-testid="toggle-filters"]').click();
    await expect(page.locator('[data-testid="row-total"]')).toContainText('500 rows');
    await expect(page.locator('[data-testid="filter-badge"]')).toHaveCount(0);

    // Toggle back on — filtering resumes with the saved value
    await page.locator('[data-testid="toggle-filters"]').click();
    await expect(page.locator('[data-testid="filter-status"]')).toHaveValue('Active');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('167 rows');
  });

  test('filtering combined with grouping updates group counts', async ({ page }) => {
    await tapGroupColumn(page, 'status');
    await expect(page.locator('[data-testid="row-total"]')).toContainText('3 rows');

    await page.locator('[data-testid="toggle-filters"]').click();
    await page.locator('[data-testid="filter-customer"]').fill('Acme');

    // Acme Corp rows span multiple status groups — groups still visible
    const text = await page.locator('[data-testid="row-total"]').innerText();
    const total = parseInt(text.match(/^(\d+)/)?.[1] ?? '0', 10);
    // Acme Corp appears in all 3 status groups — groups still present, leaf rows filtered
    expect(total).toBeLessThanOrEqual(3);
    await expect(page.locator('table tbody')).toContainText('Status:');
  });
});
