import base64
from pathlib import Path


async def extract_text(file_path: Path, file_type: str, openai_client) -> str:
    try:
        if file_type in ("txt", "md"):
            return file_path.read_text(encoding="utf-8", errors="ignore")

        if file_type == "pdf":
            import pdfplumber
            pages = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        pages.append(text)
            return "\n".join(pages)

        if file_type == "docx":
            from docx import Document
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text)

        if file_type in ("jpg", "jpeg", "png"):
            image_data = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            mime = "image/jpeg" if file_type in ("jpg", "jpeg") else "image/png"
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{image_data}"}
                        },
                        {
                            "type": "text",
                            "text": "Extract all text visible in this image. Return only the text, no commentary."
                        }
                    ]
                }],
                max_tokens=1000
            )
            return response.choices[0].message.content or ""

    except Exception:
        pass
    return ""
