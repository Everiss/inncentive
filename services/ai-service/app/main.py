from fastapi import FastAPI

from app.api.routes import router

app = FastAPI(title="ai-service", version="0.1.0")
app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    # Port is defined by uvicorn invocation (default in project: 8020).
    print("INFO: [ai-service] app loaded (expected port: 8020)")
