# Module Documentation Index

Living docs - one per module. **Read the relevant doc before modifying a module; update it in the same change.** See the "Module Documentation Convention" section in `CLAUDE.md` for the workflow.

| Doc | Module | One-liner |
|---|---|---|
| [sdk-client.md](sdk-client.md) | `src/defindex-sdk.ts`, `src/index.ts` | `DefindexSDK` facade: one method per DeFindex API route, network resolution, package exports. |
| [http-client.md](http-client.md) | `src/clients/http-client.ts` | Axios wrapper: Bearer auth header, BigInt-safe request serialization, error passthrough. |
| [types.md](types.md) | `src/types/` | All exported TypeScript request/response interfaces and enums for the DeFindex API. |
