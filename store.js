// Shared JSON-file store used by both the HTTP server and the CLI.
// Reads from disk on every call so the two never get out of sync.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.CLAUDE_COMMENTS_DATA || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'comments.json');
const SHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const STATUSES = ['open', 'in_progress', 'needs_info', 'resolved'];

fs.mkdirSync(SHOTS_DIR, { recursive: true });

function load() {
	try {
		return JSON.parse(fs.readFileSync(FILE, 'utf8'));
	} catch {
		return [];
	}
}

function save(comments) {
	const tmp = `${FILE}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(comments, null, 2));
	fs.renameSync(tmp, FILE);
}

function httpError(status, message) {
	return Object.assign(new Error(message), { status });
}

function list({ site, status } = {}) {
	let comments = load();
	if (site) comments = comments.filter((c) => c.site === site);
	if (status && status !== 'all') {
		const wanted = status.split(',');
		comments = comments.filter((c) => wanted.includes(c.status));
	}
	return comments;
}

function get(id) {
	return load().find((c) => c.id === id) || null;
}

function sites() {
	const counts = {};
	for (const c of load()) {
		counts[c.site] ??= { site: c.site, open: 0, in_progress: 0, needs_info: 0, resolved: 0 };
		counts[c.site][c.status]++;
	}
	return Object.values(counts);
}

function create(input) {
	if (!input.site || !input.text) throw httpError(400, 'site and text are required');

	const comments = load();
	const id = crypto.randomBytes(4).toString('hex');
	const number = Math.max(0, ...comments.filter((c) => c.site === input.site).map((c) => c.number)) + 1;

	let screenshot = null;
	const match = /^data:image\/png;base64,(.+)$/.exec(input.screenshot || '');
	if (match) {
		screenshot = path.join(SHOTS_DIR, `${id}.png`);
		fs.writeFileSync(screenshot, Buffer.from(match[1], 'base64'));
	}

	const comment = {
		id,
		number,
		site: input.site,
		url: input.url,
		path: input.path,
		title: input.title,
		text: input.text,
		status: 'open',
		resolution: null,
		createdAt: new Date().toISOString(),
		resolvedAt: null,
		startedAt: null,
		thread: [],
		viewport: input.viewport,
		element: input.element,
		bodyClasses: input.bodyClasses,
		pin: input.pin,
		screenshot,
	};

	comments.push(comment);
	save(comments);
	return comment;
}

function update(id, patch) {
	const comments = load();
	const comment = comments.find((c) => c.id === id);
	if (!comment) throw httpError(404, `No comment with id ${id}`);

	const now = new Date().toISOString();
	comment.thread ??= [];

	// A reply from the reviewer answers Claude's needs-info question and puts the comment back in the queue.
	if (patch.reply !== undefined) {
		const reply = String(patch.reply).trim();
		if (!reply) throw httpError(400, 'reply cannot be empty');
		// Older comments kept Claude's question only in `resolution`.
		if (comment.resolution && !comment.thread.some((m) => m.from === 'claude' && m.text === comment.resolution)) {
			comment.thread.push({ from: 'claude', text: comment.resolution, at: comment.updatedAt || comment.createdAt });
		}
		comment.thread.push({ from: 'user', text: reply, at: now });
		comment.resolution = null;
		patch = { ...patch, status: 'open' };
	}

	if (patch.status !== undefined) {
		if (!STATUSES.includes(patch.status)) throw httpError(400, `status must be one of ${STATUSES.join(', ')}`);
		comment.status = patch.status;
		comment.resolvedAt = patch.status === 'resolved' ? now : null;
		comment.startedAt = patch.status === 'in_progress' ? now : null;
	}
	if (patch.resolution !== undefined) {
		comment.resolution = patch.resolution;
		if (patch.status === 'needs_info' && patch.resolution) comment.thread.push({ from: 'claude', text: patch.resolution, at: now });
	}
	if (patch.text !== undefined) comment.text = patch.text;
	comment.updatedAt = now;

	save(comments);
	return comment;
}

function remove(id) {
	const comments = load();
	const comment = comments.find((c) => c.id === id);
	if (!comment) throw httpError(404, `No comment with id ${id}`);
	if (comment.screenshot) fs.rmSync(comment.screenshot, { force: true });
	save(comments.filter((c) => c.id !== id));
	return { ok: true };
}

function fileSize(file) {
	try {
		return fs.statSync(file).size;
	} catch {
		return 0;
	}
}

// Screenshot disk usage for a site (or all sites): every screenshot, resolved comments' screenshots,
// and orphans (files no comment points at, e.g. left behind by a deleted comment).
function storage({ site } = {}) {
	const all = load();
	const comments = site ? all.filter((c) => c.site === site) : all;
	const sum = (files) => ({ count: files.length, bytes: files.reduce((n, f) => n + fileSize(f), 0) });
	const referenced = new Set(all.map((c) => c.screenshot).filter(Boolean));
	const orphans = site ? [] : fs.readdirSync(SHOTS_DIR).map((f) => path.join(SHOTS_DIR, f)).filter((f) => !referenced.has(f));
	return {
		total: sum(comments.map((c) => c.screenshot).filter(Boolean)),
		resolved: sum(comments.filter((c) => c.status === 'resolved' && c.screenshot).map((c) => c.screenshot)),
		orphans: sum(orphans),
	};
}

// Deletes the screenshots of resolved comments (plus orphans when not limited to one site). The comments stay.
function clearResolvedScreenshots({ site } = {}) {
	const before = storage({ site });
	const comments = load();
	for (const c of comments) {
		if (c.status !== 'resolved' || !c.screenshot || (site && c.site !== site)) continue;
		fs.rmSync(c.screenshot, { force: true });
		c.screenshot = null;
	}
	save(comments);
	if (!site) {
		const referenced = new Set(comments.map((c) => c.screenshot).filter(Boolean));
		for (const f of fs.readdirSync(SHOTS_DIR)) {
			const file = path.join(SHOTS_DIR, f);
			if (!referenced.has(file)) fs.rmSync(file, { force: true });
		}
	}
	return { freed: before.resolved.bytes + before.orphans.bytes, count: before.resolved.count + before.orphans.count };
}

module.exports = { DATA_DIR, SHOTS_DIR, STATUSES, list, get, sites, create, update, remove, storage, clearResolvedScreenshots };
