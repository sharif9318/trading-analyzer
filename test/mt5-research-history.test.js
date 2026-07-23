const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'mt5', 'ResearchHistoryBackfill.mq5'),
  'utf8',
);

test('research history importer discovers the broker start without weakening the gate', () => {
  assert.match(script, /#property version\s+"1\.001"/);
  assert.match(script, /TERMINAL_MAXBARS/);
  assert.match(script, /Max bars in chart to Unlimited/);
  assert.match(script, /SERIES_SERVER_FIRSTDATE/);
  assert.match(script, /Actual start:/);
  assert.match(script, /StartTime != D'2020\.01\.01 00:00'/);
});
