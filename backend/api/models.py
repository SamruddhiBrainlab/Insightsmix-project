from datetime import datetime
from .db import db

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    projects = db.relationship('Project', backref='user', lazy=True)

from enum import Enum
from sqlalchemy import Enum as SQLAlchemyEnum

class ProjectStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    FAILED = "FAILED"
    SUCCESS = "SUCCESS"

class Project(db.Model):
    __tablename__ = 'projects'

    job_id = db.Column(db.String(100), primary_key=True)  # Use job_id as the primary key
    name = db.Column(db.String(100), nullable=False)
    gcs_path = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(SQLAlchemyEnum(ProjectStatus), nullable=False, default=ProjectStatus.PENDING)  # Enum column for status
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
