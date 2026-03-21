'use client';

import { useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Send } from 'lucide-react';

interface ApiTestPanelProps {
    method: string;
    path: string;
    defaultBody: object;
}

export default function ApiTestPanel({ method, path, defaultBody }: ApiTestPanelProps) {
    const [apiKey, setApiKey] = useState('');
    const [body, setBody] = useState(JSON.stringify(defaultBody, null, 2));
    const [response, setResponse] = useState<string | null>(null);
    const [statusCode, setStatusCode] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        setLoading(true);
        setError(null);
        setResponse(null);
        setStatusCode(null);

        try {
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch {
                setError('Invalid JSON in request body');
                setLoading(false);
                return;
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers['X-Api-Key'] = apiKey;
            }

            const res = await fetch(path, {
                method,
                headers,
                body: method !== 'GET' ? JSON.stringify(parsedBody) : undefined,
            });

            setStatusCode(res.status);
            const data = await res.json();
            setResponse(JSON.stringify(data, null, 2));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* API Key input */}
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    X-Api-Key
                </label>
                <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key (zx_...)"
                    className="w-full px-3.5 py-2.5 bg-gray-950/50 border border-gray-700/40 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 font-mono transition-all"
                />
            </div>

            {/* Request body */}
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Request Body (JSON)
                </label>
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="w-full px-3.5 py-2.5 bg-gray-950/50 border border-gray-700/40 rounded-xl text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-y leading-relaxed transition-all"
                />
            </div>

            {/* Send button */}
            <button
                onClick={handleSend}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-blue-600/50 disabled:to-blue-500/50 text-white text-sm font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20"
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Send className="h-4 w-4" />
                )}
                {loading ? 'Sending...' : 'Send Request'}
            </button>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Response */}
            {response && (
                <div>
                    <div className="flex items-center gap-2.5 mb-2.5">
                        <span className="text-xs font-medium text-gray-400">Response</span>
                        <span
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                statusCode && statusCode >= 200 && statusCode < 300
                                    ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20'
                                    : statusCode && statusCode >= 400
                                    ? 'bg-red-500/12 text-red-400 border border-red-500/20'
                                    : 'bg-amber-500/12 text-amber-400 border border-amber-500/20'
                            }`}
                        >
                            {statusCode && statusCode >= 200 && statusCode < 300 ? (
                                <CheckCircle2 className="h-3 w-3" />
                            ) : (
                                <XCircle className="h-3 w-3" />
                            )}
                            {statusCode}
                        </span>
                    </div>
                    <pre className="bg-gray-950/60 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed border border-gray-700/20 max-h-96 overflow-y-auto">
                        {response}
                    </pre>
                </div>
            )}
        </div>
    );
}
