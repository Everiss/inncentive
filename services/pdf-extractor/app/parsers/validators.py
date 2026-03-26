def validate_result(payload: dict) -> tuple[bool, str, list[str], bool]:
    missing: list[str] = []

    if not payload.get("cnpj_from_form"):
        missing.append("company_info.cnpj")
    if not payload.get("fiscal_year"):
        missing.append("fiscal_year")
    if not payload.get("form_data", {}).get("projects"):
        missing.append("projects")

    if not missing:
        return True, "HIGH", [], False
    if len(missing) <= 2:
        return False, "MEDIUM", missing, True
    return False, "LOW", missing, True
