.PHONY: e2e integration compose-up compose-down

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down

integration:
	cd backend && uv sync --group dev && uv run pytest ../tests/integration -q

e2e:
	cd e2e && npm test
