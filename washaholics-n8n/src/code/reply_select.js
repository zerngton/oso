// Leads whose Gmail thread should be checked for a send / reply / bounce.
const sheet = parseJsonBody($input.first().json) || {};
const { rows } = rowsFromValues(sheet.values);
const WATCH = [STATUS.DRAFT_READY, STATUS.SENT, STATUS.FOLLOWUP_READY, STATUS.FOLLOWUP_SENT, STATUS.OOO];
return rows
  .filter((r) => WATCH.includes(r.status) && r.thread_id)
  .slice(0, CONFIG.maxThreadsPerRun || 150)
  .map((r) => ({ json: Object.assign({}, r, { request: {
    url: CONFIG.gmailBase + '/gmail/v1/users/me/threads/' + encodeURIComponent(r.thread_id) + '?format=full',
  } }) }));
