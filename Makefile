.PHONY: up down be fe seed ingest-demo test clean

up:
	@echo "🚀 Starting Opportunity Radar..."
	docker-compose up -d
	@echo "✓ Services running:"
	@echo "  Frontend:      http://localhost:5173"
	@echo "  Backend API:   http://localhost:8000"
	@echo "  API Docs:      http://localhost:8000/docs"
	@echo "  Mongo Express: http://localhost:8081"
	@echo ""
	@echo "Next steps:"
	@echo "  1. make seed        # Seed canonical themes"
	@echo "  2. make ingest-demo # Run demo ingest"

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
	@echo "🌱 Seeding canonical themes..."
	docker-compose exec backend python -m backend.scripts.seed_themes
	@echo "\n✓ Themes seeded. Now run 'make ingest-demo' or click 'Run Ingest (Demo)' in UI"

ingest-demo:
	@echo "📊 Running demo ingest..."
	curl -X POST "http://localhost:8000/api/ingest/run?mode=demo"
	@echo "\n✓ Demo ingest complete. Visit http://localhost:5173"

test:
	@echo "🧪 Running backend tests..."
	docker-compose exec backend pytest -v

clean:
	@echo "🧹 Cleaning up..."
	docker-compose down -v
	@echo "✓ All data cleaned"
