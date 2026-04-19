RI.Api = (function () {
  async function request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('Request failed: ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function get(path) { return request('GET', path); }
  function post(path, body) { return request('POST', path, body); }
  function put(path, body) { return request('PUT', path, body); }
  function patch(path, body) { return request('PATCH', path, body); }
  function del(path) { return request('DELETE', path); }

  function sse(path, body, handlers) {
    // Fetch-based SSE parser (EventSource doesn't support POST bodies)
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(body)
    }).then(async res => {
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('SSE request failed: ' + res.status + ' ' + txt);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let currentEvent = 'message';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          currentEvent = 'message';
          let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
            else if (line.startsWith(':')) { /* comment */ }
          }
          if (data) {
            let parsed = null;
            try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
            if (handlers[currentEvent]) handlers[currentEvent](parsed);
          }
        }
      }
    });
  }

  return { get, post, put, patch, del, sse };
})();
