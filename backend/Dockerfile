FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire backend directory
COPY backend/ ./backend/

# Set Python path so backend module can be imported
ENV PYTHONPATH=/app

# Run the application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
