# features

Feature modules are added only when their phase is authorized **and** their OpenAPI contract is
versioned (see `docs/SCREEN-INVENTORY.md`). A feature may import from `shared/` but never
from another feature's internals.
