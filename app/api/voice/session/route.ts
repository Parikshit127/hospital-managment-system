import { NextResponse } from 'next/server';

export async function POST() {
  const apiKey = process.env.BOLNA_API_KEY;
  const agentId = process.env.BOLNA_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'Bolna demo credentials not configured' }, { status: 500 });
  }

  const r = await fetch('https://api.bolna.ai/v1/web-call/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agent_id: agentId }),
  });

  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
