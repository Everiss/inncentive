def _receipt_value(payload: dict, key: str):
    receipt_top = (payload or {}).get("submission_receipt") or {}
    receipt_nested = ((payload or {}).get("form_data") or {}).get("submission_receipt") or {}
    return receipt_top.get(key) or receipt_nested.get(key)


def validate_result(payload: dict, version_info: dict | None = None) -> tuple[bool, str, list[str], bool]:
    missing: list[str] = []

    has_cnpj = bool(payload.get("cnpj_from_form"))
    has_fiscal_year = bool(payload.get("fiscal_year"))
    has_projects = bool(payload.get("form_data", {}).get("projects"))
    family = (version_info or {}).get("family") or "v2_intermediate_2019_2022"

    has_sender_name = bool(_receipt_value(payload, "sender_name"))
    has_sender_cpf = bool(_receipt_value(payload, "sender_cpf"))
    has_auth_code = bool(_receipt_value(payload, "authenticity_code"))
    has_expedition = bool(_receipt_value(payload, "expedition_at"))

    if not has_cnpj:
        missing.append("company_info.cnpj")
    if not has_fiscal_year:
        missing.append("fiscal_year")
    if not has_projects:
        missing.append("projects")

    # Family-specific quality rules:
    # v1 legacy forms often lack modern receipt block -> keep receipt optional.
    # v2/v3 should usually contain receipt metadata; if absent, request AI completion.
    if family in {"v2_intermediate_2019_2022", "v3_modern_2023_plus"}:
        if not has_sender_name:
            missing.append("submission_receipt.sender_name")
        if not has_sender_cpf:
            missing.append("submission_receipt.sender_cpf")
        if not has_expedition:
            missing.append("submission_receipt.expedition_at")
        if not has_auth_code:
            missing.append("submission_receipt.authenticity_code")

    if not missing:
        return True, "HIGH", [], False

    only_receipt_missing = all(m.startswith("submission_receipt.") for m in missing)

    # Keep the document reviewable when core identifiers are present.
    if has_cnpj and has_fiscal_year:
        if only_receipt_missing:
            return True, "MEDIUM", missing, True
        if has_projects:
            return True, "MEDIUM", missing, True
        return False, "MEDIUM", missing, True

    if len(missing) <= 2:
        return False, "MEDIUM", missing, True
    return False, "LOW", missing, True
