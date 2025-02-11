import os
import pandas as pd
import io
from typing import Tuple, Union
from datetime import datetime
from flask import Blueprint, Response, request, jsonify, send_file, current_app
from .services import *
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
load_dotenv()

# Define a blueprint for API routes
api = Blueprint('api', __name__)
BUCKET_NAME = os.getenv("BUCKET_NAME")
 
# Function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']

from config.logging_config import setup_logging

logger = setup_logging()

@api.route('/upload', methods=['POST'])
def upload_data():
    """
    Handle file uploads and database connections for data ingestion.
    
    Supports three data sources:
    - CSV file upload
    - Excel file upload (converts to CSV)
    - Database connection (exports to CSV)
    
    Returns:
        tuple: JSON response with status and file details, and HTTP status code
    """
    data_source = request.form.get('data_source')
    logger.info(f"Received upload request for data source: {data_source}")

    if data_source == 'csv_file':
        return _handle_csv_upload()
    elif data_source == 'excel_file':
        return _handle_excel_upload()
    elif data_source == 'database_connection':
        return _handle_database_connection()
    else:
        logger.error(f"Invalid data source provided: {data_source}")
        return jsonify({'error': 'Invalid data source option'}), 400

def _handle_csv_upload():
    """Handle CSV file upload and storage."""
    if 'file' not in request.files:
        logger.error("No file provided in request")
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        logger.error("Empty filename provided")
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        now = datetime.now()
        filename = f"{filename.removesuffix('.csv')}_{now.strftime('%Y-%m-%d %H:%M:%S')}.csv"
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        try:
            file.save(file_path)
            logger.info(f"CSV file successfully saved: {filename}")
            return jsonify({
                "message": "File uploaded successfully",
                "file_path": file_path,
                "file_name": filename
            }), 200
        except Exception as e:
            logger.error(f"Failed to save CSV file: {str(e)}")
            return jsonify({'error': 'Failed to save file'}), 500

def _handle_excel_upload():
    """Handle Excel file upload, conversion to CSV, and storage."""
    if 'file' not in request.files:
        logger.error("No file provided in request")
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        logger.error("Empty filename provided")
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            now = datetime.now()
            filename = f"{filename}_{now.strftime('%Y-%m-%d %H:%M:%S')}"
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            
            excel_data = pd.read_excel(file_path)
            csv_path = f"{file_path.rsplit('.', 1)[0]}.csv"
            excel_data.to_csv(csv_path, index=False)
            os.remove(file_path)
            
            logger.info(f"Excel file converted and saved as CSV: {csv_path}")
            return jsonify({
                "message": "File uploaded successfully",
                "file_path": csv_path,
                "file_name": filename
            }), 200
        except Exception as e:
            logger.error(f"Failed to process Excel file: {str(e)}")
            return jsonify({'error': str(e)}), 500

def _handle_database_connection():
    """Handle database connection and data export to CSV."""
    required_fields = ['username', 'password', 'database_name', 'table_name']
    form_data = {field: request.form.get(field) for field in required_fields}
    
    if not all(form_data.values()):
        missing_fields = [field for field, value in form_data.items() if not value]
        logger.error(f"Missing required fields: {missing_fields}")
        return jsonify({'error': 'Username, password, database name, and table name are required'}), 400

    try:
        db_connection_string = f"mysql+pymysql://{form_data['username']}:{form_data['password']}@localhost/{form_data['database_name']}"
        engine = create_engine(db_connection_string)
        query = f"SELECT * FROM {form_data['table_name']}"
        
        db_data = pd.read_sql(query, engine)
        csv_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'database_data.csv')
        db_data.to_csv(csv_path, index=False)
        
        logger.info(f"Database data successfully exported to CSV: {csv_path}")
        return jsonify({
            "message": "File uploaded successfully",
            "file_path": csv_path,
            "file_name": 'database_data.csv'
        }), 200
    except Exception as e:
        logger.error(f"Database connection/export failed: {str(e)}")
        return jsonify({'error': str(e)}), 500


@api.route('/generate-eda-report', methods=['POST'])
def generate_eda_report():
    """
    Generate Exploratory Data Analysis (EDA) report from uploaded data.
    
    Expects JSON payload with:
    - dataSource: filename of the uploaded data
    - projectName: name of the project
    - userEmail: email of the user
    
    Returns:
        tuple: JSON response with status and project details, and HTTP status code
    """
    try:
        request_data = request.get_json()
        logger.info("Received EDA generation request")
        
        # Validate required fields
        required_fields = ['dataSource', 'projectName', 'userEmail']
        if not all(field in request_data for field in required_fields):
            missing_fields = [field for field in required_fields if field not in request_data]
            logger.error(f"Missing required fields: {missing_fields}")
            return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400

        filename = request_data['dataSource']
        project_name = request_data['projectName']
        user_email = request_data['userEmail']
        
        # Check for existing project version
        logger.info(f"Checking for existing project: {project_name} for user: {user_email}")
        last_project_ver = is_project_already_exist(user_email, project_name)
        if last_project_ver:
            project_name = f"{project_name}_version_{last_project_ver}"
            logger.info(f"Created new version of project: {project_name}")

        # Read and validate input file
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        try:
            with open(filepath, 'rb') as file:
                file_data = file.read()
            df = pd.read_csv(io.BytesIO(file_data))
            logger.info(f"Successfully read file: {filename} with {len(df)} rows")
        except FileNotFoundError:
            logger.error(f"File not found: {filepath}")
            return jsonify({"error": f"File not found: {filename}"}), 404
        except Exception as e:
            logger.error(f"Error reading file {filename}: {str(e)}")
            return jsonify({"error": f"Error reading file: {str(e)}"}), 400

        # Upload to GCS
        try:
            uploader = GCSUploader(project_name)
            timestamp_folder = uploader.create_timestamp_folder()
            destination_path = f"{timestamp_folder}/{filename}"
            gcs_path = uploader.upload_to_gcs(file_data.decode('utf-8'), destination_path)
            logger.info(f"Successfully uploaded file to GCS: {gcs_path}")
        except Exception as e:
            logger.error(f"GCS upload failed: {str(e)}")
            return jsonify({"error": f"Failed to upload to GCS: {str(e)}"}), 500

        # Store project details
        try:
            project_id = store_or_update_user_and_project(
                user_email, 
                project_name, 
                timestamp_folder, 
                filename, 
                status="PENDING"
            )
            logger.info(f"Stored project details. Project ID: {project_id}")
        except Exception as e:
            logger.error(f"Failed to store project details: {str(e)}")
            return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

        # Generate EDA report
        try:
            create_and_upload_eda(filepath, timestamp_folder)
            logger.info("Successfully generated and uploaded EDA report")
        except Exception as e:
            logger.error(f"EDA generation failed: {str(e)}")
            return jsonify({"error": f"Failed to generate EDA report: {str(e)}"}), 500

        # Cleanup local file
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"Cleaned up local file: {filepath}")
        except Exception as e:
            logger.warning(f"Failed to cleanup local file {filepath}: {str(e)}")

        return jsonify({
            "message": "Generated EDA report successfully",
            "gcs_path": gcs_path,
            "project_id": project_id,
            "project_name": project_name
        }), 200

    except Exception as e:
        logger.error(f"Unexpected error in generate_eda_report: {str(e)}")
        return jsonify({"error": str(e)}), 500

@api.route('/get-input-options')
def get_input_options():
   """
   Retrieve column headers from a CSV file stored in Google Cloud Storage.
   
   Query Parameters:
       project_id: ID of the project
       user_email: Email of the user requesting the data
   
   Returns:
       tuple: JSON response with column options and HTTP status code
   """
   try:
       project_id = request.args.get('project_id')
       user_email = request.args.get('user_email')

       if not project_id or not user_email:
           logger.error("Missing required parameters: project_id or user_email")
           return jsonify({
               'success': False,
               'error': 'Missing required parameters: project_id and user_email are required'
           }), 400

       logger.info(f"Fetching CSV headers for project_id: {project_id}, user_email: {user_email}")
       
       try:
           headers = get_csv_from_gcs(user_email, project_id)
           options = [str(col) for col in headers][1:]
           
           logger.info(f"Successfully retrieved {len(options)} columns from CSV")
           return jsonify({
               'success': True,
               'options': options
           })
           
       except Exception as e:
           logger.error(f"Failed to retrieve CSV from GCS: {str(e)}")
           return jsonify({
               'success': False,
               'error': f'Failed to retrieve file data: {str(e)}'
           }), 500
           
   except Exception as e:
       logger.error(f"Unexpected error in get_input_options: {str(e)}")
       return jsonify({
           'success': False,
           'error': str(e)
       }), 500

@api.route('/submit-form', methods=['POST'])
def start_training():
   """
   Start a new model training job.
   
   Expects JSON payload with:
       projectId: ID of the project
       userEmail: Email of the user
       [additional training parameters]
       
   Returns:
       tuple: JSON response with job details and HTTP status code
   """
   try:
       training_params = request.get_json()
       if not training_params:
           logger.error("Empty request payload received")
           return jsonify({"error": "No training parameters provided"}), 400

       # Validate required parameters
       required_fields = ['projectId', 'userEmail']
       if not all(field in training_params for field in required_fields):
           missing_fields = [field for field in required_fields if field not in training_params]
           logger.error(f"Missing required fields: {missing_fields}")
           return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400

       project_id = training_params['projectId']
       user_email = training_params['userEmail']
       
       logger.info(f"Processing training request for project: {project_id}, user: {user_email}")

       # Validate user existence
       try:
           user = User.query.filter_by(email=user_email).first()
           if not user:
               logger.error(f"User not found: {user_email}")
               return jsonify({'error': 'User not found'}), 404

           # Validate project existence
           project = Project.query.filter_by(id=project_id, user_id=user.id).first()
           if not project:
               logger.error(f"Project not found for user: {user_email}, project_id: {project_id}")
               return jsonify({'error': 'Project not found for this user'}), 404

           timestamp_folder = project.gcs_path
           filename = project.source_file_name
           source_file_path = f"gs://{BUCKET_NAME}/{timestamp_folder}/{filename}"
           
           logger.info(f"Starting training job for file: {source_file_path}")

           # Initialize training service and start job
           training_service = ModelTrainingService(timestamp_folder, source_file_path)
           result = training_service.start_training_job(training_params)
           
           # Extract and store job ID
           job_id = result["job_id"].split("/")[-1]
           logger.info(f"Training job started successfully. Job ID: {job_id}")

           # Update project status
           try:
               project.job_id = job_id
               db.session.commit()
               logger.info(f"Updated project {project_id} with job ID: {job_id}")
           except SQLAlchemyError as e:
               logger.error(f"Failed to update project with job ID: {str(e)}")
               return jsonify({
                   "error": "Training job started but failed to update project status",
                   "job_id": job_id
               }), 500

           return jsonify({
               "message": "Training job started successfully",
               "result": result
           }), 200

       except SQLAlchemyError as e:
           logger.error(f"Database error: {str(e)}")
           return jsonify({"error": "Database operation failed"}), 500
           
   except Exception as e:
       logger.error(f"Unexpected error in start_training: {str(e)}")
       return jsonify({"error": str(e)}), 500

@api.route('/training/status/<job_id>', methods=['GET'])
def get_training_status(job_id: str):
    """
    Get the current status of a training job.
    
    Args:
        job_id: The ID of the training job
        
    Returns:
        tuple: JSON response with job status and HTTP status code
    """
    try:
        logger.info(f"Checking status for job: {job_id}")
        
        # Clean job ID if it contains full path
        job_id = job_id.split("/")[-1]
        
        # Get job status
        try:
            training_service = ModelTrainingService()
            result = training_service.get_job_status(job_id)
            logger.info(f"Job {job_id} status: {result['state']}")
            
            # Update status in database
            try:
                update_job_status(result["state"], job_id)
                logger.info(f"Updated database status for job {job_id}")
            except Exception as e:
                logger.error(f"Failed to update job status in database: {str(e)}")
                # Continue execution as this is not critical
                
            return jsonify(result), 200
            
        except Exception as e:
            logger.error(f"Failed to get job status: {str(e)}")
            return jsonify({"error": f"Failed to get job status: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in get_training_status: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api.route('/get-report', methods=['GET'])
def get_report():
    """
    Retrieve a report from Google Cloud Storage.
    
    Query Parameters:
        project_id: ID of the project
        email: Email of the user
        filename: Name of the report file in GCS
        
    Returns:
        Response: HTML content of the report or JSON error message
    """
    try:
        # Validate required parameters
        project_id = request.args.get('project_id')
        user_email = request.args.get('email')
        gcs_file_name = request.args.get('filename')
        logger.info(f"Report request - Project: {project_id}, User: {user_email}, File: {gcs_file_name}")
        
        if not all([project_id, user_email]):
            logger.error("Missing required parameters")
            return jsonify({
                'error': 'Project ID and email parameters are required'
            }), 400
             
        if not gcs_file_name:
            logger.warning("No filename provided, will use default")

        try:
            content, status_code = get_report_from_gcs(project_id, user_email, gcs_file_name)
            
            if status_code != 200:
                logger.error(f"Failed to get report: {content.get('error', 'Unknown error')}")
                return jsonify(content), status_code
                
            logger.info(f"Successfully retrieved report for project {project_id}")
            
            # Return HTML content with proper headers
            return Response(
                content['file_content'],
                mimetype='text/html',
                headers={
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'text/html; charset=utf-8'
                }
            )
            
        except Exception as e:
            logger.error(f"Failed to retrieve report from GCS: {str(e)}")
            return jsonify({
                'error': f'Failed to retrieve report: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in get_report: {str(e)}")
        return jsonify({'error': str(e)}), 500
    

@api.route('/get-user-projects', methods=['GET'])
def get_user_projects() -> Tuple[jsonify, int]:
    """
    Retrieve projects associated with a user identified by their email address.
    
    Returns:
        tuple: A tuple containing:
            - A JSON response with either project data or error message
            - HTTP status code
    
    Query Parameters:
        email (str): The email address of the user
    """
    try:
        user_email = request.args.get('email')
        
        if not user_email:
            logger.warning("Request made without email parameter")
            return jsonify({
                'error': 'Email parameter is required'
            }), 400

        user = User.query.filter_by(email=user_email).first()
        if not user:
            logger.info(f"No user found for email: {user_email}")
            return jsonify({
                'error': 'No projects created yet'
            }), 404
        
        pending_projects = Project.query.filter_by(user_id=user.id, status="PENDING").all()
        
        for project in pending_projects:
            logger.debug(f"Checking status for pending project: {project.job_id}")
            get_training_status(project.job_id)
        
        projects_data, error = get_projects_for_user(user_email)
        
        if error:
            logger.error(f"Error retrieving projects for user {user_email}: {error}")
            return jsonify({
                'error': error
            }), 404

        logger.info(f"Successfully retrieved {len(projects_data)} projects for user {user_email}")
        return jsonify({
            'projects': projects_data
        }), 200

    except Exception as e:
        logger.exception(f"Unexpected error in get_user_projects: {str(e)}")
        return jsonify({
            'error': 'Internal server error occurred'
        }), 500
    

@api.route('/genai-summary-files', methods=['GET'])
def get_md_files() -> Union[Response, Tuple[jsonify, int]]:
    """
    Retrieve and serve markdown summary files for a specific project.
    
    Returns:
        Union[Response, Tuple[jsonify, int]]: Either:
            - A Response object containing markdown content
            - A tuple with error JSON and status code
    
    Query Parameters:
        project_id (str): The ID of the project
        email (str): The email address of the user
        filename (str): Name of the markdown file to retrieve
    """
    try:
        project_id = request.args.get('project_id')
        user_email = request.args.get('email')
        file_name = request.args.get('filename')

        logger.info(f"Attempting to retrieve summary file. Project ID: {project_id}, "
                   f"User: {user_email}, File: {file_name}")

        if not all([project_id, user_email, file_name]):
            logger.warning("Missing required query parameters")
            return jsonify({
                'error': 'Missing required parameters: project_id, email, and filename'
            }), 400

        try:
            content, status_code = get_summary_files(project_id, user_email, file_name)
        except Exception as e:
            logger.warning(f"First attempt to get summary files failed: {str(e)}. Retrying...")
            content, status_code = get_summary_files(project_id, user_email, file_name)

        if status_code != 200:
            logger.error(f"Failed to retrieve summary files. Status code: {status_code}")
            return jsonify(content), status_code

        logger.info(f"Successfully retrieved markdown file for project {project_id}")
        return Response(
            content['file_content'],
            mimetype='text/markdown',
            headers={
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/markdown; charset=utf-8'
            }
        )

    except Exception as e:
        logger.exception(f"Unexpected error in get_md_files: {str(e)}")
        return jsonify({
            'error': f'Internal server error: {str(e)}'
        }), 500