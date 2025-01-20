import argparse
import os
import numpy as np
import pandas as pd
import tensorflow as tf
import tensorflow_probability as tfp
import io
import json
from google.cloud import storage
import logging
import sys
import tempfile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('meridian_mmm.log')
    ]
)
logger = logging.getLogger(__name__)

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '0'

from meridian import constants
from meridian.data import load
from meridian.model import model
from meridian.model import spec
from meridian.model import prior_distribution
from meridian.analysis import summarizer
from meridian.analysis import optimizer

def load_data_from_gcs(bucket_name, data_path):
    """Load CSV data from Google Cloud Storage bucket."""
    try:
        full_path = data_path
        df = pd.read_csv(full_path)
        df.to_csv("geo_media.csv", index=False)
        logger.info("Direct GCS loading successful")
        return df
    except Exception as e:
        logger.error(f"Failed to load data from GCS: {e}")
        raise

def prepare_data_loader(df, time, geo, controls, population, kpi, revenue_per_kpi, media, media_spend, correct_media_to_channel, correct_media_spend_to_channel):
    """Prepare data loader for Meridian model using dynamic column mapping."""
    logger.info("Preparing data loader with dynamic column mapping...")

    # Convert JSON strings to Python dictionaries
    # media = json.loads(media_json)
    # media_spend = json.loads(media_spend_json)

    # Set up CoordToColumns using the column_mapping
    # coord_to_columns = load.CoordToColumns(
    #     time=time,
    #     geo=geo,
    #     controls=controls.split(','),
    #     population=population,
    #     kpi=kpi,
    #     revenue_per_kpi=revenue_per_kpi,
    #     media=media.split(','),
    #     media_spend=media_spend.split(','),
    # )
    coord_to_columns = load.CoordToColumns(
    **{
        key: value
        for key, value in {
            "time": time,
            "geo": geo,
            "controls": controls.split(',') if controls else None,
            "population": population,
            "kpi": kpi,
            "revenue_per_kpi": revenue_per_kpi,
            "media": media.split(',') if media else None,
            "media_spend": media_spend.split(',') if media_spend else None,
        }.items()
        if value not in (None, "", [])
    }
)


    correct_media_to_channel = json.loads(correct_media_to_channel)
    correct_media_spend_to_channel = json.loads(correct_media_spend_to_channel)
    # Create media to channel mappings
  
    return load.CsvDataLoader(
        csv_path="geo_media.csv",
        kpi_type='non_revenue',
        coord_to_columns=coord_to_columns,
        media_to_channel=correct_media_to_channel,
        media_spend_to_channel=correct_media_spend_to_channel
    )

def train_meridian_model(data_loader, roi_mu=0.2, roi_sigma=0.9, 
                          n_chains=3, n_adapt=200, n_burnin=200, n_keep=500):
    """
    Train Meridian Model with reduced parameters for faster testing
    """
    logger.info("Initializing model training")
    prior = prior_distribution.PriorDistribution(
        roi_m=tfp.distributions.LogNormal(roi_mu, roi_sigma, name=constants.ROI_M)
    )
    model_spec = spec.ModelSpec(prior=prior)

    mmm = model.Meridian(input_data=data_loader, model_spec=model_spec)
    mmm.sample_prior(n_keep)
    logger.info("Starting model posterior sampling...")
    mmm.sample_posterior(n_chains=n_chains, n_adapt=n_adapt, n_burnin=n_burnin, n_keep=n_keep)
    
    logger.info("Model posterior sampling completed")
    return mmm


def upload_to_gcs(local_file_path, bucket_name, destination_blob_name):
    """
    Uploads a file to Google Cloud Storage.

    Args:
        local_file_path (str): Path to the local file.
        bucket_name (str): Name of the GCS bucket.
        destination_blob_name (str): Destination path in the GCS bucket.
    """
    try:
        # Initialize a storage client
        client = storage.Client()

        # Access the bucket
        bucket = client.bucket(bucket_name)

        # Create a blob object for the model file
        blob = bucket.blob(destination_blob_name)

        # Upload the file to GCS
        blob.upload_from_filename(local_file_path)
        logger.info(f"File successfully uploaded to gs://{bucket_name}/{destination_blob_name}")
    except Exception as e:
        logger.error(f"Error uploading file to GCS: {e}")
        raise


def main(project_id, bucket_name, data_path, result_dir,output_path, time, geo, controls, population, kpi, revenue_per_kpi, media, media_spend, correct_media_to_channel, correct_media_spend_to_channel):
    # Log the received arguments for debugging
    logger.info(f"Received project_id: {project_id}")
    logger.info(f"Received bucket_name: {bucket_name}")
    logger.info(f"Received data_path: {data_path}")
    logger.info(f"Received output_path: {output_path}")
    # Log the entire column_mapping dictionary
    logger.info(f"time: {time}")
    logger.info(f"geo: {geo}")
    
    # Log the 'controls' variable as a list
    logger.info(f"Controls: {controls}")
    logger.info(f"population: {population}")
    logger.info(f"kpi: {kpi}")
    logger.info(f"revenue_per_kpi: {revenue_per_kpi}")
    
    # Log the media and media_spend variables as lists
    logger.info(f"Media: {media}")
    logger.info(f"Media Spend: {media_spend}")
    
    # Log the 'correct_media_to_channel' and 'correct_media_spend_to_channel' as dictionaries
    logger.info(f"Correct Media to Channel: {correct_media_to_channel}")
    logger.info(f"Correct Media Spend to Channel: {media_spend}")

    
    # Convert JSON strings back to Python objects
    # correct_media_to_channel = json.loads(correct_media_to_channel)
    # correct_media_spend_to_channel = json.loads(correct_media_spend_to_channel)
   
    
    """Main function to train and save the Meridian Media Mix Model."""
    os.makedirs(output_path, exist_ok=True)
    logger.info("Loading data...")
    df = load_data_from_gcs(bucket_name, data_path)

    # Prepare column mapping
    data_loader = prepare_data_loader(df, time, geo, controls, population, kpi, revenue_per_kpi, media, media_spend, correct_media_to_channel, correct_media_spend_to_channel)
    data_loader = data_loader.load()

    # Train model
    mmm = train_meridian_model(data_loader)

    # Save model
    with tempfile.TemporaryDirectory() as tmp_dir:
        local_model_path = os.path.join(tmp_dir, 'saved_mmm.pkl')
        
        # Save the model locally first
        model.save_mmm(mmm, local_model_path)
        logger.info(f"Model saved locally: {local_model_path}")

        # Upload model to GCS
        destination_model_blob = f'{result_dir}/saved_mmm.pkl'
        upload_to_gcs(local_model_path, bucket_name, destination_model_blob)

        # Create and save model summary
        logger.info("Generating and saving model summary...")
        mmm_summarizer = summarizer.Summarizer(mmm)
        local_summary_path = os.path.join( '2021-01-25/model_summary.html')
        start_date = '2021-01-25'
        end_date = '2024-01-15'
        mmm_summarizer.output_model_results_summary('model_summary.html', start_date, end_date)

        # Upload summary to GCS
        # summary_destination_blob = 'result/model_summary.html'
        summary_destination_blob = f'result/{os.path.basename(result_dir)}/model_summary.html'

        upload_to_gcs(local_summary_path, bucket_name, summary_destination_blob)
        summary_destination_blob = 'result/optimization_output.html'
        budget_optimizer = optimizer.BudgetOptimizer(mmm)
        optimization_results = budget_optimizer.optimize()
        local_optimization_output_path = os.path.join( 'optimization_output/')
        # optimization_destination_blob = f'result/{os.path.basename(result_dir)}/'
        optimization_destination_blob = f'result/{os.path.basename(result_dir)}/optimization_output.html'
        optimization_results.output_optimization_summary('optimization_output.html', local_optimization_output_path)
        upload_to_gcs(local_optimization_output_path+'optimization_output.html', bucket_name, optimization_destination_blob)

    logger.info(f"Model and summary uploaded to GCS bucket '{bucket_name}' in 'model' and 'result' folders.")
    logger.info("Meridian Media Mix Model Training completed successfully.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Meridian Media Mix Model Training')
    
    # Required arguments
    parser.add_argument('--project_id', required=True, help='Google Cloud Project ID')
    parser.add_argument('--bucket_name', required=True, help='GCS Bucket Name')
    parser.add_argument('--data_path', required=True, help='Path to input CSV in GCS bucket')
    parser.add_argument('--result_dir', required=True, help='Path to save all the artifacts related to model in GCS bucket')
    parser.add_argument('--output_path', required=True, help='Path to save model and results')
    
    # New arguments
    parser.add_argument('--time', required=True, help='Time column')
    parser.add_argument('--geo', required=True, help='Geo column')
    parser.add_argument('--controls', required=True, help='Comma-separated list of control variables')
    parser.add_argument('--population', required=True, help='Population column')
    parser.add_argument('--kpi', required=True, help='KPI column')
    parser.add_argument('--revenue_per_kpi', required=True, help='Revenue per KPI column')
    parser.add_argument('--media', required=True, help='Comma-separated list of media columns')
    parser.add_argument('--media_spend', required=True, help='Comma-separated list of media spend columns')
    parser.add_argument('--correct_media_to_channel', required=True, help='JSON string for correct media to channel mapping')
    parser.add_argument('--correct_media_spend_to_channel', required=True, help='JSON string for correct media spend to channel mapping')

    # Parse arguments
    args = parser.parse_args()

    # Call main function with parsed arguments
    try:
        main(
            args.project_id, args.bucket_name, args.data_path,args.result_dir, args.output_path, 
            args.time, args.geo, args.controls, 
            args.population, args.kpi, args.revenue_per_kpi, args.media, 
            args.media_spend, args.correct_media_to_channel, args.correct_media_spend_to_channel
        )
    except Exception as e:
        logger.error(f"Training process failed: {e}", exc_info=True)
        raise
