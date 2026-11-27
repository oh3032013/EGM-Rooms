# Security Summary

**Reviewed Files**: 14 (`src/server/createMultiplayerServer.ts`, `src/game/multiplayer.ts`, `src/App.tsx`, `src/game/rules.ts`, `src/game/version.ts`, `src/game/story.ts`, `src/game/constants.ts`, `src/game/types.ts`, `src/components/StoryModal.tsx`, `src/components/PortalModal.tsx`, `src/components/MissionsModal.tsx`, `src/components/GameHUD.tsx`, `server.ts`, `src/game/blindAssist.ts`)
**Issues Resolved**: 7

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Session & Host Hijacking | `src/server/createMultiplayerServer.ts` | 748 | Joining a room with another player's `clientId` overwrote their active socket and could claim host control without verifying ownership. | High | Fixed | Generated a 24-byte random `sessionToken` per room seat, kept it off public player broadcasts, and verified reconnects using `timingSafeEqual` (`tokensMatch`), returning `UNAUTHORIZED` otherwise; client tokens stay strictly in JS memory. |
| Prototype-Chain & Fallthrough Dispatch | `src/server/createMultiplayerServer.ts` | 1088 | Lookup checks via `ITEMS[msg.itemId]` / `REALM_DEFS[msg.realmId]` and an unguarded fallback branch in `action:buy_animal` accepted prototype keys or unknown strings (falling back to buying a dog). | Medium | Fixed | Added `isOwnKey` (`Object.hasOwn`) guards on `ITEMS`, `REALM_DEFS`, `CRAFT_RECIPES`, and `MISSIONS`, plus explicit allowlists (`chicken`, `cow`, `sheep`, `dog`, `cat`) before running world-mutating actions. |
| Server Movement Teleport & Wall-Clip | `src/server/createMultiplayerServer.ts` | 880 | `player:move` accepted arbitrary coordinates anywhere on the map without distance clamping or collision checking against water, fences, or huts. | Medium | Fixed | Clamped each position update to `MAX_MOVE_STEP_TILES` (`3.5` tiles) and enforced `isTileWalkable` collision checks with axis-sliding before updating player coordinates. |
| Unsanitized Local Save Hydration | `src/App.tsx` | 247 | Saved world JSON from browser storage was parsed and merged into live game state without filtering `__proto__`/`constructor` keys, size limits, or validating tile terrain values. | Medium | Fixed | Added a `1.5 MB` size limit, recursive `stripPrototypePollution` filtering, strict map-dimension bounds (`1..48`), and `VALID_TERRAINS` plus numeric range validation in `loadSavedWorld`. |
| Unfiltered WebRTC Signal Relay | `src/server/createMultiplayerServer.ts` | 135 | `voice:signal` relayed client-supplied SDP and ICE objects verbatim to target room peers without checking shape, types, or payload length. | Medium | Fixed | Added `sanitizeVoiceSignal` to rebuild only allowed `offer`/`answer` SDP and `ice` candidate fields while rejecting oversized or malformed fields. |
| Missing Connection & Room Rate Limits + Headers | `src/server/createMultiplayerServer.ts` | 1552 | WebSocket upgrades and `room:create` requests had no per-IP caps, and Express exposed `x-powered-by` without baseline security headers or restricted CORS methods. | Medium | Fixed | Enforced `MAX_WS_PER_IP` (`24`), `MAX_ROOM_CREATES_PER_MIN` (`30`), disabled `x-powered-by`, added `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`, and restricted CORS methods to `GET, OPTIONS`. |
| Unsafe Custom Server URL Schemes | `src/game/multiplayer.ts` | 247 | Custom server URL input did not explicitly reject dangerous schemes such as `javascript:`, `data:`, or `file:` before normalization. | Low | Fixed | Validated scheme prefixes and parsed `URL.protocol` in `normalizeServerBaseUrl` so only `http:`, `https:`, `ws:`, and `wss:` are accepted. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Safe DOM Rendering | `src/components/*.tsx`, `src/App.tsx` | All game UI, story lore, chat messages, and modals render through standard React JSX bindings with zero raw HTML injection sinks. |
| Patch File Path Confinement | `src/server/createMultiplayerServer.ts` | `/patch-files/*` normalizes relative paths via `sanitizePatchFilePath` and verifies `path.resolve(distDir, safeRel)` stays strictly inside `distDir + path.sep`. |
| WebSocket Payload & Burst Control | `src/server/createMultiplayerServer.ts` | WebSocket server enforces `maxPayload: 64 * 1024` and drops messages exceeding 80 packets per second per connection. |
| Authoritative Action Proximity | `src/server/createMultiplayerServer.ts` | Village Elder and Strange Zone landmark interactions verify `isNearVillageElder` / `isNearStrangeZone` server-side before granting story progress or gifts. |

## PoC Verification

### 1. Session & Host Hijacking via Unverified `clientId`
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Seat Ownership Verification |
| Impact | High |
| Affected File | `src/server/createMultiplayerServer.ts:748` |
| Test Scenario | Attacker sends `{"type":"room:join","code":"<ROOM>","playerName":"Hijacker","clientId":"<HOST_ID>","sessionToken":"wrong"}` |

#### How It Was Fixed
Each room member receives a random 24-byte `sessionToken` stored privately on `RoomClient` (omitted from `toPublicPlayer`). Any subsequent `room:join` targeting an existing `clientId` must supply a matching `sessionToken` verified with `tokensMatch` (`crypto.timingSafeEqual`).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | WebSocket `message` arrives at `handleRoomMessage` (`src/server/createMultiplayerServer.ts:736`). | Enters `room:join` handler |
| 2 | Looks up `existing = room.players.get(clientId)` (`createMultiplayerServer.ts:745`). | Existing seat found |
| 3 | Evaluates `!tokensMatch(existing.sessionToken, msg.sessionToken)` (`createMultiplayerServer.ts:749`). | Returns `room:error` (`UNAUTHORIZED`) without detaching the legitimate player |

#### Conclusion
**Fix Verified** - Attackers cannot take over an occupied seat or room host privileges without possessing the seat's server-issued session token.

---

### 2. Prototype-Chain Lookup & Invalid Animal Purchase Fallthrough
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Allowlist / Prototype Key Guard |
| Impact | Medium |
| Affected File | `src/server/createMultiplayerServer.ts:1088` |
| Test Scenario | Client sends `{"type":"action:shop_buy","itemId":"__proto__","qty":1}` and `{"type":"action:buy_animal","kind":"dragon"}` |

#### How It Was Fixed
Dictionary lookups check `Object.hasOwn` via `isOwnKey`, and `action:buy_animal` explicitly validates `msg.kind` against `'chicken' | 'cow' | 'sheep' | 'dog' | 'cat'` before invoking rules.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `action:shop_buy` calls `isOwnKey(ITEMS, "__proto__")` (`createMultiplayerServer.ts:1089`). | Returns `false` and exits immediately |
| 2 | `action:buy_animal` checks `msg.kind` against the 5 allowed species (`createMultiplayerServer.ts:1237-1245`). | Returns early; guard dog fallback is unreachable |

#### Conclusion
**Fix Verified** - Malformed or prototype-property payloads are rejected cleanly without crashing or unintentionally adopting animals.

---

### 3. Movement Teleport & Unwalkable Tile Bypass
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Server Movement Bounds & Collision Validation |
| Impact | Medium |
| Affected File | `src/server/createMultiplayerServer.ts:880` |
| Test Scenario | Client sends `{"type":"player:move","x":25,"y":15}` from spawn `(14, 12)` across water/structures |

#### How It Was Fixed
Incoming `player:move` deltas exceeding `MAX_MOVE_STEP_TILES` (`3.5`) are scaled down toward the player's current position, and final tile coordinates must satisfy `isTileWalkable(room.world, ...)`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `player:move` computes `dist = Math.hypot(dx, dy)` (`createMultiplayerServer.ts:885`). | Detects `dist > 3.5` and clamps `targetX`/`targetY` along the vector |
| 2 | Checks `isTileWalkable` on target and axis-slide tiles (`createMultiplayerServer.ts:893-897`). | Blocks entering water, huts, fences, or forest borders |

#### Conclusion
**Fix Verified** - Remote clients cannot instantaneously teleport across realms or walk through impassable terrain.

---

### 4. Prototype Pollution & Corrupt Terrain via `localStorage` Save Data
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe Local State Deserialization |
| Impact | Medium |
| Affected File | `src/App.tsx:247` |
| Test Scenario | `localStorage` contains `{"__proto__":{"polluted":true},"width":999,"tiles":[{"terrain":"<script>"}]}` |

#### How It Was Fixed
`loadSavedWorld` caps raw string length (`1.5 MB`), strips `__proto__`, `constructor`, and `prototype` recursively via `stripPrototypePollution`, bounds map size to `1..48`, and validates every tile terrain against `VALID_TERRAINS`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `stripPrototypePollution` iterates `Object.entries` (`src/App.tsx:253-255`). | Drops `__proto__`, `constructor`, and `prototype` keys |
| 2 | Dimension and `VALID_TERRAINS.has(tile.terrain)` checks run (`src/App.tsx:268-287`). | Rejects invalid dimensions/terrains and returns `null` safely |

#### Conclusion
**Fix Verified** - Tampered browser save data cannot inject prototype properties or invalid terrain data into the runtime world.

---

### 5. Unsanitized WebRTC Signaling Relay
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unvalidated Peer-to-Peer Relay Payload |
| Impact | Medium |
| Affected File | `src/server/createMultiplayerServer.ts:135` |
| Test Scenario | Client sends `voice:signal` with an oversized 50 KB SDP string or arbitrary extra payload properties |

#### How It Was Fixed
`sanitizeVoiceSignal` rebuilds a minimal object containing only expected `sdp` (`<= 12,000` chars) or `ice` candidate (`<= 2,048` chars) fields and returns `null` on invalid types or sizes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `voice:signal` invokes `sanitizeVoiceSignal(msg.signal)` (`createMultiplayerServer.ts:991`). | Checks discriminant (`offer`/`answer`/`ice`) and field lengths |
| 2 | Extra keys are discarded or oversized payloads return `null` (`createMultiplayerServer.ts:151-203`). | Only clean WebRTC signaling reaches peers |

#### Conclusion
**Fix Verified** - Oversized or non-standard WebRTC payloads are dropped before being forwarded to other room members.

---

### 6. Custom Server URL Scheme Validation
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URL Scheme Acceptance |
| Impact | Low |
| Affected File | `src/game/multiplayer.ts:247` |
| Test Scenario | User or stored value passes `javascript:alert(1)` or `data:text/html,hi` to `normalizeServerBaseUrl` |

#### How It Was Fixed
`normalizeServerBaseUrl` rejects any scheme outside `http://`, `https://`, `ws://`, and `wss://` both by regex and by inspecting `new URL(clean).protocol`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Scheme guard checks `/^[a-z][a-z0-9+.-]*:/i` (`src/game/multiplayer.ts:251`). | Matches `javascript:` and immediately returns `""` |

#### Conclusion
**Fix Verified** - Only HTTP(S) and WebSocket schemes are accepted for multiplayer server configuration.
