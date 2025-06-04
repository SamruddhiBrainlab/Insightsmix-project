from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
import os
import sqlalchemy
from api.routes import api
from api.db import db


def create_app():
    app = Flask(__name__)
    CORS(app, supports_credentials=True)

    # Set configuration values
    app.config["UPLOAD_FOLDER"] = "./api/uploaded_files"
    app.config["ALLOWED_EXTENSIONS"] = {"csv", "excel"}

    # Configure database URI before initializing the app
    env = os.environ.get("ENV", "development")  # Default to development if ENV not set
    print(f"Current Environment: {env}")

    if env in ["production", "test"]:
        db_user = os.environ["DB_USER"]
        db_pass = os.environ["DB_PASS"]
        db_name = os.environ["DB_NAME"]
        unix_socket_path = os.environ["INSTANCE_UNIX_SOCKET"]
    if env == "production":
        try:
            # for cloud run use following string
            app.config["SQLALCHEMY_DATABASE_URI"] = (
                f"mysql+pymysql://{db_user}:{db_pass}@localhost/{db_name}"
                f"?unix_socket={unix_socket_path}"
            )
            print("Using Cloud SQL connection via Unix socket")
        except KeyError as e:
            # Fallback to SQLite if environment variables are missing
            app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///fallback.db"
            print(
                f"Missing required environment variable: {e}. Using fallback database."
            )
    elif env == "test":
        # Use the Unix socket connection for Cloud SQL locally, cloud auth proxy should be activated
        app.config["SQLALCHEMY_DATABASE_URI"] = (
            f"mysql+pymysql://{db_user}:{db_pass}@127.0.0.1:3307/{db_name}"
        )
    else:
        # Development database
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///local_app.db"
        print(f"Using development database: sqlite:///local_app.db")

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_size": 10,
        "max_overflow": 5,
        "pool_timeout": 3600,
        "pool_recycle": 1800,
    }

    app.secret_key = os.environ.get("SECRET_KEY", "your_secret_key")

    # Initialize extensions AFTER setting all configurations
    db.init_app(app)
    migrate = Migrate(app, db)

    # Register blueprints
    app.register_blueprint(api, url_prefix="/api")

    return app


app = create_app()

with app.app_context():
    db.reflect()
    db.create_all()
    print("Default features initialized: insights, mmm, budget_planner")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
