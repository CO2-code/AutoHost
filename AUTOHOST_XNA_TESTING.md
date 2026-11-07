# XNA-compatible RA1 IRC room testing

This project is an IRC-only room manager and game-list announcer for the CnCNet Red Alert 1 XNA client. It does not launch games, negotiate tunnels, send launch CTCP commands, create spawn files, or run a local game process.

## Required environment values

The default room uses the values from your captured XNA room: client version `0.1.2`, map `[2] Equal Opportunity`, and SHA-1 `cd454a0a7849d65bbc4a78e49ad7fbae5323623d`. These defaults let you test that exact map without extra environment variables.

- `CNCNET_RA1_GAME_VERSION`: override the default `0.1.2` when testing another client build.
- `CNCNET_RA1_MAP_SHA1`: required when advertising a map other than `[2] Equal Opportunity`; use the exact SHA-1 of that map.
- `CNCNET_RA1_MAP_NAME`: optional exact untranslated map name sent to the client.
- `CNCNET_RA1_GAME_MODE`: game-mode name (defaults to `Standard`).
- `CNCNET_RA1_SKILL`: skill-level index.
- `CNCNET_RA1_GAME_OPTIONS`: comma-separated packed game-option values.
- `CNCNET_RA1_DIFFICULTY`: difficulty dropdown index.

The default map pool is intentionally limited to `[2] Equal Opportunity` because that is the only map whose hash was supplied. The bot skips an advertisement if a different map has no configured SHA-1. Never reuse one map's hash for another map.

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

Client `ra-0.1.2` uses protocol revision `A` and strictly requires **14 parameters** (`splitMessage.Length == 14`). In revision A, the fields are:
`GAME A;<version>;<maxPlayers>;<channel>;<title>;<flags>;<players>;<mapName>;<gameMode>;<tunnel>;<loadedGameId>;<skill>;<mapSha1>;<gameOptions>`
Any 15th field (such as `difficulty`) causes `Ignoring CTCP game message because of an invalid amount of parameters.` on client `0.1.2`. Protocol revision `B` introduces the 15th parameter (`difficulty`). The bot now defaults to revision `A` with the exact 14 parameters and populates the host nickname in the player list.

## Explicit limitation

AutoHost only creates and advertises IRC rooms. Players can see and join those rooms, but the bot does not start a match or make a playable game happen. Actual match hosting requires a separate, properly implemented game-hosting workflow outside this IRC-only project.
