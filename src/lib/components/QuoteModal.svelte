<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { page } from '$app/state';
  import { X, Plus, Trash2 } from 'lucide-svelte';
  import Avatar from './Avatar.svelte';

  type Member = {
    id: string;
    first_name: string;
    avatar_url: string | null;
  };

  let {
    open = $bindable(false),
    members,
    allTags,
    canManageTags = false,
    onCreated,
    onTagsSaved,
    onDeleteTagFromDatabase
  }: {
    open: boolean;
    members: Member[];
    allTags: string[];
    canManageTags?: boolean;
    onCreated: () => void;
    onTagsSaved?: (tags: string[]) => void;
    onDeleteTagFromDatabase?: (tag: string) => void;
  } = $props();

  const roomId = $derived(page.params.id!);

  type Line = {
    said_by: string;
    text: string;
  };

  let lines = $state<Line[]>([
    {
      said_by: '',
      text: ''
    }
  ]);

  let tags = $state<string[]>([]);
  let tagInput = $state('');
  let isNsfw = $state(false);
  let loading = $state(false);
  let errorMsg = $state('');

  let activeMemberDropdown = $state(-1);
  let activeTagDropdown = $state(false);
  let confirmingTagDelete = $state('');

  const tagSuggestions = $derived(
    tagInput.trim()
      ? allTags.filter(
          (tag) =>
            tag.toLowerCase().includes(tagInput.trim().toLowerCase()) &&
            !tags.includes(tag)
        )
      : allTags.filter((tag) => !tags.includes(tag))
  );

  function colorFromString(str: string): string {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;

    return `hsl(${hue}, 70%, 60%)`;
  }

  function getMemberSuggestions(input: string) {
    const query = input.trim().toLowerCase();

    if (!query) {
      return members;
    }

    return members.filter((member) =>
      member.first_name.toLowerCase().includes(query)
    );
  }

  function addLine() {
    lines = [
      ...lines,
      {
        said_by: '',
        text: ''
      }
    ];
  }

  function removeLine(index: number) {
    if (lines.length === 1) return;

    lines = lines.filter((_, i) => i !== index);

    if (activeMemberDropdown === index) {
      activeMemberDropdown = -1;
    }
  }

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();

    if (clean && !tags.includes(clean)) {
      tags = [...tags, clean];
    }

    tagInput = '';
    activeTagDropdown = false;
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();

      if (tagInput.trim()) {
        addTag(tagInput);
      }

      return;
    }

    if (
      e.key === 'Backspace' &&
      !tagInput &&
      tags.length > 0
    ) {
      tags = tags.slice(0, -1);
    }
  }

  const canSubmit = $derived(
    lines.every(
      (line) =>
        line.said_by.trim() &&
        line.text.trim()
    )
  );

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (!canSubmit || loading) return;

    loading = true;
    errorMsg = '';

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      errorMsg = 'You must be logged in.';
      loading = false;
      return;
    }

    const normalizedTags = [
      ...new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      )
    ];

    /*
     * First make sure every tag exists in room_tags.
     *
     * Existing tags are ignored because of the
     * room_id + name unique constraint.
     */
    if (normalizedTags.length > 0) {
      const { error: tagError } = await supabase
        .from('room_tags')
        .upsert(
          normalizedTags.map((name) => ({
            room_id: roomId,
            name
          })),
          {
            onConflict: 'room_id,name',
            ignoreDuplicates: true
          }
        );

      if (tagError) {
        console.error('Failed to save tags:', tagError);
        errorMsg = tagError.message;
        loading = false;
        return;
      }

      onTagsSaved?.(normalizedTags);
    }

    const primaryColor = colorFromString(
      lines[0].said_by.trim() + Date.now()
    );

    const { error } = await supabase
      .from('quotes')
      .insert({
        room_id: roomId,
        added_by: user.id,
        lines: lines.map((line) => ({
          said_by: line.said_by.trim(),
          text: line.text.trim()
        })),
        color: primaryColor,
        tags: normalizedTags,
        is_nsfw: isNsfw
      });

    if (error) {
      console.error('Failed to save quote:', error);
      errorMsg = error.message;
      loading = false;
      return;
    }

    close();
    onCreated();

    loading = false;
  }

  function close() {
    open = false;

    lines = [
      {
        said_by: '',
        text: ''
      }
    ];

    tags = [];
    tagInput = '';
    isNsfw = false;
    errorMsg = '';

    activeMemberDropdown = -1;
    activeTagDropdown = false;
    confirmingTagDelete = '';
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      close();
    }
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('overflow-hidden', open);
    }
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
  <div class="fixed inset-0 z-100 flex items-center justify-center px-4 py-6 sm:px-5 sm:py-8">
    <button
      type="button"
      class="absolute inset-0 bg-black/30 backdrop-blur-md animate-fade-in"
      onclick={close}
      aria-label="Close"
    ></button>

    <div
      class="glass-panel relative w-full max-w-md max-h-[88vh] overflow-y-auto overscroll-contain
             rounded-[28px]
             p-6 sm:p-7
             animate-modal-in"
    >
      <button
        type="button"
        onclick={close}
        class="absolute top-4 right-4 sm:top-5 sm:right-5
               flex items-center justify-center w-8 h-8 rounded-full
               text-surface-400 bg-black/[0.04] dark:bg-white/[0.06] backdrop-blur-sm
               hover:text-surface-700 hover:bg-black/[0.08]
               dark:hover:text-surface-200 dark:hover:bg-white/[0.1]
               transition-all active:scale-90"
        aria-label="Close"
      >
        <X size={16} strokeWidth={2.25} />
      </button>

      <h2 class="text-[19px] font-bold tracking-tight text-surface-900 dark:text-surface-50 mb-1 pr-10">
        Add a quote
      </h2>

      <p class="text-[13px] text-surface-500 dark:text-surface-400 mb-6">
        Capture a moment, tag it, and save it to the room
      </p>

      <form onsubmit={handleSubmit} class="space-y-4">
        <!-- Dialogue lines -->
        <div class="space-y-3">
          {#each lines as line, i (i)}
            <div class="flex gap-2 items-start">
              <div class="flex-1 space-y-2">
                <!-- Person -->
                <div class="relative">
                  <input
                    type="text"
                    bind:value={line.said_by}
                    onfocus={() => (activeMemberDropdown = i)}
                    placeholder="Who said it?"
                    class="w-full h-9 px-3 rounded-xl
                           text-[12.5px] font-medium
                           bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm
                           border border-black/[0.05] dark:border-white/[0.08]
                           text-surface-900 dark:text-surface-100
                           placeholder-surface-400
                           focus:outline-none
                           focus:ring-2 focus:ring-brand-500/30
                           focus:bg-white/60 dark:focus:bg-white/[0.08]
                           transition-all"
                  />

                  {#if activeMemberDropdown === i}
                    <button
                      type="button"
                      tabindex="-1"
                      class="fixed inset-0 z-20 cursor-default"
                      onclick={() => (activeMemberDropdown = -1)}
                      aria-label="Close member dropdown"
                    ></button>

                    {@const suggestions = getMemberSuggestions(line.said_by)}

                    {#if suggestions.length > 0}
                      <div
                        class="glass-chrome absolute left-0 right-0 top-full mt-1.5 z-30
                               max-h-40 overflow-y-auto overscroll-contain
                               rounded-2xl
                               py-1.5 animate-dropdown-in"
                      >
                        {#each suggestions as member (member.id)}
                          <button
                            type="button"
                            onclick={() => {
                              line.said_by = member.first_name;
                              activeMemberDropdown = -1;
                            }}
                            class="w-full mx-0 px-3.5 py-1.5
                                   flex items-center gap-2
                                   text-left text-[12.5px] font-medium
                                   text-surface-700
                                   dark:text-surface-200
                                   hover:bg-surface-100
                                   dark:hover:bg-surface-700/50
                                   hover:text-surface-900
                                   dark:hover:text-surface-50
                                   transition-colors"
                          >
                            <Avatar name={member.first_name} avatarUrl={member.avatar_url} size={20} />

                            <span>{member.first_name}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>

                <!-- Quote text -->
                <textarea
                  bind:value={line.text}
                  placeholder="What did they say?"
                  rows="2"
                  class="w-full px-3 py-2 rounded-xl
                         text-[13px]
                         bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm
                         border border-black/[0.05] dark:border-white/[0.08]
                         text-surface-900 dark:text-surface-100
                         placeholder-surface-400
                         focus:outline-none
                         focus:ring-2 focus:ring-brand-500/30
                         focus:bg-white/60 dark:focus:bg-white/[0.08]
                         transition-all resize-none"
                ></textarea>
              </div>

              {#if lines.length > 1}
                <button
                  type="button"
                  onclick={() => removeLine(i)}
                  class="mt-1 p-1.5 rounded-lg
                         text-surface-300
                         hover:text-red-500
                         hover:bg-red-50
                         dark:hover:bg-red-500/10
                         transition-colors"
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Add line -->
        <button
          type="button"
          onclick={addLine}
          class="flex items-center gap-1.5
                 text-[12px] font-semibold
                 text-brand-500
                 hover:text-brand-600
                 transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          Add followup
        </button>

        <!-- Tags -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label
              for="tagInput"
              class="block text-[12px] font-semibold
                     text-surface-600 dark:text-surface-400"
            >
              Tags
            </label>

            {#if allTags.length > 0}
              <span class="text-[11px] text-surface-400 dark:text-surface-500">
                {allTags.length} in this room
              </span>
            {/if}
          </div>

          <div class="relative">
            <div
              class="flex flex-wrap items-center gap-1.5
                     min-h-10 px-3 py-1.5 rounded-2xl
                     bg-black/[0.03] dark:bg-white/[0.05] backdrop-blur-sm
                     border border-black/[0.05] dark:border-white/[0.08]
                     ring-1 ring-transparent
                     focus-within:ring-2
                     focus-within:ring-brand-500/40
                     focus-within:bg-white/60 dark:focus-within:bg-white/[0.08]
                     transition-all"
            >
              {#each tags as tag (tag)}
                <span
                  class="flex items-center gap-1
                         text-[11px] font-semibold
                         pl-2 pr-1 py-1 rounded-lg
                         animate-tag-in"
                  style:color={colorFromString(tag)}
                  style:background-color={`${colorFromString(tag)}1A`}
                >
                  #{tag}

                  <button
                    type="button"
                    onclick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    class="flex items-center justify-center w-3.5 h-3.5 rounded-full
                           hover:bg-black/10 dark:hover:bg-white/10
                           transition-colors"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </span>
              {/each}

              <input
                id="tagInput"
                type="text"
                bind:value={tagInput}
                onfocus={() => (activeTagDropdown = true)}
                onkeydown={handleTagKeydown}
                placeholder={
                  tags.length === 0
                    ? 'Search or create a tag…'
                    : ''
                }
                class="flex-1 min-w-24
                       bg-transparent
                       text-[12.5px]
                       text-surface-900
                       dark:text-surface-100
                       placeholder-surface-400
                       focus:outline-none py-1"
              />
            </div>

            {#if activeTagDropdown}
              <!-- Click outside -->
              <button
                type="button"
                tabindex="-1"
                class="fixed inset-0 z-20 cursor-default"
                onclick={() => (activeTagDropdown = false)}
                aria-label="Close tag dropdown"
              ></button>

              {#if tagSuggestions.length > 0 || tagInput.trim()}
                <div
                  class="glass-chrome absolute left-0 right-0 top-full mt-1.5 z-30
                         max-h-48 overflow-y-auto overscroll-contain
                         rounded-2xl
                         py-1.5 animate-dropdown-in"
                >
                  {#each tagSuggestions.slice(0, 8) as suggestion (suggestion)}
                    <div
                      class="group/tagrow flex items-center justify-between
                             px-2 py-0.5
                             text-[12.5px] font-medium
                             text-surface-700
                             dark:text-surface-200"
                    >
                      <button
                        type="button"
                        onclick={() => addTag(suggestion)}
                        class="flex-1 flex items-center gap-2 px-1.5 py-1.5 rounded-xl
                               text-left
                               group-hover/tagrow:bg-surface-100
                               dark:group-hover/tagrow:bg-surface-700/50
                               transition-colors"
                      >
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          style:background-color={colorFromString(suggestion)}
                        ></span>

                        <span class="truncate">
                          #{suggestion}
                        </span>
                      </button>

                      {#if canManageTags && onDeleteTagFromDatabase}
                        {#if confirmingTagDelete === suggestion}
                          <div class="flex items-center gap-1 pl-1 shrink-0">
                            <button
                              type="button"
                              onclick={() => {
                                onDeleteTagFromDatabase?.(suggestion);
                                removeTag(suggestion);
                                confirmingTagDelete = '';
                              }}
                              class="text-[10px] font-bold text-white bg-red-500
                                     hover:bg-red-600 px-2 py-1 rounded-lg
                                     transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onclick={() => (confirmingTagDelete = '')}
                              aria-label="Cancel"
                              class="p-1 rounded-lg text-surface-400
                                     hover:text-surface-600 dark:hover:text-surface-300"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        {:else}
                          <button
                            type="button"
                            onclick={() => (confirmingTagDelete = suggestion)}
                            class="opacity-0 group-hover/tagrow:opacity-100
                                   hover:text-red-500 hover:bg-red-500/10
                                   p-1.5 rounded-lg
                                   transition-all shrink-0"
                            aria-label={`Delete tag ${suggestion} completely`}
                          >
                            <Trash2 size={11} />
                          </button>
                        {/if}
                      {/if}
                    </div>
                  {/each}

                  {#if tagInput.trim() && !allTags.some((t) => t.toLowerCase() === tagInput.trim().toLowerCase()) && !tags.includes(tagInput.trim().toLowerCase())}
                    <button
                      type="button"
                      onclick={() => addTag(tagInput)}
                      class="w-full flex items-center gap-2 px-3.5 py-2
                             text-left text-[12.5px] font-medium
                             text-brand-500
                             hover:bg-brand-500/10
                             transition-colors
                             {tagSuggestions.length > 0 ? 'mt-1 border-t border-surface-100 dark:border-surface-700/60 pt-2' : ''}"
                    >
                      <Plus size={13} strokeWidth={2.5} />
                      Create tag "{tagInput.trim().toLowerCase()}"
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <!-- NSFW -->
        <label
          class="flex items-center justify-between px-1 cursor-pointer"
        >
          <span
            class="text-[12.5px] font-medium
                   text-surface-700 dark:text-surface-300"
          >
            Mark as NSFW
          </span>

          <button
            type="button"
            onclick={() => (isNsfw = !isNsfw)}
            class="relative w-10 h-6 rounded-full
                   transition-colors
                   {isNsfw
              ? 'bg-red-500'
              : 'bg-surface-200 dark:bg-surface-700'}"
            aria-label="Toggle NSFW"
          >
            <span
              class="absolute top-0.5 left-0.5
                     w-5 h-5 rounded-full
                     bg-white shadow-sm
                     transition-transform
                     {isNsfw ? 'translate-x-4' : ''}"
            ></span>
          </button>
        </label>

        {#if errorMsg}
          <p class="text-[13px] text-red-500 dark:text-red-400">
            {errorMsg}
          </p>
        {/if}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          class="w-full h-11 rounded-2xl
                 text-[14px] font-semibold text-white
                 bg-brand-500 hover:bg-brand-600
                 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-6px_var(--color-brand-500)]
                 disabled:opacity-40
                 disabled:pointer-events-none
                 active:scale-[0.98]
                 transition-all"
        >
          {loading ? 'Saving…' : 'Save quote'}
        </button>
      </form>
    </div>
  </div>
{/if}