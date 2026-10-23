'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const MCURL = path.join(__dirname, '..', 'bin', 'mcurl.js');

let server;
let base;

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function send(response, status, body = '', headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  response.writeHead(status, {
    'Content-Length': payload.length,
    ...headers,
  });
  response.end(payload);
}

before(async () => {
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/hello') {
      send(response, 200, 'hello world', { 'Content-Type': 'text/plain' });
      return;
    }

    if (pathname === '/redirect') {
      response.writeHead(302, { Location: '/hello' });
      response.end();
      return;
    }

    if (pathname === '/loop') {
      response.writeHead(302, { Location: '/loop' });
      response.end();
      return;
    }

    if (pathname === '/redir-303') {
      response.writeHead(303, { Location: '/hello' });
      response.end();
      return;
    }

    if (pathname === '/redir-307') {
      response.writeHead(307, { Location: '/post' });
      response.end();
      return;
    }

    if (pathname === '/missing') {
      send(response, 404, 'not found body');
      return;
    }

    if (pathname === '/slow') {
      const timer = setTimeout(() => {
        send(response, 200, 'slow body');
      }, 2000);
      response.on('close', () => clearTimeout(timer));
      return;
    }

    if (pathname === '/slow-redirect') {
      const timer = setTimeout(() => {
        response.writeHead(302, { Location: '/slow-ok' });
        response.end();
      }, 600);
      response.on('close', () => clearTimeout(timer));
      return;
    }

    if (pathname === '/slow-ok') {
      const timer = setTimeout(() => {
        send(response, 200, 'finally');
      }, 600);
      response.on('close', () => clearTimeout(timer));
      return;
    }

    if (pathname === '/echo') {
      send(response, 200, JSON.stringify(request.headers), {
        'Content-Type': 'application/json',
      });
      return;
    }

    if (pathname === '/post') {
      const body = await readBody(request);
      send(response, 200, JSON.stringify({
        data: body.toString('utf8'),
        ctype: request.headers['content-type'] || '',
        method: request.method,
      }), { 'Content-Type': 'application/json' });
      return;
    }

    if (pathname === '/form') {
      const body = await readBody(request);
      send(response, 200, JSON.stringify({
        data: body.toString('utf8'),
        ctype: request.headers['content-type'] || '',
      }), { 'Content-Type': 'application/json' });
      return;
    }

    if (pathname === '/put') {
      send(response, 201, 'put ok');
      return;
    }

    if (pathname === '/delete') {
      send(response, 200, 'delete ok');
      return;
    }

    if (pathname === '/binary') {
      send(response, 200, Buffer.from([0, 1, 2, 255]));
      return;
    }

    send(response, 404, 'no route');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MCURL, ...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    const killer = setTimeout(() => {
      child.kill();
      reject(new Error(`mcurl did not finish: ${args.join(' ')}`));
    }, options.timeout || 20000);

    child.on('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

test('GET prints the response body', async () => {
  const result = await run([`${base}/hello`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'hello world');
  assert.equal(result.stderr.toString(), '');
});

test('-i includes response headers', async () => {
  const result = await run(['-i', `${base}/hello`]);
  const text = result.stdout.toString();
  assert.equal(result.code, 0, result.stderr.toString());
  assert.ok(text.startsWith('HTTP/1.1 200 OK\r\n'));
  assert.ok(text.includes('Content-Type: text/plain'));
  assert.ok(text.endsWith('\r\n\r\nhello world'));
  assert.equal(text.split('HTTP/1.1 200').length, 2);
});

test('-I sends HEAD and only prints headers', async () => {
  const result = await run(['-I', `${base}/hello`]);
  const text = result.stdout.toString();
  assert.equal(result.code, 0, result.stderr.toString());
  assert.ok(text.startsWith('HTTP/1.1 200 OK\r\n'));
  assert.ok(text.includes('Content-Length: 11'));
  assert.ok(!text.includes('hello world'));
});

test('-v writes request and response details to stderr', async () => {
  const result = await run(['-v', `${base}/hello`]);
  const errors = result.stderr.toString();
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'hello world');
  assert.ok(errors.includes('> GET /hello HTTP/1.1'));
  assert.ok(errors.includes('< HTTP/1.1 200 OK'));
});

test('-o writes the body to a file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcurl-'));
  const output = path.join(directory, 'body.bin');
  const result = await run(['-o', output, `${base}/hello`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), '');
  assert.equal(fs.readFileSync(output, 'utf8'), 'hello world');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('-O names the output file after the URL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcurl-'));
  const result = await run(['-O', `${base}/hello`], { cwd: directory });
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), '');
  assert.equal(fs.readFileSync(path.join(directory, 'hello'), 'utf8'), 'hello world');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('-d sends form data and implies POST', async () => {
  const result = await run(['-d', 'a=1', '-d', 'b=2', `${base}/post`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.data, 'a=1&b=2');
  assert.equal(info.ctype, 'application/x-www-form-urlencoded');
  assert.equal(info.method, 'POST');
});

test('-j sends a JSON body', async () => {
  const result = await run(['-j', '{"a": 1}', `${base}/post`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.data, '{"a": 1}');
  assert.equal(info.ctype, 'application/json');
});

test('-X PUT sends a PUT request', async () => {
  const result = await run(['-X', 'PUT', `${base}/put`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'put ok');
});

test('-X DELETE sends a DELETE request', async () => {
  const result = await run(['-X', 'DELETE', `${base}/delete`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'delete ok');
});

test('-H adds a custom header', async () => {
  const result = await run(['-H', 'X-Custom: abc', `${base}/echo`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info['x-custom'], 'abc');
});

test('-A overrides the User-Agent', async () => {
  const result = await run(['-A', 'my-bot/2.0', `${base}/echo`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info['user-agent'], 'my-bot/2.0');
});

test('-u sends HTTP Basic authentication', async () => {
  const result = await run(['-u', 'user:pass', `${base}/echo`]);
  const info = JSON.parse(result.stdout.toString());
  const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`;
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.authorization, expected);
});

test('-b sends cookies', async () => {
  const result = await run(['-b', 'session=abc123', `${base}/echo`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.cookie, 'session=abc123');
});

test('-F sends multipart form data', async () => {
  const result = await run(['-F', 'field=hello', `${base}/form`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.ok(info.ctype.startsWith('multipart/form-data; boundary='));
  assert.ok(info.data.includes('Content-Disposition: form-data; name="field"'));
  assert.ok(info.data.includes('hello'));
});

test('-f exits 22 on HTTP errors and hides the body', async () => {
  const result = await run(['-f', `${base}/missing`]);
  assert.equal(result.code, 22);
  assert.equal(result.stdout.toString(), '');
  assert.ok(result.stderr.toString().includes('404'));
});

test('-f -s exits 22 silently', async () => {
  const result = await run(['-f', '-s', `${base}/missing`]);
  assert.equal(result.code, 22);
  assert.equal(result.stdout.toString(), '');
  assert.equal(result.stderr.toString(), '');
});

test('HTTP error body is printed without -f', async () => {
  const result = await run([`${base}/missing`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'not found body');
});

test('-L follows redirects', async () => {
  const result = await run(['-L', `${base}/redirect`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'hello world');
});

test('redirects are not followed without -L', async () => {
  const result = await run([`${base}/redirect`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), '');
});

test('-L detects redirect loops', async () => {
  const result = await run(['-L', `${base}/loop`]);
  assert.equal(result.code, 47);
});

test('303 redirect changes POST to GET', async () => {
  const result = await run(['-X', 'POST', '-d', 'x=1', '-L', `${base}/redir-303`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'hello world');
});

test('307 redirect preserves method and body', async () => {
  const result = await run(['-X', 'POST', '-d', 'x=1', '-L', `${base}/redir-307`]);
  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.method, 'POST');
  assert.equal(info.data, 'x=1');
});

test('-m enforces a total timeout', async () => {
  const result = await run(['-m', '0.5', `${base}/slow`]);
  assert.equal(result.code, 28);
  assert.equal(result.stdout.toString(), '');
});

test('-m covers the whole redirect chain', async () => {
  const result = await run(['-L', '-m', '1', `${base}/slow-redirect`]);
  assert.equal(result.code, 28);
  assert.equal(result.stdout.toString(), '');
});

test('cross-origin redirects update Host and drop Authorization', async () => {
  const target = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(request.headers));
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));

  const targetHost = `127.0.0.1:${target.address().port}`;
  const redirector = http.createServer((request, response) => {
    response.writeHead(302, { Location: `http://${targetHost}/echo` });
    response.end();
  });
  await new Promise((resolve) => redirector.listen(0, '127.0.0.1', resolve));

  const result = await run([
    '-L',
    '-u', 'user:pass',
    `http://127.0.0.1:${redirector.address().port}/go`,
  ]);

  const info = JSON.parse(result.stdout.toString());
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(info.host, targetHost);
  assert.equal(info.authorization, undefined);

  if (redirector.closeAllConnections) redirector.closeAllConnections();
  if (target.closeAllConnections) target.closeAllConnections();
  await new Promise((resolve) => redirector.close(resolve));
  await new Promise((resolve) => target.close(resolve));
});

test('-w prints transfer statistics', async () => {
  const result = await run([
    '-w', 'code=%{http_code} size=%{size_download}\\n',
    `${base}/hello`,
  ]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.equal(result.stdout.toString(), 'hello worldcode=200 size=11\n');
});

test('binary response bodies are preserved', async () => {
  const result = await run([`${base}/binary`]);
  assert.equal(result.code, 0, result.stderr.toString());
  assert.deepEqual(result.stdout, Buffer.from([0, 1, 2, 255]));
});

test('unsupported protocols exit with code 1', async () => {
  const result = await run(['foo://example.com/file']);
  assert.equal(result.code, 1);
});

test('malformed URLs exit with code 3', async () => {
  const result = await run(['http://[::1']);
  assert.equal(result.code, 3);
});

test('unknown hosts exit with code 6', async () => {
  const result = await run(['http://no-such-host-xyz.invalid/']);
  assert.equal(result.code, 6);
});
