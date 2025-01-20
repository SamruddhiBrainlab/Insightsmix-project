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
ARG GITHUB_TOKEN
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --upgrade git+https://${GITHUB_TOKEN}@github.com/Anubhavbrainlabs/meridian.git

# Debug CUDA, cuDNN, and TensorFlow GPU availability
# RUN nvcc --version && \
#     python -c "import tensorflow as tf; print(tf.__version__); print('GPU Available:', tf.config.list_physical_devices('GPU'))"

# Copy the training script
COPY train.py .

# Entry point for the training script
# ENTRYPOINT ["python", "train2.py", "--project_id", "insightsmix", "--bucket_name", "mmm-data-test", "--data_path", "input-data/geo_media.csv", "--output_path", "mmm"]
ENTRYPOINT ["python", "train.py"]

