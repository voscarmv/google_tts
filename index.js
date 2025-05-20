// Imports the Google Cloud client library
import textToSpeech from '@google-cloud/text-to-speech';

// Import other required libraries
import {writeFile} from 'node:fs/promises';

// Creates a client
const options = {
    keyFilename: './credentials.json'
}
const client = new textToSpeech.TextToSpeechClient(options);

async function quickStart() {
  // The text to synthesize
  const text = 'hello, world!';

  // Construct the request
  const request = {
    input: {text: text},
    // Select the language and SSML voice gender (optional)
    voice: {languageCode: 'en-US', ssmlGender: 'NEUTRAL'},
    // select the type of audio encoding
    audioConfig: {audioEncoding: 'MP3'},
  };

  // Performs the text-to-speech request
  const [response] = await client.synthesizeSpeech(request);

  // Save the generated binary audio content to a local file
  await writeFile('output.mp3', response.audioContent, 'binary');
  console.log('Audio content written to file: output.mp3');
}

await quickStart();