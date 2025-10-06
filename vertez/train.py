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
import base64
import re

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
        logger.error(f"Failed to load data from GCS: {e}")
        raise

def prepare_data_loader(df, time, geo, controls, population, kpi, revenue_per_kpi, media, media_spend, organic_media, correct_media_to_channel, correct_media_spend_to_channel):
    """Prepare data loader for Meridian model using dynamic column mapping."""
    logger.info("Preparing data loader with dynamic column mapping...")
    try:
        def is_valid(value):
            return value not in (None, "", []) and value != ['']

        if revenue_per_kpi:
            coord_to_columns = load.CoordToColumns(
                **{
                    key: value
                    for key, value in {
                        "time": time,
                        "geo": geo,
                        "controls": controls.split(',') if controls else None,
                        "population": population if population else None,
                        "kpi": kpi,
                        "revenue_per_kpi": revenue_per_kpi if revenue_per_kpi else None,
                        "media": media.split(',') if media else None,
                        "media_spend": media_spend.split(',') if media_spend else None,
                        "organic_media": organic_media.split(',') if organic_media else None
                    }.items()
                    if is_valid(value)
                }
            )
        else:
            coord_to_columns = load.CoordToColumns(
            **{
                key: value
                for key, value in {
                    "time": time,
                    "geo": geo,
                    "controls": controls.split(',') if controls else None,
                    "population": population if population else None,
                    "kpi": kpi,
                    "media": media.split(',') if media else None,
                    "media_spend": media_spend.split(',') if media_spend else None,
                    "organic_media": organic_media.split(',') if organic_media else None
                }.items()
                if is_valid(value)
                }
            )
        correct_media_to_channel = json.loads(correct_media_to_channel)
        correct_media_spend_to_channel = json.loads(correct_media_spend_to_channel)
        logger.info(f"coord_to_columns: {coord_to_columns}")

        logger.info(f"correct_media_to_channel: {correct_media_to_channel}")
        logger.info(f"correct_media_spend_to_channel: {correct_media_spend_to_channel}")
        data_loader = load.CsvDataLoader(
            csv_path="geo_media.csv",
            kpi_type='non_revenue',
            coord_to_columns=coord_to_columns,
            media_to_channel=correct_media_to_channel,
            media_spend_to_channel=correct_media_spend_to_channel
        )
        logger.info("Data loader completed successfully.")
        return data_loader
    except Exception as e:
        logger.error(f"Error in the function prepare_data_loader: {e}")
        raise


def create_channel_specific_roi_prior(data_loader, custom_priors_enabled, custom_priors, default_mu=0.2, default_sigma=0.9):
    """Create channel-specific ROI priors from lift test data"""
    n_channels = len(data_loader.media_channel)

    print(f"Creating prior for {n_channels} channels")
    print(f"Channel names: {list(data_loader.media_channel.values)}")

    channel_map = {ch: idx for idx, ch in enumerate(data_loader.media_channel.values)}


    # Initialize with default parameters for all channels (these are lognormal parameters)
    mu_batch = np.full(n_channels, default_mu, dtype=np.float32)
    sigma_batch = np.full(n_channels, default_sigma, dtype=np.float32)

    if custom_priors and isinstance(custom_priors, str):
       try:
           custom_priors = json.loads(custom_priors)
       except json.JSONDecodeError as e:
           logger.error(f"Failed to parse custom_priors JSON: {e}")
           custom_priors = {}

    if isinstance(custom_priors_enabled, str):
       custom_priors_enabled = custom_priors_enabled.lower() in ('true', '1', 'yes')
       
    # Update with lift test results for tested channels
    if custom_priors_enabled:
        for channel_name, prior_values in custom_priors.items():
            channel_name = channel_name.lower()
            if channel_name in channel_map:
                logger.info(f"Channel Name: {channel_name}, {channel_map}")
                channel_idx = channel_map[channel_name]

                mu_batch[channel_idx] = prior_values["mean"]
                sigma_batch[channel_idx] = prior_values["sigma"]


    # Create the batch LogNormal distribution
    return tfp.distributions.LogNormal(
        loc=tf.convert_to_tensor(mu_batch, dtype=tf.float32),
        scale=tf.convert_to_tensor(sigma_batch, dtype=tf.float32),
        name=constants.ROI_M
    )

def train_meridian_model(data_loader, custom_priors_enabled, custom_priors,
                          n_chains=3, n_adapt=200, n_burnin=200, n_keep=500):
    """
    Train Meridian Model with lift test calibration.
    
    Args:
        data_loader: Loaded Meridian data object
        n_chains: Number of MCMC chains
        n_adapt: Number of adaptation steps
        n_burnin: Number of burn-in steps
        n_keep: Number of samples to keep
    
    Returns:
        Trained Meridian model
    """
    try:
        logger.info("Initializing model training with lift test calibration")
        
        # Create channel-specific ROI priors
        roi_prior = create_channel_specific_roi_prior(
            data_loader, 
            custom_priors_enabled,
            custom_priors 
        )

        # Create prior distribution
        prior = prior_distribution.PriorDistribution(roi_m=roi_prior)

        # Store parameters in a dictionary
        prior_params_dict = get_prior_parameter_dict(prior)
        logger.info(f"Prior parameters dictionary: {prior_params_dict}")

        # Create model specification with calibration period
        model_spec = spec.ModelSpec(
            prior=prior
        )

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

def generate_rhat_diagnostics(mmm, tmp_dir):
    """Generate R-hat diagnostics plot and return base64 encoded image."""
    try:
        logger.info("Generating R-hat diagnostics...")
        model_diagnostics = visualizer.ModelDiagnostics(mmm)
        
        # Generate the R-hat plot
        r_hat_path = os.path.join(tmp_dir, 'r_hat.png')
        r_hat_chart = model_diagnostics.plot_rhat_boxplot()
        logger.info(f"r_hat_path: {r_hat_path}")
        
        # Adjust size and labels
        r_hat_chart = (
            r_hat_chart
            .properties(width=600, height=400)
            .configure_axis(
                labelFontSize=12,
                titleFontSize=14,
                labelAngle=0
            )
            .configure_legend(
                labelFontSize=12,
                titleFontSize=14
            )
        )

        # Save as PNG
        r_hat_chart.save(r_hat_path)
        
        # Convert to base64
        if os.path.exists(r_hat_path):
            with open(r_hat_path, 'rb') as img_file:
                r_hat_base64 = base64.b64encode(img_file.read()).decode('utf-8')
            logger.info(f"R-hat diagnostics generated and converted to base64")
            return r_hat_base64
        else:
            logger.warning("R-hat plot file was not created")
            return None
            
    except Exception as e:
        logger.error(f"Error generating R-hat diagnostics: {e}", exc_info=True)
        return None

def integrate_rhat_into_html(html_content, r_hat_base64):
    """Integrate R-hat diagnostics into the HTML content."""
    if not r_hat_base64:
        logger.warning("No R-hat data to integrate")
        return html_content
    
    # Create R-hat section
    r_hat_section = f"""
<div id="rhat-diagnostics-section" style="margin: 20px 0;">
  <div class="chart-table-title" style="color: #333; font-size: 16px; margin-bottom: 15px;">
    R-hat Convergence Diagnostics
  </div>
  <div style="text-align: center; margin-bottom: 15px;">
    <img src="data:image/png;base64,{r_hat_base64}"
         alt="R-hat Convergence Diagnostics Plot"
         style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
  </div>
  <div class="chart-table-description" style="padding: 10px; background-color: #f8f9fa; border-radius: 4px;">
    <strong>Note:</strong> R-hat values close to 1.0 indicate convergence. R-hat &lt; 1.2 indicates approximate convergence and is a reasonable threshold for many problems. Values significantly above 1.2 may indicate convergence issues that require further investigation.
  </div>
</div>"""
    
    # Find the closing tag of the chart-table and insert after it
    chart_table_pattern = r'(</chart-table>)'
    if re.search(chart_table_pattern, html_content):
        html_content = re.sub(chart_table_pattern, r'\1' + r_hat_section, html_content, count=1)
        logger.info("R-hat section inserted after Model fit metrics table")
    else:
        logger.warning("Could not find </chart-table> tag, inserting before </body>")
        insert_at = html_content.find("</body>")
        if insert_at != -1:
            html_content = html_content[:insert_at] + r_hat_section + html_content[insert_at:]
        else:
            html_content += r_hat_section
    
    return html_content

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
         organic_media, custom_priors_enabled, custom_priors, correct_media_to_channel, correct_media_spend_to_channel):
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
    logger.info(f"Custom priors enables: {custom_priors_enabled}")
    logger.info(f"custom priors: {custom_priors}")
    logger.info(f"Correct Media to Channel: {correct_media_to_channel}")
    logger.info(f"Correct Media Spend to Channel: {correct_media_spend_to_channel}")

    os.makedirs(output_path, exist_ok=True)
    
    # Load data
    logger.info("Loading data...")
    df = load_data_from_gcs(bucket_name, data_path)

    # Prepare data loader
    data_loader = prepare_data_loader(
        df, time, geo, controls, population, kpi, revenue_per_kpi, 
        media, media_spend, organic_media, correct_media_to_channel, 
        correct_media_spend_to_channel
    )
    logger.info(f"Data loader created: {data_loader}")
    data_loader = data_loader.load()

    # Convert revenue_per_kpi to float if provided
    revenue_per_kpi_value = None
    if revenue_per_kpi and revenue_per_kpi.strip():
        try:
            revenue_per_kpi_value = float(revenue_per_kpi)
            logger.info(f"Revenue per KPI value: {revenue_per_kpi_value}")
        except ValueError:
            logger.warning(f"Could not convert revenue_per_kpi '{revenue_per_kpi}' to float")

    # Train model with lift test calibration
    mmm = train_meridian_model(
        data_loader, 
        custom_priors_enabled, 
        custom_priors
    )

    # Save model and results
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Save model
        local_model_path = os.path.join(tmp_dir, 'saved_mmm.pkl')
        model.save_mmm(mmm, local_model_path)
        logger.info(f"Model saved locally: {local_model_path}")

        destination_model_blob = f'{result_dir}/saved_mmm.pkl'
        upload_to_gcs(local_model_path, bucket_name, destination_model_blob)

        # Generate R-hat diagnostics
        logger.info("Generating R-hat diagnostics...")
        r_hat_base64 = generate_rhat_diagnostics(mmm, tmp_dir)

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

        # Integrate R-hat diagnostics
        if os.path.exists(local_summary_path):
            with open(local_summary_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            html_content = integrate_rhat_into_html(html_content, r_hat_base64)
            
            with open(local_summary_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logger.info("R-hat diagnostics integrated into model summary")
        else:
            logger.error(f"Model summary HTML not found at {local_summary_path}")

        # Upload summary
        summary_destination_blob = f'{result_dir}/model_summary.html'
        upload_to_gcs(local_summary_path, bucket_name, summary_destination_blob)
        
        # Budget optimization
        budget_optimizer = optimizer.BudgetOptimizer(mmm)
        if revenue_per_kpi_value:
            logger.info("Running optimization with revenue per KPI...")
            optimization_results = budget_optimizer.optimize()
        else:
            logger.info("Running optimization with KPI...")
            optimization_results = budget_optimizer.optimize(use_kpi=True)
        
        local_optimization_output_path = os.path.join(tmp_dir, 'optimization_output')
        os.makedirs(local_optimization_output_path, exist_ok=True)
        
        optimization_destination_blob = f'{result_dir}/optimization_output.html'
        optimization_results.output_optimization_summary(
            'optimization_output.html', 
            local_optimization_output_path
        )
        
        optimization_file_path = os.path.join(
            local_optimization_output_path, 
            'optimization_output.html'
        )
        upload_to_gcs(optimization_file_path, bucket_name, optimization_destination_blob)

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
    parser.add_argument('--controls', required=True, help='Comma-separated control variables')
    parser.add_argument('--population', required=True, help='Population column')
    parser.add_argument('--kpi', required=True, help='KPI column')
    parser.add_argument('--revenue_per_kpi', required=True, help='Revenue per KPI')
    parser.add_argument('--media', required=True, help='Comma-separated media columns')
    parser.add_argument('--media_spend', required=True, help='Comma-separated media spend')
    parser.add_argument('--organic_media', required=True, help='Comma-separated organic media')
    parser.add_argument('--custom_priors_enabled', required=False, help='Boolean value is custom priors enabled')
    parser.add_argument('--custom_priors', required=False, help='JSON string for custom priors')
    parser.add_argument('--correct_media_to_channel', required=True, 
                       help='JSON string for media to channel mapping')
    parser.add_argument('--correct_media_spend_to_channel', required=True, 
                       help='JSON string for media spend to channel mapping')

    args = parser.parse_args()

    try:
        main(
            args.project_id, args.bucket_name, args.data_path, args.result_dir, 
            args.output_path, args.time, args.start_date, args.end_date, args.geo, 
            args.controls, args.population, args.kpi, args.revenue_per_kpi, args.media, 
            args.media_spend, args.organic_media, args.custom_priors_enabled, args.custom_priors, args.correct_media_to_channel, 
            args.correct_media_spend_to_channel
        )
    except Exception as e:
        logger.error(f"Training process failed: {e}", exc_info=True)
        raise