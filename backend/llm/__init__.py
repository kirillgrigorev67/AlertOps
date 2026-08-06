from .base import LLMProvider
from .openai_compatible import OpenAICompatibleProvider
from .demo import DemoProvider


def get_provider(provider_type: str, base_url: str, api_key: str, model: str) -> LLMProvider:
    """Factory function to create LLM provider instances."""
    if provider_type == "demo":
        return DemoProvider(model=model)
    return OpenAICompatibleProvider(
        base_url=base_url,
        api_key=api_key,
        model=model,
    )


__all__ = ["LLMProvider", "OpenAICompatibleProvider", "DemoProvider", "get_provider"]