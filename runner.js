// Runs `/action-comments` headlessly with the Claude Code CLI, one run per site at a time.
// A run is split into batches by model: comments without an override share one session on the main model,
// and comments set to another model get a session on that model. Batches run one after another.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const store = require('./store');
const sites = require('./sites');

const RUNS_DIR = path.join(store.DATA_DIR, 'runs');
const CONFIG_FILE = path.join(store.DATA_DIR, 'config.json');
const USAGE_FILE = path.join(store.DATA_DIR, 'usage.json');
const MODELS = store.MODELS;
const MAX_LOG = 300;

// What the headless session may do without asking. Override in data/config.json, e.g.
// { "permissionMode": "bypassPermissions" } or { "allowedTools": [...], "model": "..." }
const DEFAULTS = {
	permissionMode: 'acceptEdits',
	allowedTools: [
		'Read',
		'Edit',
		'Write',
		'Glob',
		'Grep',
		'TodoWrite',
		'Skill',
		'Bash(node:*)',
		'Bash(npm run:*)',
		'Bash(npx:*)',
		'Bash(wp:*)',
		'Bash(git status:*)',
		'Bash(git diff:*)',
		'Bash(git log:*)',
		'Bash(ls:*)',
		'Bash(cat:*)',
		'Bash(head:*)',
		'Bash(sed -n:*)',
		'Bash(grep:*)',
		'Bash(find:*)',
		'Bash(curl:*)',
	],
	model: null,
};

const runs = {}; // site → run state

fs.mkdirSync(RUNS_DIR, { recursive: true });

function httpError(status, message) {
	return Object.assign(new Error(message), { status });
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

function config() {
	return { ...DEFAULTS, ...readJson(CONFIG_FILE) };
}

// Settings the dashboard can change. model: null uses your Claude Code default.
function updateConfig(patch) {
	const saved = readJson(CONFIG_FILE) || {};
	if (patch.model !== undefined) {
		if (patch.model !== null && !MODELS.includes(patch.model)) throw httpError(400, `model must be one of ${MODELS.join(', ')} or null`);
		saved.model = patch.model;
	}
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(saved, null, 2));
	return { model: config().model, models: MODELS };
}

// ---------- plan usage ----------

// Claude Code reports plan usage in `rate_limit_event`s. These cover the whole account, including interactive sessions.
function saveUsage(info) {
	const w = info?.unifiedWindows;
	if (!w) return;
	const pick = (x) => x && { utilization: x.utilization, resetsAt: x.resetsAt * 1000, status: x.status };
	fs.writeFileSync(USAGE_FILE, JSON.stringify({ fiveHour: pick(w.five_hour), sevenDay: pick(w.seven_day), checkedAt: new Date().toISOString() }));
}

function usage() {
	return readJson(USAGE_FILE) || {};
}

// Gets fresh numbers with the smallest possible request: Haiku, no tools, no skills, nothing saved.
let probing = null;
function refreshUsage() {
	probing ??= new Promise((resolve, reject) => {
		const PATH = loginPath();
		const args = ['-p', 'Reply with: ok', '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--tools', '',
			'--disable-slash-commands', '--no-session-persistence'];
		const child = spawn(findClaude(PATH), args, { cwd: os.tmpdir(), env: { ...process.env, PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		child.stdout.on('data', (chunk) => (out += chunk));
		child.on('error', reject);
		child.on('close', () => {
			for (const line of out.split('\n')) {
				try {
					const event = JSON.parse(line);
					if (event.type === 'rate_limit_event') saveUsage(event.rate_limit_info);
				} catch {}
			}
			resolve(usage());
		});
	}).finally(() => (probing = null));
	return probing;
}

// launchd starts the server with a bare PATH, so borrow the login shell's to find claude, node, wp, npm etc.
let shellPath;
function loginPath() {
	if (shellPath === undefined) {
		try {
			shellPath = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf %s "$PATH"'], { timeout: 5000 }).toString().trim();
		} catch {
			shellPath = '';
		}
	}
	const extra = [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin')];
	return [shellPath, process.env.PATH, ...extra].filter(Boolean).join(':');
}

function findClaude(PATH) {
	if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
	for (const dir of [...PATH.split(':'), path.join(os.homedir(), '.claude/local')]) {
		const bin = path.join(dir, 'claude');
		try {
			fs.accessSync(bin, fs.constants.X_OK);
			return bin;
		} catch {}
	}
	throw httpError(500, 'Could not find the claude CLI. Set CLAUDE_BIN for the server.');
}

const short = (s, n = 90) => {
	s = String(s ?? '').replace(/\s+/g, ' ').trim();
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// One readable line per tool call or message from the stream-json output.
function describe(event, cwd) {
	const rel = (p) => (p && cwd && p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p);
	if (event.type === 'assistant') {
		return (event.message?.content || [])
			.map((part) => {
				if (part.type === 'text' && part.text.trim()) return { kind: 'text', text: short(part.text, 240) };
				if (part.type !== 'tool_use') return null;
				const i = part.input || {};
				const detail = rel(i.file_path) || i.description || i.command || i.pattern || i.skill || '';
				return { kind: 'tool', text: short(`${part.name} ${detail}`) };
			})
			.filter(Boolean);
	}
	if (event.type === 'result') {
		return [{ kind: event.is_error ? 'error' : 'done', text: short(event.result || event.subtype, 400) }];
	}
	return [];
}

function publicState(run) {
	if (!run) return { running: false };
	const { child, ...rest } = run;
	return rest;
}

function status(site) {
	return publicState(runs[site]);
}

// ids limits the run to those comments, e.g. the Run button on a single card.
function start(site, ids) {
	if (!site) throw httpError(400, 'site is required');
	if (runs[site]?.running) throw httpError(409, 'Claude is already actioning comments for this site');

	let comments = store.list({ site, status: 'open,in_progress' });
	if (ids?.length) comments = comments.filter((c) => ids.includes(c.id));
	if (!comments.length) throw httpError(400, ids?.length ? 'That comment isn’t open' : 'No open comments to action');

	const cwd = sites.projectDir(site);
	if (!cwd) throw httpError(400, `Could not find the project folder for ${site}. Link it in Herd or park its parent folder.`);

	// Group by the model each comment will actually use, main model first.
	const cfg = config();
	const groups = new Map([[cfg.model, []]]);
	for (const c of comments) {
		const model = c.model || cfg.model;
		if (!groups.has(model)) groups.set(model, []);
		groups.get(model).push(c);
	}
	const batches = [...groups]
		.filter(([, list]) => list.length)
		.map(([model, list]) => ({ model, ids: list.map((c) => c.id), numbers: list.map((c) => c.number) }));

	const run = {
		site,
		cwd,
		running: true,
		pending: comments.length,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		exitCode: null,
		stopped: false,
		activity: 'Starting Claude Code…',
		log: [],
		result: null,
		cost: null,
		model: cfg.model || 'default',
		batches: batches.map(({ model, numbers }) => ({ model: model || 'default', numbers })),
		batch: 0,
		child: null,
	};
	runs[site] = run;

	const logFile = path.join(RUNS_DIR, `${site.replace(/[^\w.-]/g, '_')}.log`);
	fs.writeFileSync(logFile, '');
	// With one batch, let the skill pick up every open comment as before; with several, each gets only its own.
	runBatch(run, batches, 0, logFile, cfg, batches.length > 1 || !!ids?.length);
	return publicState(run);
}

function runBatch(run, batches, index, logFile, cfg, scoped) {
	const { site, cwd } = run;
	const batch = batches[index];
	const PATH = loginPath();
	const args = [
		'-p',
		scoped ? `/action-comments ${site} ${batch.ids.join(' ')}` : `/action-comments ${site}`,
		'--output-format',
		'stream-json',
		'--verbose',
		'--permission-mode',
		cfg.permissionMode,
		'--add-dir',
		__dirname,
	];
	if (cfg.allowedTools?.length) args.push('--allowedTools', ...cfg.allowedTools);
	if (batch.model) args.push('--model', batch.model);

	const raw = fs.createWriteStream(logFile, { flags: 'a' });
	const child = spawn(findClaude(PATH), args, { cwd, env: { ...process.env, PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
	run.child = child;
	run.batch = index;
	run.model = batch.model || 'default';

	const push = (entry) => {
		run.log.push({ ...entry, at: new Date().toISOString() });
		if (run.log.length > MAX_LOG) run.log.shift();
		if (entry.kind === 'tool' || entry.kind === 'text') run.activity = entry.text;
	};
	const which = `${batch.model || 'main model'} · ${batch.numbers.map((n) => `#${n}`).join(', ')}`;
	if (scoped) push({ kind: 'text', text: batches.length > 1 ? `Batch ${index + 1} of ${batches.length} · ${which}` : which });

	let buffer = '';
	child.stdout.on('data', (chunk) => {
		raw.write(chunk);
		buffer += chunk;
		const lines = buffer.split('\n');
		buffer = lines.pop();
		for (const line of lines) {
			let event;
			try {
				event = JSON.parse(line);
			} catch {
				continue;
			}
			describe(event, cwd).forEach(push);
			if (event.type === 'system' && event.subtype === 'init' && event.model) run.model = event.model;
			if (event.type === 'rate_limit_event') saveUsage(event.rate_limit_info);
			if (event.type === 'result') {
				run.result = [run.result, event.result].filter(Boolean).join('\n\n') || null;
				if (event.total_cost_usd != null) run.cost = (run.cost || 0) + event.total_cost_usd;
			}
		}
	});
	child.stderr.on('data', (chunk) => {
		raw.write(chunk);
		push({ kind: 'error', text: short(chunk.toString(), 400) });
	});
	child.on('error', (err) => push({ kind: 'error', text: err.message }));
	child.on('close', (code) => {
		raw.end();
		if (code !== 0) run.exitCode = code;
		if (!run.stopped && index + 1 < batches.length) return runBatch(run, batches, index + 1, logFile, cfg, scoped);

		run.running = false;
		run.exitCode ??= code;
		run.finishedAt = new Date().toISOString();
		run.activity = run.stopped ? 'Stopped' : run.exitCode === 0 ? 'Finished' : `Exited with code ${run.exitCode}`;
		// Don't leave a comment stuck "in progress" if the run was stopped or crashed.
		for (const c of store.list({ site, status: 'in_progress' })) store.update(c.id, { status: 'open' });
	});
}

function stop(site) {
	const run = runs[site];
	if (!run?.running) throw httpError(400, 'Nothing is running for this site');
	run.stopped = true;
	run.child.kill('SIGTERM');
	setTimeout(() => run.running && run.child.kill('SIGKILL'), 5000);
	return publicState(run);
}

module.exports = { start, stop, status, config: () => ({ model: config().model, models: MODELS }), updateConfig, usage, refreshUsage };
