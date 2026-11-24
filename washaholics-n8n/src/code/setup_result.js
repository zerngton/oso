const r = $input.first().json;
const body = parseJsonBody(r) || {};
if (!body.spreadsheetId) throw new Error('Could not create the spreadsheet: ' + JSON.stringify(body).slice(0, 500));
return [{ json: { spreadsheetId: body.spreadsheetId, url: body.spreadsheetUrl,
  next_step: 'Put SHEET_ID=' + body.spreadsheetId + ' in config.env and run ./install.sh again.' } }];
