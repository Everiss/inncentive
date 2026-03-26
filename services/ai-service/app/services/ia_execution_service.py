from app.api.schemas import ExecuteRequest, ExecuteResponse
from app.providers.anthropic_provider import AnthropicProvider


PROVIDER_ANTHROPIC = "anthropic"


def execute_task(request: ExecuteRequest) -> ExecuteResponse:
    provider = request.provider.lower().strip()

    if provider == PROVIDER_ANTHROPIC:
        return AnthropicProvider().execute(request)

    raise ValueError(f"Unsupported IA provider in ai-service: {request.provider}")
