import json
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Optional
from google import genai
from google.genai import types
from app.schemas import Verdict


class ProviderError(Exception):
    """Raised when an LLM provider fails or times out."""


class LLMProvider(ABC):
    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @abstractmethod
    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        """Returns raw JSON string matching the Verdict schema."""
        ...


class GeminiProvider(LLMProvider):
    def __init__(
        self,
        client: genai.Client,
        model: str,
        timeout_secs: Optional[float] = None,
    ) -> None:
        self._client = client
        self._model = model
        self._timeout_secs = timeout_secs

    @property
    def model_name(self) -> str:
        return self._model

    def _invoke(self, system_prompt: str, user_prompt: str) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.0,
                response_mime_type="application/json",
                response_schema=Verdict,
            ),
        )
        if not response.text:
            raise ProviderError(f"{self._model} returned empty response")
        return response.text

    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        if self._timeout_secs is None:
            try:
                return self._invoke(system_prompt, user_prompt)
            except Exception as exc:
                raise ProviderError(f"{self._model} API error: {exc}") from exc

        pool = ThreadPoolExecutor(max_workers=1)
        try:
            future = pool.submit(self._invoke, system_prompt, user_prompt)
            return future.result(timeout=self._timeout_secs)
        except FuturesTimeoutError as exc:
            raise ProviderTimeoutError(
                f"{self._model} timed out after {self._timeout_secs}s"
            ) from exc
        except Exception as exc:
            raise ProviderError(f"{self._model} API error: {exc}") from exc
        finally:
            pool.shutdown(wait=False, cancel_futures=True)


class MockProvider(LLMProvider):
    def __init__(self, base_model: str) -> None:
        self._model = f"mock:{base_model}"

    @property
    def model_name(self) -> str:
        return self._model

    def generate_verdict_json(
        self, system_prompt: str, user_prompt: str, criteria: list[str]
    ) -> str:
        payload = {
            "verdict": "pass",
            "score": 88,
            "criteria": [
                {
                    "criterion": c,
                    "met": True,
                    "evidence": "Mock evidence verified",
                    "confidence": 0.95,
                }
                for c in criteria
            ],
            "summary": "Mock evaluation: all criteria satisfied.",
            "risks": [],
        }
        return json.dumps(payload)

class ProviderError(Exception):
    """Raised when an LLM provider fails or times out."""

class ProviderTimeoutError(ProviderError):
    """Raised when an LLM provider exeeds its timeout."""