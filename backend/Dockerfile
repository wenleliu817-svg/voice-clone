FROM python:3.11-slim

WORKDIR /app

# Install deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code
COPY backend/server.py .
COPY backend/frontend_build/ ./frontend_build/

EXPOSE 5001

CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 1 --threads 4 --timeout 0 server:app"]
