import json
from typing import Any

import anthropic

from app.api.schemas import ExecuteRequest, ExecuteResponse
from app.core.config import settings


class AnthropicProvider:
    def __init__(self) -> None:
        if not settings.anthropic_api_key:
            raise RuntimeError("Anthropic provider not initialized: ANTHROPIC_API_KEY is missing")
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def execute(self, request: ExecuteRequest) -> ExecuteResponse:
        start_ms = __import__("time").time_ns() // 1_000_000

        message_content = self._build_message_content(request)
        params: dict[str, Any] = {
            "model": request.model,
            "max_tokens": request.max_tokens,
            "system": request.system_prompt,
            "messages": [{"role": "user", "content": message_content}],
        }

        if request.extended_thinking:
            params["thinking"] = {
                "type": "enabled",
                "budget_tokens": request.thinking_budget or 4000,
            }

        if request.temperature is not None:
            params["temperature"] = request.temperature

        try:
            response = self.client.messages.create(**params)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Anthropic execution failed: {exc}") from exc

        text_response = ""
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text_response = getattr(block, "text", "") or ""
                break

        data = self._parse_json_response(text_response, request.task)

        latency_ms = (__import__("time").time_ns() // 1_000_000) - start_ms
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)

        return ExecuteResponse(
            task=request.task,
            provider="anthropic",
            model=request.model,
            data=data,
            latencyMs=latency_ms,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            tokensUsed=(input_tokens or 0) + (output_tokens or 0),
        )

    def _build_message_content(self, request: ExecuteRequest) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = []

        if request.is_pdf_base64:
            content.append(
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": request.content,
                    },
                }
            )
            full_instruction = request.task_instruction
            if request.context_hint:
                full_instruction = f"{request.context_hint}\n\n{request.task_instruction}"
            content.append({"type": "text", "text": full_instruction})
            return content

        instruction = self._build_chunk_instruction(request.task_instruction, request.chunk_context)
        hint_prefix = f"{request.context_hint}\n\n" if request.context_hint else ""
        content.append(
            {
                "type": "text",
                "text": f"{hint_prefix}{instruction}\n\n---\n\n{request.content}",
            }
        )
        return content

    def _build_chunk_instruction(self, base: str, chunk: Any | None) -> str:
        if not chunk or chunk.total == 1:
            return base

        if chunk.index == 0:
            position = "INITIAL CHUNK (first part)"
        elif chunk.index == chunk.total - 1:
            position = "FINAL CHUNK (last part)"
        else:
            position = f"MIDDLE CHUNK (part {chunk.index + 1} of {chunk.total})"

        return (
            f"ATTENTION: This is {position} of a document split into {chunk.total} chunks due to size.\n"
            "Extract ALL data available in this chunk. For fields unavailable here, use null.\n"
            "Results from all chunks will be merged automatically.\n\n"
            f"{base}"
        )

    def _parse_json_response(self, text: str, task: str) -> dict[str, Any]:
        if not text or not text.strip():
            return {"error": "Empty response", "raw": ""}

        candidate = text.strip()

        try:
            return json.loads(candidate)
        except Exception:  # noqa: BLE001
            pass

        fenced_start = candidate.find("```")
        if fenced_start != -1:
            fenced_end = candidate.find("```", fenced_start + 3)
            if fenced_end != -1:
                block = candidate[fenced_start + 3 : fenced_end].strip()
                if block.startswith("json"):
                    block = block[4:].strip()
                try:
                    return json.loads(block)
                except Exception:  # noqa: BLE001
                    pass

        first_obj_start = candidate.find("{")
        first_obj_end = candidate.rfind("}")
        if first_obj_start != -1 and first_obj_end > first_obj_start:
            possible = candidate[first_obj_start : first_obj_end + 1]
            try:
                return json.loads(possible)
            except Exception:  # noqa: BLE001
                pass

        if first_obj_start != -1:
            partial = candidate[first_obj_start:]
            recovered = self._repair_truncated_json(partial)
            if recovered is not None:
                return recovered

        return {"error": "Invalid JSON response", "task": task, "raw": candidate[:500]}

    def _repair_truncated_json(self, partial: str) -> dict[str, Any] | None:
        s = partial.rstrip()
        if s.endswith(","):
            s = s[:-1]

        last_quote = s.rfind('"')
        if last_quote != -1:
            tail = s[last_quote + 1 :]
            if '"' not in tail:
                s = s[:last_quote]
                if s.endswith(":"):
                    s = s[:-1]
                if s.endswith(","):
                    s = s[:-1]

        braces = 0
        brackets = 0
        in_string = False
        escaped = False

        for ch in s:
            if escaped:
                escaped = False
                continue
            if ch == "\\" and in_string:
                escaped = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                braces += 1
            elif ch == "}":
                braces -= 1
            elif ch == "[":
                brackets += 1
            elif ch == "]":
                brackets -= 1

        if braces <= 0 and brackets <= 0:
            return None

        fixed = s + ("]" * max(0, brackets)) + ("}" * max(0, braces))
        try:
            parsed = json.loads(fixed)
        except Exception:  # noqa: BLE001
            return None

        if isinstance(parsed, dict):
            return parsed
        return {"data": parsed}
