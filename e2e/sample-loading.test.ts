import { expect, test } from '@playwright/test';

test('shows the sample loading overlay while instruments load, then clears it', async ({
	page
}) => {
	// Slow down the sample downloads so the overlay is reliably visible long
	// enough to assert against, regardless of how fast the local server/CPU is —
	// the unit suite can't cover this since it's purely a network/audio-decode
	// timing behaviour.
	await page.route('**/samples/**', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 150));
		await route.continue();
	});

	await page.goto('/');

	const overlay = page.getByRole('status').filter({ hasText: 'Loading instruments' });
	await expect(overlay).toBeVisible();
	await expect(overlay).toBeHidden({ timeout: 15000 });
});
