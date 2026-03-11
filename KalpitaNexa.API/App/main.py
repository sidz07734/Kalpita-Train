# app/main.py
import logging
import time
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from App.dependencies import verify_token

# Import all the routers from the controllers
from .Controllers import (
    auth_controller, user_controller,
    chat_controller,search_controller,promptmanager_controller,
    file_processing_controller,
    visualization_controller,
    role_controller,
    tenant_controller,
    admin_controller,
    application_controller,
    bot_controller,training_controller
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="KalpitaNexa API(Restructured)",
    description="A clean, modular API with separated concerns.",
    version="5.0.0"
)

# ==================== PERFORMANCE FIX #4: Add Performance Monitoring ====================
@app.middleware("http")
async def add_performance_monitoring(request: Request, call_next):
    """
    Middleware to track and log request processing time.
    Helps identify slow endpoints and performance bottlenecks.
    """
    start_time = time.time()
    
    
    response = await call_next(request)
    
    # Calculate processing time
    process_time = time.time() - start_time
    
    # Add processing time to response headers (useful for debugging)
    response.headers["X-Process-Time"] = f"{process_time:.3f}s"
    
    # Log all requests with their timing
    logger.info(f"{request.method} {request.url.path} - {process_time:.3f}s")
    
    # Warn about slow requests (over 2 seconds)
    if process_time > 2.0:
        logger.warning(
            f"⚠️ SLOW REQUEST DETECTED: {request.method} {request.url.path} "
            f"took {process_time:.2f}s"
        )
    
    # Alert about very slow requests (over 5 seconds)
    if process_time > 5.0:
        logger.error(
            f"🚨 VERY SLOW REQUEST: {request.method} {request.url.path} "
            f"took {process_time:.2f}s - NEEDS OPTIMIZATION!"
        )
    
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost:4201","https://kalpitanexaclient-dev.azurewebsites.net","https://kalpitanexaclient.azurewebsites.net"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_controller.router, prefix="/api/auth", tags=["Authentication"])
protected_dependencies = [Depends(verify_token)]
# Include all the routers
logger.info("Including API routers...")
# app.include_router(auth_controller.router, prefix="/api/auth", tags=["Authentication"],)
app.include_router(user_controller.router, prefix="/api/users", tags=["User Management"])
app.include_router(chat_controller.router, prefix="/api", tags=["Chat & Files"])
app.include_router(search_controller.router, prefix="/api", tags=["Search"])
app.include_router(promptmanager_controller.router, prefix="/api", tags=["Prompt Manager"])
app.include_router(file_processing_controller.router, prefix="/api", tags=["File Processing"])
app.include_router(visualization_controller.router, prefix="/api", tags=["Visualization"])
app.include_router(role_controller.router, prefix="/api", tags=["Role Management"])
app.include_router(tenant_controller.router, prefix="/api", tags=["Tenant Management"])
app.include_router(admin_controller.router, prefix="/api/admin", tags=["Admin Management"])
app.include_router(application_controller.router, prefix="/api", tags=["Application Management"])
app.include_router(bot_controller.router, tags=["Teams Bot"])
app.include_router(training_controller.router, prefix="/api", tags=["Training"])

# ==================== PERFORMANCE FIX #5: Add Health Check Endpoint ====================
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Quick health check endpoint to verify API is running.
    Does not perform any database or external service calls.
    """
    return {
        "status": "healthy",
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)