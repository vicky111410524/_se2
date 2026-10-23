import { test, expect } from '@playwright/test';

test.describe('E2E Test: 使用者完整操作流程', () => {
  test('能設定截止時間新增任務、確認時間整理表格更新，最後刪除任務', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1')).toHaveText('待辦事項清單');

    const taskName = 'Playwright 自動化任務';
    await page.fill('#todo-input', taskName);
    await page.fill('#todo-due', '2026-12-31T18:30');
    await page.click('#add-btn');

    const todoItem = page.locator('#todo-list li', { hasText: taskName });
    await expect(todoItem).toBeVisible();
    await expect(todoItem).toContainText('截止 2026/12/31 18:30');

    const scheduleRow = page.locator('#schedule-body tr', { hasText: '12/31' });
    await expect(scheduleRow).toBeVisible();
    await expect(scheduleRow).toContainText('18:30');

    await todoItem.locator('.del-btn').click();
    await expect(todoItem).not.toBeVisible();
    await expect(page.locator('#schedule-body tr', { hasText: '12/31' })).not.toBeVisible();
  });
});
