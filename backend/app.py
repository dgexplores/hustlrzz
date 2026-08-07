from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from backend.api.routes import router
from backend.config import CORS_ORIGINS
from backend.tools.logger import get_logger, audit
from backend.api.middleware import RequestIDMiddleware, RateLimitMiddleware
from fastapi.middleware.cors import CORSMiddleware

logger = get_logger("app")

app = FastAPI()

# Middleware order matters: add_middleware wraps outward, so the last one added
# runs first. CORS must be outermost, then request-ID, then rate limiting.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,  # explicit origins from CORS_ORIGINS env var
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


# Global exception handler: log full details server-side, return a generic
# message to clients (never leak internal exception text / stack traces).
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    audit(
        "app.unhandled_error",
        request_id=getattr(request.state, "request_id", None),
        method=request.method,
        path=request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        },
    )


app.include_router(router)
