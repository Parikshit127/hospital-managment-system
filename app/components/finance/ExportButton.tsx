'use client';

import { Download } from 'lucide-react';

interface ExportButtonProps {
    data: any[];
    filename: string;
    columns: { key: string; label: string }[];
}

export function ExportButton({ data, filename, columns }: ExportButtonProps) {
    async function handleExport() {
        // Dynamic import xlsx to keep bundle small
        const XLSX = (await import('xlsx')).default;

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
    }

    return (
        <button onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition">
            <Download className="h-4 w-4" /> Export Excel
        </button>
    );
}
