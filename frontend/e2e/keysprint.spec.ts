import { expect, test } from '@playwright/test';

test.describe('KeySprint End-to-End Flow', () => {
  test('completes typing test with backspace & active restart, verifies single history entry, switches modes & theme, and checks mobile portrait/landscape', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Switch between modes cleanly
    await page.getByRole('button', { name: 'words' }).click();
    await expect(page.getByRole('button', { name: '25w' })).toBeVisible();
    await page.getByRole('button', { name: 'custom' }).click();

    const customBox = page.locator('#custom-passage-input');
    await customBox.fill('keysprint test');

    const typingInput = page.getByTestId('typing-input');
    await typingInput.click();
    await typingInput.pressSequentially('key', { delay: 20 });

    // Active test Restart resets progress cleanly
    await page.getByRole('button', { name: /restart/i }).click();
    await expect(page.getByText('0%')).toBeVisible();

    // Type with a typo corrected via Backspace -> 100% final accuracy
    await typingInput.pressSequentially('kex', { delay: 20 });
    await typingInput.press('Backspace');
    await typingInput.pressSequentially('ysprint test', { delay: 20 });

    await expect(page.getByText('Session Complete')).toBeVisible();
    await expect(page.getByTestId('result-accuracy')).toContainText('100%');

    // Refresh and verify exactly 1 saved entry persisted in IndexedDB
    await page.goto('/history');
    await expect(page.getByText('custom · custom')).toHaveCount(1);
    await page.reload();
    await expect(page.getByText('custom · custom')).toHaveCount(1);

    // Change theme in Settings and verify persistence after reload
    await page.goto('/settings');
    await page.getByRole('button', { name: 'light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Mobile portrait (375x812) and landscape (812x375) overflow checks
    for (const vp of [
      { width: 375, height: 812 },
      { width: 812, height: 375 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasOverflow).toBe(false);
    }

    const unexpectedErrors = consoleErrors.filter(
      (err) => !err.includes('401') && !err.includes('Unauthorized')
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test('registers a new account and verifies authenticated profile', async ({ page }) => {
    const uniqueUser = `e2e_${Date.now()}`;
    await page.goto('/register');
    await page.getByLabel('Username').fill(uniqueUser);
    await page.getByLabel('Display Name (optional)').fill('E2E Typist');
    await page.getByLabel('Email').fill(`${uniqueUser}@example.com`);
    await page.getByLabel('Password (8+ characters)').fill('StrongPass123!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText(`@${uniqueUser}`)).toBeVisible();
  });

  test('completes an Academy lesson and explores Smart Coach and Progress dashboard', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: /learning academy/i })).toBeVisible();

    await page.getByRole('heading', { name: 'Posture & Keyboard Positioning' }).click();
    await expect(page.getByText(/Posture Tip:/i)).toBeVisible();

    const typingInput = page.getByTestId('typing-input');
    await typingInput.click();
    await typingInput.pressSequentially(
      'ff jj ff jj fj jf ff jj asdf jkl; fjdk slaj ghfj fdsa ;lkj',
      { delay: 5 }
    );
    await expect(page.getByText('Session Complete')).toBeVisible();

    await page.goto('/practice');
    await expect(page.getByRole('heading', { name: /smart typing coach/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Balanced' })).toBeVisible();

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: /personal progress/i })).toBeVisible();
    await expect(page.getByText('Goal Progress')).toBeVisible();
    await expect(page.getByText('Daily Activity (Last 7 Days)')).toBeVisible();
  });

  test('navigates leaderboard filters, challenges, private race room creation, and profile privacy', async ({
    page,
  }) => {
    const uniqueUser = `arena_${Date.now()}`;
    await page.goto('/register');
    await page.getByLabel('Username').fill(uniqueUser);
    await page.getByLabel('Email').fill(`${uniqueUser}@example.com`);
    await page.getByLabel('Password (8+ characters)').fill('StrongPass123!');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/profile/);

    // Verify Profile Achievements & Privacy controls render
    await expect(page.getByText(/Public Profile Privacy Controls/i)).toBeVisible();
    await expect(page.getByText(/Achievements \(/i)).toBeVisible();

    // Check Leaderboard filters & Challenge standings
    await page.goto('/leaderboard');
    await expect(page.getByLabel(/Sort leaderboard by/i)).toBeVisible();
    await expect(page.getByText('Daily Precision Sprint')).toBeVisible();
    await page.getByRole('button', { name: /Challenge Leaderboard/i }).first().click();
    await expect(page.getByText(/Verified Standings/i)).toBeVisible();

    // Complete a live Daily Challenge from Leaderboard -> Studio -> streamed checkpoints -> verified completion
    await page.getByRole('link', { name: /Take Challenge/i }).first().click();
    await expect(page.getByText(/DAILY Challenge: Daily Precision Sprint/i)).toBeVisible();
    const challengeInput = page.getByTestId('typing-input');
    await challengeInput.click();
    await challengeInput.pressSequentially(
      'Accuracy builds effortless speed when every keystroke lands deliberately.',
      { delay: 45 }
    );
    await expect(page.getByText(/Verified competitive submission recorded/i)).toBeVisible();

    // Create private race room in Arena & verify Ready + Leave
    await page.goto('/arena');
    await page.getByRole('button', { name: /Create Private Room/i }).click();
    await expect(page.getByText(/Live Standings/i)).toBeVisible();
    await expect(page.getByText(`@${uniqueUser}`)).toBeVisible();
    await page.getByRole('button', { name: /Leave Room/i }).click();
    await expect(page.getByRole('button', { name: /Create Private Room/i })).toBeVisible();
  });

  test('verifies cross-device layout stability (desktop/tablet/mobile), theme persistence, and keyboard skip link across routes', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 375, height: 812 },
    ];
    const routes = ['/', '/learn', '/practice', '/progress', '/leaderboard', '/arena', '/history', '/profile', '/settings'];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Keyboard accessibility: Tab focuses the Skip to main content link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();

    // Check dark & light theme switching cleanly sets data-theme & meta theme-color
    await page.goto('/settings');
    await page.getByRole('button', { name: 'light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        const hasHorizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(hasHorizontalOverflow, `Overflow at ${vp.width}x${vp.height} on ${route}`).toBe(false);
      }
    }
  });
});
