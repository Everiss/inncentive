import json
from urllib.parse import unquote, urlparse

import pymysql

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger("mysql_store")


def _conn():
    if not settings.db_url:
        return None
    parsed = urlparse(settings.db_url)
    if parsed.scheme not in {"mysql", "mysql+pymysql"}:
        return None
    return pymysql.connect(
        host=parsed.hostname or "localhost",
        port=parsed.port or 3306,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=(parsed.path or "").lstrip("/") or None,
        charset="utf8mb4",
        autocommit=True,
    )


def persist_extraction(
    request_id: str,
    file_hash: str,
    original_name: str,
    parser_version: str,
    payload: dict,
    raw_text: str,
) -> None:
    conn = _conn()
    if conn is None:
        return

    status = "COMPLETED"
    if not payload.get("is_valid_formpd"):
        status = "FAILED"
    elif payload.get("needs_ai"):
        status = "NEEDS_AI"

    confidence = str(payload.get("confidence") or "LOW")
    if confidence not in {"LOW", "MEDIUM", "HIGH"}:
        confidence = "LOW"

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO extraction_requests
                  (request_id, file_hash, original_name, parser_version, status, confidence, needs_ai, started_at, finished_at)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  status=VALUES(status),
                  confidence=VALUES(confidence),
                  needs_ai=VALUES(needs_ai),
                  finished_at=NOW(),
                  updated_at=CURRENT_TIMESTAMP
                """,
                (request_id, file_hash, original_name, parser_version, status, confidence, 1 if payload.get("needs_ai") else 0),
            )

            fields = []
            form_data = payload.get("form_data") or {}
            company_info = form_data.get("company_info") or {}
            submission_receipt = payload.get("submission_receipt") or {}
            company_registry = payload.get("company_registry") or {}
            company_registry_fields = company_registry.get("fields") or {}
            company_ident = payload.get("company_identification") or {}
            company_ident_fields = company_ident.get("fields") or {}

            fields.extend(
                [
                    ("company_info.cnpj", company_info.get("cnpj")),
                    ("company_info.legal_name", company_info.get("legal_name")),
                    ("fiscal_year", payload.get("fiscal_year")),
                    ("submission_receipt.sender_name", submission_receipt.get("sender_name")),
                    ("submission_receipt.sender_cpf", submission_receipt.get("sender_cpf")),
                    ("submission_receipt.expedition_at", submission_receipt.get("expedition_at")),
                    ("submission_receipt.authenticity_code", submission_receipt.get("authenticity_code")),
                ]
            )

            for k, v in company_ident_fields.items():
                fields.append((f"company_identification.{k}", v))
            for k, v in company_registry_fields.items():
                fields.append((f"company_registry.{k}", v))

            for field_path, value in fields:
                if value is None:
                    continue
                cur.execute(
                    """
                    INSERT INTO extraction_fields
                      (request_id, field_path, source, confidence, value_json, is_final)
                    VALUES
                      (%s, %s, 'DETERMINISTIC', %s, CAST(%s AS JSON), 1)
                    ON DUPLICATE KEY UPDATE
                      confidence=VALUES(confidence),
                      value_json=VALUES(value_json),
                      is_final=1
                    """,
                    (request_id, field_path, 95 if confidence == "HIGH" else 75 if confidence == "MEDIUM" else 55, json.dumps(value, ensure_ascii=False)),
                )

            cur.execute(
                """
                INSERT INTO extraction_artifacts
                  (request_id, artifact_type, artifact_version, content_text, content_json)
                VALUES
                  (%s, 'RAW_TEXT', 1, %s, NULL)
                ON DUPLICATE KEY UPDATE
                  content_text=VALUES(content_text)
                """,
                (request_id, raw_text),
            )
            cur.execute(
                """
                INSERT INTO extraction_artifacts
                  (request_id, artifact_type, artifact_version, content_text, content_json)
                VALUES
                  (%s, 'NORMALIZED_JSON', 1, NULL, CAST(%s AS JSON))
                ON DUPLICATE KEY UPDATE
                  content_json=VALUES(content_json)
                """,
                (request_id, json.dumps(payload, ensure_ascii=False)),
            )
            cur.execute(
                """
                INSERT INTO extraction_events
                  (request_id, event_type, event_payload, actor)
                VALUES
                  (%s, %s, CAST(%s AS JSON), 'pdf-extractor')
                """,
                (
                    request_id,
                    "EXTRACTION_COMPLETED" if status in {"COMPLETED", "NEEDS_AI"} else "EXTRACTION_FAILED",
                    json.dumps(
                        {
                            "status": status,
                            "confidence": confidence,
                            "needs_ai": bool(payload.get("needs_ai")),
                            "missing_fields": payload.get("missing_fields") or [],
                        },
                        ensure_ascii=False,
                    ),
                ),
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("db persistence failed: %s", exc)
    finally:
        conn.close()


def fetch_extraction_trace(request_id: str) -> dict | None:
    conn = _conn()
    if conn is None:
        return None

    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute(
                """
                SELECT id, request_id, batch_id, file_id, file_hash, original_name, file_path, parser_version,
                       status, confidence, needs_ai, started_at, finished_at, error_message, created_at, updated_at
                FROM extraction_requests
                WHERE request_id = %s
                LIMIT 1
                """,
                (request_id,),
            )
            req = cur.fetchone()
            if not req:
                return None

            cur.execute(
                """
                SELECT id, field_path, source, confidence, value_json, is_final, created_at
                FROM extraction_fields
                WHERE request_id = %s
                ORDER BY field_path ASC
                """,
                (request_id,),
            )
            fields = cur.fetchall() or []

            cur.execute(
                """
                SELECT id, artifact_type, artifact_version, page_from, page_to, content_hash, created_at
                FROM extraction_artifacts
                WHERE request_id = %s
                ORDER BY artifact_type ASC, artifact_version ASC
                """,
                (request_id,),
            )
            artifacts = cur.fetchall() or []

            cur.execute(
                """
                SELECT id, event_type, event_payload, actor, created_at
                FROM extraction_events
                WHERE request_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (request_id,),
            )
            events = cur.fetchall() or []

            return {
                "request": req,
                "fields": fields,
                "artifacts": artifacts,
                "events": events,
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("db trace fetch failed: %s", exc)
        return None
    finally:
        conn.close()
