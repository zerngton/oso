// Emails the owner when any Washaholics workflow fails.
const e = $('Error Trigger').first().json || {};
const wf = (e.workflow && e.workflow.name) || 'Unknown workflow';
const ex = e.execution || {};
const err = (ex.error && (ex.error.message || ex.error.description)) || 'Unknown error';
const text = 'Workflow: ' + wf + '\nFailed node: ' + (ex.lastNodeExecuted || '-') + '\nError: ' + err + '\nExecution: ' + (ex.url || ex.id || '-') + '\nTime: ' + new Date().toISOString();
const raw = buildRawEmail({ to: CONFIG.ownerEmail, from: CONFIG.fromHeader, subject: 'n8n alert: ' + wf + ' failed', text });
return [{ json: { request: { url: CONFIG.gmailBase + '/gmail/v1/users/me/messages/send', body: { raw } } } }];
