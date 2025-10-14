.PHONY: up down be fe seed test clean

up:
	@echo "🚀 Starting Opportunity Radar..."
	docker-compose up -d
	@echo "✓ Services running:"
	@echo "  Frontend:      http://localhost:5173"
	@echo "  Backend API:   http://localhost:8000"
	@echo "  API Docs:      http://localhost:8000/docs"
	@echo "  Mongo Express: http://localhost:8081"

down:
	@echo "🛑 Stopping Opportunity Radar..."
	docker-compose down

be:
	@echo "📊 Backend logs..."
	docker-compose logs -f backend

fe:
	@echo "🎨 Frontend logs..."
	docker-compose logs -f frontend

seed:
	@echo "🌱 Seeding demo data..."
	curl -X POST "http://localhost:8000/api/ingest/run?mode=demo"
	@echo "\n✓ Demo data seeded. Visit http://localhost:5173"

test:
	@echo "🧪 Running backend tests..."
	docker-compose exec backend pytest -v

clean:
	@echo "🧹 Cleaning up..."
	docker-compose down -v
	@echo "✓ All data cleaned"
