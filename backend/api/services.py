import os
import io
from google.cloud import aiplatform, storage
from datetime import datetime
import logging
from typing import Dict, Any
from api.models import User, Project
from .db import db
import pandas as pd
from ydata_profiling import ProfileReport
import base64
import pdfkit
import vertexai
import time
import gzip
from vertexai.generative_models import GenerativeModel, Part, SafetySetting
from google.auth import default
from .summary_prompt import summary_prompt
from dotenv import load_dotenv
from google.api_core import exceptions as google_exceptions
from config.logging_config import setup_logging
load_dotenv()


BUCKET_NAME = os.getenv("BUCKET_NAME")
aiplatform.init(project="insightsmix")

# Initialize GCS client
credentials, project = default()
client = storage.Client(credentials=credentials)

logger = setup_logging()

class GCSUploader:
    def __init__(self, project_name):
        """
        Initialize the GCSUploader
        """
        self.project_name = project_name

    def create_timestamp_folder(self):
        """
        Create a timestamp folder in the format: result/<project name>-YYYY-MM-DD_HH-MM-SS/
        """
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        return f"result/{self.project_name}-{timestamp}"

    def upload_to_gcs(self, file_data, destination_path):
        """
        Upload file data to GCS
        """
        try:
            bucket = client.bucket(BUCKET_NAME)
            blob = bucket.blob(destination_path)
            blob.upload_from_string(file_data, content_type='text/csv')
            return f"gs://{BUCKET_NAME}/{destination_path}"
        except Exception as e:
            raise Exception(f"GCS Upload Error: {e}")
        
        

class ModelTrainingService:
    def __init__(self, timestamp_folder="", gcs_path=""):
        self.project_id = "insightsmix"
        self.base_image_uri = "us-central1-docker.pkg.dev/insightsmix/mmm-training/mmm"
        self.location = "us-central1"
        self.timestamp_folder = timestamp_folder
        self.gcs_path = gcs_path
        
    def _create_worker_pool_specs(self, training_params: Dict[str, Any]) -> list:
        """Create worker pool specifications for the training job."""
        media = training_params.get("media")
        mediaSpend = training_params.get("mediaSpend")

        channel_names = []
        for media_name in media:
            media_name = media_name.lower().replace("_spend", "").replace("_impression", "").replace("spend", "").replace("impression", "")
            channel_names.append(media_name)

        # Correct mapping of media to channel
        CORRECT_MEDIA_TO_CHANNEL = {media[i]: f"{channel_names[i]}" for i in range(len(media))}
        CORRECT_MEDIA_SPEND_TO_CHANNEL = {mediaSpend[i]: f"{channel_names[i]}" for i in range(len(mediaSpend))}

        date_range = training_params.get('dateRange')
        
        # Convert the mappings to JSON string format
        CORRECT_MEDIA_TO_CHANNEL_JSON = str(CORRECT_MEDIA_TO_CHANNEL).replace("'", '"')
        CORRECT_MEDIA_SPEND_TO_CHANNEL_JSON = str(CORRECT_MEDIA_SPEND_TO_CHANNEL).replace("'", '"')
        
        print("timestamp_folder", self.timestamp_folder)
        return [{
            "machine_spec": {
                "machine_type": "n1-standard-16",
                "accelerator_type": "NVIDIA_TESLA_T4",
                "accelerator_count": 2,
            },
            "replica_count": 1,
            "container_spec": {
                "image_uri": self.base_image_uri,
                "args": [
                    "--project_id", self.project_id,
                    "--bucket_name", BUCKET_NAME,
                    "--data_path", self.gcs_path ,
                    "--result_dir", self.timestamp_folder,
                    "--output_path", "mmm/output",
                    "--time", training_params.get('date'),
                    "--start_date", date_range.get('start_date'),
                    "--end_date", date_range.get('end_date'),
                    "--geo", training_params.get('geo'),
                    "--controls", ",".join(training_params.get('control_variable', [])),
                    "--population", training_params.get('population', []),
                    "--kpi", training_params.get('kpi', []),
                    "--revenue_per_kpi", training_params.get('revenuePerKpi', []),
                    "--media", ",".join(training_params.get('media', [])),
                    "--media_spend", ",".join(training_params.get('mediaSpend', [])),
                    "--correct_media_to_channel", CORRECT_MEDIA_TO_CHANNEL_JSON,
                    "--correct_media_spend_to_channel", CORRECT_MEDIA_SPEND_TO_CHANNEL_JSON,
                ]
            }
        }]


    def start_training_job(self, training_params: Dict[str, Any]) -> Dict[str, Any]:
        """Start a new training job with the provided parameters."""
        try:
            worker_pool_specs = self._create_worker_pool_specs(training_params)
            project_name = training_params.get("projectName")

            job = aiplatform.CustomJob(
                display_name=f'{project_name}-{datetime.now().strftime("%Y%m%d-%H%M%S")}',
                worker_pool_specs=worker_pool_specs,
                staging_bucket=f'gs://{BUCKET_NAME}'
            )
            
            job.submit()

            with open("workpool.txt", "a") as f:
                f.write(job.resource_name + "\n")
                f.write(str(worker_pool_specs))

            return {
                "status": "submitted",
                "job_id": job.resource_name,
                "display_name": job.display_name,
            }
            
        except Exception as e:
            logging.error(f"Error starting training job: {str(e)}")
            raise


    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of a training job."""
        try:
            client_options = {"api_endpoint": "us-central1-aiplatform.googleapis.com"}
            client = aiplatform.gapic.JobServiceClient(client_options=client_options)
            name = client.custom_job_path(
                project=self.project_id, location=self.location, custom_job=job_id
            )
            response = client.get_custom_job(name=name)
            return {
                "job_id": response.name,
                "display_name": response.display_name,
                "state": response.state.name,
                "create_time": response.create_time.isoformat() if response.create_time else None,
                "start_time": response.start_time.isoformat() if response.start_time else None,
                "end_time": response.end_time.isoformat() if response.end_time else None,
                "error": response.error.message if response.error else None,
            }
        except Exception as e:
            logging.error(f"Error getting job status: {str(e)}")
            raise

def get_org_name(email):
    domain = email.split('@')[1] if '@' in email else 'unknown'
    return domain 

def get_or_create_user(email):
    """Retrieve a user by email or create a new one, inferring organization from email domain."""
    user = User.query.filter_by(email=email).first()
    if not user:
        # Extract organization from email domain
        org = get_org_name(email)
        
        user = User(email=email, organization=org)
        db.session.add(user)
        db.session.commit()
    return user
        

def get_projects_for_organization(organization):
    """
    Get all projects for a specific organization
    
    Args:
        organization (str): The organization name
        
    Returns:
        tuple: (projects_data, error)
    """
    try:
        projects = Project.query.filter_by(organization=organization, status="SUCCESS").all()
        
        projects_data = []
        for project in projects:
            project_dict = {
                'project_id': project.id,
                'name': project.name,
                'gcs_path': project.gcs_path,
                'user_id': project.user_id,
                'organization': project.organization,
                'status': project.status.value,
                'created_at': project.created_at.isoformat()
            }
            projects_data.append(project_dict)
        
        return projects_data, None
        
    except Exception as e:
        logger.exception(f"Error retrieving projects for organization {organization}: {str(e)}")
        return None, f"Error retrieving projects: {str(e)}"



def upload_html_to_gcs(html_content, destination_blob_name):
    """Uploads an HTML string to the Google Cloud Storage bucket."""
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_string(html_content, content_type="text/html", timeout=300)
    print(f"HTML content uploaded to {destination_blob_name}.")


def create_and_upload_eda(data_file_path, timestamp_folder):
    try:
        df = pd.read_csv(data_file_path)
        size = os.path.getsize(data_file_path)
        if size > 5000000:
            print("Size is greater than 5mb")
            profile = ProfileReport(
                df,
                minimal=True
            )
        else:
            print("Started EDA report generating...")
            profile = ProfileReport(df, title="EDA Report", explorative=True)
        html_content = profile.to_html()
        destination_blob_name = f"{timestamp_folder}/eda_report.html"
        upload_html_to_gcs(html_content, destination_blob_name)
    except:
        import logging
        logging.exception("Message")


# Updated helper function for storing projects with versioning
def store_or_update_user_and_project(user_email, project_name, gcs_path, filename, status="PENDING"):
    """
    Store or update user and project information with automatic versioning.
    
    Args:
        user_email (str): Email of the user
        project_name (str): Base name of the project (e.g., "twc")
        gcs_path (str): GCS path for the project
        filename (str): Source file name
        status (str): Project status
        
    Returns:
        int: Project ID of the created/updated project
        
    Raises:
        ValueError: If user organization is not found
    """
    try:
       # Get or create user
        user = get_or_create_user(user_email)
        print(f"User created/found: {user}")
        
        # Check if project with same name already exists in the same organization
        existing_project = Project.query.filter_by(
            base_name=project_name,
            organization=user.organization
        ).first()
        
        if existing_project:
            error_msg = f"Project '{project_name}' already exists in organization '{user.organization}'"
            print(f"Validation error: {error_msg}")
            raise ValueError(error_msg)
        
        # Get next version number for this project
        next_version = Project.get_next_version_number(project_name, user.id)
        
        # Create timestamp string (format: YYYYMMDD_HHMMSS)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")
        
        # Create versioned name with timestamp
        versioned_name = f"{project_name}_version_{next_version}_{timestamp}"
        
        # Create new project version
        new_project = Project(
            base_name=project_name,
            name=versioned_name,
            version=next_version,
            source_file_name=filename,
            gcs_path=gcs_path,
            user_id=user.id,
            organization=user.organization,
            status=status
        )
        
        db.session.add(new_project)
        db.session.commit()
        
        return new_project.id
        
    except Exception as e:
        db.session.rollback()
        raise e
    
def create_new_version_of_existing_project(project, user, status="PENDING"):
    try:
        # Get next version number for this project
        next_version = Project.get_next_version_number(project.base_name, user.id)
        
        # Create timestamp string (format: YYYYMMDD_HHMMSS)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S")
        
        # Create versioned name with timestamp
        versioned_name = f"{project.base_name}_version_{next_version}_{timestamp}"
        
        # Create new project version
        new_project = Project(
            base_name=project.base_name,
            name=versioned_name,
            version=next_version,
            source_file_name=project.source_file_name,
            gcs_path=project.gcs_path,
            user_id=user.id,
            organization=user.organization,
            status=status
        )
        
        db.session.add(new_project)
        db.session.commit()
        
        return new_project
        
    except Exception as e:
        db.session.rollback()
        raise e


def update_job_status(state, job_id):
    # Retrieve the project using the job_id
    project = Project.query.filter_by(job_id=job_id).first()

    new_status = None
    if state == "JOB_STATE_SUCCEEDED":
        new_status = "SUCCESS"
    elif state == "JOB_STATE_FAILED":
        new_status = "FAILED"

    if project and new_status:
        # Update the status of the project
        project.status = new_status
        db.session.commit()
        print(f"Updated project {job_id} status to {new_status}.")


def get_report_from_gcs(project_id, user_email, gcs_file_name):
    try:
        print("Searching for project_id:", project_id)  # Add this debug line
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return {'error': 'User not found'}, 404

        # Add debug query
        all_projects = Project.query.filter_by(organization=user.organization).all()
        print("All projects for user:", [(p.id, p.name) for p in all_projects])
            
        print(project_id, user.organization, "------------")
        project = Project.query.filter_by(id=project_id, organization=user.organization).first()
        if not project:
            return {'error': 'Project not found for this user'}, 404
        gcs_path = os.path.join(project.gcs_path, project.name)
        file_path_in_gcs = os.path.join(gcs_path, gcs_file_name)

        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(file_path_in_gcs)

        if not blob.exists():
            return {'error': 'File not found in GCS'}, 404

        # Download and decode the content with proper encoding
        file_content = blob.download_as_text(encoding='utf-8')
        
        if gcs_file_name == "MMM_summary.md" or gcs_file_name == "MSO_summary.md":
            file_content = file_content.replace("\n*\n", "*").replace("\n**\n", "**")

        if gcs_file_name == "eda_report.html":
            file_content = file_content.replace("Pandas Profiling Report", "EDA Report")
        return {"file_content": file_content}, 200

    except Exception as e:
        print(f"Error in get_eda_report_from_gcs: {str(e)}")
        return {'error': 'Internal server error occurred'}, 500


def generate_pdf_summary(input_file_path, summary_file_path):
    """
    Download HTML from GCS, convert to PDF, and generate summary using Gemini

    Args:
        file_path (str): Path to the HTML file in the bucket
    """
    try:
        # Initialize GCS client
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(input_file_path)
        
        # Create a temporary file to store the HTML content
        temp_html = 'temp_output.html'
        temp_pdf = 'temp_output.pdf'

        # Download the file from GCS
        blob.download_to_filename(temp_html)

        # Configure pdfkit options
        options = {
            'encoding': 'UTF-8',
            'enable-local-file-access': True,
            'disable-external-links': True
        }

        # config = pdfkit.configuration(wkhtmltopdf='/usr/local/bin/wkhtmltopdf')
        pdfkit.from_file(temp_html, temp_pdf, options=options)

        # Read PDF file and encode to base64
        with open(temp_pdf, 'rb') as pdf_file:
            pdf_content = base64.b64encode(pdf_file.read()).decode()

        # Initialize Vertex AI
        vertexai.init(project="insightsmix", location="us-central1")
        model = GenerativeModel("gemini-1.5-pro-002")

        # Create document part from PDF
        document1 = Part.from_data(
            mime_type="application/pdf",
            data=base64.b64decode(pdf_content)
        )

        # Define prompt for analysis
        text1 = summary_prompt

        # Configure generation parameters
        generation_config = {
            "max_output_tokens": 8192,
            "temperature": 1,
            "top_p": 0.95,
        }

        # Configure safety settings
        safety_settings = [
            SafetySetting(
                category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=SafetySetting.HarmBlockThreshold.OFF
            ),
            SafetySetting(
                category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=SafetySetting.HarmBlockThreshold.OFF
            ),
            SafetySetting(
                category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=SafetySetting.HarmBlockThreshold.OFF
            ),
            SafetySetting(
                category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=SafetySetting.HarmBlockThreshold.OFF
            ),
        ]

        # Generate content
        responses = model.generate_content(
            [document1, text1],
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=True,
        )
        bucket = client.get_bucket(BUCKET_NAME)

        # Define the file path in GCS
        blob = bucket.blob(summary_file_path)
        line_count = 0
        with blob.open("w") as file:
            for response in responses:
                if line_count:
                    # Write each response to the file on GCS
                    file.write(response.text + "\n")
                    line_count += 1
                else:
                    file.write(response.text)
    
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        raise
    finally:
        try:
            if os.path.exists(temp_html):
                os.remove(temp_html)
            if os.path.exists(temp_pdf):
                os.remove(temp_pdf)
        except:
            pass


def get_summary_files(project_id, user_email, gcs_file_name):
    try:
        result, status = get_report_from_gcs(project_id, user_email, gcs_file_name)

        # If there was an error, return it
        if 'error' in result:
            if gcs_file_name == "MMM_summary.md":
                file_name = "model_summary.html"
            if gcs_file_name == "MSO_summary.md":
                file_name = "optimization_output.html"

            user = User.query.filter_by(email=user_email).first()
            if not user:
                return {'error': 'User not found'}, 404
            
            project = Project.query.filter_by(id=project_id, organization=user.organization).first()
            if not project:
                return {'error': 'Project not found for this user'}, 404

            gcs_path = os.path.join(project.gcs_path, project.name)
            input_file_path = os.path.join(gcs_path, file_name)
            summary_file_path = os.path.join(gcs_path, gcs_file_name) 

            generate_pdf_summary(input_file_path, summary_file_path)
            time.sleep(10)
            result, status = get_report_from_gcs(project_id, user_email, gcs_file_name)
        return result, status
    except:
        import logging
        logging.exception("Message")


def get_csv_from_gcs(user_email, project_id):
    """
    Fetch CSV file from Google Cloud Storage and return both columns and date ranges
    """
    try:
        # Extract bucket and blob names from gcs_path
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return {'error': 'User not found'}, 404

        project = Project.query.filter_by(id=project_id, user_id=user.id).first()
        if not project:
            return {'error': 'Project not found for this user'}, 404

        timestamp_folder = project.gcs_path
        filename = project.source_file_name
        source_file_path = f"{timestamp_folder}/{filename}"
        
        bucket = client.get_bucket(BUCKET_NAME)
        blob = bucket.blob(source_file_path)
        
        # Download as string
        content = blob.download_as_string()
        # Read CSV content
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        
        # Get column names
        columns = df.columns.tolist()
        
        # Extract date ranges for date columns
        date_ranges = extract_date_ranges(df, columns)
        
        return {
            'columns': columns,
            'date_ranges': date_ranges
        }
        
    except Exception as e:
        raise Exception(f"Error reading CSV from GCS: {str(e)}")

def is_date_column(column_name):
    """
    Check if a column name suggests it contains date/time data
    """
    date_keywords = ['date', 'time', 'timestamp', 'datetime', 'day', 'month', 'year']
    column_lower = column_name.lower()
    return any(keyword in column_lower for keyword in date_keywords)

def extract_date_ranges(df, columns):
    """
    Extract min and max dates from date columns in the DataFrame
    """
    date_ranges = {}
    
    for column in columns:
        if is_date_column(column):
            try:
                # Skip if column has too many null values
                if df[column].isnull().sum() / len(df) > 0.5:
                    continue
                
                # Try to convert to datetime
                date_series = pd.to_datetime(df[column], errors='coerce')
                
                # Skip if conversion failed for most values
                if date_series.isnull().sum() / len(date_series) > 0.5:
                    continue
                
                # Get min and max dates
                min_date = date_series.min()
                max_date = date_series.max()
                
                # Skip if we couldn't get valid dates
                if pd.isna(min_date) or pd.isna(max_date):
                    continue
                
                # Format dates as strings
                date_ranges[column] = {
                    'start_date': min_date.strftime('%Y-%m-%d'),
                    'end_date': max_date.strftime('%Y-%m-%d')
                }
                
                logger.info(f"Extracted date range for column '{column}': {date_ranges[column]}")
                
            except Exception as e:
                logger.warning(f"Could not extract date range for column '{column}': {str(e)}")
                continue
    
    return date_ranges

    

def generate_chunks(blob, file_name, chunk_size=1024*1024):
    """Generator function to stream and process content in chunks"""
    try:
        # Get the total size of the blob
        blob.reload()
        total_size = blob.size
        offset = 0
        buffer = ""

        while offset < total_size:
            # Calculate the end position for this chunk
            end = min(offset + chunk_size - 1, total_size - 1)
            
            try:
                chunk = blob.download_as_bytes(start=offset, end=end)
            except google_exceptions.RequestRangeNotSatisfiable:
                # If we get a range error, try to download the remaining content
                chunk = blob.download_as_bytes(start=offset)
                
            if not chunk:
                break
                
            # Decode chunk and add to buffer
            try:
                current_content = chunk.decode('utf-8')
                buffer += current_content
                
                # Process complete lines to avoid cutting HTML/text in middle
                lines = buffer.split('\n')
                
                # Keep the last potentially incomplete line in buffer
                buffer = lines[-1]
                complete_lines = lines[:-1]
                
                if complete_lines:
                    content = '\n'.join(complete_lines)
                    compressed_chunk = gzip.compress(content.encode('utf-8'))
                    yield compressed_chunk
                
                offset += len(chunk)
                
            except UnicodeDecodeError as e:
                logger.error(f"Unicode decode error at offset {offset}: {str(e)}")
                # Skip this chunk and continue with the next one
                offset += len(chunk)
                buffer = ""
                continue
                
    except Exception as e:
        logger.error(f"Error in generate_chunks: {str(e)}")
        raise

    # Process remaining buffer if any
    if buffer:
        try:
            compressed_chunk = gzip.compress(buffer.encode('utf-8'))
            yield compressed_chunk
        except Exception as e:
            logger.error(f"Error processing final buffer: {str(e)}")


def get_eda_report_from_gcs(project_id, user_email, gcs_file_name):
    try:
        print("Searching for project_id:", project_id)
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return {'error': 'User not found'}, 404

        all_projects = Project.query.filter_by(user_id=user.id).all()
        print("All projects for user:", [(p.id, p.name) for p in all_projects])
            
        project = Project.query.filter_by(id=project_id, user_id=user.id).first()
        if not project:
            return {'error': 'Project not found for this user'}, 404

        gcs_path = project.gcs_path
        file_path_in_gcs = os.path.join(gcs_path, gcs_file_name)
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(file_path_in_gcs)

        if not blob.exists():
            return {'error': 'File not found in GCS'}, 404

        # Instead of downloading entire content, return blob object for streaming
        return {"blob": blob, "file_name": gcs_file_name}, 200

    except Exception as e:
        print(f"Error in get_report_from_gcs: {str(e)}")
        return {'error': 'Internal server error occurred'}, 500