import os
import re
import pandas as pd
import io
import copy
from typing import Tuple, Union
from datetime import datetime
from flask import (
    Blueprint,
    Response,
    request,
    jsonify,
    send_file,
    current_app,
    stream_with_context,
)
from .services import *
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from google.cloud import discoveryengine_v1
from config.logging_config import setup_logging

logger = setup_logging()
load_dotenv()

# Define a blueprint for API routes
api = Blueprint("api", __name__)
BUCKET_NAME = os.getenv("BUCKET_NAME")

# Function to check allowed file extensions
def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in current_app.config["ALLOWED_EXTENSIONS"]
    )


def sanitize_columns(df):
    """Convert column names to BigQuery-compatible format."""
    df.columns = [re.sub(r"[^a-zA-Z0-9_]", "_", str(col)) for col in df.columns]
    return df


def process_csv(file_path):
    """Clean CSV for BigQuery compatibility."""
    df = pd.read_csv(file_path)
    df = sanitize_columns(df)
    df.to_csv(file_path, index=False)
    return df


@api.route("/upload", methods=["POST"])
def upload_data():
    data_source = request.form.get("data_source")

    if data_source == "csv_file":
        return _handle_csv_upload()
    elif data_source == "excel_file":
        return _handle_excel_upload()
    elif data_source == "database_connection":
        return _handle_database_connection()
    else:
        return jsonify({"error": "Invalid data source option"}), 400


def _handle_csv_upload():
    if "file" not in request.files or request.files["file"].filename == "":
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{filename.removesuffix('.csv')}_{timestamp}.csv"
        file_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)

        try:
            file.save(file_path)
            process_csv(file_path)  # Clean column names
            return (
                jsonify(
                    {
                        "message": "File uploaded successfully",
                        "file_path": file_path,
                        "file_name": filename,
                    }
                ),
                200,
            )
        except Exception as e:
            return jsonify({"error": str(e)}), 500


def _handle_excel_upload():
    if "file" not in request.files or request.files["file"].filename == "":
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_path = os.path.join(
                current_app.config["UPLOAD_FOLDER"], f"{filename}_{timestamp}"
            )
            file.save(temp_path)

            # Convert to CSV with clean columns
            df = pd.read_excel(temp_path)
            df = sanitize_columns(df)

            csv_path = f"{temp_path.rsplit('.', 1)[0]}.csv"
            df.to_csv(csv_path, index=False)
            os.remove(temp_path)

            return (
                jsonify(
                    {
                        "message": "File uploaded successfully",
                        "file_path": csv_path,
                        "file_name": os.path.basename(csv_path),
                    }
                ),
                200,
            )
        except Exception as e:
            return jsonify({"error": str(e)}), 500


def _handle_database_connection():
    required = ["username", "password", "database_name", "table_name"]
    data = {field: request.form.get(field) for field in required}

    if not all(data.values()):
        return jsonify({"error": "All database fields are required"}), 400

    try:
        connection_string = f"mysql+pymysql://{data['username']}:{data['password']}@localhost/{data['database_name']}"
        engine = create_engine(connection_string)

        df = pd.read_sql(f"SELECT * FROM {data['table_name']}", engine)
        df = sanitize_columns(df)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_path = os.path.join(
            current_app.config["UPLOAD_FOLDER"], f"database_data_{timestamp}.csv"
        )
        df.to_csv(csv_path, index=False)

        return (
            jsonify(
                {
                    "message": "Database data exported successfully",
                    "file_path": csv_path,
                    "file_name": f"database_data_{timestamp}.csv",
                }
            ),
            200,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Updated generate_eda_report function to handle the validation error
@api.route("/generate-eda-report", methods=["POST"])
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
        required_fields = ["dataSource", "projectName", "userEmail"]
        if not all(field in request_data for field in required_fields):
            missing_fields = [
                field for field in required_fields if field not in required_fields
            ]
            logger.error(f"Missing required fields: {missing_fields}")
            return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400

        filename = request_data["dataSource"]
        print(filename, "####################")
        project_name = request_data["projectName"]
        user_email = request_data["userEmail"]

        # Read and validate input file
        filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
        try:
            with open(filepath, "rb") as file:
                file_data = file.read()
            df = pd.read_csv(io.BytesIO(file_data))
            logger.info(f"Successfully read file: {filename} with {len(df)} rows")
        except FileNotFoundError:
            logger.error(f"File not found: {filepath}")
            return jsonify({"error": f"File not found: {filename}"}), 404
        except Exception as e:
            logger.error(f"Error reading file {filename}: {str(e)}")
            return jsonify({"error": f"Error reading file: {str(e)}"}), 400

        # Upload main file to GCS
        try:
            uploader = GCSUploader(project_name)
            timestamp_folder = uploader.create_timestamp_folder()

            # Upload the main CSV file
            destination_path = f"{timestamp_folder}/{filename}"
            gcs_path = uploader.upload_to_gcs(
                file_data.decode("utf-8"), destination_path
            )
            logger.info(f"Successfully uploaded file to GCS: {gcs_path}")

            org_name = get_org_name(user_email)
            # Prepare metadata.json content
            metadata = [
                {
                    "organization": org_name,
                    "project_name": project_name,
                    "user_email": user_email,
                    "files": [
                        {
                            "file_name": filename,
                            "file_type": "csv",
                            "path": destination_path,
                        }
                    ],
                }
            ]

            # Upload metadata.json file
            metadata_json_str = json.dumps(metadata, indent=2)
            metadata_path = f"{timestamp_folder}/metadata.json"
            metadata_gcs_path = uploader.upload_to_gcs(metadata_json_str, metadata_path)
            logger.info(f"Successfully uploaded metadata to GCS: {metadata_gcs_path}")

        except Exception as e:
            logger.error(f"GCS upload failed: {str(e)}")
            return jsonify({"error": f"Failed to upload to GCS: {str(e)}"}), 500

        # Store project details (this will now validate for duplicates)
        try:
            project_id = store_or_update_user_and_project(
                user_email, project_name, timestamp_folder, filename, status="PENDING"
            )
            logger.info(f"Stored project details. Project ID: {project_id}")
        except ValueError as e:
            # Handle duplicate project name error specifically
            logger.error(f"Project validation failed: {str(e)}")
            return jsonify({"error": str(e)}), 409  # 409 Conflict status code
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

        return (
            jsonify(
                {
                    "message": "Generated EDA report successfully",
                    "gcs_path": gcs_path,
                    "project_id": project_id,
                    "project_name": project_name,
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Unexpected error in generate_eda_report: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api.route("/get-input-options")
def get_input_options():
    """
    Retrieve column headers and date ranges from a CSV file stored in Google Cloud Storage.

    Query Parameters:
        project_id: ID of the project
        user_email: Email of the user requesting the data

    Returns:
        tuple: JSON response with column options, date ranges, and HTTP status code
    """
    try:
        project_id = request.args.get("project_id")
        user_email = request.args.get("user_email")

        if not project_id or not user_email:
            logger.error("Missing required parameters: project_id or user_email")
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Missing required parameters: project_id and user_email are required",
                    }
                ),
                400,
            )

        logger.info(
            f"Fetching CSV headers and date ranges for project_id: {project_id}, user_email: {user_email}"
        )

        try:
            # Get both columns and date ranges
            csv_data = get_csv_from_gcs(user_email, project_id)

            # Handle error case
            if isinstance(csv_data, tuple) and "error" in csv_data[0]:
                return jsonify(csv_data[0]), csv_data[1]

            columns = csv_data["columns"]
            date_ranges = csv_data["date_ranges"]

            # Filter out empty or invalid column names
            options = [
                str(col)
                for col in columns
                if col and str(col).strip() and str(col) != "Unnamed: 0"
            ]

            logger.info(
                f"Successfully retrieved {len(options)} columns and {len(date_ranges)} date ranges from CSV"
            )

            return jsonify(
                {"success": True, "options": options, "date_ranges": date_ranges}
            )

        except Exception as e:
            logger.error(f"Failed to retrieve CSV from GCS: {str(e)}")
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Failed to retrieve file data: {str(e)}",
                    }
                ),
                500,
            )

    except Exception as e:
        logger.error(f"Unexpected error in get_input_options: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@api.route("/submit-form", methods=["POST"])
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
        required_fields = ["projectId", "userEmail"]
        if not all(field in training_params for field in required_fields):
            missing_fields = [
                field for field in required_fields if field not in training_params
            ]
            logger.error(f"Missing required fields: {missing_fields}")
            return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400

        project_id = training_params["projectId"]
        user_email = training_params["userEmail"]

        logger.info(
            f"Processing training request for project: {project_id}, user: {user_email}"
        )

        # Validate user existence
        try:
            user = User.query.filter_by(email=user_email).first()
            if not user:
                logger.error(f"User not found: {user_email}")
                return jsonify({"error": "User not found"}), 404

            # Validate project existence
            project = Project.query.filter_by(id=project_id, user_id=user.id).first()
            if not project:
                logger.error(
                    f"Project not found for user: {user_email}, project_id: {project_id}"
                )
                return jsonify({"error": "Project not found for this user"}), 404

            new_project_ver_id = project_id
            if project.job_id:
                print("Model already trained creating new version")
                # New project version
                project = create_new_version_of_existing_project(project, user)
                new_project_ver_id = project.id

            timestamp_folder = project.gcs_path
            filename = project.source_file_name
            source_file_path = f"gs://{BUCKET_NAME}/{timestamp_folder}/{filename}"

            logger.info(f"Starting training job for file: {source_file_path}")
            results_timestamp_folder_path = os.path.join(project.gcs_path, project.name)
            # Initialize training service and start job
            training_service = ModelTrainingService(
                results_timestamp_folder_path, source_file_path
            )
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
                return (
                    jsonify(
                        {
                            "error": "Training job started but failed to update project status",
                            "job_id": job_id,
                        }
                    ),
                    500,
                )

            return (
                jsonify(
                    {
                        "message": "Training job started successfully",
                        "result": result,
                        "project_id": new_project_ver_id,
                    }
                ),
                200,
            )

        except SQLAlchemyError as e:
            logger.error(f"Database error: {str(e)}")
            return jsonify({"error": "Database operation failed"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in start_training: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api.route("/training/status/<job_id>", methods=["GET"])
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


@api.route("/get-report", methods=["GET"])
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
        project_id = request.args.get("project_id")
        user_email = request.args.get("email")
        gcs_file_name = request.args.get("filename")
        logger.info(
            f"Report request - Project: {project_id}, User: {user_email}, File: {gcs_file_name}"
        )

        if not all([project_id, user_email]):
            logger.error("Missing required parameters")
            return (
                jsonify({"error": "Project ID and email parameters are required"}),
                400,
            )

        if not gcs_file_name:
            logger.warning("No filename provided, will use default")

        try:
            content, status_code = get_report_from_gcs(
                project_id, user_email, gcs_file_name
            )

            if status_code != 200:
                logger.error(
                    f"Failed to get report: {content.get('error', 'Unknown error')}"
                )
                return jsonify(content), status_code

            logger.info(f"Successfully retrieved report for project {project_id}")

            # Return HTML content with proper headers
            return Response(
                content["file_content"],
                mimetype="text/html",
                headers={
                    "Cache-Control": "no-cache",
                    "Content-Type": "text/html; charset=utf-8",
                },
            )

        except Exception as e:
            logger.error(f"Failed to retrieve report from GCS: {str(e)}")
            return jsonify({"error": f"Failed to retrieve report: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_report: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api.route("/get-user-projects", methods=["GET"])
def get_user_projects() -> Tuple[jsonify, int]:
    """
    Retrieve projects associated with a user's organization identified by their email address.

    Returns:
        tuple: A tuple containing:
            - A JSON response with either project data or error message
            - HTTP status code

    Query Parameters:
        email (str): The email address of the user
    """
    try:
        user_email = request.args.get("email")

        if not user_email:
            logger.warning("Request made without email parameter")
            return jsonify({"error": "Email parameter is required"}), 400

        user = User.query.filter_by(email=user_email).first()
        if not user:
            user = get_or_create_user(user_email)

        # Check status for pending projects in the organization
        pending_projects = Project.query.filter_by(
            organization=user.organization, status="PENDING"
        ).all()

        for project in pending_projects:
            logger.debug(f"Checking status for pending project: {project.job_id}")
            get_training_status(project.job_id)

        # Use the organization-based method instead of user-specific method
        projects_data, error = get_projects_for_organization(user.organization)

        if error:
            logger.error(
                f"Error retrieving projects for organization {user.organization}: {error}"
            )
            return jsonify({"error": error}), 404

        logger.info(
            f"Successfully retrieved {len(projects_data)} projects for organization {user.organization}"
        )
        return jsonify({"projects": projects_data}), 200

    except Exception as e:
        logger.exception(f"Unexpected error in get_user_projects: {str(e)}")
        return jsonify({"error": "Internal server error occurred"}), 500


@api.route("/genai-summary-files", methods=["GET"])
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
        project_id = request.args.get("project_id")
        user_email = request.args.get("email")
        file_name = request.args.get("filename")

        logger.info(
            f"Attempting to retrieve summary file. Project ID: {project_id}, "
            f"User: {user_email}, File: {file_name}"
        )

        if not all([project_id, user_email, file_name]):
            logger.warning("Missing required query parameters")
            return (
                jsonify(
                    {
                        "error": "Missing required parameters: project_id, email, and filename"
                    }
                ),
                400,
            )

        try:
            content, status_code = get_summary_files(project_id, user_email, file_name)
        except Exception as e:
            logger.warning(
                f"First attempt to get summary files failed: {str(e)}. Retrying..."
            )
            content, status_code = get_summary_files(project_id, user_email, file_name)

        if status_code != 200:
            logger.error(
                f"Failed to retrieve summary files. Status code: {status_code}"
            )
            return jsonify(content), status_code

        logger.info(f"Successfully retrieved markdown file for project {project_id}")
        return Response(
            content["file_content"],
            mimetype="text/markdown",
            headers={
                "Cache-Control": "no-cache",
                "Content-Type": "text/markdown; charset=utf-8",
            },
        )

    except Exception as e:
        logger.exception(f"Unexpected error in get_md_files: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@api.route("/get-eda-report", methods=["GET"])
def get_eda_report():
    """
    Retrieve a report from Google Cloud Storage with streaming support.
    """
    try:
        project_id = request.args.get("project_id")
        user_email = request.args.get("email")
        gcs_file_name = request.args.get("filename")
        logger.info(
            f"Report request - Project: {project_id}, User: {user_email}, File: {gcs_file_name}"
        )

        if not all([project_id, user_email]):
            logger.error("Missing required parameters")
            return (
                jsonify({"error": "Project ID and email parameters are required"}),
                400,
            )

        if not gcs_file_name:
            logger.warning("No filename provided, will use default")

        try:
            result, status_code = get_eda_report_from_gcs(
                project_id, user_email, gcs_file_name
            )
            if status_code != 200:
                logger.error(
                    f"Failed to get report: {result.get('error', 'Unknown error')}"
                )
                return jsonify(result), status_code

            logger.info(f"Streaming report for project {project_id}")

            # Stream the response
            return Response(
                stream_with_context(
                    generate_chunks(result["blob"], result["file_name"])
                ),
                mimetype="text/html",
                headers={
                    "Cache-Control": "no-cache",
                    "Content-Type": "text/html; charset=utf-8",
                    "Content-Encoding": "gzip",
                    "Transfer-Encoding": "chunked",
                },
            )

        except Exception as e:
            import logging

            logging.exception("Message")
            logger.error(f"Failed to retrieve report from GCS: {str(e)}")
            return jsonify({"error": f"Failed to retrieve report: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_report: {str(e)}")
        return jsonify({"error": str(e)}), 500


from data_science.data_science.run_agent import run_agent
from data_science.data_science.run_agent import RunAgents, get_session_stats
import asyncio

# agent_manager = AsyncAgentManager()


@api.route("/session-stats/<user_email>", methods=["GET"])
async def get_user_session_stats(user_email):
    """Get session statistics for debugging and monitoring."""
    try:
        stats = await get_session_stats(user_email)
        return jsonify(stats), 200
    except Exception as e:
        logger.error(f"Error getting session stats for {user_email}: {e}")
        return (
            jsonify(
                {
                    "error": str(e),
                    "user_email": user_email,
                    "timestamp": datetime.now().isoformat(),
                }
            ),
            500,
        )


@api.route("/qa-chatbot-v2", methods=["GET", "POST"])
async def qa_chatbot_v2():
    """Enhanced version with session management and comprehensive error handling."""
    request_start = datetime.now()
    user_email = None
    session_id = None

    try:
        # Handle both GET and POST requests
        if request.method == "GET":
            user_query = request.args.get("user_query")
            user_email = request.args.get("user_email", "default")
            app_id = request.args.get("app_id")
            data_store_ids = request.args.getlist("data_store_ids")
            session_id = request.args.get("session_id")
        else:  # POST
            data = request.get_json()
            if not data:
                logger.warning("POST request without JSON body")
                return (
                    jsonify({"error": "JSON body is required for POST requests"}),
                    400,
                )

            user_query = data.get("user_query")
            user_email = data.get("user_email", "default")
            app_id = data.get("app_id")
            data_store_ids = data.get("data_store_ids", [])
            session_id = data.get("session_id")

        # Log request details
        logger.info(
            f"Request received - user: {user_email}, session: {session_id}, app_id: {app_id}"
        )

        # Input validation
        if not user_query:
            logger.warning(f"Missing user_query from {user_email}")
            return jsonify({"error": "user_query is required"}), 400

        if not user_query.strip():
            logger.warning(f"Empty user_query from {user_email}")
            return jsonify({"error": "user_query cannot be empty"}), 400

        # Validate query length
        if len(user_query) > 10000:
            logger.warning(
                f"Query too long from {user_email}: {len(user_query)} characters"
            )
            return (
                jsonify(
                    {
                        "error": "Query too long. Maximum 10000 characters allowed.",
                        "query_length": len(user_query),
                    }
                ),
                400,
            )

        # Validate data_store_ids is a list if provided
        if data_store_ids and not isinstance(data_store_ids, list):
            logger.warning(f"Invalid data_store_ids format from {user_email}")
            return jsonify({"error": "data_store_ids must be a list"}), 400

        # Get database configuration
        try:
            database_id = get_org_name(user_email)
            table_name = get_table_name(app_id)
        except Exception as e:
            logger.error(f"Error getting configuration for {user_email}: {e}")
            return (
                jsonify(
                    {
                        "error": "Failed to retrieve user configuration",
                        "status": "error",
                    }
                ),
                500,
            )

        logger.info(
            f"Configuration - database_id: {database_id}, table_name: {table_name}"
        )

        # Run the agent with session management and timeout
        try:
            response = await asyncio.wait_for(
                run_agent(
                    user_query,
                    user_email,
                    database_id,
                    table_name,
                    app_id,
                    data_store_ids,
                    session_id,
                ),
                timeout=120.0,  # 2 minute timeout
            )
        except asyncio.TimeoutError:
            logger.error(
                f"Agent execution timed out for user {user_email}, session {session_id}"
            )
            return (
                jsonify(
                    {
                        "error": "Request timed out. Please try again with a simpler query.",
                        "timeout_seconds": 120,
                        "status": "timeout",
                    }
                ),
                408,
            )

        # Process the response
        final_res = copy.deepcopy(response)

        try:
            res, processed_data_store_ids = process_bot_response(
                final_res, data_store_ids
            )
        except Exception as e:
            logger.error(f"Error processing bot response for {user_email}: {e}")
            # Fall back to original response if processing fails
            res = response
            processed_data_store_ids = data_store_ids

        # Calculate request duration
        request_duration = (datetime.now() - request_start).total_seconds()

        # Prepare successful response
        success_response = {
            "bot_response": res,
            "rephrased_query": response.get("rephrased_query"),
            "user_email": user_email,
            "session_id": response.get("session_id"),
            "app_id": app_id,
            "data_store_ids": processed_data_store_ids,
            "database_id": database_id,
            "table_name": table_name,
            "status": "success",
            "request_duration": round(request_duration, 2),
            "execution_time": response.get("execution_time"),
            "timestamp": response.get("timestamp", datetime.now().isoformat()),
        }

        logger.info(
            f"Request completed successfully - user: {user_email}, session: {response.get('session_id')}, duration: {request_duration:.2f}s"
        )
        return jsonify(success_response), 200

    except asyncio.TimeoutError:
        logger.error(f"Agent execution timed out for user {user_email}")
        return (
            jsonify(
                {
                    "error": "Request timed out. Please try again with a simpler query.",
                    "user_email": user_email,
                    "session_id": session_id,
                    "status": "timeout",
                }
            ),
            408,
        )

    except ValueError as ve:
        logger.error(f"Validation error for user {user_email}: {ve}")
        return (
            jsonify(
                {
                    "error": f"Invalid input: {str(ve)}",
                    "user_email": user_email,
                    "session_id": session_id,
                    "status": "validation_error",
                }
            ),
            400,
        )

    except Exception as e:
        request_duration = (datetime.now() - request_start).total_seconds()
        logger.exception(f"Unexpected error in qa_chatbot_v2 for user {user_email}")
        return (
            jsonify(
                {
                    "error": f"Failed to get response: {str(e)}",
                    "user_email": user_email,
                    "session_id": session_id,
                    "status": "error",
                    "request_duration": round(request_duration, 2),
                    "timestamp": datetime.now().isoformat(),
                }
            ),
            500,
        )


# Add new endpoint for creating new sessions
@api.route("/new-session", methods=["POST"])
async def create_new_session():
    """Create a new session for the user"""
    try:
        data = request.get_json() if request.method == "POST" else {}
        user_email = (
            data.get("user_email", "default")
            if data
            else request.args.get("user_email", "default")
        )

        # Create a new session
        agent_runner = RunAgents(user_email)
        session_id = await agent_runner.create_new_session()

        return (
            jsonify(
                {
                    "session_id": session_id,
                    "user_email": user_email,
                    "status": "success",
                    "message": "New session created successfully",
                }
            ),
            200,
        )

    except Exception as e:
        logger.exception("Error creating new session")
        return (
            jsonify(
                {"error": f"Failed to create new session: {str(e)}", "status": "error"}
            ),
            500,
        )


project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "insightsmix")


@api.route("/get-all-projects", methods=["GET"])
def get_all_projects():
    """
    Get all projects

    Returns:
        JSON: list of projects
    """

    try:
        client = discoveryengine_v1.EngineServiceClient()
        parent = (
            f"projects/{project_id}/locations/global/collections/default_collection"
        )

        request = discoveryengine_v1.ListEnginesRequest(parent=parent)
        engines = client.list_engines(request=request)

        engine_ids = [
            engine.name.split("/")[-1]  # last part after "/engines/"
            for engine in engines
        ]

        return jsonify(engine_ids)

    except Exception as e:
        print(f"Error in get_all_engines_and_datastores: {str(e)}")
        return jsonify([]), 500


@api.route("/get-models-project", methods=["GET"])
def get_models_for_project():
    """
    Retrieve datastore IDs for a specific engine in a UI-friendly format.

    Query Params:
        engine_id (str, optional): The engine ID. If omitted, an error is returned.

    Returns:
        JSON: List of datastore IDs (keeping original values with datastore- prefix)
              but excluding dummy datastore IDs.
    """
    engine_id = request.args.get("engine_id")

    if not engine_id:
        return (
            jsonify(
                {
                    "error": "Engine ID not provided. Please pass `engine_id` or ensure the agent is initialized."
                }
            ),
            400,
        )

    try:
        # Create a fresh client each time
        client = discoveryengine_v1.EngineServiceClient()
        engine_name = f"projects/{project_id}/locations/global/collections/default_collection/engines/{engine_id}"

        request_obj = discoveryengine_v1.GetEngineRequest(name=engine_name)
        engine = client.get_engine(request=request_obj)

        # Filter out the unwanted dummy datastore
        filtered_data_stores = [
            ds
            for ds in engine.data_store_ids
            if ds != "dummy-chatbot-datastore_1754553084575"
        ]

        return (
            jsonify({"data_store_ids": filtered_data_stores, "engine_id": engine_id}),
            200,
        )

    except Exception as e:
        error_msg = f"Failed to retrieve data stores for engine {engine_id}: {str(e)}"
        print(f"Error in get_models_for_project: {error_msg}")
        return jsonify({"error": error_msg}), 500
