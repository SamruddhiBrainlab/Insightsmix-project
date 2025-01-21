import os
import pandas as pd
import io
from datetime import datetime
from flask import Blueprint, Response, request, jsonify, send_file, current_app
from .services import *
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
load_dotenv()

# Define a blueprint for API routes
api = Blueprint('api', __name__)
BUCKET_NAME = os.getenv("BUCKET_NAME")

# Function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']

@api.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename) + f"-{datetime.utcnow()}"
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)

        # Ensure the upload folder exists
        os.makedirs(current_app.config['UPLOAD_FOLDER'], exist_ok=True)

        file.save(file_path)

        # Return the file path for further use
        return jsonify({
            "message": "File uploaded successfully",
            "file_path": file_path
        }), 200

    return jsonify({"error": "File type not allowed"}), 400


@api.route('/submit-form', methods=['POST'])
def start_training():
    """
    Endpoint to start a new training job.
    Accepts training parameters and a file path, validates and uploads the file, then starts the training job.
    """
    try:
        # Retrieve JSON payload
        training_params = request.get_json()
        print(training_params)
        if not training_params:
            return jsonify({"error": "No training parameters provided"}), 400

        # Check for 'filepath' in training_params
        filepath = training_params.get('dataSource')
        project_name = training_params.get('projectName')
        user_email = training_params.get('userEmail')
        if not filepath:
            return jsonify({"error": "Filepath is missing in training parameters"}), 400

        # Read the CSV file
        try:
            with open(filepath, 'rb') as file:
                file_data = file.read()
            df = pd.read_csv(io.BytesIO(file_data))
        except Exception as e:
            return jsonify({"error": f"Error reading file: {e}"}), 400

        # Preview the DataFrame
        preview = df.head().to_dict(orient='records')

        # Upload the file to GCS
        uploader = GCSUploader(project_name)
        timestamp_folder = uploader.create_timestamp_folder()
        filename = os.path.basename(filepath)
        destination_path = f"{timestamp_folder}/{filename}"
        gcs_path = uploader.upload_to_gcs(file_data.decode('utf-8'), destination_path)
        print("File path:", gcs_path)


        training_service = ModelTrainingService(timestamp_folder, gcs_path)
        
        result = training_service.start_training_job(training_params)

        job_id = result["job_id"].split("/")[-1]
        # Store or update user and project in the database
        store_or_update_user_and_project(user_email, project_name, timestamp_folder, job_id, status="PENDING")

        create_and_upload_eda(filepath, timestamp_folder)
        # deleting local file
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({
            "message": "Training job started successfully",
            "gcs_path": gcs_path,
            "data_preview": preview,
            "result": result
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route('/training/status/<job_id>', methods=['GET'])
def get_training_status(job_id):
    """Endpoint to get the status of a training job."""
    try:
        print("Checking job status", job_id)
        job_id = job_id.split("/")[-1]
        training_service = ModelTrainingService()
        result = training_service.get_job_status(job_id)
        update_job_status(result["state"], job_id)
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route('/get-report', methods=['GET'])
def get_report():
    project_id = request.args.get('project_id')
    user_email = request.args.get('email')
    gcs_file_name = request.args.get('filename')
    if not project_id or not user_email:
        return jsonify({
            'error': 'Project ID and email parameters are required'
        }), 400

    try:
        content, status_code = get_report_from_gcs(project_id, user_email, gcs_file_name)
        
        if status_code != 200:
            return jsonify(content), status_code
            
        # Return HTML content with proper content type
        return Response(
            content['file_content'],
            mimetype='text/html',
            headers={
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/html; charset=utf-8'
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    
@api.route('/get-user-projects', methods=['GET'])
def get_user_projects():
    try:
        # Get user email from query parameters
        user_email = request.args.get('email')

        if not user_email:
            return jsonify({
                'error': 'Email parameter is required'
            }), 400

        # check if any pending job successed
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return None, "No projects created yet"
        
        # Query projects for the user with status 'Success'
        projects = Project.query.filter_by(user_id=user.id, status="PENDING").all()

        for project in projects:
            job_id = project.job_id
            get_training_status(job_id)
            
        # Call the helper function to get the projects for the user
        projects_data, error = get_projects_for_user(user_email)

        if error:
            return jsonify({
                'error': error
            }), 404

        # Return the projects data in the response
        return jsonify({
            'projects': projects_data
        }), 200

    except Exception as e:
        # Log the error (you should configure proper logging)
        print(f"Error in get_user_projects: {str(e)}")
        return jsonify({
            'error': 'Internal server error occurred'
        }), 500
    

@api.route('/genai-summary-files', methods=['GET'])
def get_md_files():
    try:
        job_id = request.args.get('job_id')
        user_email = request.args.get('email')
        file_name = request.args.get('filename')
        print(job_id, user_email, file_name)
        try:
            content, status_code = get_summary_files(job_id, user_email, file_name)
        except Exception as e:
            content, status_code = get_summary_files(job_id, user_email, file_name)
        if status_code != 200:
            return jsonify(content), status_code
            
        # Return HTML content with proper content type
        return Response(
            content['file_content'],
            mimetype='text/markdown',
            headers={
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/markdown; charset=utf-8'
            }
        )
    except Exception as e:
        import logging
        logging.exception("Message")
        return jsonify({'error': str(e)}), 500