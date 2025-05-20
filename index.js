// Imports the Google Cloud client library
import textToSpeech from '@google-cloud/text-to-speech';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();
import fs from 'fs';

async function loadTextFile(filePath) {
  try {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    return text;
  } catch (error) {
    console.error("Could not load or read the file:", error);
    return null;
  }
}


// Import other required libraries
import { writeFile } from 'node:fs/promises';

// Creates a client
const options = {
  keyFilename: './credentials.json'
}
// const client = new textToSpeech.TextToSpeechClient(options);
const client = new textToSpeech.TextToSpeechLongAudioSynthesizeClient(options);
// const client = new textToSpeech.TextToSpeechLongAudioSynth(options);

async function quickStart() {
  // The text to synthesize
  const text = await loadTextFile('./essay.txt');

  // Construct the request
  const request = {
    input: { text: text },
    // Select the language and SSML voice gender (optional)
    voice: {
      languageCode: 'en-US',
      ssmlGender: 'NEUTRAL',
      name: "en-us-Standard-A"
    },
    // select the type of audio encoding
    audioConfig: { audioEncoding: 'LINEAR16' },
    outputGcsUri: process.env.OUTPUT_URI,
    parent: process.env.PARENT
  };
  const [operation] = await client.synthesizeLongAudio(request);
  console.log(operation);
  const [response] = await operation.promise();
  console.log(response);
  // // Performs the text-to-speech request
  // const [response] = await client.synthesizeLongAudio(request);

  // // Save the generated binary audio content to a local file
  // await writeFile('output.mp3', response.audioContent, 'binary');
  // console.log('Audio content written to file: output.mp3');
}

await quickStart();