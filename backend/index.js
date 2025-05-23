// Imports
import express from 'express';
import cors from 'cors';
import textToSpeech from '@google-cloud/text-to-speech';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import fs from 'fs'; // For fs.promises and fs.existsSync, fs.createReadStream, fs.unlink
import path from 'path'; // For constructing file paths
// 'writeFile' from 'node:fs/promises' is kept for potential future use.
// import { writeFile } from 'node:fs/promises'; // Not directly used, can be commented if not planned
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3001;

// Apply Middleware
app.use(cors());
app.use(express.json());

// In-Memory Store for Active TTS Operations
// Status can be: PENDING, RUNNING, DONE_GCS_READY, FAILED, ERROR_POLLING
const activeTtsOperations = {}; // Example: { fileId: { operationName: '...', gcsUri: '...', status: 'PENDING', progress: 0, error?: string } }


// --- Google Cloud Client Setup ---
const clientOptions = {
  keyFilename: './credentials.json' // Path relative to backend/index.js
};
// TTS Client
const ttsClient = new textToSpeech.TextToSpeechLongAudioSynthesizeClient(clientOptions);
// Storage Client
const storage = new Storage(clientOptions);


// Utility function to load text file (kept from original)
async function loadTextFile(filePath) {
  try {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    return text;
  } catch (error) {
    console.error("Could not load or read the file:", error);
    return null; // Or throw error
  }
}

// Refactored TTS logic
async function synthesizeLongAudioGCS(textToSynthesize, outputGcsUri) {
  if (!textToSynthesize) {
    console.error("No text provided for synthesis.");
    throw new Error("No text provided for synthesis.");
  }
  if (!outputGcsUri) {
    console.error("No output GCS URI provided for synthesis.");
    throw new Error("No output GCS URI provided for synthesis.");
  }
  if (!process.env.PARENT) {
    console.error("PARENT environment variable is not set.");
    throw new Error("PARENT environment variable is not set for TTS.");
  }

  const request = {
    input: { text: textToSynthesize },
    voice: {
      languageCode: 'en-US',
      ssmlGender: 'NEUTRAL',
      name: "en-us-Standard-A"
    },
    audioConfig: { audioEncoding: 'MP3' }, // Changed from LINEAR16 to MP3
    outputGcsUri: outputGcsUri,
    parent: process.env.PARENT
  };

  try {
    console.log("Synthesizing long audio with request:", JSON.stringify(request, null, 2));
    const [operation] = await ttsClient.synthesizeLongAudio(request);
    console.log("Synthesis operation object received:", operation);
    return operation; 
  } catch (error) {
    console.error("Error during text-to-speech synthesis call:", error);
    throw error; 
  }
}

// --- API Endpoints ---

// Basic Status Endpoint
app.get('/api/status', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

// TTS Initiation Endpoint
app.post('/api/generate-audio', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text input is required' });
  }

  if (!process.env.GCS_BUCKET_NAME) {
    console.error('GCS_BUCKET_NAME environment variable is not set.');
    return res.status(500).json({ error: 'Server configuration error: GCS bucket not specified.' });
  }
  if (!process.env.PARENT) {
    console.error('PARENT environment variable (Google Cloud Project ID) is not set.');
    return res.status(500).json({ error: 'Server configuration error: Google Cloud Project ID not specified.' });
  }

  const fileId = uuidv4();
  const outputGcsFile = `${fileId}.mp3`; // Filename in GCS
  const outputGcsUri = `gs://${process.env.GCS_BUCKET_NAME}/${outputGcsFile}`;

  try {
    console.log(`Initiating TTS for fileId: ${fileId} with output URI: ${outputGcsUri}`);
    const operation = await synthesizeLongAudioGCS(text, outputGcsUri);

    if (!operation || !operation.name) {
      console.error('TTS operation initiation failed or did not return an operation name.');
      return res.status(500).json({ error: 'Failed to initiate audio synthesis.' });
    }
    
    console.log('TTS operation initiated successfully. Operation Name:', operation.name);

    activeTtsOperations[fileId] = {
      operationName: operation.name,
      gcsUri: outputGcsUri,
      status: 'PENDING',
      progress: 0
    };

    res.status(202).json({
      fileId,
      eventsUrl: `/api/events/${fileId}`,
      status: 'Processing started'
    });

  } catch (error) {
    console.error('Error during TTS initiation for fileId:', fileId, error);
    const errorMessage = error.message || 'Failed to initiate audio synthesis due to an internal error.';
    res.status(500).json({ error: errorMessage });
  }
});

// SSE Progress Endpoint
app.get('/api/events/:fileId', async (req, res) => {
  const { fileId } = req.params;

  if (!activeTtsOperations[fileId]) {
    return res.status(404).json({ error: 'Invalid or unknown file ID for events stream.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust for specific origins in production
  res.flushHeaders();

  res.write(`event: connected
data: ${JSON.stringify({ message: "Connected to progress stream for fileId: " + fileId })}

`);

  const operationDetails = activeTtsOperations[fileId];
  const operationName = operationDetails.operationName;

  let pollingInterval = setInterval(async () => {
    try {
      const [operation] = await ttsClient.operationsClient.getOperation({ name: operationName });

      if (operation.error) {
        console.error(`TTS Operation Error for ${fileId}:`, operation.error);
        activeTtsOperations[fileId].status = 'FAILED';
        activeTtsOperations[fileId].error = operation.error.message || 'Unknown TTS operation error';
        res.write(`event: error
data: ${JSON.stringify({ message: 'TTS generation failed.', error: operation.error.message || 'Unknown error' })}

`);
        clearInterval(pollingInterval);
        res.end();
        return;
      }

      if (operation.done) {
        // Update status to indicate GCS file is ready
        activeTtsOperations[fileId].status = 'DONE_GCS_READY';
        activeTtsOperations[fileId].progress = 100;
        
        // Send final progress event
        res.write(`event: progress
data: ${JSON.stringify({ percentage: 100 })}

`);

        // Log that the file is ready in GCS
        console.log(`TTS complete for ${fileId}. File ready at GCS URI: ${operationDetails.gcsUri}`);
        
        // Send complete event, downloadUrl will be handled by /api/download/:fileId to stream from GCS
        res.write(`event: complete
data: ${JSON.stringify({ downloadUrl: `/api/download/${fileId}`, message: "Audio ready for download (from GCS)." })}

`);
        clearInterval(pollingInterval);
        res.end();
      } else {
        const metadata = operation.metadata;
        let progressPercentage = activeTtsOperations[fileId].progress || 0;

        if (metadata && typeof metadata.progressPercentage === 'number') {
            progressPercentage = metadata.progressPercentage;
        } else {
            console.warn(`Progress percentage not found or not a number in metadata for ${fileId}. Metadata:`, JSON.stringify(metadata));
            if (activeTtsOperations[fileId].status === 'PENDING' && progressPercentage === 0) {
                progressPercentage = 1; 
            }
        }
        
        activeTtsOperations[fileId].status = 'RUNNING';
        activeTtsOperations[fileId].progress = progressPercentage;
        
        res.write(`event: progress
data: ${JSON.stringify({ percentage: progressPercentage })}

`);
      }
    } catch (err) {
      console.error(`Error polling operation status for ${fileId}:`, err);
      if (activeTtsOperations[fileId] && activeTtsOperations[fileId].status !== 'FAILED' && activeTtsOperations[fileId].status !== 'DONE_GCS_READY') { // Check against new status
        activeTtsOperations[fileId].status = 'ERROR_POLLING';
        activeTtsOperations[fileId].error = err.message;
      }
      res.write(`event: error
data: ${JSON.stringify({ message: 'Error fetching progress.', details: err.message })}

`);
    }
  }, 5000); 

  req.on('close', () => {
    if (activeTtsOperations[fileId]) { 
        console.log(`Client disconnected for fileId: ${fileId}. Clearing polling interval.`);
    } else {
        console.log(`Client disconnected for fileId: ${fileId} (already cleaned up or state unknown). Clearing polling interval.`);
    }
    clearInterval(pollingInterval);
    res.end();
  });
});

// File Download Endpoint (Updated to stream from GCS)
app.get('/api/download/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const operationEntry = activeTtsOperations[fileId];

  if (!operationEntry || operationEntry.status !== 'DONE_GCS_READY' || !operationEntry.gcsUri) {
    return res.status(404).json({ error: 'File not found, not ready, or GCS URI missing.' });
  }

  const gcsUri = operationEntry.gcsUri;
  let bucketName;
  let gcsFileName;

  try {
    const gcsPathParts = gcsUri.replace('gs://', '').split('/');
    bucketName = gcsPathParts.shift(); // First part is bucket name
    gcsFileName = gcsPathParts.join('/'); // Rest is the file name/path
    
    if (!bucketName || !gcsFileName) {
      throw new Error('Invalid GCS URI format.');
    }
  } catch (uriError) {
    console.error(`Invalid GCS URI for ${fileId}: ${gcsUri}`, uriError);
    return res.status(500).json({ error: 'Server error: Could not parse GCS path.' });
  }
  
  console.log(`Streaming file for ${fileId} from GCS: gs://${bucketName}/${gcsFileName}`);

  const gcsFile = storage.bucket(bucketName).file(gcsFileName);
  
  // Check if file exists on GCS before attempting to stream
  try {
    const [exists] = await gcsFile.exists();
    if (!exists) {
      console.error(`File not found on GCS for ${fileId}: gs://${bucketName}/${gcsFileName}`);
      delete activeTtsOperations[fileId]; // Clean up entry
      return res.status(404).json({ error: 'File no longer available on cloud storage.' });
    }
  } catch (checkError) {
    console.error(`Error checking GCS file existence for ${fileId}:`, checkError);
    return res.status(500).json({ error: 'Server error: Could not verify file on cloud storage.' });
  }

  const desiredFileName = `${fileId}.mp3`; // Or a more generic name like 'audio.mp3'
  res.setHeader('Content-Disposition', `attachment; filename="${desiredFileName}"`);
  res.setHeader('Content-Type', 'audio/mpeg'); // Assuming MP3 format

  const gcsStream = gcsFile.createReadStream();

  let gcsDeletionAttempted = false;
  const deleteFromGcsAndCleanup = async () => {
    if (gcsDeletionAttempted) return;
    gcsDeletionAttempted = true;
    try {
      await gcsFile.delete();
      console.log(`File gs://${bucketName}/${gcsFileName} deleted successfully from GCS for ${fileId}.`);
    } catch (deleteErr) {
      console.error(`Error deleting file from GCS gs://${bucketName}/${gcsFileName} for ${fileId}:`, deleteErr);
      // Log error, but don't send error to client as download might have finished.
    }
    delete activeTtsOperations[fileId];
    console.log(`Cleaned up activeTtsOperations for ${fileId}.`);
  };

  gcsStream.on('error', (err) => {
    console.error(`Error streaming file from GCS for ${fileId} (gs://${bucketName}/${gcsFileName}):`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error streaming file from cloud storage.' });
    }
    // Don't delete from GCS on stream read error, as file might still be there and retrievable.
    // Clean up local state only.
    // delete activeTtsOperations[fileId]; // Decided against this to allow retry if GCS issue was temporary
    res.end(); 
  });

  // res.on('finish') is generally more reliable for client completion
  res.on('finish', () => {
    console.log(`File successfully streamed to client for ${fileId} (gs://${bucketName}/${gcsFileName}). Initiating GCS delete.`);
    deleteFromGcsAndCleanup();
  });
  
  req.on('close', () => { // Client disconnected
    if (!res.writableEnded) { // Check if streaming was already finished
        console.log(`Client disconnected during download for ${fileId} (gs://${bucketName}/${gcsFileName}). Aborting stream and initiating GCS delete.`);
        gcsStream.destroy(); // Stop streaming from GCS
        deleteFromGcsAndCleanup();
    }
  });

  gcsStream.pipe(res);
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Export app for potential testing or serverless functions if needed in future
export default app;