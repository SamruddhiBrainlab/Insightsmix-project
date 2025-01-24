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

# Install Python dependencies, including the private GitHub repository
# ARG GITHUB_TOKEN
RUN pip install --no-cache-dir -r requirements.txt
#     pip install --no-cache-dir --upgrade git+https://${GITHUB_TOKEN}@github.com/Anubhavbrainlabs/meridian.git

# Copy the training script
COPY train.py .

ENTRYPOINT ["python", "train.py"]

