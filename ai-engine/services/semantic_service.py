from models.analysis import SemanticResponse
from models.transaction import NormalizedTransaction

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "transfer": ["transfer", "send", "pay"],
    "approve": ["approve", "allowance", "spending"],
    "swap": ["swap", "exchange", "trade"],
    "bridge": ["bridge", "deposit", "withdraw"],
    "stake": ["stake", "unstake", "delegate"],
}


def _categorize(text: str) -> set[str]:
    lowered = text.lower()
    return {
        category
        for category, keywords in _CATEGORY_KEYWORDS.items()
        if any(keyword in lowered for keyword in keywords)
    }


def analyze_semantic(transaction: NormalizedTransaction) -> SemanticResponse:
    """Detects a mismatch between what the user says a transaction does
    (`description`) and what it actually calls (`functionName`) - e.g. a
    description of "transfer funds" backing a transaction that actually
    calls `approve(...)`, which grants a spending allowance instead."""
    description = transaction.description or ""
    function_name = transaction.function_name or ""

    described = _categorize(description)
    actual = _categorize(function_name)

    if not described:
        return SemanticResponse(
            semantic_score=20.0,
            issues=["No clear transaction intent stated in the description."],
            explanation="Without a description, the transaction's stated intent cannot be verified against its actual behavior.",
            confidence=0.3,
        )

    if not actual:
        return SemanticResponse(
            semantic_score=25.0,
            issues=["Could not determine a transaction category from the function name."],
            explanation="The function name does not match any known transaction category, so intent-vs-behavior comparison is inconclusive.",
            confidence=0.4,
        )

    if described.isdisjoint(actual):
        if "transfer" in described and "approve" in actual:
            return SemanticResponse(
                semantic_score=92.0,
                issues=[
                    f"Description implies a transfer, but the transaction calls '{function_name}', "
                    "which grants a spending allowance rather than moving funds."
                ],
                explanation=(
                    "This is a classic approval-phishing pattern: a benign-sounding description "
                    "masks a call that lets a third party move funds later, potentially without limit."
                ),
                confidence=0.9,
            )
        return SemanticResponse(
            semantic_score=58.0,
            issues=[
                f"Description suggests a {'/'.join(sorted(described))} action, but the function "
                f"'{function_name}' maps to {'/'.join(sorted(actual))}."
            ],
            explanation="The stated intent and the actual transaction category do not match.",
            confidence=0.75,
        )

    return SemanticResponse(
        semantic_score=6.0,
        issues=[],
        explanation="The transaction's description is consistent with its actual function call.",
        confidence=0.85,
    )
