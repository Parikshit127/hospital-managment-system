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
        GET: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-400/40', glow: 'shadow-emerald-500/20' },
        POST: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-400/40', glow: 'shadow-blue-500/20' },
        PUT: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-400/40', glow: 'shadow-amber-500/20' },
        DELETE: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-400/40', glow: 'shadow-red-500/20' },
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
        <div className={`border rounded-3xl overflow-hidden transition-all duration-200 ${
            expanded
                ? 'border-slate-500/50 bg-slate-800/60 backdrop-blur-sm shadow-2xl shadow-slate-900/50'
                : 'border-slate-600/30 bg-slate-800/40 backdrop-blur-sm hover:border-slate-500/50 hover:bg-slate-700/50 hover:shadow-xl hover:shadow-slate-900/30'
        }`}>
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-6 py-4 transition-all"
            >
                <div className={`p-1 rounded-lg transition-all ${expanded ? 'text-slate-200 bg-slate-700/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'}`}>
                    {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </div>
                <span
                    className={`px-3 py-1 rounded-xl text-[10px] font-bold uppercase border tracking-wider shadow-sm ${mc.bg} ${mc.text} ${mc.border} ${mc.glow}`}
                >
                    {method}
                </span>
                <code className="text-sm text-slate-100 font-mono font-medium tracking-tight">{path}</code>
                {auth && (
                    <Lock className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                )}
                <span className="text-sm text-slate-400 ml-auto hidden sm:inline text-right truncate max-w-xs">
                    {description}
                </span>
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="border-t border-slate-600/30">
                    {/* Description bar */}
                    <div className="px-6 py-4 bg-slate-900/30 border-b border-slate-600/20">
                        <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
                        {auth && (
                            <div className="mt-3 inline-flex items-center gap-2 bg-amber-500/15 backdrop-blur-sm border border-amber-400/30 rounded-xl px-3 py-1.5">
                                <Lock className="h-3.5 w-3.5 text-amber-300" />
                                <code className="text-xs text-amber-200 font-medium">{auth}</code>
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 px-6 py-3 border-b border-slate-600/20 bg-slate-900/20">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
                                    activeTab === tab.key
                                        ? 'text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-6">
                        {activeTab === 'schema' && requestFields && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                                    Request Fields
                                </h4>
                                <div className="overflow-x-auto rounded-2xl border border-slate-600/30 shadow-lg">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-400 text-xs uppercase bg-slate-900/50">
                                                <th className="px-5 py-3 pr-4 font-bold">Field</th>
                                                <th className="px-5 py-3 pr-4 font-bold">Type</th>
                                                <th className="px-5 py-3 pr-4 font-bold">Required</th>
                                                <th className="px-5 py-3 font-bold">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-600/20">
                                            {requestFields.map((f) => (
                                                <tr key={f.name} className="hover:bg-slate-700/20 transition-colors">
                                                    <td className="px-5 py-3 pr-4">
                                                        <code className="text-blue-300 text-xs bg-blue-500/15 backdrop-blur-sm px-2 py-1 rounded-lg font-semibold">{f.name}</code>
                                                    </td>
                                                    <td className="px-5 py-3 pr-4">
                                                        <span className="text-slate-300 text-xs font-mono">{f.type}</span>
                                                    </td>
                                                    <td className="px-5 py-3 pr-4">
                                                        {f.required ? (
                                                            <span className="text-amber-300 text-[11px] font-bold bg-amber-500/20 backdrop-blur-sm px-2.5 py-1 rounded-full">required</span>
                                                        ) : (
                                                            <span className="text-slate-500 text-[11px] font-medium">optional</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-slate-400 text-xs">{f.description}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {responseExample && (
                                    <div className="mt-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                Response (200)
                                            </h4>
                                            <button
                                                onClick={() => handleCopy(JSON.stringify(responseExample, null, 2))}
                                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-600/50 px-3 py-1.5 rounded-lg transition-all"
                                            >
                                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                {copied ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className="bg-slate-950/80 rounded-2xl p-5 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed border border-slate-600/30 shadow-xl">
                                            {JSON.stringify(responseExample, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'example' && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        cURL Example
                                    </h4>
                                    <button
                                        onClick={() => handleCopy(curlExample)}
                                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-all bg-slate-700/30 hover:bg-slate-600/50 px-3 py-1.5 rounded-lg"
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <pre className="bg-slate-950/80 rounded-2xl p-5 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed border border-slate-600/30 shadow-xl">
                                    {curlExample}
                                </pre>

                                {requestBody && (
                                    <div className="mt-6">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                                            Request Body
                                        </h4>
                                        <pre className="bg-slate-950/80 rounded-2xl p-5 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed border border-slate-600/30 shadow-xl">
                                            {JSON.stringify(requestBody, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'mapping' && fieldMappings && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                                    Field Mapping (API &rarr; Hospital OS)
                                </h4>
                                <div className="overflow-x-auto rounded-2xl border border-slate-600/30 shadow-lg">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-400 text-xs uppercase bg-slate-900/50">
                                                <th className="px-5 py-3 pr-4 font-bold">API Field</th>
                                                <th className="px-5 py-3 pr-4 font-bold">Our DB Field</th>
                                                <th className="px-5 py-3 font-bold">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-600/20">
                                            {fieldMappings.map((m, i) => (
                                                <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                                                    <td className="px-5 py-3 pr-4">
                                                        <code className="text-blue-300 text-xs bg-blue-500/15 backdrop-blur-sm px-2 py-1 rounded-lg font-semibold">{m.externalField}</code>
                                                    </td>
                                                    <td className="px-5 py-3 pr-4">
                                                        <code className="text-emerald-300 text-xs bg-emerald-500/15 backdrop-blur-sm px-2 py-1 rounded-lg font-semibold">{m.ourField}</code>
                                                    </td>
                                                    <td className="px-5 py-3 text-slate-400 text-xs">{m.description}</td>
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
