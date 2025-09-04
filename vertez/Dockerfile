# Use TensorFlow GPU base image
FROM tensorflow/tensorflow:2.15.0-gpu

# Ensure apt-get is non-interactive
ENV DEBIAN_FRONTEND=noninteractive

# Set the working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    software-properties-common \
    curl \
    git \
    wget \
    gpg && \
    rm -rf /var/lib/apt/lists/*

# Verify Python version (already in the base image)
RUN python --version && pip --version

# Copy the requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --timeout 100 -r requirements.txt

# Install private GitHub repository using secrets
# This prevents the token from being stored in image layers
ARG GITHUB_TOKEN
# Configure Git to use the token properly
RUN git config --global url."https://${GITHUB_TOKEN}:x-oauth-basic@github.com/".insteadOf "https://github.com/" && \
    pip install --no-cache-dir --upgrade git+https://github.com/Brainlabs-Digital/BL-Meridian-1.1.7.git && \
    git config --global --unset url."https://${GITHUB_TOKEN}:x-oauth-basic@github.com/".insteadOf

# Copy the training script
COPY train.py .

# Set entrypoint
ENTRYPOINT ["python", "train.py"]