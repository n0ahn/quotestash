<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase, getCurrentProfile, uploadAvatar, removeAvatar } from '$lib/supabase';
  import {
    LayoutGrid,
    User,
    Palette,
    ShieldCheck,
    Info,
    Sun,
    Moon,
    Monitor,
    Check,
    LogOut,
    Download,
    Trash2,
    KeyRound,
    Quote,
    Loader2,
    Camera,
    X,
    Bell,
    BellOff
  } from 'lucide-svelte';
  import { pushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from '$lib/push';

  // ---------- shared page state ----------
  let loading = $state(true);

  type TabId = 'information' | 'appearance' | 'manage' | 'about';

  const tabs: { id: TabId; label: string; icon: typeof User }[] = [
    { id: 'information', label: 'Information', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'manage', label: 'Manage', icon: ShieldCheck },
    { id: 'about', label: 'About', icon: Info }
  ];

  let activeTab = $state<TabId>('information');

  // ---------- information tab ----------
  let userId = $state('');
  let firstName = $state('');
  let email = $state('');
  let firstNameDraft = $state('');
  let savingName = $state(false);
  let nameSaved = $state(false);

  const nameDirty = $derived(firstNameDraft.trim() !== '' && firstNameDraft.trim() !== firstName);

  // ---------- profile picture ----------
  let avatarUrl = $state<string | null>(null);
  let avatarUploading = $state(false);
  let avatarError = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

  async function handleAvatarChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    avatarError = null;

    if (!file.type.startsWith('image/')) {
      avatarError = 'Please choose an image file.';
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      avatarError = 'Image must be smaller than 5MB.';
      input.value = '';
      return;
    }

    avatarUploading = true;
    const newUrl = await uploadAvatar(file);
    avatarUploading = false;
    input.value = '';

    if (!newUrl) {
      avatarError = 'Failed to upload image. Please try again.';
      return;
    }

    avatarUrl = newUrl;
  }

  async function handleRemoveAvatar() {
    avatarError = null;
    avatarUploading = true;
    const ok = await removeAvatar();
    avatarUploading = false;

    if (!ok) {
      avatarError = 'Failed to remove picture. Please try again.';
      return;
    }

    avatarUrl = null;
  }

  function colorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  async function saveFirstName() {
    if (!nameDirty || savingName) return;
    savingName = true;
    nameSaved = false;

    const trimmed = firstNameDraft.trim();
    const { error } = await supabase.from('users').update({ first_name: trimmed }).eq('id', userId);

    if (!error) {
      firstName = trimmed;
      nameSaved = true;
      setTimeout(() => (nameSaved = false), 2000);
    } else {
      console.error('Failed to update name', error);
    }
    savingName = false;
  }

  // ---------- appearance tab ----------
  type ThemeMode = 'light' | 'dark' | 'auto';
  let mode = $state<ThemeMode>('auto');

  const themeOptions: { value: ThemeMode; icon: typeof Sun; label: string; description: string }[] = [
    { value: 'light', icon: Sun, label: 'Light', description: 'Always use the light theme' },
    { value: 'auto', icon: Monitor, label: 'Auto', description: 'Match your system setting' },
    { value: 'dark', icon: Moon, label: 'Dark', description: 'Always use the dark theme' }
  ];

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

  // ---------- manage tab ----------
  let newPassword = $state('');
  let confirmPassword = $state('');
  let passwordSaving = $state(false);
  let passwordMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  const passwordValid = $derived(newPassword.length >= 6 && newPassword === confirmPassword);

  async function updatePassword() {
    if (!passwordValid || passwordSaving) return;
    passwordSaving = true;
    passwordMessage = null;

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      passwordMessage = { type: 'error', text: error.message };
    } else {
      passwordMessage = { type: 'success', text: 'Password updated.' };
      newPassword = '';
      confirmPassword = '';
    }
    passwordSaving = false;
  }

  let exporting = $state(false);

  async function exportMyData() {
    exporting = true;
    try {
      const { data: memberRows } = await supabase.from('room_members').select('room_id').eq('user_id', userId);
      const roomIds = (memberRows ?? []).map((r) => r.room_id);

      const { data: rooms } = roomIds.length
        ? await supabase.from('rooms').select('id, name, code').in('id', roomIds)
        : { data: [] };

      const { data: quotes } = roomIds.length
        ? await supabase.from('quotes').select('*').in('room_id', roomIds).eq('added_by', userId)
        : { data: [] };

      const payload = {
        exported_at: new Date().toISOString(),
        profile: { id: userId, first_name: firstName, email },
        rooms: rooms ?? [],
        quotes_added: quotes ?? []
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quotestash-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      exporting = false;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/');
  }

  let showDeleteConfirm = $state(false);
  let deleteConfirmText = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  async function deleteAccount() {
    if (deleteConfirmText !== 'DELETE' || deleting) return;
    deleting = true;
    deleteError = '';

    const { error } = await supabase.from('users').delete().eq('id', userId);

    if (error) {
      console.error('Failed to delete account data', error);
      deleteError =
        "Couldn't fully delete your account data. Some things may be tied to rooms you own — try leaving or transferring ownership first, or contact support.";
      deleting = false;
      return;
    }

    await supabase.auth.signOut();
    goto('/');
  }

  // ---------- push notifications ----------
  let pushAvailable = $state(false);
  let pushEnabled = $state(false);
  let pushBusy = $state(false);
  let pushError = $state('');

  async function refreshPushState() {
    pushAvailable = pushSupported();
    if (!pushAvailable) return;
    pushEnabled = await isSubscribed();
  }

  async function togglePush() {
    if (pushBusy) return;
    pushBusy = true;
    pushError = '';

    try {
      if (pushEnabled) {
        const ok = await unsubscribeFromPush();
        if (ok) pushEnabled = false;
        else pushError = "Couldn't turn off notifications. Try again.";
      } else {
        const ok = await subscribeToPush();
        if (ok) {
          pushEnabled = true;
        } else if (Notification.permission === 'denied') {
          pushError = 'Notifications are blocked for this site in your browser settings.';
        } else {
          pushError = "Couldn't turn on notifications. Try again.";
        }
      }
    } finally {
      pushBusy = false;
    }
  }

  // ---------- lifecycle ----------
  async function loadData() {
    loading = true;

    const profile = await getCurrentProfile();
    if (!profile) {
      goto('/auth/login');
      return;
    }

    userId = profile.id;
    firstName = profile.first_name;
    firstNameDraft = profile.first_name;
    email = profile.email;
    avatarUrl = profile.avatar_url ?? null;

    const stored = localStorage.getItem('quotestash-theme') as ThemeMode | null;
    mode = stored ?? 'auto';

    loading = false;

    refreshPushState();
  }

  onMount(loadData);
</script>

<svelte:head>
  <title>Settings · QuoteStash</title>
</svelte:head>

<div class="px-5 sm:px-8 py-20 sm:p-10 sm:py-20 max-w-3xl mx-auto">
  <a
    href="/rooms"
    class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors mb-6"
  >
    <LayoutGrid size={14} />
    Your rooms
  </a>

  {#if loading}
    <div class="flex items-center gap-4 mb-8">
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      <div class="flex flex-col gap-2">
        <div class="h-5 w-32 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
        <div class="h-3 w-24 rounded-lg bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
      </div>
    </div>
    <div class="h-11 w-full max-w-md rounded-2xl bg-surface-100 dark:bg-surface-900 animate-pulse mb-8"></div>
    <div class="h-48 rounded-3xl bg-surface-100 dark:bg-surface-900 animate-pulse"></div>
  {:else}
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8 min-w-0">
      <div class="relative shrink-0 group/avatar">
        {#if avatarUrl}
          <img src={avatarUrl} alt={firstName} class="w-16 h-16 rounded-full object-cover shadow-sm" />
        {:else}
          <div
            class="flex items-center justify-center rounded-full text-white text-[24px] font-bold shadow-sm"
            style="width: 4rem; height: 4rem; background-color: {colorFromString(firstName)};"
          >
            {firstName.charAt(0).toUpperCase()}
          </div>
        {/if}

        <button
          type="button"
          onclick={() => fileInput?.click()}
          disabled={avatarUploading}
          aria-label="Change profile picture"
          class="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 text-white opacity-0 group-hover/avatar:opacity-100 transition-all disabled:cursor-wait"
        >
          {#if avatarUploading}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <Camera size={18} />
          {/if}
        </button>

        <input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={handleAvatarChange} />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50 truncate">Settings</h1>
        <p class="text-[13px] text-surface-500 dark:text-surface-400 mt-0.5 truncate">
          {firstName} · {email}
        </p>
        <div class="flex items-center gap-3 mt-1.5">
          <button
            type="button"
            onclick={() => fileInput?.click()}
            disabled={avatarUploading}
            class="text-[11.5px] font-semibold text-brand-500 hover:text-brand-600 transition-colors disabled:opacity-50"
          >
            {avatarUrl ? 'Change picture' : 'Add picture'}
          </button>
          {#if avatarUrl}
            <button
              type="button"
              onclick={handleRemoveAvatar}
              disabled={avatarUploading}
              class="flex items-center gap-1 text-[11.5px] font-medium text-surface-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <X size={12} />
              Remove
            </button>
          {/if}
        </div>
        {#if avatarError}
          <p class="text-[11.5px] text-red-500 mt-1">{avatarError}</p>
        {/if}
      </div>
    </div>

    <!-- Tabs -->
    <div class="mb-6 inline-flex items-center gap-0.5 rounded-2xl glass-chrome p-1 overflow-x-auto max-w-full">
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          onclick={() => (activeTab = tab.id)}
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold whitespace-nowrap transition-colors {activeTab ===
          tab.id
            ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
            : 'text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-200'}"
        >
          <tab.icon size={14} strokeWidth={2.25} />
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Panels -->
    {#if activeTab === 'information'}
      <div class="flex flex-col gap-4">
        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">
            Your details
          </h2>

          <label for="settings-first-name" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
            First name
          </label>
          <div class="flex items-center gap-2 mb-4">
            <input
              id="settings-first-name"
              type="text"
              bind:value={firstNameDraft}
              class="flex-1 h-10 px-3 rounded-xl glass-inset text-[13.5px] text-surface-900 dark:text-surface-50 outline-none focus:ring-2 focus:ring-brand-400/50 dark:focus:ring-brand-500/50 transition-shadow"
              maxlength="40"
            />
            <button
              type="button"
              onclick={saveFirstName}
              disabled={!nameDirty || savingName}
              class="h-10 px-4 rounded-xl text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 transition-colors flex items-center gap-1.5 shrink-0"
            >
              {#if savingName}
                <Loader2 size={14} class="animate-spin" />
              {:else if nameSaved}
                <Check size={14} />
              {:else}
                Save
              {/if}
            </button>
          </div>

          <label for="settings-email" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
            Email
          </label>
          <input
            id="settings-email"
            type="text"
            value={email}
            disabled
            class="w-full h-10 px-3 rounded-xl glass-inset text-[13.5px] text-surface-500 dark:text-surface-400 outline-none cursor-not-allowed"
          />
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mt-1.5">
            Your email is tied to your login and can't be changed here.
          </p>
        </div>

        <a
          href="/profile"
          class="p-5 rounded-3xl glass flex items-center justify-between gap-3 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 shrink-0">
              <Quote size={16} />
            </div>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50">View your quote stats</p>
              <p class="text-[11.5px] text-surface-400 dark:text-surface-500 truncate">
                Quotes added, favorites earned, and more
              </p>
            </div>
          </div>
          <span class="text-surface-300 dark:text-surface-600 text-sm shrink-0">→</span>
        </a>
      </div>
    {:else if activeTab === 'appearance'}
      <div class="p-5 rounded-3xl glass">
        <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-4">Theme</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {#each themeOptions as opt (opt.value)}
            <button
              type="button"
              onclick={() => setMode(opt.value)}
              class="relative flex flex-col items-start gap-2 p-4 rounded-2xl text-left transition-colors {mode ===
              opt.value
                ? 'glass-inset ring-2 ring-brand-400 dark:ring-brand-500'
                : 'glass-inset hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'}"
            >
              <div
                class="w-8 h-8 rounded-xl flex items-center justify-center {mode === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400'}"
              >
                <opt.icon size={15} strokeWidth={2} />
              </div>
              <div>
                <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50">{opt.label}</p>
                <p class="text-[11px] text-surface-400 dark:text-surface-500 mt-0.5">{opt.description}</p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {:else if activeTab === 'manage'}
      <div class="flex flex-col gap-4">
        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Bell size={13} />
            Push notifications
          </h2>
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">
            Get notified when someone adds a quote, comments, or favorites something of yours — even when QuoteStash isn't open.
          </p>

          {#if !pushAvailable}
            <p class="text-[12px] text-surface-500 dark:text-surface-400">
              Push notifications aren't supported in this browser.
            </p>
          {:else}
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[13px] font-medium text-surface-800 dark:text-surface-100">
                  {pushEnabled ? 'Notifications are on' : 'Notifications are off'}
                </p>
                {#if pushError}
                  <p class="text-[11.5px] text-red-500 mt-0.5">{pushError}</p>
                {/if}
              </div>
              <button
                type="button"
                onclick={togglePush}
                disabled={pushBusy}
                class="h-9 px-4 rounded-xl text-[12.5px] font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0 {pushEnabled
                  ? 'glass-inset text-surface-700 dark:text-surface-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                  : 'bg-brand-500 text-white hover:bg-brand-600'}"
              >
                {#if pushBusy}
                  <Loader2 size={14} class="animate-spin" />
                {:else if pushEnabled}
                  <BellOff size={14} />
                {:else}
                  <Bell size={14} />
                {/if}
                {pushEnabled ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          {/if}
        </div>

        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <KeyRound size={13} />
            Password
          </h2>
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">Set a new password for your account.</p>

          <div class="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label for="new-password" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                bind:value={newPassword}
                placeholder="At least 6 characters"
                class="w-full h-10 px-3 rounded-xl glass-inset text-[13.5px] text-surface-900 dark:text-surface-50 outline-none focus:ring-2 focus:ring-brand-400/50 dark:focus:ring-brand-500/50 transition-shadow"
              />
            </div>
            <div>
              <label for="confirm-password" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                bind:value={confirmPassword}
                placeholder="Repeat password"
                class="w-full h-10 px-3 rounded-xl glass-inset text-[13.5px] text-surface-900 dark:text-surface-50 outline-none focus:ring-2 focus:ring-brand-400/50 dark:focus:ring-brand-500/50 transition-shadow"
              />
            </div>
          </div>

          {#if passwordMessage}
            <p class="text-[12px] mb-3 {passwordMessage.type === 'success' ? 'text-emerald-500' : 'text-red-500'}">
              {passwordMessage.text}
            </p>
          {/if}

          <button
            type="button"
            onclick={updatePassword}
            disabled={!passwordValid || passwordSaving}
            class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-surface-900 text-white dark:bg-white dark:text-surface-900 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
          >
            {#if passwordSaving}
              <Loader2 size={14} class="animate-spin" />
            {/if}
            Update password
          </button>
        </div>

        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Download size={13} />
            Your data
          </h2>
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">
            Download a copy of your profile and the quotes you've added, as JSON.
          </p>
          <button
            type="button"
            onclick={exportMyData}
            disabled={exporting}
            class="h-9 px-4 rounded-xl text-[12.5px] font-semibold glass-inset text-surface-700 dark:text-surface-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {#if exporting}
              <Loader2 size={14} class="animate-spin" />
            {:else}
              <Download size={14} />
            {/if}
            Export my data
          </button>
        </div>

        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-1">Session</h2>
          <p class="text-[11.5px] text-surface-400 dark:text-surface-500 mb-4">Sign out of QuoteStash on this device.</p>
          <button
            type="button"
            onclick={handleLogout}
            class="h-9 px-4 rounded-xl text-[12.5px] font-semibold glass-inset text-surface-700 dark:text-surface-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>

        <div class="p-5 rounded-3xl bg-red-50/60 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20">
          <h2 class="text-[13px] font-bold text-red-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Trash2 size={13} />
            Danger zone
          </h2>
          <p class="text-[11.5px] text-red-400/90 dark:text-red-400/70 mb-4">
            Permanently delete your account. This can't be undone, and may fail if you still own rooms with other
            members in them.
          </p>

          {#if !showDeleteConfirm}
            <button
              type="button"
              onclick={() => (showDeleteConfirm = true)}
              class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            >
              Delete account
            </button>
          {:else}
            <div class="flex flex-col gap-2.5">
              <p class="text-[12px] text-red-500 dark:text-red-400 font-medium">
                Type <span class="font-mono font-bold">DELETE</span> to confirm.
              </p>
              <input
                type="text"
                bind:value={deleteConfirmText}
                placeholder="DELETE"
                class="w-full max-w-xs h-9 px-3 rounded-xl border border-red-300 dark:border-red-500/40 bg-white dark:bg-surface-950 text-[13px] text-surface-900 dark:text-surface-50 outline-none"
              />
              {#if deleteError}
                <p class="text-[11.5px] text-red-500">{deleteError}</p>
              {/if}
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onclick={deleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  class="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  {#if deleting}
                    <Loader2 size={14} class="animate-spin" />
                  {/if}
                  Confirm delete
                </button>
                <button
                  type="button"
                  onclick={() => {
                    showDeleteConfirm = false;
                    deleteConfirmText = '';
                    deleteError = '';
                  }}
                  class="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {:else if activeTab === 'about'}
      <div class="flex flex-col gap-4">
        <div class="p-5 rounded-3xl glass">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path
                  d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.365z"
                />
              </svg>
            </div>
            <div>
              <p class="text-[15px] font-bold text-surface-900 dark:text-surface-50">
                Quote<span class="text-brand-500">Stash</span>
              </p>
              <p class="text-[11.5px] text-surface-400 dark:text-surface-500">Collect the things your friends say.</p>
            </div>
          </div>
          <p class="text-[12.5px] text-surface-500 dark:text-surface-400 leading-relaxed">
            QuoteStash is a shared place for your friend group, team, or room to save the funniest, most
            memorable things you say to each other — then vote, comment, and quiz each other on them.
          </p>
        </div>

        <div class="p-5 rounded-3xl glass">
          <h2 class="text-[13px] font-bold text-surface-700 dark:text-surface-200 uppercase tracking-wide mb-3">
            Signed in as
          </h2>
          <div class="flex items-center gap-3">
            {#if avatarUrl}
              <img src={avatarUrl} alt={firstName} class="w-9 h-9 rounded-full object-cover shrink-0" />
            {:else}
              <div
                class="shrink-0 flex items-center justify-center rounded-full text-white text-[13px] font-bold"
                style="width: 2.25rem; height: 2.25rem; background-color: {colorFromString(firstName)};"
              >
                {firstName.charAt(0).toUpperCase()}
              </div>
            {/if}
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-surface-900 dark:text-surface-50 truncate">{firstName}</p>
              <p class="text-[11.5px] text-surface-400 dark:text-surface-500 truncate">{email}</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>