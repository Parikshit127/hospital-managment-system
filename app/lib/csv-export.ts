/**
 * CSV Export Utility
 * Converts tabular data to CSV format and triggers browser download.
 */

export function exportToCSV(data: Record<string, any>[], filename: string) {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];

    // Header row
    csvRows.push(headers.map(h => `"${h}"`).join(','));

    // Data rows
    for (const row of data) {
        const values = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        });
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Format data for CSV export, flattening nested objects
 */
export function flattenForCSV(data: any[], fieldMap: Record<string, string | ((item: any) => any)>): Record<string, any>[] {
    return data.map(item => {
        const row: Record<string, any> = {};
        for (const [header, accessor] of Object.entries(fieldMap)) {
            if (typeof accessor === 'function') {
                row[header] = accessor(item);
            } else {
                // Handle dot notation: 'patient.name' -> item.patient.name
                const parts = accessor.split('.');
                let val: any = item;
                for (const part of parts) {
                    val = val?.[part];
                }
                row[header] = val ?? '';
            }
        }
        return row;
    });
}
