/**
 * @file src/stores/UIStore.svelte.ts
 * @description UI visibility management using Svelte 5 runes
 */

import { mode } from './collectionStore.svelte';
import { screen, ScreenSize } from './screenSizeStore.svelte';
import { untrack } from 'svelte';

export type UIVisibility = 'hidden' | 'collapsed' | 'full';

export interface UIState {
	leftSidebar: UIVisibility;
	rightSidebar: UIVisibility;
	pageheader: UIVisibility;
	pagefooter: UIVisibility;
	header: UIVisibility;
	footer: UIVisibility;
}

class UIStore {
	// State
	state = $state<UIState>({
		leftSidebar: 'full',
		rightSidebar: 'hidden',
		pageheader: 'full',
		pagefooter: 'hidden',
		header: 'hidden',
		footer: 'hidden'
	});

	routeContext = $state({
		isImageEditor: false,
		isCollectionBuilder: false
	});

	// UI toggles
	manualOverrideActive = $state(false);
	headerShowMore = $state(false);
	isSearchVisible = $state(false);

	// Timers
	private manualTimer: ReturnType<typeof setTimeout> | null = null;

	// Computed
	get uiVisibility() {
		return this.state;
	}

	get isLeftSidebarVisible() {
		return this.state.leftSidebar !== 'hidden';
	}
	get isRightSidebarVisible() {
		return this.state.rightSidebar !== 'hidden';
	}
	get isPageHeaderVisible() {
		return this.state.pageheader !== 'hidden';
	}
	get isPageFooterVisible() {
		return this.state.pagefooter !== 'hidden';
	}
	get isHeaderVisible() {
		return this.state.header !== 'hidden';
	}
	get isFooterVisible() {
		return this.state.footer !== 'hidden';
	}

	constructor() {
		if (typeof window === 'undefined') return;

		// Single effect watches size + mode changes
		$effect.root(() => {
			$effect(() => {
				const size = screen.size;
				const currentMode = mode.value;

				untrack(() => {
					if (!this.manualOverrideActive) {
						this.updateFromContext(size, currentMode);
					}
				});
			});
		});
	}

	private updateFromContext(size: ScreenSize, currentMode: string) {
		const isViewMode = currentMode === 'view' || currentMode === 'media';

		// Special routes
		if (this.routeContext.isImageEditor) {
			this.state = {
				leftSidebar: 'collapsed',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'full',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		if (this.routeContext.isCollectionBuilder) {
			this.state = {
				leftSidebar: 'collapsed',
				rightSidebar: 'hidden',
				pageheader: 'full',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		const showPageHeader = ['edit', 'create', 'modify', 'media'].includes(currentMode);

		// Mobile
		if (size === ScreenSize.XS || size === ScreenSize.SM) {
			this.state = {
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		// Tablet
		if (size === ScreenSize.MD) {
			this.state = {
				leftSidebar: isViewMode ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: showPageHeader ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}

		// Desktop
		this.state = {
			leftSidebar: isViewMode ? 'full' : 'collapsed',
			rightSidebar: isViewMode ? 'hidden' : 'full',
			pageheader: showPageHeader ? 'full' : 'hidden',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		};
	}

	toggle(element: keyof UIState, visibility: UIVisibility) {
		this.state[element] = visibility;

		// Prevent auto-updates for 600ms after manual toggle
		if (element === 'leftSidebar' || element === 'rightSidebar') {
			this.manualOverrideActive = true;

			if (this.manualTimer) clearTimeout(this.manualTimer);
			this.manualTimer = setTimeout(() => {
				this.manualOverrideActive = false;
				this.manualTimer = null;
			}, 600);
		}
	}

	setRouteContext(ctx: { isImageEditor?: boolean; isCollectionBuilder?: boolean }) {
		Object.assign(this.routeContext, ctx);
		this.forceUpdate();
	}

	forceUpdate() {
		this.updateFromContext(screen.size, mode.value);
	}

	initUIEffects() {
		// No-op for compatibility
	}
}

export const ui = new UIStore();

// --- Backward Compatibility Layer ---
export const uiStore = ui;

export const toggleUIElement = (el: keyof UIState, vis: UIVisibility) => ui.toggle(el, vis);
export const setRouteContext = (ctx: any) => ui.setRouteContext(ctx);
export const initUIEffects = () => ui.initUIEffects();
export const destroy = () => {};
export const forceUpdate = () => ui.forceUpdate();

export const uiVisibility = {
	get current() {
		return ui.state;
	}
};

export const isSearchVisible = {
	set(v: boolean) {
		ui.isSearchVisible = v;
	},
	update(fn: (v: boolean) => boolean) {
		ui.isSearchVisible = fn(ui.isSearchVisible);
	},
	subscribe(run: (v: boolean) => void) {
		run(ui.isSearchVisible);
		// Return a cleanup function directly to match Svelte store signature
		const root = $effect.root(() => {
			$effect(() => run(ui.isSearchVisible));
		});
		return () => {
			root();
		};
	}
};

export const headerController = {
	get options() {
		return { showMore: ui.headerShowMore };
	},
	setShowMore: (v: boolean) => {
		ui.headerShowMore = v;
	}
};
