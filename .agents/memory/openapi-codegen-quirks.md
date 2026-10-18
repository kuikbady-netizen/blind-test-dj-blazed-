---
name: OpenAPI codegen quirks
description: Toolchain fixes for generated client types and Zod barrels in this workspace.
---

When generated client code uses `Headers.entries()`, the API client TypeScript library set must include `dom.iterable` alongside `dom`.

Orval can create duplicate exports when the generated Zod operation schemas and generated model types are both wildcard-exported, especially for path-parameter names. Keep generated type exports namespaced rather than adding a second wildcard export, and reapply that barrel adjustment after codegen if the generator rewrites it.

**Why:** The generated client and Zod files typecheck separately from the application; these failures surface only when the complete workspace typecheck runs.

**How to apply:** After changing the OpenAPI spec, regenerate once, inspect the API-Zod barrel if TS2308 appears, adjust exports, then run the library typecheck without rerunning codegen.
