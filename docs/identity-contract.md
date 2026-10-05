# Production identity contract

The game adapter verifies a game session token and supplies `PortalIdentity`:
`portalUserId`, `studentId`, `displayName`, optional `email`, `schoolCode`,
`campaignId`, and `gameUserId`.

`gameUserId` is the canonical gameplay/profile/session key (`game_users.id`).
`portalUserId` remains the external Portal identity. `studentId` (MSSV) and email
are metadata: matching strings across schools must never merge users, balances,
action cooldowns, running points, or active sessions. Colyseus session IDs still
identify individual transport connections.

`campaignId` is the internal `campaigns.id` database UUID resolved by the adapter.
Webmaster only needs an external campaign code such as `r2pl-2027`; it does not
need to supply database UUIDs. The adapter resolves the campaign, school code and
game user before returning the trusted identity. Client school/MSSV/points fields
are not authoritative. The Portal adapter remains an interface/skeleton; production
authentication fails closed until a real verifier is configured.

Local development retains normalized email keys and mock profiles. Player wallets
remain in memory in this phase; the player repository does not yet implement a
durable wallet or real Portal/running-provider integration.

`production_identity.test.ts` exercises two schools sharing an MSSV and email,
isolated profile mutations, trusted school selection, metadata changes, and
replacement login cleanup using distinct game user UUIDs.
