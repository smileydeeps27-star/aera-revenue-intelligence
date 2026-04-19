function open(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(':' + ' '.repeat(2048) + '\n\n');
}

function send(res, event, data) {
  if (event) res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function close(res) {
  try { res.end(); } catch (e) { /* ignore */ }
}

module.exports = { open, send, close };
