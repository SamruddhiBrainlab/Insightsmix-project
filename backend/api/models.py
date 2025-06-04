from datetime import datetime
from .db import db

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    organization = db.Column(db.String(100), nullable=False)  # New field
    projects = db.relationship('Project', backref='user', lazy=True)

    def __repr__(self):
        return f'<User {self.email} - {self.organization}>'

from enum import Enum
from sqlalchemy import Enum as SQLAlchemyEnum

class ProjectStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    FAILED = "FAILED"
    SUCCESS = "SUCCESS"

class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.String(100), nullable=True)
    name = db.Column(db.String(100), nullable=False)
    source_file_name = db.Column(db.String(100), nullable=False)
    gcs_path = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    organization = db.Column(db.String(100), nullable=False)  # New field
    status = db.Column(SQLAlchemyEnum(ProjectStatus), nullable=False, default=ProjectStatus.PENDING)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<Project {self.name} - {self.organization}>'

    @classmethod
    def get_projects_by_organization(cls, organization):
        """Get all projects for a specific organization"""
        return cls.query.filter_by(organization=organization).all()

    @classmethod
    def get_projects_for_user_org(cls, user_email):
        """Get all projects for the user's organization"""
        user = User.query.filter_by(email=user_email).first()
        if user:
            return cls.query.filter_by(organization=user.organization).all()
        return []