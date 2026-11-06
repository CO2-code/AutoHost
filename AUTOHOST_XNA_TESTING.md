# XNA-compatible RA1 IRC room testing

This project is an IRC-only room manager and game-list announcer for the CnCNet Red Alert 1 XNA client. It does not launch games, negotiate tunnels, send launch CTCP commands, create spawn files, or run a local game process.

## Required environment values

The bot does not publish a game-list entry until the exact client version and map SHA-1 are configured.

- `CNCNET_RA1_GAME_VERSION`: exact game version from the RA1 client build.
- `CNCNET_RA1_MAP_SHA1`: SHA-1 of the actual map file selected for the room.
- `CNCNET_RA1_MAP_NAME`: optional exact map name sent to the client.
- `CNCNET_RA1_GAME_MODE`: game-mode name (defaults to `Standard`).
- `CNCNET_RA1_SKILL`: skill-level index.
- `CNCNET_RA1_GAME_OPTIONS`: comma-separated packed game-option values.
- `CNCNET_RA1_DIFFICULTY`: difficulty dropdown index.

The map hash setting currently represents one map. Do not rotate to another map while reusing that hash. Each advertised map needs its own matching metadata.

## IRC behavior

- Joins `#cncnet-ra` using the lobby key `ra1-derp`.
- Joins `#cncnet-ra-games` without a key.
- Creates room channels using `#cncnet-ra-game` followed by a seven-digit suffix.
- Derives the default 10-character SHA-1 room key.
- Applies the room key, player limit, and XNA room topic.
- Advertises rooms using the 15-field revision-B game-list message expected by the current XNA client source.
- Refreshes room listings and sends a closed advertisement before leaving a room.
- Tracks IRC room membership and provides room chat, moderation, and map-vote commands.

## Protocol note

The captured `CTCP reply GAME A;...` is useful evidence of the room details reported by your `0.1.2` client, but it is not by itself proof that the game-list broadcast uses revision A. The current XNA client source uses protocol revision `B` and parses the game-list entry as 15 fields. The capture reports version `0.1.2`, map `[2] Equal Opportunity`, and SHA-1 `cd454a0a7849d65bbc4a78e49ad7fbae5323623d`. Use that hash only when advertising that exact map; it must not be reused for the default `Path Beyond` map or any other map. Keep the game-list broadcast at revision B unless the client parser being tested is confirmed to expect another revision.

## Explicit limitation

AutoHost only creates and advertises IRC rooms. Players can see and join those rooms, but the bot does not start a match or make a playable game happen. Actual match hosting requires a separate, properly implemented game-hosting workflow outside this IRC-only project.
