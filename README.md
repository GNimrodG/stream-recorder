# RTSP Stream Recorder

A web-based application for scheduling and recording timed RTSP streams using FFmpeg with hardware acceleration support.
Built with Next.js and Material-UI.

## Features

- 📅 **Schedule Recordings** - Set a start time and duration for RTSP stream recordings
- ▶️ **Manual Control** - Start or stop recordings manually
- 📊 **Dashboard** - View recording statistics and status at a glance
- 👁️ **Live Preview** - Preview active streams with auto-refreshing snapshots
- 🎬 **Hardware Acceleration** - NVIDIA (NVENC), Intel (QSV), and AMD (AMF) support
- ⚙️ **Configurable Settings** - Customize codecs, formats, and output options
- 🐳 **Docker Ready** - Easy deployment with Docker and Docker Compose
- 📥 **Download Recordings** - Download completed recordings directly from the UI

## Screenshots

### Dashboard

View recording statistics and recent activity

### Recordings Page

Manage all recordings with filtering, preview, and download options

### Settings Page

Configure hardware acceleration, codecs, storage, and preview options

## Prerequisites

### Local Development

- Node.js 20+
- Yarn
- FFmpeg installed and available in PATH

### Docker Deployment

- Docker
- Docker Compose

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Ensure FFmpeg is installed:**
   ```bash
   # Windows (with Chocolatey)
   choco install ffmpeg

   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt install ffmpeg
   ```

3. **Run the development server:**
   ```bash
   yarn dev
   ```

4. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Docker Deployment

1. **Build and run with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

2. **Access the application:**
   Navigate to [http://localhost:3000](http://localhost:3000)

3. **View logs:**
   ```bash
   docker-compose logs -f stream-recorder
   ```

4. **Stop the application:**
   ```bash
   docker-compose down
   ```

## Configuration

### Environment Variables

| Variable                | Description                        | Default                  |
|-------------------------|------------------------------------|--------------------------|
| `RECORDINGS_DB_PATH`    | Path to the JSON database file     | `./data/recordings.json` |
| `SETTINGS_FILE_PATH`    | Path to the settings JSON file     | `./data/settings.json`   |
| `RECORDINGS_OUTPUT_DIR` | Directory for recorded video files | `./recordings`           |
| `PORT`                  | Application port                   | `3000`                   |

### Settings (via UI)

Access the Settings page to configure:

**Hardware Acceleration:**

- Auto-detect available GPU encoders
- NVIDIA NVENC/CUDA
- Intel Quick Sync Video (QSV)
- AMD AMF
- CPU-only (software encoding)

**Video Settings:**

- Output format: MP4, MKV, AVI, MPEG-TS
- Video codec: Copy, H.264, H.265/HEVC, VP9
- Audio codec: Copy, AAC, MP3, Opus
- RTSP transport: TCP, UDP, HTTP

**Recording Settings:**

- Default duration
- Reconnect attempts and delay

**Storage Settings:**

- Output directory
- Maximum storage limit
- Auto-delete after X days

**Preview Settings:**

- Enable/disable live preview
- Preview quality (320p, 640p, 1280p)
- Snapshot refresh interval

### Docker Volumes

The Docker setup uses two persistent volumes:

- `recordings_data` - Stores recorded video files
- `db_data` - Stores the recordings database and settings

## API Endpoints

### Recordings

| Method   | Endpoint                            | Description                 |
|----------|-------------------------------------|-----------------------------|
| `GET`    | `/api/recordings`                   | Get all recordings          |
| `GET`    | `/api/recordings?stats=true`        | Get recording statistics    |
| `POST`   | `/api/recordings`                   | Create a new recording      |
| `GET`    | `/api/recordings/[id]`              | Get a specific recording    |
| `PATCH`  | `/api/recordings/[id]`              | Update a recording          |
| `DELETE` | `/api/recordings/[id]`              | Delete a recording          |
| `POST`   | `/api/recordings/[id]?action=start` | Start a scheduled recording |
| `POST`   | `/api/recordings/[id]?action=stop`  | Stop a running recording    |
| `GET`    | `/api/recordings/[id]/preview`      | Get live stream preview     |
| `GET`    | `/api/recordings/[id]/download`     | Download recorded file      |

### Settings

| Method  | Endpoint                    | Description                    |
|---------|-----------------------------|--------------------------------|
| `GET`   | `/api/settings`             | Get current settings           |
| `GET`   | `/api/settings?hwinfo=true` | Get hardware acceleration info |
| `PUT`   | `/api/settings`             | Save all settings              |
| `PATCH` | `/api/settings`             | Update partial settings        |

## Usage

1. **Configure Settings (Optional):**
    - Go to Settings page
    - Configure hardware acceleration if you have a compatible GPU
    - Set your preferred output format and codecs
    - Configure storage location and limits

2. **Create a Recording:**
    - Click "New Recording" button
    - Enter a name for the recording
    - Set the RTSP URL (e.g., `rtsp://admin:password@192.168.1.100:554/stream`)
    - Set the start time
    - Set the duration in seconds
    - Click "Schedule Recording"

3. **Monitor Recordings:**
    - View the status of all recordings in the Dashboard or Recordings page
    - Scheduled recordings show an "info" status
    - Active recordings show a "recording" status with preview and stop buttons
    - Completed recordings show a "success" status with download button

4. **Preview Active Streams:**
    - Click the eye icon on any active recording
    - View the live stream with auto-refreshing snapshots

5. **Download Completed Recordings:**
    - Click the download icon on completed recordings
    - The video file will be downloaded to your device

## Tech Stack

- **Frontend:** Next.js 16, React 19, Material-UI 7
- **Backend:** Next.js API Routes
- **Recording:** FFmpeg with hardware acceleration
- **Date Picker:** MUI X Date Pickers
- **Storage:** JSON file-based database
- **Container:** Nvidia/CUDA base image for hardware acceleration support + FFmpeg + Node.js

## Project Structure

```
stream-recorder/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── recordings/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── preview/route.ts
│   │   │   │       └── download/route.ts
│   │   │   └── settings/
│   │   │       └── route.ts
│   │   ├── recordings/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── recordings.ts
│   │   └── settings.ts
│   ├── types/
│   │   ├── recording.ts
│   │   └── settings.ts
│   └── theme.ts
├── data/               # Database and settings
├── recordings/         # Recorded video files
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Hardware Acceleration Notes

### NVIDIA (NVENC)

- Requires NVIDIA GPU with NVENC support
- Docker: Use `nvidia/cuda` base image with nvidia-docker

### Intel Quick Sync (QSV)

- Requires Intel CPU with integrated graphics (6th gen+)
- Docker: Mount `/dev/dri` device

### AMD (AMF)

- Requires AMD GPU with AMF support
- Docker: Use ROCm or AMDGPU drivers
