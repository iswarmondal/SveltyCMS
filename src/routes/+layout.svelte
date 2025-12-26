<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**

 ### Features
 - Paraglide i18n integration
 - Theme management
 -->

<script lang="ts">
	import '../app.postcss';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// Skeleton UI
	import { initializeStores, storePopup, getModalStore, Modal } from '@skeletonlabs/skeleton';
	import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	// import { setGlobalToastStore } from '@utils/toast'; // Deprecated
	import { setGlobalModalStore } from '@utils/modalUtils'; // Add import for modal utils

	// Custom Toast
	import MyToast from '@components/system/MyToast.svelte';

	// Modal Components Registry
	import ScheduleModal from '@components/collectionDisplay/ScheduleModal.svelte';
	import MediaLibraryModal from '@components/MediaLibraryModal.svelte';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { systemLanguage } from '@stores/store.svelte';

	// Theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte';

	// UI effects (must be called in component context)
	// import { initUIEffects } from '@stores/UIStore.svelte';

	// Components
	import TokenPicker from '@components/TokenPicker.svelte';

	// Props
	interface Props {
		children?: import('svelte').Snippet;
	}
	const { children }: Props = $props();

	// ============================================================================
	// State Management
	// ============================================================================

	let currentLocale = $state(getLocale() || 'en'); // Fallback to 'en' if Paraglide not yet initialized

	// ============================================================================
	// Initialization - deferred to onMount for proper SSR/client separation
	// ============================================================================

	// Initialize Skeleton stores (must be in component context during init)
	// Initialize Skeleton stores (must be in component context during init)
	initializeStores();
	// const _toastStore = getToastStore();
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	// setGlobalToastStore(getToastStore()); // Replaced by custom MyToast
	setGlobalModalStore(getModalStore()); // Initialize modal store
	setGlobalModalStore(getModalStore()); // Initialize modal store

	// Modal component registry for Skeleton UI
	const modalComponentRegistry: Record<string, any> = {
		scheduleModal: ScheduleModal,
		mediaLibraryModal: MediaLibraryModal
	};

	// ============================================================================
	// Mount Lifecycle
	// ============================================================================

	onMount(async () => {
		// Initialize UI effects
		// initUIEffects();

		// URL is the source of truth on initial load
		const urlLocale = getLocale();
		if (urlLocale && availableLocales.includes(urlLocale as any)) {
			if (systemLanguage.value !== urlLocale) {
				systemLanguage.value = urlLocale;
				currentLocale = urlLocale;
			}
		}

		// Initialize dark mode
		initializeDarkMode();
	});

	// ============================================================================
	// Theme Auto-Refresh
	// ============================================================================

	$effect(() => {
		if (!themeStore.autoRefreshEnabled || !browser) return;

		const interval = 30 * 60 * 1000; // 30 minutes
		const intervalId = setInterval(() => {
			initializeThemeStore().catch(console.error);
		}, interval);

		return () => clearInterval(intervalId);
	});

	// ============================================================================
	// Derived State
	// ============================================================================

	// Get the site name from data loaded in layout.server.ts
	const siteName = $derived(page.data.settings?.SITE_NAME || 'SveltyCMS');
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

<div>
	{#key currentLocale}
		{@render children?.()}
	{/key}
	{#if browser}
		<TokenPicker />
		<!-- Global UI Components -->
		<Modal components={modalComponentRegistry} />
		<MyToast />
		<!-- <TokenPicker /> -->
	{/if}
</div>
