from fastapi import FastAPI, HTTPException
from google import genai

from app.config import Settings
from app.providers import GeminiProvider, LLMProvider, MockProvider
from app.schemas import EvaluateRequest, Verdict
from app.service import AllProvidersFailedError, ArbiterService
from app.validator import VerdictValidator


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings()
    application = FastAPI(title="ProofPay AI Arbiter")

    providers: list[LLMProvider] = []
    primary_name = cfg.llm_models[0] if cfg.llm_models else "gemini-4-hydrogen"

    if cfg.mock_llm:
        providers.append(MockProvider(base_model=primary_name))
    elif cfg.gemini_api_key and cfg.llm_models:
        client = genai.Client(api_key=cfg.gemini_api_key)
        seen: set[str] = set()
        for idx, model_name in enumerate(cfg.llm_models):
            if model_name in seen:
                continue
            seen.add(model_name)

            timeout_secs = (
                cfg.primary_timeout_secs if idx == 0 else cfg.fallback_timeout_secs
            )

            providers.append(
                GeminiProvider(
                    client=client,
                    model=model_name,
                    timeout_secs=timeout_secs,
                )
            )

    arbiter_service = (
        ArbiterService(
            providers=providers,
            validator=VerdictValidator(),
            min_content_length=cfg.min_content_length,
            skip_length_guard=cfg.mock_llm,
            total_timeout_secs=cfg.evaluate_timeout_secs,
        )
        if providers
        else None
    )

    @application.get("/health")
    def health():
        return {
            "ok": True,
            "model": primary_name,
            "models": list(cfg.llm_models),
            "mock": cfg.mock_llm,
        }

    @application.post("/evaluate", response_model=Verdict)
    def evaluate(req: EvaluateRequest):
        if arbiter_service is None:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
        try:
            return arbiter_service.evaluate(req)
        except AllProvidersFailedError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return application


app = create_app()