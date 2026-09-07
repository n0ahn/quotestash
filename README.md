# QuoteStash

QuoteStash is a SvelteKit web app for saving and sharing the funny, memorable things your friends say. Create a "room" for your friend group, invite people with a join code, and drop in quotes — who said it, what they said, tags, an optional NSFW flag — for everyone to react to, comment on, and favorite.

## Features

- **Auth** — email/password sign up and login (Supabase Auth), with an auto-created profile row on first login.
- **Rooms** — create rooms, join via invite/room code, manage members, and set a room group photo.
- **Quotes** — add multi-line quotes attributing each line to a speaker, tag them, mark NSFW, react, comment (with threaded replies), and favorite.
- **Leaderboard** — per-room leaderboard, presumably ranking members by quotes added / favorites / reactions.
- **Quiz** — a quiz mode per room (`/rooms/[id]/quiz`), likely a "guess who said it" game, with results tracked in `quiz_results`.
- **Notifications** — in-app notification bell for room/quote activity.
- **Profile & settings** — avatar upload, profile editing, room-level and account-level settings.
- **Command palette** — quick keyboard-driven navigation.
- **PWA install prompt** — install-to-home-screen prompt with iOS-specific guidance.
- **Legal pages** — terms, privacy policy, and cookie policy routes.

## Tech stack

- **[SvelteKit](https://kit.svelte.dev/)** (Svelte 5 runes syntax, e.g. `$state`) — routing and UI framework
- **[Supabase](https://supabase.com/)** — Postgres database, authentication, and file storage (avatars, room photos)
- **Tailwind CSS** (via `clsx` + `tailwind-merge`) — styling
- **[shadcn-svelte](https://www.shadcn-svelte.com/)-style UI primitives** — `Button`, `Input`, `Label` components
- **lucide-svelte** — icon set

## Project structure

```
src/
├── app.html                 # HTML shell
├── app.d.ts                 # Ambient TypeScript types
├── lib/
│   ├── supabase.ts          # Supabase client + profile/avatar/room-photo helpers
│   ├── database.types.ts    # Generated Postgres schema types
│   ├── utils.ts             # Shared utilities (e.g. `cn` classname helper)
│   ├── components/          # App components (RoomCard, QuoteCard, QuoteModal, NotificationBell, ...)
│   └── components/ui/       # Low-level UI primitives (button, input, label)
└── routes/
    ├── +page.svelte          # Home
    ├── auth/                 # Login / register
    ├── profile/               # User profile
    ├── settings/              # Account settings
    ├── legal/                 # Terms, privacy, cookies
    └── rooms/
        ├── +page.svelte             # Room list
        └── [id]/
            ├── +page.svelte          # Room home / quote feed
            ├── quotes/               # Quote detail views
            ├── members/              # Member list / member detail
            ├── leaderboard/          # Leaderboard
            ├── quiz/                 # Quiz mode
            └── settings/             # Room settings
```

## Database schema (Supabase / Postgres)

Defined in `src/lib/database.types.ts`:

| Table | Purpose |
|---|---|
| `users` | App-level user profile (name, email, avatar) |
| `rooms` | A friend-group room (name, join code, owner, photo) |
| `room_members` | Room ↔ user membership |
| `room_tags` | Tags scoped to a room, used to categorize quotes |
| `quotes` | A quote: array of `{ said_by, text }` lines, color, tags, NSFW flag |
| `quote_favorites` | User favorites on a quote |
| `quote_comments` | Comments on a quote, with threaded replies (`parent_comment_id`) |
| `comment_likes` | Likes on comments |
| `quote_reactions` | Emoji-style reactions on a quote |
| `notifications` | In-app notifications |
| `quiz_results` | Recorded results from the quiz mode |
| `join_room` | Join-room flow (e.g. via invite code) |

Row Level Security (RLS) is used on Supabase tables/storage; see inline comments in `supabase.ts` (e.g. room photo storage is namespaced by uploader ID to avoid RLS timing issues right after room creation).

## Getting started

> **Note:** this archive contains only the `src/` folder. To run the app you'll need a full SvelteKit project scaffold (`package.json`, `svelte.config.js`, `vite.config.ts`, `tailwind.config.js`, etc.) and a Supabase project.

1. Scaffold a SvelteKit project and copy `src/` in, or drop this `src/` into an existing SvelteKit + Supabase project.
2. Install dependencies (at minimum): `@supabase/supabase-js`, `clsx`, `tailwind-merge`, `lucide-svelte`, plus SvelteKit/Svelte/Tailwind tooling.
3. Set environment variables:
   ```
   PUBLIC_SUPABASE_URL=your-supabase-url
   PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
4. Set up the Postgres schema to match `src/lib/database.types.ts`, and create `avatars` and `room-photos` storage buckets with appropriate RLS policies.
5. Run the dev server:
   ```
   npm run dev
   ```

## License

Not specified.