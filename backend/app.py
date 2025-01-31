# app.py
from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
import os
from api.routes import api
from api.db import db  # Import db from the new db module

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from React frontend

# Set configuration values
app.config['UPLOAD_FOLDER'] = './api/uploaded_files'
app.config['ALLOWED_EXTENSIONS'] = {'csv'}

# Database configuration
if os.getenv('ENV') == 'production':  # Use Google Cloud SQL in production
    app.config['SQLALCHEMY_DATABASE_URI'] = (
        f"mysql+pymysql://{os.getenv('GOOGLE_SQL_USER')}:{os.getenv('GOOGLE_SQL_PASSWORD')}@/"
        f"{os.getenv('GOOGLE_SQL_DATABASE')}?unix_socket=/cloudsql/{os.getenv('GOOGLE_SQL_INSTANCE_CONNECTION_NAME')}"
    )
else:  # Use SQLite for local development
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///local_app.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'your_secret_key')

# Initialize SQLAlchemy
db.init_app(app)

# Initialize Flask-Migrate
migrate = Migrate(app, db)

# Register API routes
app.register_blueprint(api, url_prefix='/api')

# Create database tables if they don't exist
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
