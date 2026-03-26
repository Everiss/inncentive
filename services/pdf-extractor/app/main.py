from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(title="pdf-extractor", version="0.1.0")
app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    # Port is defined by uvicorn invocation (default in project: 8010).
    print("INFO: [pdf-extractor] app loaded (expected port: 8010)")
