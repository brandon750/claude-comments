#!/usr/bin/env node
// Local API + dashboard for Claude Comments. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const runner = require('./runner');

const PORT = Number(process.env.PORT) || 4848;
const MAX_BODY = 25 * 1024 * 1024;

function json(res, data, status = 200) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function readJson(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(Object.assign(new Error('Body too large'), { status: 413 }));
				req.destroy();
			} else chunks.push(chunk);
		});
		req.on('end', () => {
			try {
				resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
			} catch {
				reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
			}
		});
		req.on('error', reject);
	});
}

const server = http.createServer(async (req, res) => {
	// Only the dashboard and the extension may talk to the API. Any web page can send a request to
	// localhost, and the run endpoint starts Claude Code, so other origins are refused outright.
	const origin = req.headers.origin;
	const allowed = !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}` || origin.startsWith('chrome-extension://');
	if (!allowed) return json(res, { error: 'Forbidden origin' }, 403);
	if (origin) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	}
	if (req.method === 'OPTIONS') return res.end();

	const url = new URL(req.url, `http://localhost:${PORT}`);
	const idMatch = /^\/api\/comments\/([\w-]+)$/.exec(url.pathname);

	try {
		if (req.method === 'GET' && url.pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(fs.readFileSync(path.join(__dirname, 'dashboard.html')));
		}

		if (req.method === 'GET' && url.pathname.startsWith('/screenshots/')) {
			const file = path.join(store.SHOTS_DIR, path.basename(url.pathname));
			if (!fs.existsSync(file)) return json(res, { error: 'Not found' }, 404);
			res.writeHead(200, { 'Content-Type': 'image/png' });
			return fs.createReadStream(file).pipe(res);
		}

		if (req.method === 'GET' && url.pathname === '/api/health') return json(res, { ok: true });
		if (req.method === 'GET' && url.pathname === '/api/sites') return json(res, store.sites());

		if (url.pathname === '/api/storage' && req.method === 'GET') return json(res, store.storage({ site: url.searchParams.get('site') }));
		if (url.pathname === '/api/screenshots' && req.method === 'DELETE') {
			return json(res, store.clearResolvedScreenshots({ site: url.searchParams.get('site') }));
		}

		if (url.pathname === '/api/config') {
			if (req.method === 'GET') return json(res, runner.config());
			if (req.method === 'PATCH') return json(res, runner.updateConfig(await readJson(req)));
		}
		if (url.pathname === '/api/usage') {
			if (req.method === 'GET') return json(res, runner.usage());
			if (req.method === 'POST') return json(res, await runner.refreshUsage());
		}

		if (url.pathname === '/api/run') {
			const site = url.searchParams.get('site');
			if (req.method === 'GET') return json(res, runner.status(site));
			if (req.method === 'POST') return json(res, runner.start((await readJson(req)).site), 202);
			if (req.method === 'DELETE') return json(res, runner.stop(site));
		}

		if (url.pathname === '/api/comments') {
			if (req.method === 'GET') {
				return json(res, store.list({ site: url.searchParams.get('site'), status: url.searchParams.get('status') }));
			}
			if (req.method === 'POST') return json(res, store.create(await readJson(req)), 201);
		}

		if (idMatch) {
			if (req.method === 'GET') {
				const comment = store.get(idMatch[1]);
				return comment ? json(res, comment) : json(res, { error: 'Not found' }, 404);
			}
			if (req.method === 'PATCH') return json(res, store.update(idMatch[1], await readJson(req)));
			if (req.method === 'DELETE') return json(res, store.remove(idMatch[1]));
		}

		json(res, { error: 'Not found' }, 404);
	} catch (err) {
		json(res, { error: err.message }, err.status || 500);
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`Claude Comments running at http://localhost:${PORT}`);
	console.log(`Data: ${store.DATA_DIR}`);
});
