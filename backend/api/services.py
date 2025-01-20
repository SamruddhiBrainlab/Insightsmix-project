import os
from google.cloud import aiplatform, storage
from datetime import datetime
import logging
from typing import Dict, Any
from api.models import User, Project
from .db import db
import pandas as pd
from ydata_profiling import ProfileReport
from google.cloud import storage
import base64
import pdfkit
import vertexai
import time
from vertexai.generative_models import GenerativeModel, Part, SafetySetting

from .summary_prompt import summary_prompt
from dotenv import load_dotenv
load_dotenv()

BUCKET_NAME = os.getenv("BUCKET_NAME")
aiplatform.init(project="insightsmix")
# Initialize GCS client
client = storage.Client()


class GCSUploader:
    def __init__(self, project_name):
        """
        Initialize the GCSUploader
        """
        self.storage_client = storage.Client()
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
            bucket = self.storage_client.bucket(BUCKET_NAME)
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

        # Correct mapping of media to channel
        CORRECT_MEDIA_TO_CHANNEL = {media[i]: f"Channel_{i}" for i in range(len(media))}
        CORRECT_MEDIA_SPEND_TO_CHANNEL = {mediaSpend[i]: f"Channel_{i}" for i in range(len(mediaSpend))}

        # Convert the mappings to JSON string format
        CORRECT_MEDIA_TO_CHANNEL_JSON = str(CORRECT_MEDIA_TO_CHANNEL).replace("'", '"')
        CORRECT_MEDIA_SPEND_TO_CHANNEL_JSON = str(CORRECT_MEDIA_SPEND_TO_CHANNEL).replace("'", '"')

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
                    "--time", ",".join(training_params.get('time')),
                    "--geo", ",".join(training_params.get('geo')),
                    "--controls", ",".join(training_params.get('controls', [])),
                    "--population", ",".join(training_params.get('population', [])),
                    "--kpi", ",".join(training_params.get('kpi', [])),
                    "--revenue_per_kpi", ",".join(training_params.get('revenuePerKpi', [])),
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


def get_or_create_user(email):
    """Retrieve a user by email or create a new one."""
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(email=email)
        db.session.add(user)
        db.session.commit()
    return user

def create_project(user_id, project_name, gcs_path):
    """Create a new project for a user."""
    project = Project(
        name=project_name,
        gcs_path=gcs_path,
        user_id=user_id,
        created_at=datetime.utcnow()
    )
    db.session.add(project)
    db.session.commit()
    return project
        

def get_projects_for_user(user_email):
    try:
        # Retrieve the user by email
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return None, "No projects created yet"
        
        # Query projects for the user with status 'Success'
        projects = Project.query.filter_by(user_id=user.id, status="SUCCESS").all()
        # Format the project data for the response
        projects_data = [
            {
                'job_id': project.job_id,
                'name': project.name,
                'gcs_path': project.gcs_path,
                'status': str(project.status),
                'created_at': project.created_at.isoformat()
            }
            for project in projects
        ]
        
        return projects_data, None

    except Exception as e:
        print(f"Error in get_projects_for_user: {str(e)}")
        return None, "Error retrieving projects"



def upload_html_to_gcs(html_content, destination_blob_name):
    """Uploads an HTML string to the Google Cloud Storage bucket."""
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_string(html_content, content_type="text/html")
    print(f"HTML content uploaded to {destination_blob_name}.")


def create_and_upload_eda(data_file_path, timestamp_folder):
    try:
        df = pd.read_csv(data_file_path)
        profile = ProfileReport(df, title="Pandas Profiling Report", explorative=True)
        html_content = profile.to_html()

        destination_blob_name = f"{timestamp_folder}/eda_report.html"
        upload_html_to_gcs(html_content, destination_blob_name)
    except:
        import logging
        logging.exception("Message")


def store_or_update_user_and_project(user_email, project_name, timestamp_folder, job_id, status="PENDING"):
    user = get_or_create_user(user_email)
    project = Project.query.get(job_id)
    
    if not project:
        project = Project(
            job_id=job_id,
            name=project_name,
            gcs_path=timestamp_folder,
            user_id=user.id,
            status=status
        )
        db.session.add(project)
    else:
        project.name = project_name
        project.gcs_path = timestamp_folder
        project.status = status
    
    db.session.commit()
    return project


def update_job_status(state, job_id):
    # Retrieve the project using the job_id
    project = Project.query.get(job_id)

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
    else:
        print(f"Project with job_id {job_id} not found.")


def get_report_from_gcs(job_id, user_email, gcs_file_name):
    try:
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return {'error': 'User not found'}, 404
        print(job_id)
        project = Project.query.filter_by(job_id=job_id, user_id=user.id).first()
        if not project:
            return {'error': 'Project not found for this user'}, 404

        gcs_path = project.gcs_path
        file_path_in_gcs = os.path.join(gcs_path, gcs_file_name)

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(file_path_in_gcs)

        if not blob.exists():
            return {'error': 'File not found in GCS'}, 404

        # Download and decode the content with proper encoding
        file_content = blob.download_as_text(encoding='utf-8')
        
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
        storage_client = storage.Client()
        bucket = storage_client.bucket(BUCKET_NAME)
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

        # Convert HTML to PDF
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

        with blob.open("w") as file:
            for response in responses:
                # Write each response to the file on GCS
                file.write(response.text + "\n")
    
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


def get_summary_files(job_id, user_email, gcs_file_name):
    try:
        result, status = get_report_from_gcs(job_id, user_email, gcs_file_name)

        # If there was an error, return it
        if 'error' in result:
            if gcs_file_name == "MMM_summary.md":
                file_name = "model_summary.html"
            if gcs_file_name == "MSO_summary.md":
                file_name = "optimization_output.html"

            user = User.query.filter_by(email=user_email).first()
            if not user:
                return {'error': 'User not found'}, 404
            
            project = Project.query.filter_by(job_id=job_id, user_id=user.id).first()
            if not project:
                return {'error': 'Project not found for this user'}, 404

            gcs_path = project.gcs_path
            input_file_path = os.path.join(gcs_path, file_name)
            summary_file_path = os.path.join(gcs_path, gcs_file_name) 

            generate_pdf_summary(input_file_path, summary_file_path)
            time.sleep(10)
            result, status = get_report_from_gcs(job_id, user_email, gcs_file_name)
        return result, status
    except:
        import logging
        logging.exception("Message")