DB_DUMP ?= .data/dumps/remote.dump

.PHONY: help db-start db-stop db-dump db-restore db-sync

help:
	@printf '%s\n' 'make db-sync     Dump remote, restore lokal, migrasi, dan atur .env.local' 'make db-dump     Simpan dump remote ke $(DB_DUMP)' 'make db-restore  Restore $(DB_DUMP) ke lokal (data lokal dicadangkan)' 'make db-start    Jalankan PostgreSQL lokal dan atur .env.local' 'make db-stop     Hentikan PostgreSQL lokal proyek'

db-start:
	bun scripts/db-copy.ts start

db-stop:
	bun scripts/db-copy.ts stop

db-dump:
	bun scripts/db-copy.ts dump "$(DB_DUMP)"

db-restore:
	bun scripts/db-copy.ts restore "$(DB_DUMP)"

db-sync:
	bun scripts/db-copy.ts sync "$(DB_DUMP)"
