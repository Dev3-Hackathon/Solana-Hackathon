from typing import Literal, Optional
from pydantic import BaseModel, Field


class DeliverableInput(BaseModel):
    source_url: str
    content: str
    content_type: Literal["text", "html", "github_bundle"]


class EvaluateRequest(BaseModel):
    job_title: str = Field(min_length=1)
    description: str
    criteria: list[str] = Field(min_length=1)
    deliverable: DeliverableInput


class CriterionResult(BaseModel):
    criterion: str
    met: Optional[bool]  # null = unverifiable
    evidence: str
    confidence: float


class Verdict(BaseModel):
    verdict: Literal["pass", "fail", "inconclusive"]
    score: int
    criteria: list[CriterionResult]
    summary: str
    risks: list[str]
    model: Optional[str] = None
    evaluatedAt: Optional[str] = None