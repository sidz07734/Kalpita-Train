"""
Models for the Training Processing module.
Pydantic schemas for request validation and response serialization.

Placed at: KalpitaNexa/KalpitaNexa.API/App/Models/training_models.py
"""

from pydantic import BaseModel
from typing import Optional, List


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class ProcessTrainingRequest(BaseModel):
    """
    Trigger Phase 1 processing for a single Day folder.
    day_folder_name must match exactly as it appears on SharePoint.
    Example: "Day 2 - AI training - Pavan"
    """
    day_folder_name: str


class CheckStatusRequest(BaseModel):
    """Check processing status of a Day folder."""
    day_folder_name: str


class QuizRequest(BaseModel):
    """
    Generate an interactive quiz for a given topic.
    topic: the subject to generate MCQ questions on.
    Example: "LLMs", "REST APIs", "Database Design"
    """
    topic: str


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class Phase1Result(BaseModel):
    """Result returned after Phase 1 (summary + Q&A) processing."""
    day_folder_name: str
    summary_uploaded: bool
    qa_uploaded: bool
    questions_count: int
    message: str


class StatusResponse(BaseModel):
    """Processing status of a given Day folder."""
    day_folder_name: str
    phase1_completed: bool
    phase2_completed: bool
    processed_at: Optional[str] = None
    summary_exists: bool
    qa_exists: bool


class QuizQuestion(BaseModel):
    """A single MCQ quiz question."""
    question: str
    options: List[str]          # Always 4 options: ["A) ...", "B) ...", "C) ...", "D) ..."]
    correct_answer: str         # e.g. "A"
    explanation: str            # Brief explanation of why the answer is correct
    topic: str


class QuizResponse(BaseModel):
    """Structured quiz returned to the frontend."""
    topic: str
    questions: List[QuizQuestion]
    total_questions: int


class TrainingApiResponse(BaseModel):
    """Standard wrapper for all training endpoints."""
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None

class QuizResultRequest(BaseModel):
    topic: str
    score: int
    total_questions: int
    tenant_id: Optional[str] = None
    app_id: Optional[int] = None

class QuizResultRow(BaseModel):
    id: int
    user_email: str
    topic: str
    score: int
    total_questions: int
    taken_at: str
    tenant_id: Optional[str] = None
    app_id: Optional[int] = None




