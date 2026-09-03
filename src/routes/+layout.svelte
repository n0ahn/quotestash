<script lang="ts">
	import './layout.css';
	import { Sun, Moon, Monitor } from 'lucide-svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	type ThemeMode = 'light' | 'dark' | 'auto';

	let mode = $state<ThemeMode>('auto');

	function applyTheme(current: ThemeMode) {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = current === 'dark' || (current === 'auto' && prefersDark);
		document.documentElement.classList.toggle('dark', isDark);
	}

	function setMode(next: ThemeMode) {
		mode = next;
		localStorage.setItem('quotestash-theme', next);
		applyTheme(next);
	}

	onMount(() => {
		const stored = localStorage.getItem('quotestash-theme') as ThemeMode | null;
		mode = stored ?? 'auto';
		applyTheme(mode);

		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => {
			if (mode === 'auto') applyTheme('auto');
		};
		media.addEventListener('change', onChange);
		return () => media.removeEventListener('change', onChange);
	});

	const options: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
		{ value: 'light', icon: Sun, label: 'Light' },
		{ value: 'auto', icon: Monitor, label: 'Auto' },
		{ value: 'dark', icon: Moon, label: 'Dark' }
	];
</script>

<div class="min-h-screen">
	<div class="fixed top-4 left-4 z-50 flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365z"/>
        </svg>
      </div>
      <span class="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Quote<span class="text-brand-500">Stash</span></span>
    </div>
	<div
		class="fixed bottom-4 right-4 z-50 flex items-center gap-0.5 rounded-full border border-surface-200 bg-white/80 p-1 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/80"
	>
		{#each options as opt (opt.value)}
			<button
				type="button"
				onclick={() => setMode(opt.value)}
				aria-label={opt.label}
				class="flex h-7 w-7 items-center justify-center rounded-full transition-colors {mode ===
				opt.value
					? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
					: 'text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'}"
			>
				<opt.icon size={14} strokeWidth={2} />
			</button>
		{/each}
	</div>

	{@render children()}
</div>