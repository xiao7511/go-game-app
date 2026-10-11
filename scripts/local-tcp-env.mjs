// Opt-in transport for the already-running dedicated loopback Supabase.
process.env.NOBI_LOCAL_DB_TRANSPORT='tcp';
process.env.NOBI_BROWSER_EXECUTABLE??='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
process.env.NOBI_REUSE_ISOLATED_SERVER='1';

process.env.NOBI_ONLINE_SCREENSHOT_DIR??='docs/nobi-v2/screenshots/phase-3d/regression-online';
process.env.NOBI_RATED_SCREENSHOT_DIR??='docs/nobi-v2/screenshots/phase-3d/regression-competitive';

process.env.NOBI_GUANDAN_SERIES_SCREENSHOT_DIR??='docs/nobi-v2/screenshots/phase-3d/regression-series';
