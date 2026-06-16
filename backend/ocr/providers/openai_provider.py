"""OpenAI GPT-4o receipt parsing provider."""

import base64
import json
import os

from openai import OpenAI

from ocr.llm_service import SYSTEM_PROMPT, RESPONSE_SCHEMA


# OpenAI structured output format wraps the schema
_OPENAI_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "receipt_items",
        "strict": True,
        "schema": RESPONSE_SCHEMA,
    },
}


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set")
    return OpenAI(api_key=api_key)


def parse_receipt(pages: list[tuple[bytes, str]]) -> dict:
    """Parse a receipt using OpenAI GPT-4o vision.

    ``pages`` is a list of ``(image_bytes, mime_type)`` tuples. Multiple pages are
    sent in a single call and treated as one receipt.
    """
    client = _get_client()

    content = [{"type": "text", "text": "Extract all items from this receipt."}]
    for image_bytes, mime_type in pages:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        image_url = f"data:{mime_type};base64,{b64_image}"
        content.append(
            {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}}
        )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        response_format=_OPENAI_RESPONSE_FORMAT,
        max_tokens=4096,
        temperature=0,
    )

    return json.loads(response.choices[0].message.content)
