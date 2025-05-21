// Imports the Google Cloud client library
import textToSpeech from '@google-cloud/text-to-speech';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// const root = await protobuf.load('./cloud_tts_lrs.proto');
// const SynthesizeLongAudioMetadata = root.lookupType('google.cloud.texttospeech.v1.SynthesizeLongAudioMetadata');
// Function to load text from a file
async function loadTextFile(filePath) {
  try {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    return text;
  } catch (error) {
    console.error("Could not load or read the file:", error);
    return null;
  }
}

// Initialize the Text-to-Speech client
const ttsClient = new textToSpeech.v1.TextToSpeechLongAudioSynthesizeClient({
  keyFilename: './credentials.json',
});

// Initialize the Google Cloud Storage client
const storage = new Storage({
  keyFilename: './credentials.json',
});

async function synthesizeLongAudio() {
  const text = await loadTextFile('./essay.txt');
  if (!text) return;

  const outputGcsUri = process.env.OUTPUT_URI; // e.g., 'gs://your-bucket-name/output.wav'
  const parent = process.env.PARENT; // e.g., 'projects/your-project-id/locations/us'

  const request = {
    parent,
    input: { text },
    voice: {
      languageCode: 'en-US',
      ssmlGender: 'NEUTRAL',
      name: 'en-US-Standard-A',
    },
    audioConfig: { audioEncoding: 'LINEAR16' },
    outputGcsUri,
  };

  console.log('Starting long-form audio synthesis...');
  const [operation] = await ttsClient.synthesizeLongAudio(request);

  // Extract operation name for polling
  const operationName = operation.name;

  // Polling mechanism to check operation status
  let isDone = false;
  while (!isDone) {
    const [currentOperation] = await ttsClient.operationsClient.getOperation({ name: operationName });
    const progresso = await ttsClient.checkSynthesizeLongAudioProgress(operationName);
    // console.log("progresso ", progresso.metadata.progressPercentage);
    if (currentOperation.done) {
      isDone = true;
      console.log('Synthesis complete.');
    } else {
      // const metadata = currentOperation.metadata;
      const progress = progresso.metadata.progressPercentage;
      console.log(`Progress: ${progress}%`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before next check
    }
  }

  // // Generate a signed URL for the output file
  // const gcsUriParts = outputGcsUri.replace('gs://', '').split('/');
  // const bucketName = gcsUriParts.shift();
  // const fileName = gcsUriParts.join('/');

  // const options = {
  //   version: 'v4',
  //   action: 'read',
  //   expires: Date.now() + 60 * 60 * 1000, // 1 hour
  // };

  // try {
  //   const [url] = await storage
  //     .bucket(bucketName)
  //     .file(fileName)
  //     .getSignedUrl(options);

  //   console.log(`Download your audio file here: ${url}`);
  // } catch (error) {
  //   console.error('Error generating signed URL:', error);
  // }
}

synthesizeLongAudio();
