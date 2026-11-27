from datetime import datetime, timezone
from app.schemas import CriterionResult, Verdict


class VerdictValidationError(Exception):
    """Raised when LLM output violates domain invariants."""


class VerdictValidator:
    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def validate_and_normalize(
        self, raw_json: str, expected_criteria: list[str], model_name: str
    ) -> Verdict:
        try:
            verdict = Verdict.model_validate_json(raw_json)
        except Exception as exc:
            raise VerdictValidationError(f"Invalid JSON schema: {exc}") from exc

        verdict.score = max(0, min(100, verdict.score))
        for item in verdict.criteria:
            item.confidence = max(0.0, min(1.0, item.confidence))

        if len(verdict.criteria) != len(expected_criteria):
            raise VerdictValidationError("Criteria count mismatch")

        for got, exp in zip(verdict.criteria, expected_criteria):
            if got.criterion.strip() != exp.strip():
                raise VerdictValidationError(
                    f"Criterion text mismatch: {got.criterion!r} != {exp!r}"
                )
            got.criterion = exp

        # Rule: If any met is null -> verdict cannot be "pass"
        if any(c.met is None for c in verdict.criteria) and verdict.verdict == "pass":
            verdict.verdict = "inconclusive"
            if "unverifiable_criteria" not in verdict.risks:
                verdict.risks.append("unverifiable_criteria")

        verdict.model = model_name
        verdict.evaluatedAt = self.now_iso()
        return verdict

    def build_inconclusive(
        self, criteria: list[str], summary: str, risk: str, model_name: str
    ) -> Verdict:
        return Verdict(
            verdict="inconclusive",
            score=0,
            criteria=[
                CriterionResult(criterion=c, met=None, evidence="", confidence=0.0)
                for c in criteria
            ],
            summary=summary,
            risks=[risk],
            model=model_name,
            evaluatedAt=self.now_iso(),
        )