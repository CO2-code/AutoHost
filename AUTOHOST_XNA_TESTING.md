# XNA-compatible RA1 room testing

This branch changes the IRC room/listing handshake to match the current CnCNet XNA RA1 client.

## Required environment values

The bot deliberately does not publish a game-list entry until the exact client version and map SHA-1 are configured. Incorrect values can make the room appear incompatible or prevent it from being listed.

- `CNCNET_RA1_GAME_VERSION`: exact `ProgramConstants.GAME_VERSION` value used by the RA1 client build you are testing.
- `CNCNET_RA1_MAP_SHA1`: SHA-1 of the actual map file selected for the room.
- `CNCNET_RA1_MAP_NAME`: optional exact untranslated map name from the map metadata. If omitted, the room's displayed map label is sent.
- `CNCNET_RA1_GAME_MODE`: exact untranslated game-mode UI name (defaults to `Standard`).
- `CNCNET_RA1_SKILL`: normalized skill-level index (defaults to `1`).
- `CNCNET_RA1_GAME_OPTIONS`: comma-separated packed broadcast option values. Leave empty if no broadcastable options are enabled.
- `CNCNET_RA1_DIFFICULTY`: difficulty dropdown index (defaults to `-1`).

The map hash is currently one environment value, so test with the matching map configured. Do not rotate to a different map until its corresponding hash/name metadata is supplied.

## What changed

- Joins `#cncnet-ra` with `ra1-derp`; joins `#cncnet-ra-games` without a key.
- Creates XNA-style room channel names and derives the default 10-character SHA-1 channel key.
- Applies the room key, player limit, and XNA room topic.
- Sends the 15-field revision-B CTCP `GAME` notice using the XNA field order.
- Seeds room members from IRC NAMES replies after joining/reconnecting.
- Sends the closed flag before closing a room.
- Uses a 30-second minimum game-list refresh interval.

## Important limitation

This makes the IRC room/listing handshake testable. It does not turn the cloud bot into a playable RA1 host: the current launch countdown and custom `LAUNCH` message do not implement XNA `STARTV2/STARTV3`, tunnel negotiation, or local `spawn.ini` / `spawnmap.ini` game startup. A local Windows host agent is still required for actual matches.
