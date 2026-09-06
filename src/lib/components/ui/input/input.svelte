<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-8 rounded-xl border border-input/70 bg-white/40 backdrop-blur-md px-2.5 py-1 text-base transition-all file:h-6 file:text-sm file:font-medium focus-visible:border-brand-400 focus-visible:bg-white/70 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-white/5 dark:focus-visible:bg-white/10 dark:disabled:bg-white/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-8 rounded-xl border border-input/70 bg-white/40 backdrop-blur-md px-2.5 py-1 text-base transition-all file:h-6 file:text-sm file:font-medium focus-visible:border-brand-400 focus-visible:bg-white/70 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-white/5 dark:focus-visible:bg-white/10 dark:disabled:bg-white/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}