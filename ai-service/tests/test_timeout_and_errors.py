import json
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.providers import LLMProvider, ProviderError, ProviderTimeoutError
from app.schemas import DeliverableInput, EvaluateRequest
from app.service import AllProvidersFailedError, ArbiterService
from app.validator import VerdictValidator


class TimeoutStubProvider(LLMProvider):
    @property
    def model_name(self) -> str:
        return "stub-timeout-model"

    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        raise ProviderTimeoutError("timed out")


class FailingStubProvider(LLMProvider):
    @property
    def model_name(self) -> str:
        return "stub-failing-model"

    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        raise ProviderError("503 upstream error")


class NumericEdgeCaseProvider(LLMProvider):
    @property
    def model_name(self) -> str:
        return "stub-numeric-model"

    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        return json.dumps(
            {
                "verdict": "pass",
                "score": 85,
                "criteria": [
                    {
                        "criterion": criteria[0],
                        "met": True,
                        "evidence": "<nav>Menu</nav>",
                        "confidence": 1,  # integer 1 in raw JSON -> must serialize as float 1.0
                    },
                    {
                        "criterion": criteria[1],
                        "met": False,
                        "evidence": "",
                        "confidence": 0.75,
                    },
                ],
                "summary": "Numeric type verification.",
                "risks": [],
            }
        )


def _sample_req() -> EvaluateRequest:
    return EvaluateRequest(
        job_title="Landing page",
        description="Cafe site",
        criteria=["Responsive navbar"],
        deliverable=DeliverableInput(
            source_url="https://example.com",
            content="<html><body><nav>Menu</nav></body></html>",
            content_type="html",
        ),
    )


def test_timeout_falls_back_to_inconclusive_with_model_timeout():
    svc = ArbiterService(
        providers=[TimeoutStubProvider()],
        validator=VerdictValidator(),
    )
    verdict = svc.evaluate(_sample_req())
    assert verdict.verdict == "inconclusive"
    assert "model_timeout" in verdict.risks


def test_all_api_failures_raise_502_error():
    svc = ArbiterService(
        providers=[FailingStubProvider(), FailingStubProvider()],
        validator=VerdictValidator(),
    )
    with pytest.raises(AllProvidersFailedError):
        svc.evaluate(_sample_req())


def test_score_is_int_and_confidence_is_float():
    test_app = create_app(Settings(mock_llm=True))
    client = TestClient(test_app)

    res = client.post(
        "/evaluate",
        json={
            "job_title": "Landing page",
            "description": "Cafe landing page",
            "criteria": ["Responsive navbar", "Contact form"],
            "deliverable": {
                "source_url": "https://example.com/index.html",
                "content": "<html><body><nav>Menu</nav></body></html>",
                "content_type": "html",
            },
        },
    )
    assert res.status_code == 200
    data = res.json()

    assert type(data["score"]) is int
    assert 0 <= data["score"] <= 100

    assert len(data["criteria"]) == 2
    for item in data["criteria"]:
        assert type(item["confidence"]) is float
        assert 0.0 <= item["confidence"] <= 1.0


def test_validator_coerces_int_confidence_to_float():
    raw = NumericEdgeCaseProvider().generate_verdict_json(
        "", "", ["Responsive navbar", "Contact form"]
    )
    verdict = VerdictValidator().validate_and_normalize(
        raw_json=raw,
        expected_criteria=["Responsive navbar", "Contact form"],
        model_name="stub-numeric-model",
    )
    dumped = verdict.model_dump(mode="json")

    assert type(dumped["score"]) is int
    assert type(dumped["criteria"][0]["confidence"]) is float
    assert dumped["criteria"][0]["confidence"] == 1.0
    assert type(dumped["criteria"][1]["confidence"]) is float