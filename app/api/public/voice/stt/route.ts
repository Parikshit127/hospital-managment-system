import { NextResponse } from 'next/server';
import { transcribeSpeech } from '@/app/lib/stt';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const langCode = (formData.get('language_code') as string) || 'en-IN';

    const uploadedFile = file as File;
    const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

    const result = await transcribeSpeech(
      fileBuffer,
      uploadedFile.name || 'audio.webm',
      uploadedFile.type || 'audio/webm',
      {
        languageCode: langCode,
        // Default is a live patient conversation, where latency is the product,
        // so take the distilled model. Dictation into a clinical record sends
        // `accurate` and gets the accurate one instead.
        whisperModel: formData.get('accurate')
          ? 'whisper-large-v3'
          : 'whisper-large-v3-turbo',
      },
    );

    // `raw` first so provider-specific fields survive, normalised fields last.
    return NextResponse.json({
      ...result.raw,
      transcript: result.transcript,
      detectedLanguageCode: result.detectedLanguageCode,
      provider: result.provider,
    });
  } catch (error: any) {
    console.error('[STT] Unexpected error:', error);
    return NextResponse.json({ transcript: '', provider: 'error' });
  }
}
