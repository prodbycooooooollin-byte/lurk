# Lurk

A Twitch chat client for Windows, macOS and Linux. It works like Chatterino at its core, with a quiet monochrome interface and a sidebar that shows **who is in chat, even if they never type**.

English by default, German built in (Settings → Appearance → Language).

## Features

**Who's in chat**
- Live list of everyone present, with join time and message count
- Filters: new (last 10 min), lurking (hasn't chatted), active, left
- Joins feed: every join and leave as it happens
- Watchlist: sound and system notification when specific people join
- Optional inline join lines in chat
- As a moderator or broadcaster: the full viewer list via the Twitch API, even in large channels

**From Chatterino**
- Multiple channels, up to four columns side by side
- Twitch, 7TV, BetterTTV and FrankerFaceZ emotes, zero-width included, with large previews
- Badges, readable username colours, timestamps
- Recent history on join (recent-messages)
- User card: account age, followers, follow and sub age, recent messages, moderation
- Mentions and custom keywords (regex supported) with colours and sounds, collected across channels
- Deleted messages and timeouts stay visible, struck through
- Reply threads, `/me`, `/timeout`, `/ban`, `/unban`, `/announce`
- Pause on hover
- Tab completion for emotes, names and commands, emote picker
- Ignore people and phrases, search chat (`from:name`)

**New**
- Command palette (Ctrl K) for channels, actions and settings
- Per-channel stats: messages per minute, most active chatters, top emotes
- First-time and returning chatter markers
- Private notes on people
- Save chat log as text
- Always on top, dark and light themes
- Automatic updates via GitHub Releases

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl K | Command palette |
| Ctrl T | Add channel |
| Ctrl F | Search chat |
| Ctrl J | Toggle who's in chat |
| Ctrl B | Toggle channel list |
| Ctrl 1–9 | Switch channel |
| Ctrl W | Close column |
| Ctrl + click a channel | Open in a new column |

## Signing in

Reading works without an account. To chat, open Settings → Account and click **Sign in with Twitch**, then confirm in your browser.

That one-click flow needs the app's Twitch client ID to be built in (one-time setup for whoever builds Lurk):

1. Register an app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps/create): OAuth redirect URL `http://localhost`, category *Chat Bot* or *Application Integration*, client type **Public**.
2. Local builds: copy `.env.example` to `.env` and set `VITE_TWITCH_CLIENT_ID`.
3. Releases: add the same ID as a repository variable `TWITCH_CLIENT_ID` (GitHub → Settings → Secrets and variables → Actions → Variables).

The client ID is public, not a secret. Without it, Lurk falls back to asking for your own client ID or a token (Settings → Account → Advanced).

## Development

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck
npm test
npm run dist       # build an installer for this OS (release/)
```

Regenerate the app icon after editing `build/icon.svg`: `npm run icon`.

Stack: Electron (main process, updater, networking), React 19 + TypeScript, Tailwind CSS, Radix UI, Framer Motion, TanStack Virtual, Zustand, cmdk, Lucide, Inter.

Translations live in `src/renderer/src/lib/i18n.ts`. Adding a language means adding one dictionary there.

## Releasing

```bash
npm version patch          # bumps the version and creates the tag
git push --follow-tags
```

The GitHub Action builds Windows, macOS and Linux and publishes a release. Installed copies download the update in the background and offer "Install x.y.z" in the title bar. Auto-update only works for copies installed with `Lurk-Setup-x.y.z.exe`, not for an unpacked folder.

Note: auto-update on macOS requires a signed app (Apple Developer certificate). Windows and Linux (AppImage) update without signing. Unsigned Windows builds show a SmartScreen warning on first launch ("More info → Run anyway").

## Twitch limits

- Twitch sends joins and leaves in batches roughly every 10 seconds.
- The name list on join is only sent for chats under 1,000 people. In bigger channels you see everyone who joins or chats from then on, unless you are a moderator, in which case Lurk loads the full list.
