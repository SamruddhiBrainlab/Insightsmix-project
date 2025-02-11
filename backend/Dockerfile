# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    software-properties-common \
    git \
    wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project
COPY . .

# Expose port for Cloud Run
EXPOSE 8080

# Set environment variable for Flask
ENV PORT=8080
ENV GUNICORN_CMD_ARGS="--bind 0.0.0.0:8080"

# Run the application with Gunicorn
CMD ["gunicorn", "--preload", "--workers=4", "--timeout=300", "--bind", "0.0.0.0:8080", "app:app"]
