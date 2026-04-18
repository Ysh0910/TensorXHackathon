"""
AI Gold Assessment System - Stage 1 Backend
FastAPI + Motor (async MongoDB) + Local File Storage
"""

import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

import motor.motor_asyncio
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("gold_assessment")

# ---------------------------------------------------------------------------
# Directory setup
# ---------------------------------------------------------------------------
UPLOAD_ROOT = Path("uploads")
IMAGE_DIR = UPLOAD_ROOT / "images"
AUDIO_DIR = UPLOAD_ROOT / "audio"

IMAGE_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# MongoDB (Motor async driver)
# ---------------------------------------------------------------------------
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "gold_db"
COLLECTION_NAME = "assessments"

mongo_client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
db = mongo_client[DB_NAME]
assessments_collection = db[COLLECTION_NAME]

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AI Gold Assessment API",
    description="Stage 1 – Secure async bridge for sensor data ingestion.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _extension(filename: str | None, fallback: str) -> str:
    """Return the file extension from a filename, or a safe fallback."""
    if filename and "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return fallback


async def _save_file(upload: UploadFile, dest: Path) -> str:
    """Stream an UploadFile to disk and return the relative path string."""
    contents = await upload.read()
    dest.write_bytes(contents)
    logger.info("Saved file → %s (%d bytes)", dest, len(contents))
    return str(dest)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", tags=["ops"])
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/start-assessment", status_code=status.HTTP_201_CREATED, tags=["assessment"])
async def start_assessment(
    image: UploadFile = File(..., description="High-resolution photo from the sensor app"),
    audio: UploadFile = File(..., description="WAV audio from the tap-test"),
):
    """
    Accept a multipart upload containing an image and an audio file.

    - Generates a unique ``session_id``.
    - Persists both files under ``uploads/images/`` and ``uploads/audio/``.
    - Inserts a tracking document into MongoDB ``assessments`` collection.
    - Returns the ``session_id`` with HTTP 201.
    """
    # Validate MIME types loosely
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Expected an image file, received content-type: {image.content_type}",
        )

    session_id = str(uuid.uuid4())

    img_ext = _extension(image.filename, "jpg")
    aud_ext = _extension(audio.filename, "wav")

    image_path = IMAGE_DIR / f"{session_id}.{img_ext}"
    audio_path = AUDIO_DIR / f"{session_id}.{aud_ext}"

    try:
        saved_image = await _save_file(image, image_path)
        saved_audio = await _save_file(audio, audio_path)
    except OSError as exc:
        logger.exception("File I/O error for session %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist uploaded files.",
        ) from exc

    document = {
        "session_id": session_id,
        "image_path": saved_image,
        "audio_path": saved_audio,
        "status": "received",
        "timestamp": datetime.now(timezone.utc),
    }

    try:
        result = await assessments_collection.insert_one(document)
        logger.info(
            "Assessment document inserted | session_id=%s | _id=%s",
            session_id,
            result.inserted_id,
        )
    except Exception as exc:
        logger.exception("MongoDB insert failed for session %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record assessment in database.",
        ) from exc

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "session_id": session_id,
            "message": "Assessment received successfully.",
        },
    )
