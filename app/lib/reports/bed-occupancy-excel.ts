import ExcelJS from 'exceljs';
import type { BedOccupancyReportPayload } from '@/app/actions/bed-occupancy-actions';
import type { OccupancyGroupRow } from '@/app/lib/reports/bed-occupancy';

const HEADER_FILL = 'FF1B5E20';

type Col = { header: string; key: string; width: number; fmt?: string };

const ddmmyyyy = (key: string) => {
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
};

function addTable(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, cols: Col[], rows: Record<string, unknown>[]) {
    const ws = wb.addWorksheet(name);
    const last = cols.length;
    ws.mergeCells(1, 1, 1, last);
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, last);
    ws.getCell(2, 1).value = subtitle;
    ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF666666' } };

    const headerRowIdx = 4;
    const header = ws.getRow(headerRowIdx);
    header.values = cols.map((c) => c.header);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = 26;

    cols.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.width;
        if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt;
    });
    rows.forEach((row, i) => {
        const r = ws.addRow(cols.map((c) => row[c.key] ?? ''));
        if (i % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9F7' } };
    });
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: last } };
    return ws;
}

const groupCols = (label: string, withParent: boolean): Col[] => [
    { header: label, key: 'label', width: 26 },
    ...(withParent ? [{ header: 'Department', key: 'parent', width: 22 }] : []),
    { header: 'Total Beds', key: 'totalBeds', width: 12, fmt: '#,##0' },
    { header: 'Bed-days Available', key: 'bedDaysAvailable', width: 16, fmt: '#,##0.0' },
    { header: 'Bed-days Occupied', key: 'bedDaysOccupied', width: 16, fmt: '#,##0.0' },
    { header: 'Occupancy %', key: 'occupancyPct', width: 13, fmt: '0.0"%"' },
    { header: 'Avg Occupied Beds', key: 'avgOccupiedBeds', width: 15, fmt: '#,##0.0' },
    { header: 'Avg Vacant Beds', key: 'avgVacantBeds', width: 15, fmt: '#,##0.0' },
    { header: 'Occupied (as of)', key: 'occupiedAsOf', width: 14, fmt: '#,##0' },
    { header: 'Vacant (as of)', key: 'vacantAsOf', width: 14, fmt: '#,##0' },
    { header: 'Blocked (now)', key: 'blockedAsOf', width: 13 },
    { header: 'Admissions', key: 'admissions', width: 12, fmt: '#,##0' },
    { header: 'Discharges', key: 'discharges', width: 12, fmt: '#,##0' },
    { header: 'Deaths', key: 'deaths', width: 10, fmt: '#,##0' },
    { header: 'ALOS (days)', key: 'alosDays', width: 12, fmt: '0.0' },
];

const groupRows = (rows: OccupancyGroupRow[]) =>
    rows.map((r) => ({ ...r, blockedAsOf: r.blockedAsOf ?? 'n/a', alosDays: r.alosDays ?? '' }));

export async function buildBedOccupancyWorkbook(data: BedOccupancyReportPayload, generatedBy?: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HospitalOS';
    wb.created = new Date();

    const s = data.summary;
    const f = data.meta.filters;
    const period = `${ddmmyyyy(data.range.start)} to ${ddmmyyyy(data.range.end)}`;
    const filterText = [
        `Period: ${period}`,
        f.department && `Department: ${f.department}`,
        f.ward && `Ward: ${f.ward}`,
        f.bedCategory && `Bed category: ${f.bedCategory}`,
    ].filter(Boolean).join(' · ');
    const generated = `Generated ${new Date(data.meta.generatedAt).toLocaleString('en-IN', { timeZone: data.meta.timezone })}${generatedBy ? ` by ${generatedBy}` : ''}`;
    const subtitle = `${data.meta.organizationName ? data.meta.organizationName + ' · ' : ''}${filterText} · ${generated}`;

    // ── Summary ────────────────────────────────────────────────────────────────
    const snap = data.snapshot;
    const kv: [string, string | number][] = [
        ['Total beds', snap.total],
        [`Occupied beds (${snap.isLive ? 'now' : 'end of range'})`, snap.occupied],
        [`Vacant beds (${snap.isLive ? 'now' : 'end of range'})`, snap.vacant],
        ['Blocked / maintenance beds', snap.blocked ?? 'n/a (status history is not recorded)'],
        ['Snapshot occupancy %', snap.occupancyPct],
        ['', ''],
        ['Period occupancy % (time-weighted)', s.occupancyPct],
        ['Bed-days available', s.bedDaysAvailable],
        ['Bed-days occupied', s.bedDaysOccupied],
        ['Average occupied beds', s.avgOccupiedBeds],
        ['Average vacant beds', s.avgVacantBeds],
        ['Peak day', s.peakDay ? `${ddmmyyyy(s.peakDay.date)} (${s.peakDay.occupancyPct}%)` : '—'],
        ['Lowest day', s.lowDay ? `${ddmmyyyy(s.lowDay.date)} (${s.lowDay.occupancyPct}%)` : '—'],
        ['', ''],
        ['Admissions', s.admissions],
        ['Discharges', s.discharges],
        ['Net census change', s.netCensusChange],
        ['Deaths', s.deaths],
        ['Cancelled admissions', s.cancelled],
        ['Awaiting final discharge (semi discharged)', s.awaitingFinalDischarge],
        ['Average length of stay (days)', s.alosDays ?? '—'],
        ['Bed turnover rate (discharges per bed)', s.bedTurnoverRate ?? '—'],
        ['Turnover interval (days)', s.turnoverIntervalDays ?? '—'],
        ...s.dischargeTypes.map((d): [string, number] => [`Discharge type: ${d.type}`, d.count]),
    ];
    const ws = wb.addWorksheet('Summary');
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value = 'IPD Bed Occupancy Report';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:B2');
    ws.getCell('A2').value = subtitle;
    ws.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };
    ws.getColumn(1).width = 46;
    ws.getColumn(2).width = 34;
    kv.forEach(([k, v], i) => {
        const r = ws.getRow(4 + i);
        r.getCell(1).value = k;
        r.getCell(2).value = v;
        r.getCell(1).font = { bold: !!k && v === '' };
        r.getCell(2).alignment = { horizontal: 'left' };
    });
    const notesStart = 4 + kv.length + 1;
    const notes = [
        'Occupancy is time-weighted from actual bed allocation: admission date/time, bed transfers and discharge date/time.',
        'Patients awaiting final discharge (semi discharged) are counted as occupying their bed until the final discharge.',
        'Bed master has no commissioning dates: the current bed list is applied to the whole period.',
        'Blocked / maintenance status has no history and is shown only for views that include the current moment.',
    ];
    notes.forEach((n, i) => {
        ws.mergeCells(notesStart + i, 1, notesStart + i, 2);
        const c = ws.getCell(notesStart + i, 1);
        c.value = n;
        c.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
        c.alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(notesStart + i).height = 26;
    });

    // ── Group sheets ───────────────────────────────────────────────────────────
    addTable(wb, 'Department-wise', 'Department-wise Occupancy', subtitle, groupCols('Department', false), groupRows(data.byDepartment));
    addTable(wb, 'Ward-wise', 'Ward-wise Occupancy', subtitle, groupCols('Ward', true), groupRows(data.byWard));
    addTable(wb, 'Bed Category-wise', 'Bed Category-wise Occupancy', subtitle, groupCols('Bed Category', false), groupRows(data.byCategory));
    addTable(wb, 'Ward Type-wise', 'Ward Type-wise Occupancy', subtitle, groupCols('Ward Type', false), groupRows(data.byWardType));

    addTable(wb, 'Bed-wise', 'Bed-wise Occupancy', subtitle, [
        { header: 'Bed', key: 'bedLabel', width: 22 },
        { header: 'Ward', key: 'ward', width: 22 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Current Status', key: 'currentStatus', width: 16 },
        { header: 'Patient Stays', key: 'stays', width: 13, fmt: '#,##0' },
        { header: 'Bed-days Occupied', key: 'bedDaysOccupied', width: 16, fmt: '#,##0.0' },
        { header: 'Bed-days Available', key: 'bedDaysAvailable', width: 16, fmt: '#,##0.0' },
        { header: 'Occupancy %', key: 'occupancyPct', width: 13, fmt: '0.0"%"' },
        { header: 'Occupied (as of)', key: 'occupiedAsOf', width: 14 },
    ], data.beds.map((b) => ({ ...b, occupiedAsOf: b.occupiedAsOf ? 'Yes' : 'No' })));

    addTable(wb, 'Daily Trend', 'Daily Occupancy Trend', subtitle, [
        { header: 'Date', key: 'date', width: 13 },
        { header: 'Total Beds', key: 'totalBeds', width: 12, fmt: '#,##0' },
        { header: 'Avg Occupied Beds', key: 'avgOccupiedBeds', width: 16, fmt: '#,##0.0' },
        { header: 'Closing Occupied Beds', key: 'closingOccupiedBeds', width: 18, fmt: '#,##0' },
        { header: 'Avg Vacant Beds', key: 'avgVacantBeds', width: 15, fmt: '#,##0.0' },
        { header: 'Occupancy %', key: 'occupancyPct', width: 13, fmt: '0.0"%"' },
        { header: 'Admissions', key: 'admissions', width: 12, fmt: '#,##0' },
        { header: 'Discharges', key: 'discharges', width: 12, fmt: '#,##0' },
        { header: 'Hours Observed', key: 'observedHours', width: 14, fmt: '0.0' },
    ], data.daily.map((d) => ({ ...d, date: ddmmyyyy(d.date) })));

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
}
