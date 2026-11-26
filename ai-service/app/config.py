import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    llm_models: tuple[str, ...] = tuple(
        m.strip()
        for m in os.getenv(
            "LLM_MODELS",
            "gemini-4-hydrogen,gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite",
        ).split(",")
        if m.strip()
    )
    primary_timeout_secs: float = float(os.getenv("PRIMARY_TIMEOUT_SECS", "10"))
    fallback_timeout_secs: float = float(os.getenv("FALLBACK_TIMEOUT_SECS", "8"))
    mock_llm: bool = os.getenv("MOCK_LLM", "0") == "1"
    min_content_length: int = 10