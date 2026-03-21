'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Lock } from 'lucide-react';
import ApiTestPanel from './ApiTestPanel';

interface FieldMapping {
    externalField: string;
    ourField: string;
    description: string;
}

interface EndpointCardProps {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    auth?: string;
    requestBody?: object;
    responseExample?: object;
    fieldMappings?: FieldMapping[];
    requestFields?: { name: string; type: string; required: boolean; description: string }[];
    showTestPanel?: boolean;
}

export default function EndpointCard({
    method,
    path,
    description,
    auth,
    requestBody,
    responseExample,
    fieldMappings,
    requestFields,
    showTestPanel = false,
}: EndpointCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'schema' | 'example' | 'mapping' | 'test'>('schema');
    const [copied, setCopied] = useState(false);

    const methodConfig: Record<string, { bg: string; text: string; border: string; glow: string }> = {
        GET: { bg: 'bg-emerald-500/12', text: 'text-emerald-400', border: 'border-emerald-500/25', glow: 'shadow-emerald-500/5' },
        POST: { bg: 'bg-blue-500/12', text: 'text-blue-400', border: 'border-blue-500/25', glow: 'shadow-blue-500/5' },
        PUT: { bg: 'bg-amber-500/12', text: 'text-amber-400', border: 'border-amber-500/25', glow: 'shadow-amber-500/5' },
        DELETE: { bg: 'bg-red-500/12', text: 'text-red-400', border: 'border-red-500/25', glow: 'shadow-red-500/5' },
    };

    const mc = methodConfig[method];

    const curlExample = `curl -X ${method} \\
  https://your-hospital.com${path} \\
  -H "Content-Type: application/json" \\${auth ? `\n  -H "X-Api-Key: your_api_key_here" \\` : ''}
  -d '${requestBody ? JSON.stringify(requestBody, null, 2) : '{}'}'`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const tabs = [
        { key: 'schema', label: 'Schema' },
        { key: 'example', label: 'cURL Example' },
        ...(fieldMappings ? [{ key: 'mapping', label: 'Field Mapping' }] : []),
        ...(showTestPanel ? [{ key: 'test', label: 'Test API' }] : []),
    ];

    return (
        <div className={`border rounded-2xl overflow-hidden transition-all ${
            expanded
                ? 'border-gray-600/40 bg-gray-800/40 shadow-lg'
                : 'border-gray-700/30 bg-gray-800/20 hover:border-gray-700/50 hover:bg-gray-800/30'
        }`}>
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-5 py-4 transition-colors"
            >
                <div className={`p-0.5 rounded ${expanded ? 'text-gray-300' : 'text-gray-600'}`}>
                    {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </div>
                <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase border tracking-wide ${mc.bg} ${mc.text} ${mc.border}`}
                >
                    {method}
                </span>
                <code className="text-sm text-gray-200 font-mono tracking-tight">{path}</code>
                {auth && (
                    <Lock className="h-3 w-3 text-amber-500/60 shrink-0" />
                )}
                <span className="text-sm text-gray-500 ml-auto hidden sm:inline text-right truncate max-w-xs">
                    {description}
                </span>
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="border-t border-gray-700/30">
                    {/* Description bar */}
                    <div className="px-5 py-3 bg-gray-900/20 border-b border-gray-700/20">
                        <p className="text-sm text-gray-400">{description}</p>
                        {auth && (
                            <div className="mt-2 inline-flex items-center gap-2 bg-amber-500/8 border border-amber-500/15 rounded-lg px-2.5 py-1">
                                <Lock className="h-3 w-3 text-amber-400" />
                                <code className="text-xs text-amber-300/80">{auth}</code>
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 px-5 py-2 border-b border-gray-700/20 bg-gray-900/10">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all ${
                                    activeTab === tab.key
                                        ? 'text-white bg-gray-700/60 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/20'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-5">
                        {activeTab === 'schema' && requestFields && (
                            <div>
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                    Request Fields
                                </h4>
                                <div className="overflow-x-auto rounded-xl border border-gray-700/20">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-gray-500 text-xs uppercase bg-gray-900/30">
                                                <th className="px-4 py-2.5 pr-4 font-medium">Field</th>
                                                <th className="px-4 py-2.5 pr-4 font-medium">Type</th>
                                                <th className="px-4 py-2.5 pr-4 font-medium">Required</th>
                                                <th className="px-4 py-2.5 font-medium">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/20">
                                            {requestFields.map((f) => (
                                                <tr key={f.name} className="hover:bg-gray-700/10 transition-colors">
                                                    <td className="px-4 py-2.5 pr-4">
                                                        <code className="text-blue-300 text-xs bg-blue-500/8 px-1.5 py-0.5 rounded">{f.name}</code>
                                                    </td>
                                                    <td className="px-4 py-2.5 pr-4">
                                                        <span className="text-gray-400 text-xs font-mono">{f.type}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 pr-4">
                                                        {f.required ? (
                                                            <span className="text-amber-400 text-[11px] font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full">required</span>
                                                        ) : (
                                                            <span className="text-gray-600 text-[11px]">optional</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{f.description}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {responseExample && (
                                    <div className="mt-6">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                Response (200)
                                            </h4>
                                            <button
                                                onClick={() => handleCopy(JSON.stringify(responseExample, null, 2))}
                                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors"
                                            >
                                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                {copied ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className="bg-gray-950/60 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed border border-gray-700/20">
                                            {JSON.stringify(responseExample, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'example' && (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        cURL Example
                                    </h4>
                                    <button
                                        onClick={() => handleCopy(curlExample)}
                                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors bg-gray-700/30 hover:bg-gray-700/50 px-2.5 py-1.5 rounded-lg"
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <pre className="bg-gray-950/60 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed border border-gray-700/20">
                                    {curlExample}
                                </pre>

                                {requestBody && (
                                    <div className="mt-6">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                            Request Body
                                        </h4>
                                        <pre className="bg-gray-950/60 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed border border-gray-700/20">
                                            {JSON.stringify(requestBody, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'mapping' && fieldMappings && (
                            <div>
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                    Field Mapping (API &rarr; Hospital OS)
                                </h4>
                                <div className="overflow-x-auto rounded-xl border border-gray-700/20">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-gray-500 text-xs uppercase bg-gray-900/30">
                                                <th className="px-4 py-2.5 pr-4 font-medium">API Field</th>
                                                <th className="px-4 py-2.5 pr-4 font-medium">Our DB Field</th>
                                                <th className="px-4 py-2.5 font-medium">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/20">
                                            {fieldMappings.map((m, i) => (
                                                <tr key={i} className="hover:bg-gray-700/10 transition-colors">
                                                    <td className="px-4 py-2.5 pr-4">
                                                        <code className="text-blue-300 text-xs bg-blue-500/8 px-1.5 py-0.5 rounded">{m.externalField}</code>
                                                    </td>
                                                    <td className="px-4 py-2.5 pr-4">
                                                        <code className="text-emerald-300 text-xs bg-emerald-500/8 px-1.5 py-0.5 rounded">{m.ourField}</code>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{m.description}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'test' && showTestPanel && (
                            <ApiTestPanel
                                method={method}
                                path={path}
                                defaultBody={requestBody || {}}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
