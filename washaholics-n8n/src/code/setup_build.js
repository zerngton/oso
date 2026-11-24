// Creates the Google Spreadsheet with the Leads and Reports tabs + headers.
const headerRow = (cols) => [{ values: cols.map((c) => ({ userEnteredValue: { stringValue: c }, userEnteredFormat: { textFormat: { bold: true } } })) }];
const tab = (title, cols) => ({ properties: { title, gridProperties: { frozenRowCount: 1 } }, data: [{ startRow: 0, startColumn: 0, rowData: headerRow(cols) }] });
return [{ json: { request: { url: CONFIG.sheetsBase + '/v4/spreadsheets', body: {
  properties: { title: CONFIG.companyName + ' - AI Leads', timeZone: CONFIG.timezone },
  sheets: [tab('Leads', LEAD_COLUMNS), tab('Reports', REPORT_COLUMNS)],
} } } }];
