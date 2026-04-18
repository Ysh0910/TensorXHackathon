# AI Gold Assessment System – Stage 1

Secure, asynchronous bridge between a mobile sensor-capture app and a persistent backend.

---

## Project Structure

```
├── backend/
│   ├── main.py            ← FastAPI application
│   ├── requirements.txt
│   └── uploads/           ← auto-created on first run
│       ├── images/
│       └── audio/
└── frontend/
    ├── App.js             ← React Native / Expo application
    ├── app.json
    └── package.json
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| MongoDB | 7.x (local, default port 27017) |
| Node.js | 18+ |
| Expo CLI | `npm i -g expo-cli` (SDK 54) |

---

## Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start MongoDB (if not already running as a service)
mongod --dbpath ./data/db        # or use your system service

# Run the API server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

## Frontend Setup

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) or press `a` for Android emulator / `i` for iOS simulator.

### Connecting to the backend from a physical device

Edit the `BACKEND_URL` constant at the top of `App.js`:

```js
// Replace with your machine's LAN IP address
const BACKEND_URL = 'http://192.168.1.X:8000';
```

---

## API Reference

### `POST /start-assessment`

Accepts `multipart/form-data` with two fields:

| Field | Type | Description |
|-------|------|-------------|
| `image` | file | High-resolution photo |
| `audio` | file | WAV tap-test recording |

**Response `201 Created`:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Assessment received successfully."
}
```

### `GET /health`

Liveness probe – returns `{ "status": "ok", "timestamp": "..." }`.

---

## MongoDB Document Schema

Collection: `gold_db.assessments`

```json
{
  "_id":          "<ObjectId>",
  "session_id":   "<uuid4>",
  "image_path":   "uploads/images/<session_id>.jpg",
  "audio_path":   "uploads/audio/<session_id>.wav",
  "status":       "received",
  "timestamp":    "<UTC datetime>"
}
```

---

## App Workflow

1. **Capture Image** – opens the device camera; tap the shutter to take a high-res photo.
2. **Hold-to-Record Tap Test** – press and hold to record audio; release to stop.
3. **Submit Assessment** – packages both files into `FormData` and POSTs to the backend.  
   A loading spinner is shown during upload; an alert displays the returned `session_id`.

---

## Configuration

| Constant | File | Purpose |
|----------|------|---------|
| `BACKEND_URL` | `frontend/App.js` | API base URL |
| `MONGO_URI` | `backend/main.py` | MongoDB connection string |
| `DB_NAME` | `backend/main.py` | Database name |
| `UPLOAD_ROOT` | `backend/main.py` | Local file storage root |
