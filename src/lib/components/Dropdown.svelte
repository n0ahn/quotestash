<script lang="ts" generics="T extends string">
  import { ChevronDown } from 'lucide-svelte';

  type Option = { value: T; label: string };

  let { options, value = $bindable() }: { options: Option[]; value: T } = $props();

  let open = $state(false);
  let el = $state<HTMLDivElement>();

  const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '');

  function select(v: T) {
    value = v;
    open = false;
  }

  function handleClickOutside(e: MouseEvent) {
    if (el && !el.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" bind:this={el}>
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-xl text-[12px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
  >
    {selectedLabel}
    <ChevronDown size={13} class="text-surface-400 transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div class="absolute left-0 mt-1.5 min-w-40 max-h-64 overflow-y-auto rounded-2xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-lg z-100 p-1.5">
      {#each options as opt (opt.value)}
        <button
          type="button"
          onclick={() => select(opt.value)}
          class="w-full text-left px-3 py-2 rounded-xl text-[12.5px] font-medium transition-colors {value === opt.value
            ? 'bg-brand-500/10 text-brand-500'
            : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</div>