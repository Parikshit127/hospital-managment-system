const { SarvamAIClient } = require('sarvamai');
require('dotenv').config();

async function testTTS() {
  const sarvamKey = process.env.SARVAM_API_KEY;
  console.log("Key available:", !!sarvamKey);
  
  const client = new SarvamAIClient({
    apiSubscriptionKey: sarvamKey
  });
  
  const response = await client.textToSpeech.convert({
    model: "bulbul:v3",
    text: "Hello, I am testing the SDK.",
    target_language_code: "hi-IN",
    speaker: "ritu"
  });
  
  console.log("SDK Keys:", Object.keys(response));
  if (response.audios) {
     console.log("Has audios length:", response.audios.length);
     console.log("Type of audios[0]:", typeof response.audios[0]);
     if (typeof response.audios[0] === 'string') {
        console.log("Length of base64 string:", response.audios[0].length);
     }
  } else {
     console.log("Response:", response);
  }
}

testTTS().catch(console.error);
