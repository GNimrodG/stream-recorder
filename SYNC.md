# Syncing Recordings Between Instances

## Overview

Stream Recorder can share scheduled recordings, saved streams, and recording history between
independent instances — for example a deployment at home and another on a VPS, or one per
household. Each instance keeps recording its own local sources; sync only shares the schedule,
stream list, and history so you get one unified view. App settings (FFmpeg path, output
directory, hardware acceleration, etc.) are never synced — they're machine-specific.

## How it works

- **Peer-to-peer**: instances talk directly to each other over HTTP(S), authenticated with a
  per-instance shared secret (its "sync API key"). There's no central server.
- **Execution assignment**: every scheduled recording and auto-record rule has a "Record on"
  setting — a specific linked instance, or "All linked instances". Only the assigned instance(s)
  actually run FFmpeg for it; everyone else just mirrors the metadata for visibility.
- **Last-write-wins**: if the same item is edited on two instances before they sync, the edit
  with the newer timestamp wins. Deletions are tracked so they propagate correctly even if an
  instance was offline when the delete happened.
- **Mirrored copies aren't independently deletable**: deleting an item on an instance that
  doesn't own it (isn't its "Record on" target) only removes that instance's local mirror — it
  reappears on the next sync as long as the owning instance still has it. Delete it on the owning
  instance to remove it everywhere.
- **Automatic polling**: linked instances sync with each other every 5 minutes in the background.
  Live recording status (frames, fps, etc.) is fetched on demand when you view the
  Dashboard/Recordings pages, so it's fresher than the 5-minute metadata sync.

## Linking two instances

1. On instance A, go to **Settings > Sync Between Instances** and set **This instance's public
   URL** — an address the other instance can reach (e.g. `https://home.example.com`, a Tailscale
   hostname, or `http://192.168.1.50:3000` on a shared LAN).
2. Click **Generate pairing code**. It's valid for 10 minutes and can only be used once.
3. On instance B, set its own public URL the same way, then paste A's code into **Link an
   instance** and click **Connect**.
4. Both instances now appear in each other's linked-instances list automatically — no API keys
   to copy by hand.

If an instance isn't reachable for pairing (e.g. it's behind a firewall with no public URL), use
**Advanced: add peer manually** on each side instead, exchanging instance ID and sync API key
directly.

### Instance name

Each instance has a name shown to peers during pairing and used as the "Instance" badge in the
UI. It defaults to the machine's hostname, or can be set explicitly with the `INSTANCE_NAME`
environment variable — useful in Docker, where the container's hostname is otherwise a random
container ID. When `INSTANCE_NAME` is set, it always takes precedence over any name typed into
the Settings page (the "This instance's name" field becomes read-only and shows which
environment variable is in effect), the same way `FFMPEG_PATH` overrides the FFmpeg Path setting
elsewhere in this app. Renaming an instance, by either method, doesn't require re-pairing —
existing peers pick up the new name on their next sync.

## "Record on" assignment

When creating or editing a scheduled recording, or enabling auto-record on a saved stream, choose
which instance should actually record it:

- **This instance** (or a specific linked instance) — only that instance runs FFmpeg for it.
- **All linked instances** — every instance that has synced the item records it independently.
  This is useful for redundancy, but note that once instances start finishing at different times,
  their completion metadata (output path, success/failure) for that shared record can overwrite
  each other on the next sync, since they share one record ID. Prefer per-instance assignment
  when precise history matters.

## Security

- Sync requests are authenticated by a per-instance bearer key (`syncApiKey`), independent of
  your login (NextAuth) session — this lets instances talk to each other even if login is
  disabled.
- Any instance reachable over the public internet should sit behind TLS. Reuse the reverse-proxy
  setup already documented in [AUTHENTICATION.md](AUTHENTICATION.md) — just proxy `/api/sync/*`
  through the same HTTPS-terminating proxy. For home-to-home setups without a domain or
  certificate, a WireGuard or Tailscale tunnel between instances is the simplest way to get an
  encrypted channel.
- Deletions are remembered ("tombstoned") for 30 days so they reliably propagate to instances
  that were offline. An instance offline longer than that could resurrect an old deletion when it
  reconnects — reasonable for most setups, but worth knowing.
