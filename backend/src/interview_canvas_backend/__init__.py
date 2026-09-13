"""CLI entry: uv run interview-canvas-backend"""


def main() -> None:
    import uvicorn

    uvicorn.run(
        "interview_canvas_backend.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
