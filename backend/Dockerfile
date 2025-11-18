FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required for some python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]