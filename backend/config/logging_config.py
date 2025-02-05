import os
import logging
from logging.handlers import RotatingFileHandler

# Create logs directory if it doesn't exist
LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

# Log file path
LOG_FILE = os.path.join(LOGS_DIR, 'app.log')

def setup_logging():
    """Configure logging settings"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            RotatingFileHandler(
                LOG_FILE,
                maxBytes=10000000,  # 10MB
                backupCount=5
            ),
            logging.StreamHandler()  # This will also print logs to console
        ]
    )

    # Create a logger instance
    logger = logging.getLogger(__name__)
    
    return logger