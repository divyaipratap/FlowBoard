# FAB-15 — Threat model

**Status: skeleton (Day 1).** Codex (Track B) appends the key-handling section. Track A finalizes after integration.

## Scope

This document covers the opt-in team sync feature only. It does not cover the existing single-device threat model for FlowBoard.

## Trust boundaries

- **In trust**: the user's device (OS keychain, local SQLite, app process memory).
- **Out of trust**: the relay server, the network path, any other client on the relay that did not receive a valid pairing code.

## Assets

| Asset | Where it lives | Confidentiality | Integrity |
|---|---|---|---|
| Issue contents (title, description, comments) | Device SQLite + Yjs doc | Must not leak to relay | Must not be silently modified by relay or third party |
| Pairing code (6 words) | Briefly displayed; never persisted | Must not leak via screenshots, clipboard managers, or relay logs | N/A — codes are single-use |
| Room key (derived from pairing code) | OS keychain via Electron `safeStorage` | Must not leave device | Must not be silently rotated by relay |
| Room ID | Sent in clear to relay (it's the routing tag) | Public-routable; deliberately not secret | Bound to the room key by AAD |

## Adversaries

1. **Honest-but-curious relay operator.** Reads all bytes through their server. Must not learn issue contents. Must not learn membership of a room beyond what's necessary to route. Mitigation: end-to-end encryption with keys derived on-device from pairing codes the relay never sees.

2. **Active network attacker (MITM).** Can drop, reorder, replay, or substitute messages. Mitigation: libsodium XChaCha20-Poly1305 AEAD with replay protection via monotonic counters bound by AAD. Codex specifies in Track B.

3. **Pairing-code thief.** Gains the 6-word code (shoulder surfing, screen share). For the window the code is live, can pair a device into the room. Mitigation: codes expire (~10 min) and are single-use; pairing acknowledged on the originating device with explicit user confirmation.

4. **Stolen device with unlocked keychain.** Has full access to the room key. Mitigation: out of scope for FAB-15. Documented as a known limitation; addressed in a future "device revocation" feature.

5. **Malicious peer (paired device gone rogue).** Inside the trust boundary by definition. Can write any CRDT update. Mitigation: the per-room key model means revocation requires re-keying the whole room (regenerate pairing code and re-pair). Documented limitation.

## Non-goals

- **Forward secrecy** between sessions. The room key is long-lived; if it leaks, all past traffic decrypts. Adding double-ratchet is future work.
- **Metadata privacy from the relay.** Relay sees frame timing, sizes, peer connection events. We do not pad or jitter. A relay operator can infer activity patterns but not contents.
- **Account / multi-tenant identity.** There are no FlowBoard accounts. Identity is per-room-membership; there is no global user.

## Key handling

Pairing codes are six words drawn uniformly from the English BIP39 wordlist. Each word selects one of 2,048 entries, so the displayed code carries 66 bits of entropy. Codes are normalized to lowercase BIP39 words before derivation and are never persisted by the crypto layer.

`PeerCipher.deriveRoomKey` uses libsodium `crypto_pwhash` with Argon2id13 to derive a 32-byte room key from the normalized six-word phrase. The salt is a 16-byte BLAKE2b hash of `flowboard-sync-room-key-v1:<roomId>`, so the public 128-bit random room ID separates otherwise identical pairing codes across rooms. Production parameters are libsodium's interactive Argon2id profile: opslimit 2, memlimit 64 MiB, parallelism 1 as exposed by libsodium-wrappers. This is intentionally slow enough to make online guessing expensive while remaining acceptable for a human pairing flow on desktop hardware.

Room keys are sealed with Electron `safeStorage` before disk persistence. The persisted file contains only the room ID, format version, and a `safeStorage` ciphertext blob; plaintext key bytes stay in process memory only long enough to derive, encrypt/decrypt, or hand to `safeStorage`. If `safeStorage` is unavailable or the OS keychain is locked on first launch, `loadRoomKey` returns `null` and sync must remain disabled until the user unlocks the keychain or re-pairs. `saveRoomKey` fails closed when encryption is unavailable rather than writing an unsealed key.

There is no automatic key rotation in v1. Manual rotation means disabling sync for the room, generating a fresh room ID and six-word pairing code, deriving a new room key, and re-pairing the intended devices. A lost or malicious paired device must be treated as a room-key compromise until this re-pair flow completes.

Envelopes use libsodium XChaCha20-Poly1305 AEAD with a fresh random 192-bit nonce per message. The relay sees only the envelope version, nonce, ciphertext, and MAC. The caller-provided AAD must include the room routing context plus sender ID and monotonic sender counter; `PeerCipher` authenticates that AAD and rejects a previously accepted AAD for the same room key. Binding room ID into key derivation plus room/sender/counter into AAD prevents ciphertext from being replayed across rooms or counters. Exact counter monotonicity is owned by `SyncEngine`; the crypto layer fails closed on MAC mismatch, AAD mismatch, version mismatch, and duplicate authenticated AAD.

## Implementation hooks

- `PeerCipher` (defined at `lib/sync/src/index.ts`, implemented by Codex at `lib/sync/src/crypto/`) is the *only* place plaintext crosses an encryption boundary.
- `RelayTransport` (defined at `lib/sync/src/index.ts`, implemented by Kiro at `lib/sync/src/transport/`) never sees plaintext or keys. It only ships `Envelope` objects.
- `SyncEngine` (Track A) holds the Yjs doc in memory and is responsible for not logging plaintext outside the renderer process.

## Auditable claims

A relay should be able to verify (by reading their own logs) that they never saw plaintext. We make this easier by:
- Never including issue IDs, titles, or assignee names in any cleartext envelope field.
- Including only `roomId` (random 128-bit), envelope `version`, message length, and connection metadata in cleartext.

## Open questions

- Does the relay need rate-limiting at the protocol level, or is that the relay operator's problem? **Decision: relay operator's problem.** We do not embed rate-limit metadata in envelopes.
- Should we offer a "trusted relay" badge / signature in the Settings UI? **Decision deferred to v2.** Track C ships a plain text input with a sensible default URL; trust is the user's call.
