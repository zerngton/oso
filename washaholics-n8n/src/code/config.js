// Config node: values come from config.env at build time (no secrets here).
const CONFIG = __CONFIG__;
return [{ json: Object.assign({}, CONFIG, {
  readLeadsUrl: readRangeUrl(CONFIG, 'Leads'),
  runDate: tzDate(new Date(), CONFIG.timezone),
  runAt: new Date().toISOString(),
}) }];
