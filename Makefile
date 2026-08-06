.PHONY: up down build logs test clean

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

test:
	cd backend && python -m pytest tests/ -v

clean:
	docker compose down -v
	rm -rf data/