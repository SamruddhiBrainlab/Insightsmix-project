# Use an official Python runtime (Debian Bullseye instead of Trixie)
FROM python:3.10-slim-bullseye

# Set the working directory in the container
WORKDIR /app

# Install system dependencies including Google Cloud SDK
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    software-properties-common \
    xfonts-75dpi \
    xfonts-base \
    wkhtmltopdf \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - \
    && apt-get update \
    && apt-get install -y google-cloud-sdk \
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
CMD ["gunicorn", "--preload", "--workers=2", "--timeout=600", "--bind", "0.0.0.0:8080", "app:app"]