import { expect, test } from '@playwright/test';

test('shows the loading overlay while the soundfont loads, then clears it', async ({ page }) => {
	// Slow down the soundfont download so the overlay is reliably visible long
	// enough to assert against, regardless of how fast the local server/CPU is —
	// the unit suite can't cover this since it's purely a network timing
	// behaviour.
	await page.route('**/*.sf3', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 300));
		await route.continue();
	});

	await page.goto('/');

	const overlay = page.getByRole('status').filter({ hasText: 'Loading instruments' });
	await expect(overlay).toBeVisible();
	await expect(overlay).toBeHidden({ timeout: 15000 });
});
