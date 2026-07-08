import { store } from '$lib/stores/score.svelte';

export function vibrate(duration: number = 1): void {
	if (store.isDesktop) return;
	navigator.vibrate?.(duration);
}

export function initButtonHaptics(): () => void {
	const onClick = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (target?.closest('button, [role="button"]')) vibrate();
	};
	document.addEventListener('click', onClick, true);
	return () => document.removeEventListener('click', onClick, true);
}
