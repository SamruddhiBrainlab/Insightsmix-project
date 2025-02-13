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

# Expose port for development
EXPOSE 8080

# Use environment arg to switch between dev and prod
ARG ENV=development
ENV ENV=${ENV}

# Development run command
CMD if [ "$ENV" = "production" ]; then \
    gunicorn --bind 0.0.0.0:8080 app:app; \
    else \
    flask run --host=0.0.0.0 --port=8080; \
    fi