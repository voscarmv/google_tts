# Google TTS Full-Stack Application

This project implements a text-to-speech (TTS) generation service using Google Cloud Text-to-Speech API, an Express.js backend, and a React frontend. It features real-time progress updates via Server-Sent Events (SSE) and direct GCS audio streaming.

## Project Structure

-   `/backend`: Node.js Express server handling TTS requests and serving files.
-   `/frontend`: React application (built with Vite) for user interaction.

## Setup and Running

### Backend (`/backend` directory)

1.  **Prerequisites**:
    *   Node.js (v18+ recommended)
    *   A Google Cloud Platform (GCP) project.
    *   A Google Cloud Storage (GCS) bucket within your GCP project.
    *   A GCP Service Account with permissions for Text-to-Speech and GCS read/write access to your bucket. Download its JSON key.

2.  **Configuration**:
    *   Navigate to the `backend` directory: `cd backend`
    *   Copy the example credentials file: `cp credentials.example.json credentials.json`
        *   Paste your downloaded GCP Service Account JSON key content into `credentials.json`.
    *   Copy the example environment file: `cp .env.example .env`
    *   Edit `.env` and provide the following values:
        *   `PARENT`: Your Google Cloud Project ID and the location for TTS processing (e.g., `projects/your-gcp-project-id/locations/us-central1`). The location must be one supported by the TTS API for long audio synthesis.
        *   `GCS_BUCKET_NAME`: The name of your GCS bucket where audio files will be temporarily stored.
        *   `PORT` (Optional): The port for the backend server (defaults to 3001).

3.  **Install Dependencies**:
    ```bash
    npm install
    ```

4.  **Run the Server**:
    ```bash
    npm start
    ```
    The backend server will start, typically on port 3001.

### Frontend (`/frontend` directory)

1.  **Prerequisites**:
    *   Node.js (v18+ recommended)

2.  **Configuration**:
    *   The frontend connects to the backend at `http://localhost:3001` by default. This is configured in `frontend/src/redux/sagas.js`.

3.  **Install Dependencies**:
    *   Navigate to the `frontend` directory: `cd frontend`
    ```bash
    npm install
    ```

4.  **Run the Development Server**:
    ```bash
    npm run dev
    ```
    The React development server will start, typically on port 5173. Open your browser to this address.

## How it Works

1.  User enters text in the React frontend and submits.
2.  Frontend makes an API call to the Express backend (`/api/generate-audio`).
3.  Backend initiates a Google Cloud Long Audio Synthesis operation, targeting a unique file in the configured GCS bucket.
4.  Backend immediately responds with a `fileId` and an SSE events URL.
5.  Frontend connects to the SSE endpoint (`/api/events/:fileId`).
6.  Backend polls the GCS operation and sends progress updates (percentage) via SSE.
7.  When TTS is complete on GCS, backend sends a 'complete' SSE event with a download URL (`/api/download/:fileId`).
8.  Frontend displays a download link.
9.  When the user clicks the download link, the React app requests the `/api/download/:fileId` backend endpoint.
10. Backend streams the audio file directly from GCS to the client's browser.
11. After the stream completes (or if the client disconnects), the backend deletes the audio file from the GCS bucket.
