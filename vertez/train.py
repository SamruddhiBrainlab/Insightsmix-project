import argparse
import os
import numpy as np
import pandas as pd
import tensorflow as tf
import tensorflow_probability as tfp
import json
from google.cloud import storage
import logging
import sys
import tempfile
from utility import *

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
from meridian.analysis import visualizer

def get_prior_parameter_dict(prior_dist):
    """Return a dictionary with all prior parameters"""
    prior_params = {}

    for attr_name in dir(prior_dist):
        if not attr_name.startswith('_') and hasattr(prior_dist, attr_name):
            attr_value = getattr(prior_dist, attr_name)

            if hasattr(attr_value, 'parameters') and hasattr(attr_value, 'name'):
                prior_params[attr_name] = {
                    'distribution_type': type(attr_value).__name__,
                    'parameters': dict(attr_value.parameters),
                    'name': attr_value.name
                }

    return prior_params

def load_data_from_gcs(bucket_name, data_path):
    """Load CSV data from Google Cloud Storage bucket."""
    try:
        full_path = data_path
        df = pd.read_csv(full_path)
        df.to_csv("geo_media.csv", index=False)
        logger.info("Direct GCS loading successful")
        return df
    except Exception as e:
        logger.info(f"Failed to load data from GCS: {e}")
        raise

def prepare_data_loader(df, time, geo, controls, population, kpi, revenue_per_kpi, 
                        media, media_spend, organic_media, outcome_type,
                        reach, frequency, rf_spend,
                        correct_media_to_channel, correct_media_spend_to_channel,
                        correct_reach_to_channel, correct_frequency_to_channel, 
                        correct_rf_spend_to_channel):
    """Prepare data loader for Meridian model with reach/frequency support."""
    logger.info("Preparing data loader with reach/frequency support...")
    try:
        def is_valid(value):
            return value not in (None, "", []) and value != ['']

        # Build coordinate columns dictionary
        coord_dict = {
            "time": time,
            "geo": geo,
        }
        
        # Add optional fields
        if is_valid(controls):
            coord_dict["controls"] = controls.split(',') if isinstance(controls, str) else controls
        if is_valid(population):
            coord_dict["population"] = population
        
        coord_dict["kpi"] = kpi
        
        if is_valid(revenue_per_kpi):
            coord_dict["revenue_per_kpi"] = revenue_per_kpi
        
        # Add regular media channels
        if is_valid(media):
            coord_dict["media"] = media.split(',') if isinstance(media, str) else media
        if is_valid(media_spend):
            coord_dict["media_spend"] = media_spend.split(',') if isinstance(media_spend, str) else media_spend
        
        # Add organic media
        if is_valid(organic_media):
            coord_dict["organic_media"] = organic_media.split(',') if isinstance(organic_media, str) else organic_media
        
        # Add reach/frequency channels
        if is_valid(reach):
            coord_dict["reach"] = reach.split(',') if isinstance(reach, str) else reach
        if is_valid(frequency):
            coord_dict["frequency"] = frequency.split(',') if isinstance(frequency, str) else frequency
        if is_valid(rf_spend):
            coord_dict["rf_spend"] = rf_spend.split(',') if isinstance(rf_spend, str) else rf_spend

        coord_to_columns = load.CoordToColumns(**coord_dict)
        
        # Parse JSON mappings
        correct_media_to_channel = json.loads(correct_media_to_channel) if isinstance(correct_media_to_channel, str) else correct_media_to_channel
        correct_media_spend_to_channel = json.loads(correct_media_spend_to_channel) if isinstance(correct_media_spend_to_channel, str) else correct_media_spend_to_channel
        
        logger.info(f"coord_to_columns: {coord_to_columns}")
        logger.info(f"correct_media_to_channel: {correct_media_to_channel}")
        logger.info(f"correct_media_spend_to_channel: {correct_media_spend_to_channel}")

        if outcome_type == "revenue":
            # Build data loader kwargs
            loader_kwargs = {
                "csv_path": "geo_media.csv",
                "kpi_type": 'revenue',
                "coord_to_columns": coord_to_columns,
            }
        else:
            # Build data loader kwargs
            loader_kwargs = {
                "csv_path": "geo_media.csv",
                "kpi_type": 'non_revenue',
                "coord_to_columns": coord_to_columns,
            }
        
        # Add regular media mappings if present
        if correct_media_to_channel:
            loader_kwargs["media_to_channel"] = correct_media_to_channel
        if correct_media_spend_to_channel:
            loader_kwargs["media_spend_to_channel"] = correct_media_spend_to_channel
        
        # Add reach/frequency mappings if present
        if is_valid(reach) and correct_reach_to_channel:
            correct_reach_to_channel = json.loads(correct_reach_to_channel) if isinstance(correct_reach_to_channel, str) else correct_reach_to_channel
            loader_kwargs["reach_to_channel"] = correct_reach_to_channel
            logger.info(f"correct_reach_to_channel: {correct_reach_to_channel}")
        
        if is_valid(frequency) and correct_frequency_to_channel:
            correct_frequency_to_channel = json.loads(correct_frequency_to_channel) if isinstance(correct_frequency_to_channel, str) else correct_frequency_to_channel
            loader_kwargs["frequency_to_channel"] = correct_frequency_to_channel
            logger.info(f"correct_frequency_to_channel: {correct_frequency_to_channel}")
        
        if is_valid(rf_spend) and correct_rf_spend_to_channel:
            correct_rf_spend_to_channel = json.loads(correct_rf_spend_to_channel) if isinstance(correct_rf_spend_to_channel, str) else correct_rf_spend_to_channel
            loader_kwargs["rf_spend_to_channel"] = correct_rf_spend_to_channel
            logger.info(f"correct_rf_spend_to_channel: {correct_rf_spend_to_channel}")
        
        data_loader = load.CsvDataLoader(**loader_kwargs)
        logger.info("Data loader completed successfully.")
        return data_loader
    except Exception as e:
        logger.error(f"Error in the function prepare_data_loader: {e}", exc_info=True)
        raise


def train_meridian_model(data_loader, custom_priors_enabled, custom_priors, lift_test_enabled, lift_tests, outcome_type, advanced_settings,
                          n_chains=3, n_adapt=200, n_burnin=200, n_keep=500):
    """Train Meridian Model with lift test calibration and advanced settings."""
    try:
        if custom_priors_enabled or lift_test_enabled:
            # Create channel-specific ROI priors
            roi_prior = create_channel_specific_roi_prior(
                data_loader,
                custom_priors_enabled,
                custom_priors,
                lift_test_enabled,
                lift_tests,
                outcome_type
            )
        else:
            logger.info("Using default ROI priors")
            roi_mu = 0.2
            roi_sigma = 0.9
            roi_prior = tfp.distributions.LogNormal(roi_mu, roi_sigma, name=constants.ROI_M)
            
        # Create prior distribution
        prior = prior_distribution.PriorDistribution(roi_m=roi_prior)

        # Store parameters in a dictionary
        prior_params_dict = get_prior_parameter_dict(prior)
        logger.info(f"Prior parameters dictionary: {prior_params_dict}")

        # Define default ModelSpec parameters
        model_spec_params = {
            'prior': prior,
            'media_effects_dist': 'normal',
            'hill_before_adstock': False,
            'max_lag': 8,
            'unique_sigma_for_each_geo': False,
            'media_prior_type': 'roi',
            'roi_calibration_period': None,
            'rf_prior_type': 'roi',
            'rf_roi_calibration_period': None,
            'organic_media_prior_type': 'contribution',
            'organic_rf_prior_type': 'contribution',
            'non_media_treatments_prior_type': 'contribution',
            'knots': None,
            'baseline_geo': None,
            'holdout_id': None,
            'control_population_scaling_id': None,
            'adstock_decay_spec': 'geometric',
            'enable_aks': False,
        }

        # Override with advanced settings if provided
        if advanced_settings:
            logger.info(f"Applying advanced settings: {advanced_settings}")
            for key, value in advanced_settings.items():
                if key in model_spec_params:
                    logger.info(f"  - Overriding {key}: {model_spec_params[key]} -> {value}")
                    model_spec_params[key] = value
                else:
                    logger.warning(f"  - Unknown advanced setting '{key}' will be ignored")

        # Add lift test calibration period if enabled
        if lift_test_enabled:
            roi_calibration_period = create_roi_calibration_mask(data_loader, lift_tests)
            logger.info(f"Roi_calibration_period: {roi_calibration_period}")
            model_spec_params['roi_calibration_period'] = roi_calibration_period

        # Log final ModelSpec parameters
        logger.info("Final ModelSpec parameters:")
        for key, value in model_spec_params.items():
            if key != 'prior':  # Skip logging the prior object
                logger.info(f"  {key}: {value}")

        # Create model specification with all parameters
        model_spec = spec.ModelSpec(**model_spec_params)

        # Initialize and train model
        mmm = model.Meridian(input_data=data_loader, model_spec=model_spec)
        mmm.sample_prior(n_keep)

        logger.info("Starting model posterior sampling...")
        mmm.sample_posterior(
            n_chains=n_chains,
            n_adapt=n_adapt,
            n_burnin=n_burnin,
            n_keep=n_keep
        )

        logger.info("Model posterior sampling completed")
        return mmm

    except Exception as e:
        logger.error(f"Error in model training: {e}", exc_info=True)
        raise

def upload_to_gcs(local_file_path, bucket_name, destination_blob_name):
    """Uploads a file to Google Cloud Storage."""
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(destination_blob_name)
        blob.upload_from_filename(local_file_path)
        logger.info(f"File successfully uploaded to gs://{bucket_name}/{destination_blob_name}")
    except Exception as e:
        logger.error(f"Error uploading file to GCS: {e}")
        raise

def main(project_id, bucket_name, data_path, result_dir, output_path, time, start_date, 
         end_date, geo, controls, population, kpi, revenue_per_kpi, media, media_spend, 
         organic_media, reach, frequency, rf_spend, custom_priors_enabled, custom_priors,
         lift_test_enabled, lift_tests, outcome_type, reach_frequency_mode,
         correct_media_to_channel, correct_media_spend_to_channel,
         correct_reach_to_channel, correct_frequency_to_channel, correct_rf_spend_to_channel, advanced_settings):
    """Main function to train and save the Meridian Media Mix Model."""
    
    # Log all arguments
    logger.info(f"Received project_id: {project_id}")
    logger.info(f"Received bucket_name: {bucket_name}")
    logger.info(f"Received data_path: {data_path}")
    logger.info(f"Received result_dir: {result_dir}")
    logger.info(f"Received output_path: {output_path}")
    logger.info(f"Time column: {time}")
    logger.info(f"Start date: {start_date}")
    logger.info(f"End date: {end_date}")
    logger.info(f"Geo: {geo}")
    logger.info(f"Controls: {controls}")
    logger.info(f"Population: {population}")
    logger.info(f"KPI: {kpi}")
    logger.info(f"Revenue per KPI: {revenue_per_kpi}")
    logger.info(f"Media: {media}")
    logger.info(f"Media Spend: {media_spend}")
    logger.info(f"Organic Media: {organic_media}")
    logger.info(f"Reach: {reach}")
    logger.info(f"Frequency: {frequency}")
    logger.info(f"RF Spend: {rf_spend}")
    logger.info(f"Reach/Frequency Mode: {reach_frequency_mode}")
    logger.info(f"Custom priors enabled: {custom_priors_enabled}")
    logger.info(f"Custom priors: {custom_priors}")
    logger.info(f"Lift test enabled: {lift_test_enabled}")
    logger.info(f"Lift tests: {lift_tests}")
    logger.info(f"Outcome Type: {outcome_type}")
    logger.info(f"Advanved Settings: {advanced_settings}")


    os.makedirs(output_path, exist_ok=True)
    
    # Load data
    logger.info("Loading data...")
    df = load_data_from_gcs(bucket_name, data_path)

    # Prepare data loader with reach/frequency support
    data_loader = prepare_data_loader(
        df, time, geo, controls, population, kpi, revenue_per_kpi, 
        media, media_spend, organic_media, outcome_type,
        reach, frequency, rf_spend,
        correct_media_to_channel, correct_media_spend_to_channel,
        correct_reach_to_channel, correct_frequency_to_channel, correct_rf_spend_to_channel
    )
    logger.info(f"Data loader created: {data_loader}")
    data_loader = data_loader.load()

    # Parse JSON strings
    if lift_tests and isinstance(lift_tests, str):
        try:
            lift_tests = json.loads(lift_tests)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse lift_tests JSON: {e}")
            lift_tests = []

    # Convert string boolean to actual boolean
    if isinstance(lift_test_enabled, str):
        lift_test_enabled = lift_test_enabled.lower() in ('true', '1', 'yes')

    # Train model
    mmm = train_meridian_model(
        data_loader, 
        custom_priors_enabled, 
        custom_priors,
        lift_test_enabled,
        lift_tests,
        outcome_type,
        advanced_settings
    )

    # Save model and results
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Save model
        local_model_path = os.path.join(tmp_dir, 'saved_mmm.pkl')
        model.save_mmm(mmm, local_model_path)
        logger.info(f"Model saved locally: {local_model_path}")

        destination_model_blob = f'{result_dir}/saved_mmm.pkl'
        upload_to_gcs(local_model_path, bucket_name, destination_model_blob)

        # Create model summary
        logger.info("Generating and saving model summary...")
        mmm_summarizer = summarizer.Summarizer(mmm)
        local_summary_path = os.path.join(tmp_dir, 'model_summary.html')

        mmm_summarizer.output_model_results_summary(
            'model_summary.html', 
            tmp_dir, 
            start_date, 
            end_date
        )
        
        # Generate individual response curves 
        media_effects = visualizer.MediaEffects(mmm)
        fig = media_effects.plot_response_curves()
        individual_res_curve_path = os.path.join(tmp_dir, 'individual_res_curves.html')
        fig.save(f'{individual_res_curve_path}')

        merged_summary_path = os.path.join(tmp_dir, 'merged_model_summary.html')
        merge_html_files(local_summary_path, individual_res_curve_path, merged_summary_path)

        # Generate R-hat diagnostics
        logger.info("Generating R-hat diagnostics...")
        r_hat_base64 = generate_rhat_diagnostics(mmm, tmp_dir)

        # Integrate R-hat diagnostics
        if os.path.exists(merged_summary_path):
            with open(merged_summary_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            html_content = integrate_rhat_into_html(html_content, r_hat_base64)
            
            with open(merged_summary_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logger.info("R-hat diagnostics integrated into model summary")
        else:
            logger.error(f"Model summary HTML not found at {merged_summary_path}")

        # Upload summary
        summary_destination_blob = f'{result_dir}/model_summary.html'
        logger.info(f"Summary final file path: {merged_summary_path}")
        upload_to_gcs(merged_summary_path, bucket_name, summary_destination_blob)
        
        # Budget optimization
        budget_optimizer = optimizer.BudgetOptimizer(mmm)
        if revenue_per_kpi and revenue_per_kpi.strip():
            logger.info("Running optimization with revenue per KPI...")
            optimization_results = budget_optimizer.optimize()
        else:
            logger.info("Running optimization with KPI...")
            optimization_results = budget_optimizer.optimize(use_kpi=True)
        
        local_optimization_output_path = os.path.join(tmp_dir, 'optimization_output')
        os.makedirs(local_optimization_output_path, exist_ok=True)
        
        optimization_results.output_optimization_summary(
            'optimization_output.html', 
            local_optimization_output_path
        )

        # Generate response curves for all channels
        fig = optimization_results.plot_response_curves(n_top_channels=None)
        res_curve_all_channel_path = os.path.join(local_optimization_output_path, 'res_curves_all_channel.html')
        fig.save(f"{res_curve_all_channel_path}")


        merged_optimization_output_path = os.path.join(local_optimization_output_path, 'merged_optimization_output.html')
        # Replace chart in target HTML

        local_optimization_file = os.path.join(local_optimization_output_path, 'optimization_output.html')
        get_merged_optimization_output_html(local_optimization_file, res_curve_all_channel_path, merged_optimization_output_path)

        optimization_destination_blob = f'{result_dir}/optimization_output.html'
        
        logger.info(f"Optimization final file path: {merged_optimization_output_path}")
        upload_to_gcs(merged_optimization_output_path, bucket_name, optimization_destination_blob)

    logger.info(f"Model and summary uploaded to GCS bucket '{bucket_name}'")
    logger.info("Meridian Media Mix Model Training completed successfully.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Meridian Media Mix Model Training')
    
    # Required arguments
    parser.add_argument('--project_id', required=True, help='Google Cloud Project ID')
    parser.add_argument('--bucket_name', required=True, help='GCS Bucket Name')
    parser.add_argument('--data_path', required=True, help='Path to input CSV in GCS bucket')
    parser.add_argument('--result_dir', required=True, help='Path to save artifacts in GCS')
    parser.add_argument('--output_path', required=True, help='Local path to save results')
    parser.add_argument('--time', required=True, help='Time column')
    parser.add_argument('--start_date', required=True, help='Start date of data')
    parser.add_argument('--end_date', required=True, help='End date of data')
    parser.add_argument('--geo', required=True, help='Geo column')
    parser.add_argument('--controls', required=False, default='', help='Comma-separated control variables')
    parser.add_argument('--population', required=False, default='', help='Population column')
    parser.add_argument('--kpi', required=True, help='KPI column')
    parser.add_argument('--revenue_per_kpi', required=False, default='', help='Revenue per KPI')
    parser.add_argument('--media', required=False, default='', help='Comma-separated media columns')
    parser.add_argument('--media_spend', required=False, default='', help='Comma-separated media spend')
    parser.add_argument('--organic_media', required=False, default='', help='Comma-separated organic media')
    
    # Reach/Frequency arguments
    parser.add_argument('--reach', required=False, default='', help='Comma-separated reach columns')
    parser.add_argument('--frequency', required=False, default='', help='Comma-separated frequency columns')
    parser.add_argument('--rf_spend', required=False, default='', help='Comma-separated RF spend columns')
    parser.add_argument('--reach_frequency_mode', required=False, default='without', 
                       help='Reach/frequency mode: "with" or "without"')
    
    # Prior and calibration arguments
    parser.add_argument('--custom_priors_enabled', required=False, default='false', 
                       help='Boolean value: is custom priors enabled')
    parser.add_argument('--custom_priors', required=False, default='{}', 
                       help='JSON string for custom priors')
    parser.add_argument('--lift_test_enabled', required=False, default='false', 
                       help='Boolean value: is lift test enabled')
    parser.add_argument('--lift_tests', required=False, default='[]', 
                       help='JSON string for lift test')
    parser.add_argument('--outcomeType', required=False, default='', help='Outcome type')
    
    # Mapping arguments
    parser.add_argument('--correct_media_to_channel', required=False, default='{}',
                       help='JSON string for media to channel mapping')
    parser.add_argument('--correct_media_spend_to_channel', required=False, default='{}',
                       help='JSON string for media spend to channel mapping')
    parser.add_argument('--correct_reach_to_channel', required=False, default='{}',
                       help='JSON string for reach to channel mapping')
    parser.add_argument('--correct_frequency_to_channel', required=False, default='{}',
                       help='JSON string for frequency to channel mapping')
    parser.add_argument('--correct_rf_spend_to_channel', required=False, default='{}',
                       help='JSON string for RF spend to channel mapping')
    
    parser.add_argument("--advanced_settings", type=str, default=None, 
                    help="JSON string containing advanced settings")

    args = parser.parse_args()

    try:
        main(
            args.project_id, args.bucket_name, args.data_path, args.result_dir, 
            args.output_path, args.time, args.start_date, args.end_date, args.geo, 
            args.controls, args.population, args.kpi, args.revenue_per_kpi, args.media, 
            args.media_spend, args.organic_media, args.reach, args.frequency, args.rf_spend,
            args.custom_priors_enabled, args.custom_priors, 
            args.lift_test_enabled, args.lift_tests, args.outcomeType, args.reach_frequency_mode,
            args.correct_media_to_channel, args.correct_media_spend_to_channel,
            args.correct_reach_to_channel, args.correct_frequency_to_channel, 
            args.correct_rf_spend_to_channel,
            args.advanced_settings
        )
    except Exception as e:
        logger.error(f"Training process failed: {e}", exc_info=True)
        raise