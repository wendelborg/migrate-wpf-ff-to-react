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
    // Wait for the table to be rendered
    await page.waitForSelector('table tbody tr');
  });

  // -------------------------------------------------------------------------
  // Screenshots — the main deliverable
  // -------------------------------------------------------------------------

  test('screenshot: before and after nesting by Status then Category', async ({ page }) => {
    // --- BEFORE: flat table, no grouping ---
    await expect(page.locator('table tbody tr')).toHaveCount(20);
    await page.screenshot({ path: 'tests/screenshots/01-before-grouping.png', fullPage: false });

    // --- AFTER STEP 1: group by Status ---
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="group-band"]')).toContainText('Status');
    await page.screenshot({ path: 'tests/screenshots/02-grouped-by-status.png', fullPage: false });

    // --- AFTER STEP 2: group by Category inside Status ---
    await dragInto(page, 'th:has-text("Category")', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="group-band"]')).toContainText('Category');
    await page.screenshot({ path: 'tests/screenshots/03-nested-status-category.png', fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Functional tests
  // -------------------------------------------------------------------------

  test('renders 20 data rows initially with no grouping', async ({ page }) => {
    await expect(page.locator('table tbody tr')).toHaveCount(20);
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  test('dragging a header to the band creates a grouping chip', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).not.toContainText('Drag a column header here');
  });

  test('grouping shows 3 group headers plus all leaf rows (groups start expanded)', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');

    // 3 status values (groups start expanded) + 20 leaf rows = 23
    await expect(page.locator('table tbody tr')).toHaveCount(23);
  });

  test('group headers show column name, value, and row count', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');

    const rows = page.locator('table tbody tr');
    const text = await rows.allInnerTexts();
    const combined = text.join('\n');

    expect(combined).toMatch(/Status:\s*Active/);
    expect(combined).toMatch(/Status:\s*Pending/);
    expect(combined).toMatch(/Status:\s*Closed/);
    // Each group header shows a count in parentheses
    expect(combined).toMatch(/\(\d+\)/);
  });

  test('clicking a group header expands and collapses rows', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');

    // All 3 groups start expanded → 3 group rows + 20 leaf rows = 23
    await expect(page.locator('table tbody tr')).toHaveCount(23);

    // Click the first group header to collapse it
    await page.locator('table tbody tr').first().click();
    // One group is now collapsed — fewer rows visible
    const after = await page.locator('table tbody tr').count();
    expect(after).toBeLessThan(23);

    // Click again to expand
    await page.locator('table tbody tr').first().click();
    await expect(page.locator('table tbody tr')).toHaveCount(23);
  });

  test('two-level nesting: group by Status then Category', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');
    await dragInto(page, 'th:has-text("Category")', '[data-testid="group-band"]');

    const band = page.locator('[data-testid="group-band"]');
    await expect(band).toContainText('Status');
    await expect(band).toContainText('Category');

    // With two levels expanded: Status (3) + Status×Category combos + 20 leaf rows
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount).toBeGreaterThan(23);
  });

  test('removing a grouping chip restores flat rows', async ({ page }) => {
    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');
    await expect(page.locator('table tbody tr')).toHaveCount(23); // 3 groups + 20 leaves

    // Click the × on the Status chip
    await page.locator('[data-testid="group-band"] button[aria-label="Remove Status grouping"]').click();

    await expect(page.locator('table tbody tr')).toHaveCount(20);
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
  });

  test('ID and Amount headers are not draggable into the band', async ({ page }) => {
    // Drag ID header — it has enableGrouping:false so band should stay empty
    await dragInto(page, 'th:has-text("ID")', '[data-testid="group-band"]');
    await expect(page.locator('[data-testid="group-band"]')).toContainText(
      'Drag a column header here to group by that column',
    );
    await expect(page.locator('table tbody tr')).toHaveCount(20);
  });

  test('grouped column header gets visual indicator', async ({ page }) => {
    // Before: Status header has no ⊞
    await expect(page.locator('th:has-text("Status")')).not.toContainText('⊞');

    await dragInto(page, 'th:has-text("Status")', '[data-testid="group-band"]');

    // After: Status header shows ⊞
    await expect(page.locator('th:has-text("⊞")')).toBeVisible();
  });
});
