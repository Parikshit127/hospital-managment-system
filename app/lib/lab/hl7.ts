/**
 * app/lib/lab/hl7.ts — minimal HL7 v2 ORU^R01 parsing (no external library).
 *
 * Lab analyzers report results as HL7 v2 ORU messages. We only need the pieces
 * that map a result back to one of our orders:
 *   - the order barcode (OBR-3 Filler / OBR-2 Placer order number)
 *   - each OBX observation: test id (OBX-3), value (OBX-5), units (OBX-6), flag (OBX-8)
 *
 * Segments are separated by \r (CR); fields by '|'; components by '^'.
 * Pure + dependency-free — safe to import on client or server.
 */

export type Hl7Result = { testId: string; value: string; units: string; flag: string };
export type ParsedOru = { barcode: string | null; results: Hl7Result[] };

export function parseOru(message: string): ParsedOru {
    const segments = message
        .replace(/\r\n/g, '\r')
        .replace(/\n/g, '\r')
        .split('\r')
        .map((s) => s.trim())
        .filter(Boolean);

    let barcode: string | null = null;
    const results: Hl7Result[] = [];

    for (const seg of segments) {
        const f = seg.split('|');
        const type = f[0];
        if (type === 'OBR') {
            // OBR-2 = placer order number, OBR-3 = filler order number (first component only)
            const placer = (f[2] || '').split('^')[0].trim();
            const filler = (f[3] || '').split('^')[0].trim();
            barcode = filler || placer || barcode;
        } else if (type === 'OBX') {
            const idParts = (f[3] || '').split('^').slice(0, 2).map((x) => x.trim()).filter(Boolean);
            results.push({
                testId: idParts.join(' ') || (f[3] || '').trim(),
                value: (f[5] || '').replace(/\^/g, ' ').trim(),
                units: (f[6] || '').split('^')[0].trim(),
                flag: (f[8] || '').trim(),
            });
        }
    }

    return { barcode, results };
}

/** Build a sample ORU^R01 message for the simulator (so testing needs no analyzer). */
export function buildSampleOru(o: {
    barcode: string;
    patientId?: string;
    testName: string;
    value: string;
    unit?: string;
    timestamp: string; // caller supplies (new Date() is unavailable in some contexts)
}): string {
    const ts = o.timestamp.replace(/[-:TZ.]/g, '').slice(0, 14);
    return [
        `MSH|^~\\&|ANALYZER|LAB|HIMS|HOSP|${ts}||ORU^R01|${ts}|P|2.4`,
        `PID|1||${o.patientId || ''}`,
        `OBR|1|${o.barcode}|${o.barcode}|${o.testName}|||${ts}`,
        `OBX|1|NM|${o.testName}||${o.value}|${o.unit || ''}|||||F`,
    ].join('\r');
}
