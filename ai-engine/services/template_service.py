import re

from models.analysis import ProtocolTemplateDto, TemplateResponse
from models.transaction import NormalizedTransaction


def _function_short_name(signature: str) -> str:
    """'transfer(address,uint256)' -> 'transfer'"""
    return re.split(r"[(\s]", signature.strip(), maxsplit=1)[0].lower()


def _score_template(tx: NormalizedTransaction, template: ProtocolTemplateDto) -> tuple[float, list[str]]:
    deviations: list[str] = []

    expected_function_names = {_function_short_name(f) for f in template.expected_functions}
    tx_function = _function_short_name(tx.function_name) if tx.function_name else ""

    if not expected_function_names:
        function_score = 50.0  # template doesn't constrain function - neutral
    elif tx_function and tx_function in expected_function_names:
        function_score = 100.0
    else:
        function_score = 0.0
        deviations.append(
            f"Unexpected contract call: function '{tx_function or '(none)'}' is not in the "
            f"template's expected functions {sorted(expected_function_names)}."
        )

    if not template.expected_contracts:
        contract_score = 100.0  # template doesn't constrain destination contract
    elif tx.contract_address and tx.contract_address in {c.lower() for c in template.expected_contracts}:
        contract_score = 100.0
    else:
        contract_score = 0.0
        deviations.append("Unauthorized routing hop: destination contract is not in the expected contract list.")

    similarity = round(0.7 * function_score + 0.3 * contract_score, 1)
    return similarity, deviations


def match_template(
    tx: NormalizedTransaction, active_templates: list[ProtocolTemplateDto]
) -> TemplateResponse:
    if not active_templates:
        return TemplateResponse(
            template_name=None,
            similarity_score=0.0,
            is_match=False,
            deviations=["No active protocol templates configured."],
        )

    best_name = None
    best_score = -1.0
    best_deviations: list[str] = []

    for template in active_templates:
        score, deviations = _score_template(tx, template)
        if score > best_score:
            best_score = score
            best_name = template.name
            best_deviations = deviations

    return TemplateResponse(
        template_name=best_name,
        similarity_score=best_score,
        is_match=best_score >= 70.0,
        deviations=best_deviations if best_score < 70.0 else [],
    )
