'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface ExportButtonProps {
    data: any[] | null | undefined;
    filename: string;
    columns: { key: string; label: string }[];
}

export function ExportButton({ data, filename, columns }: ExportButtonProps) {
    const [exporting, setExporting] = useState(false);

    async function handleExport() {
        if (!data || data.length === 0) {
            alert('No data to export. Please generate the report first.');
            return;
        }
        setExporting(true);
        try {
            // Dynamic import xlsx to keep bundle small
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default ?? xlsxModule;

            const rows = data.map(row => {
                const obj: Record<string, any> = {};
                columns.forEach(col => {
                    obj[col.label] = row[col.key] ?? '';
                });
                return obj;
            });

            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, `${filename}.xlsx`);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            setExporting(false);
        }
    }

    return (
        <button
            onClick={handleExport}
            disabled={exporting || !data || data.length === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {exporting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
            ) : (
                <><Download className="h-4 w-4" /> Export Excel</>
            )}
        </button>
    );
}
