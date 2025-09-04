from datetime import datetime
from .db import db
from enum import Enum
from sqlalchemy import Enum as SQLAlchemyEnum

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    organization = db.Column(db.String(100), nullable=False)
    projects = db.relationship('Project', backref='user', lazy=True)

    def __repr__(self):
        return f'<User {self.email} - {self.organization}>'

class ProjectStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    FAILED = "FAILED"
    SUCCESS = "SUCCESS"

class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.String(100), nullable=True)
    base_name = db.Column(db.String(100), nullable=False)  # Original project name (e.g., "twc")
    name = db.Column(db.String(100), nullable=False)  # Versioned name (e.g., "twc_version_1")
    version = db.Column(db.Integer, nullable=False, default=1)  # Version number
    source_file_name = db.Column(db.String(100), nullable=False)
    gcs_path = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    organization = db.Column(db.String(100), nullable=False)
    status = db.Column(SQLAlchemyEnum(ProjectStatus), nullable=False, default=ProjectStatus.PENDING)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    # Add composite unique constraint for base_name + user_id + version
    __table_args__ = (
        db.UniqueConstraint('base_name', 'user_id', 'version', name='unique_project_version'),
    )

    def __repr__(self):
        return f'<Project {self.name} v{self.version} - {self.organization}>'

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
    
    @classmethod
    def get_next_version_number(cls, base_name, user_id):
        """Get the next version number for a project base name"""
        latest_project = cls.query.filter_by(
            base_name=base_name, 
            user_id=user_id
        ).order_by(cls.version.desc()).first()
        
        return (latest_project.version + 1) if latest_project else 1
    
    @classmethod
    def get_project_versions(cls, base_name, user_id):
        """Get all versions of a project for a user"""
        return cls.query.filter_by(
            base_name=base_name, 
            user_id=user_id
        ).order_by(cls.version.desc()).all()
    
    @classmethod
    def get_latest_version(cls, base_name, user_id):
        """Get the latest version of a project"""
        return cls.query.filter_by(
            base_name=base_name, 
            user_id=user_id
        ).order_by(cls.version.desc()).first()