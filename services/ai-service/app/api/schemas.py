from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ChunkContext(BaseModel):
    index: int
    total: int


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task: str
    provider: str
    model: str
    max_tokens: int = Field(alias="maxTokens")
    temperature: float | None = None
    extended_thinking: bool = Field(default=False, alias="extendedThinking")
    thinking_budget: int | None = Field(default=None, alias="thinkingBudget")
    content: str
    is_pdf_base64: bool = Field(default=False, alias="isPdfBase64")
    chunk_context: ChunkContext | None = Field(default=None, alias="chunkContext")
    context_hint: str | None = Field(default=None, alias="contextHint")
    system_prompt: str = Field(alias="systemPrompt")
    task_instruction: str = Field(alias="taskInstruction")


class ExecuteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task: str
    provider: str
    model: str
    data: dict[str, Any]
    latency_ms: int = Field(alias="latencyMs")
    input_tokens: int | None = Field(default=None, alias="inputTokens")
    output_tokens: int | None = Field(default=None, alias="outputTokens")
    tokens_used: int | None = Field(default=None, alias="tokensUsed")


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "ai-service"
