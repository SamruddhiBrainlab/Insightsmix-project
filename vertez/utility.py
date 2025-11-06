import os
import numpy as np
import pandas as pd
import tensorflow as tf
import tensorflow_probability as tfp
import json
import logging
import sys
import base64
import re
from bs4 import BeautifulSoup

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

def create_roi_calibration_mask(data, lift_test_data):
    roi_period = {}

    for item in lift_test_data:
        start = pd.to_datetime(item['start_date'])
        end = pd.to_datetime(item['end_date'])
        # generate weekly dates (every 7 days)
        dates = pd.date_range(start=start, end=end, freq='7D').strftime('%Y-%m-%d').tolist()
        roi_period[item['channel_name']] = dates

    logger.info(f"roi_period: {roi_period}")
    roi_calibration_period = np.zeros((len(data.time), len(data.media_channel)))
    for i in roi_period.items():
        roi_calibration_period[
            np.isin(data.time.values, i[1]), data.media_channel.values == i[0]
        ] = 1

    roi_calibration_period[
        :, ~np.isin(data.media_channel.values, list(roi_period.keys()))
    ] = 1

    return roi_calibration_period


def estimate_lognormal_dist(mean, std):
    """Reparameterization of lognormal distribution in terms of its mean and std."""
    mu_log = np.log(mean) - 0.5 * np.log((std/mean)**2 + 1)
    std_log = np.sqrt(np.log((std/mean)**2 + 1))
    return mu_log, std_log


def calculate_historical_contribution(data_loader):
    try:
        logger.info("Calculating historical contribution percentage from data...")

        # xarray DataArray with shape (geo, time, media_channel)
        # Sum across geo and time dimensions to get total spend per channel
        channel_spends = data_loader.media_spend.sum(dim=['geo', 'time'])
        logger.info(f"Total channel spend {channel_spends}")

        # Get total spend across all channels
        total_paid_media_spend = float(channel_spends.sum().values)

        logger.info(f"Total paid media spend: {total_paid_media_spend:.2f}")
        logger.info(f"Channel spends shape: {channel_spends.shape}")

        historical_contribution = {}

        # Iterate through each channel
        for idx, channel_name in enumerate(data_loader.media_channel.values):
            # Extract the spend for this channel
            channel_spend = float(channel_spends.values[idx])
            contribution_percentage = (channel_spend / total_paid_media_spend * 100) if total_paid_media_spend > 0 else 0
            historical_contribution[channel_name] = contribution_percentage
            logger.info(f"Channel {channel_name}: spend={channel_spend:.2f}, contribution={contribution_percentage:.2f}%")

        return historical_contribution
    except Exception as e:
        logger.error(f"Error calculating historical contribution: {e}", exc_info=True)
        logger.info(f"Debug - media_spend type: {type(data_loader.media_spend)}")
        logger.info(f"Debug - media_spend shape: {data_loader.media_spend.shape}")
        logger.info(f"Debug - media_spend dims: {data_loader.media_spend.dims}")
        raise

def get_lift_test_priors(lift, outcome_type, data_loader=None):

    # Check if revenue_per_kpi exists in the data loader
    has_revenue_per_kpi = hasattr(data_loader, 'revenue_per_kpi') and data_loader.revenue_per_kpi is not None
    
    # Scenario 1: Revenue outcome
    if outcome_type == "revenue":
        logger.info(f"Scenario case 1 for channel {lift['channel_name']}: Revenue outcome")
        mean = lift["incremental_outcome"] / lift["actual_spend"]
        std = 0.05 * mean
        mu, sigma = estimate_lognormal_dist(mean, std)
        return mu, sigma

    # Scenario 2: KPI outcome with revenue_per_kpi
    elif has_revenue_per_kpi:
        total_revenue_per_kpi = data_loader.revenue_per_kpi.isel(geo=0, time=0).values.item() / data_loader.kpi.isel(geo=0, time=0).values.item()
        logger.info(f"Aggregated value of Revenue Per KPI value: {total_revenue_per_kpi}")
        logger.info(f"Scenario case 2 for channel {lift['channel_name']}: KPI with revenue_per_kpi")
        incremental_revenue = lift["incremental_outcome"] * total_revenue_per_kpi
        mean = incremental_revenue / lift["actual_spend"]
        std = 0.05 * mean
        mu, sigma = estimate_lognormal_dist(mean, std)
        return mu, sigma

    # Scenario 3: KPI (Non-Revenue) without revenue_per_kpi
    else:
        logger.info(f"Scenario case 3 for channel {lift['channel_name']}: KPI without revenue_per_kpi")
        channel_name = lift['channel_name']

        if data_loader is None:
            raise ValueError("data_loader is required for scenario 3 (KPI without revenue_per_kpi)")

        # Get total KPI and total media spend for this channel
        channel_idx = np.where(data_loader.media_channel.values == channel_name)[0]
        if len(channel_idx) == 0:
            raise ValueError(f"Channel {channel_name} not found in data_loader")

        channel_idx = channel_idx[0]
        logger.info(f"Channel_idx: {channel_idx}")

        total_channel_cost = lift["actual_spend"]
        total_kpi = lift["incremental_outcome"]

        historical_contribution = calculate_historical_contribution(data_loader)

        # Use historical contribution percentage
        if historical_contribution and channel_name in historical_contribution:
            p_mean = historical_contribution[channel_name]
            logger.info(f"Using historical contribution percentage from data: {p_mean}%")
        else:
            logger.info(f"Historical contribution not found for {channel_name}, using fallback")
            p_mean = (lift["incremental_outcome"] / total_kpi) * 100
            logger.info(f"Calculated p_mean from lift test: {p_mean}%")

        p_sd = 0.05 * p_mean

        # Calculate ROI mean and standard deviation
        roi_mean = p_mean * total_kpi / total_channel_cost
        roi_sd = p_sd * total_kpi / np.sqrt(total_channel_cost)

        # Convert to lognormal parameters
        lognormal_sigma = np.sqrt(np.log(roi_sd**2 / roi_mean**2 + 1))
        lognormal_mu = np.log(roi_mean * np.exp(-lognormal_sigma**2 / 2))

        logger.info(f"Scenario 3 parameters - p_mean: {p_mean}, p_sd: {p_sd}")
        logger.info(f"roi_mean: {roi_mean}, roi_sd: {roi_sd}")
        logger.info(f"lognormal_mu: {lognormal_mu}, lognormal_sigma: {lognormal_sigma}")

        return float(lognormal_mu), float(lognormal_sigma)

    return None, None


def create_channel_specific_roi_prior(data_loader, custom_priors_enabled, custom_priors, lift_test_enabled, lift_tests, outcome_type, default_mu=0.2, default_sigma=0.9):
    """Create channel-specific ROI priors from lift test data"""
    n_channels = len(data_loader.media_channel)

    logger.info(f"Creating prior for {n_channels} channels")
    logger.info(f"Channel names: {list(data_loader.media_channel.values)}")

    channel_map = {ch: idx for idx, ch in enumerate(data_loader.media_channel.values)}

    logger.info(f"Channel Map: {channel_map}")
    
    # Initialize with default parameters for all channels
    mu_batch = np.full(n_channels, default_mu, dtype=np.float32)
    sigma_batch = np.full(n_channels, default_sigma, dtype=np.float32)

    logger.info(f"Mu batch: {mu_batch}")
    logger.info(f"Sigma batch: {sigma_batch}")

    if custom_priors and isinstance(custom_priors, str):
       try:
           custom_priors = json.loads(custom_priors)
       except json.JSONDecodeError as e:
           logger.error(f"Failed to parse custom_priors JSON: {e}")
           custom_priors = {}

    if isinstance(custom_priors_enabled, str):
       custom_priors_enabled = custom_priors_enabled.lower() in ('true', '1', 'yes')

    # Update with custom priors for tested channels
    if custom_priors_enabled:
        logger.info("Custom priors enabled...")
        for channel_name, prior_values in custom_priors.items():
            channel_name = channel_name.lower()
            if channel_name in channel_map:
                logger.info(f"Applying custom prior for channel: {channel_name}")
                channel_idx = channel_map[channel_name]
                mu_batch[channel_idx] = prior_values["mean"]
                sigma_batch[channel_idx] = prior_values["sigma"]

    # Update with lift test results for tested channels
    if lift_test_enabled:
        logger.info("Lift test is enabled.")
        for lift in lift_tests:
            channel_name = lift["channel_name"].lower()
            if channel_name in channel_map:
                logger.info(f"Adding lift test for channel {channel_name}")
                channel_idx = channel_map[channel_name]
                logger.info(f"Index of this channel is {channel_idx}")
                mu, sigma = get_lift_test_priors(lift, outcome_type, data_loader)

                mu_batch[channel_idx] = mu
                sigma_batch[channel_idx] = sigma

    # Create the batch LogNormal distribution
    return tfp.distributions.LogNormal(
        loc=tf.convert_to_tensor(mu_batch, dtype=tf.float32),
        scale=tf.convert_to_tensor(sigma_batch, dtype=tf.float32),
        name=constants.ROI_M
    )

def generate_rhat_diagnostics(mmm, tmp_dir):
    """Generate R-hat diagnostics plot and return base64 encoded image."""
    try:
        logger.info("Generating R-hat diagnostics...")
        model_diagnostics = visualizer.ModelDiagnostics(mmm)
        
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
            logger.info("R-hat diagnostics generated and converted to base64")
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
    <strong>Note:</strong> R-hat values close to 1.0 indicate convergence. R-hat &lt; 1.2 indicates approximate convergence. Values significantly above 1.2 may indicate convergence issues.
  </div>
</div>"""
    
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


def merge_html_files(first_html_path, second_html_path, output_path):
    """
    Merge two HTML files by appending the second HTML's visualization 
    as a new card in the first HTML's cards section.
    
    Args:
        first_html_path: Path to the first HTML file (MMM report)
        second_html_path: Path to the second HTML file (Vega visualization)
        output_path: Path where merged HTML will be saved
    """
    
    # Read both HTML files
    with open(first_html_path, 'r', encoding='utf-8') as f:
        first_html = f.read()
    
    with open(second_html_path, 'r', encoding='utf-8') as f:
        second_html = f.read()
    
    # Parse both HTML files
    soup1 = BeautifulSoup(first_html, 'html.parser')
    soup2 = BeautifulSoup(second_html, 'html.parser')
    
    # Extract the Vega spec from the second HTML
    script_tag = soup2.find('script', string=lambda text: text and 'var spec' in text)
    
    if not script_tag:
        raise ValueError("Could not find Vega spec in second HTML")
    
    # Create a new card for the additional visualization
    cards_section = soup1.find('cards')
    
    if not cards_section:
        raise ValueError("Could not find cards section in first HTML")
    
    # Create new card element
    new_card = soup1.new_tag('card', id='additional-visualization')
    
    # Add card title
    card_title = soup1.new_tag('card-title')
    card_title.string = 'Additional Analysis'
    new_card.append(card_title)
    
    # Add card insights (optional)
    card_insights = soup1.new_tag('card-insights')
    insights_icon = soup1.new_tag('card-insights-icon')
    img = soup1.new_tag('img', src='https://www.gstatic.com/images/icons/material/system/svg/insights_24px.svg', alt='insights icon')
    insights_icon.append(img)
    card_insights.append(insights_icon)
    
    insights_text = soup1.new_tag('p')
    insights_text['class'] = 'insights-text'
    insights_text.string = 'This visualization shows additional channel response curves and performance metrics.'
    card_insights.append(insights_text)
    new_card.append(card_insights)
    
    # Create charts section
    charts_section = soup1.new_tag('charts')
    
    # Create chart container
    chart = soup1.new_tag('chart')
    chart_embed = soup1.new_tag('chart-embed', id='additional-vis-chart')
    chart.append(chart_embed)
    charts_section.append(chart)
    
    # Add the script from second HTML
    new_script = soup1.new_tag('script', type='text/javascript')
    new_script.string = script_tag.string.replace('#vis', '#additional-vis-chart').replace('document.getElementById(\'vis\')', 'document.getElementById(\'additional-vis-chart\')')
    charts_section.append(new_script)
    
    new_card.append(charts_section)
    
    # Append the new card to cards section
    cards_section.append(new_card)
    
    # Write the merged HTML
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(str(soup1.prettify()))
    
    logger.info(f"Successfully merged HTML files. Output saved to: {output_path}")


def extract_spec_from_large_html(html_file_path):
    """Extract the complete Vega-Lite spec from HTML file, even if it's large."""
    with open(html_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the start of the spec
    spec_start = content.find('var spec = ')
    if spec_start == -1:
        raise ValueError("Could not find 'var spec = ' in the file")
    
    # Move to the start of the JSON object
    json_start = content.find('{', spec_start)
    if json_start == -1:
        raise ValueError("Could not find opening brace for spec")
    
    # Find the matching closing brace by counting braces
    brace_count = 0
    json_end = json_start
    in_string = False
    escape_next = False
    
    for i in range(json_start, len(content)):
        char = content[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"':
            in_string = not in_string
            continue
        
        if not in_string:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    json_end = i + 1
                    break
    
    if brace_count != 0:
        raise ValueError("Could not find matching closing brace for spec")
    
    # Extract the JSON string
    spec_json_str = content[json_start:json_end]
    
    # Parse it to validate
    try:
        spec_obj = json.loads(spec_json_str)
        logger.info(f"✓ Successfully parsed spec ({len(spec_json_str)} characters)")
        return spec_obj
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON: {e}")
        raise

def replace_response_curves_chart(first_html_path, new_spec, output_path):
    """Replace the optimized-response-curves-chart in first HTML."""
    
    with open(first_html_path, 'r', encoding='utf-8') as f:
        first_html = f.read()
    
    # Convert spec to JSON string for embedding
    spec_json_str = json.dumps(new_spec)
    
    # Create the new script block
    new_script = f'''<script type="text/javascript">
  (() => {{
    const opt = {{
      mode: 'vega-lite',
      width: 'container',
      autosize: {{ type: 'fit', contains: 'padding' }}
    }};
    const spec = JSON.parse({json.dumps(spec_json_str)});
    const chartDiv = document.getElementById('optimized-response-curves-chart');
    vegaEmbed('#optimized-response-curves-chart', spec).catch(console.error);
  }})();
</script>'''
    
    # Find the optimized-response-curves-chart script section
    # Look for the pattern starting from <chart> to </script>
    pattern = r'<chart>\s*<chart-embed id="optimized-response-curves-chart"></chart-embed>\s*</chart>\s*<script type="text/javascript">[\s\S]*?vegaEmbed\([^)]+optimized-response-curves-chart[^)]*\)\.catch\([^)]+\);\s*\}\)\(\);\s*</script>'
    
    match = re.search(pattern, first_html)
    
    if match:
        logger.info("✓ Found optimized-response-curves-chart section")
        replacement = f'''<chart>
  <chart-embed id="optimized-response-curves-chart"></chart-embed>
</chart>

{new_script}'''
        
        modified_html = first_html[:match.start()] + replacement + first_html[match.end():]
    else:
        logger.info("Warning: Pattern not found, trying alternative...")
        # Try alternative pattern - just find the script block
        pattern2 = r'<script type="text/javascript">\s*\(\(\) => \{[\s\S]*?const spec = JSON\.parse\([^;]+\);[\s\S]*?optimized-response-curves-chart[\s\S]*?\}\)\(\);\s*</script>'
        
        match2 = re.search(pattern2, first_html)
        if match2:
            logger.info("✓ Found script block with alternative pattern")
            modified_html = first_html[:match2.start()] + new_script + first_html[match2.end():]
        else:
            logger.info("Error: Could not find chart section to replace")
            return False
    
    # Save the modified HTML
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(modified_html)
    
    logger.info(f"✓ Saved modified HTML to {output_path}")
    return True

def get_merged_optimization_output_html(first_html, second_html, output_html):
    logger.info(f"\n[Step 1] Extracting spec from {second_html}...")
    try:
        new_spec = extract_spec_from_large_html(second_html)
        
        # Check what's in the spec
        if 'datasets' in new_spec:
            dataset_names = list(new_spec['datasets'].keys())
            logger.info(f"  - Found datasets: {dataset_names}")
            for ds_name, ds_data in new_spec['datasets'].items():
                if isinstance(ds_data, list):
                    logger.info(f"  - Dataset '{ds_name}' has {len(ds_data)} rows")
        
        if 'data' in new_spec:
            logger.info(f"  - Data reference: {new_spec['data']}")
            
    except FileNotFoundError:
        logger.error(f"Error: {second_html} not found!")
        logger.error("Please make sure second.html is in the same directory as this script.")
        return
    except Exception as e:
        logger.error(f"Error: {e}")
        return
    
    # Step 2: Replace chart in first HTML
    logger.info(f"\n[Step 2] Replacing chart in {first_html}...")
    try:
        success = replace_response_curves_chart(first_html, new_spec, output_html)
        
        if success:
            logger.info("SUCCESS!")
        else:
            logger.info("\nFailed to replace chart. Check the warnings above.")
            
    except FileNotFoundError:
        logger.error(f"Error: {first_html} not found!")
        logger.error("Please make sure first.html is in the same directory as this script.")
        return
    except Exception as e:
        logger.error(f"Error: {e}")
        return