# AI Project

This project consists of three main components:
- Flask Backend API
- React Frontend
- AI Model Training Container

## Prerequisites

Before running the project, ensure you have the following installed:
- Docker & Docker Compose
- Node.js (v16 or higher)
- Python 3.8+
- pip
- npm

## Project Structure

project/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── ...
├── frontend/
│   ├── package.json
│   ├── src/
│   └── ...
├── model/
│   ├── Dockerfile
│   ├── train.py
│   └── ...

## Backend Setup

1. Navigate to the backend directory:
   cd backend

2. Create a `.env` file in the root directory with necessary environment variables:

   BUCKET_NAME="mmm-data-test"

3. Create a virtual environment:
   python -m venv venv
   source venv/bin/activate


4. Install dependencies:
   pip install -r requirements.txt


5. Run the Flask server:
   python app.py

   The backend will be available at `http://localhost:8080`

## Frontend Setup

1. Navigate to the frontend directory:
   cd frontend


2. Install dependencies:
   npm install


3. Start the development server:
   npm start

   The frontend will be available at `http://localhost:3000`

## Docker Setup

1. Build and run the containers:
   docker build -t insightsmix .


## Steps for GCP OAuth Client ID Setup with 
- Navigate to API & Services > Credentials in the Cloud Console.
- Click Create Credentials > OAuth Client ID.
- Choose the application type (e.g., Web Application).
- Configure the redirect URIs for your app (for Web App, e.g., http://localhost:3000/dashboard for local testing).
- Download the generated OAuth Client ID JSON file.

## google-cloud-storage:
Create a Service Account Key:
Set the environment variable GOOGLE_APPLICATION_CREDENTIALS:
- export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-key.json"