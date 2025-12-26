/**
 * @file src/stores/screenSizeStore.svelte.ts
 * @description Reactive screen size tracking using Svelte 5 runes
 */

export enum ScreenSize {
	XS = 'XS',
	SM = 'SM',
	MD = 'MD',
	LG = 'LG',
	XL = 'XL',
	XXL = '2XL'
}

const BREAKPOINTS = {
	[ScreenSize.XS]: 0,
	[ScreenSize.SM]: 640,
	[ScreenSize.MD]: 768,
	[ScreenSize.LG]: 1024,
	[ScreenSize.XL]: 1280,
	[ScreenSize.XXL]: 1536
} as const;

function getScreenSize(width: number): ScreenSize {
	if (width < BREAKPOINTS[ScreenSize.SM]) return ScreenSize.XS;
	if (width < BREAKPOINTS[ScreenSize.MD]) return ScreenSize.SM;
	if (width < BREAKPOINTS[ScreenSize.LG]) return ScreenSize.MD;
	if (width < BREAKPOINTS[ScreenSize.XL]) return ScreenSize.LG;
	if (width < BREAKPOINTS[ScreenSize.XXL]) return ScreenSize.XL;
	return ScreenSize.XXL;
}

class ScreenSizeStore {
	width = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
	height = $state(typeof window !== 'undefined' ? window.innerHeight : 768);

	get size() {
		return getScreenSize(this.width);
	}

	// Alias for compatibility
	get screenSize() {
		return this.size;
	}

	get isMobile() {
		return this.size === ScreenSize.XS || this.size === ScreenSize.SM;
	}

	get isTablet() {
		return this.size === ScreenSize.MD;
	}

	get isDesktop() {
		const s = this.size;
		return s === ScreenSize.LG || s === ScreenSize.XL || s === ScreenSize.XXL;
	}

	get isLargeScreen() {
		return this.size === ScreenSize.XL || this.size === ScreenSize.XXL;
	}

	private rafId: number | null = null;
	private cleanup?: () => void;

	constructor() {
		if (typeof window === 'undefined') return;

		const update = () => {
			this.width = window.innerWidth;
			this.height = window.innerHeight;
			this.rafId = null;
		};

		const handleResize = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			this.rafId = requestAnimationFrame(update);
		};

		window.addEventListener('resize', handleResize);
		update();

		// Store cleanup for potential future use
		this.cleanup = () => {
			if (this.rafId) cancelAnimationFrame(this.rafId);
			window.removeEventListener('resize', handleResize);
		};
	}

	// Optional: manual cleanup method
	destroy() {
		this.cleanup?.();
	}
}

export const screen = new ScreenSizeStore();

// Reactive property exports
export const screenSize = {
	get current() {
		return screen.size;
	}
};

export const isMobile = {
	get current() {
		return screen.isMobile;
	}
};

export const isTablet = {
	get current() {
		return screen.isTablet;
	}
};

export const isDesktop = {
	get current() {
		return screen.isDesktop;
	}
};

export const isLargeScreen = {
	get current() {
		return screen.isLargeScreen;
	}
};

// Aliases and functional helpers for backward compatibility
export const screenSizeStore = screen;
export function getScreenSizeState() {
	return screen.size;
}
export function getIsMobile() {
	return screen.isMobile;
}
export function getIsTablet() {
	return screen.isTablet;
}
export function getIsDesktop() {
	return screen.isDesktop;
}
export function getIsLargeScreen() {
	return screen.isLargeScreen;
}
