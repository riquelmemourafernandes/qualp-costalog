from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routing import router as routing_router
from app.core.config import settings

app = FastAPI(
    title="QualP Costalog API",
    version="1.0.0",
    description="API para estimativas e planejamento de rotas de veículos pesados, com tarifas de pedágio auditáveis.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routing_router, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": "qualp-costalog-api"}
