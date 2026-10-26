#!/usr/bin/env node
// CLI for Claude Code to read and resolve comments. Works without the server running.
//
//   node cli.js sites
//   node cli.js list [--site host.test] [--status open|in_progress|needs_info|resolved|all]
//   node cli.js show <id>
//   node cli.js start <id>                     (mark as being worked on, shows in the dashboard)
//   node cli.js resolve <id> --note "What was changed"
//   node cli.js needs-info <id> --note "Question for the reviewer"
//   node cli.js reopen <id>
const store = require('./store');
const sites = require('./sites');

const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
	if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') ? true : rest[++i];
	else positional.push(rest[i]);
}

function detectSite() {
	return sites.siteForDir(process.cwd(), store.sites().map((s) => s.site));
}

function format(c, { full = false } = {}) {
	const v = c.viewport || {};
	const e = c.element || {};
	const lines = [
		`## #${c.number} [${c.status}] id: ${c.id}`,
		`Page: ${c.url}${c.title ? `  (${c.title})` : ''}`,
		`Comment: ${c.text}`,
		`Viewport: ${v.width}×${v.height} · breakpoint ${v.breakpoint} · ${v.device}${v.dpr ? ` · dpr ${v.dpr}` : ''}`,
		`Created: ${c.createdAt}`,
		`Element: <${e.tag}>${e.id ? ` #${e.id}` : ''}${e.classes?.length ? ` .${e.classes.join('.')}` : ''}`,
		`Selector: ${e.selector}`,
	];
	if (e.ancestors?.length) lines.push(`Ancestors: ${e.ancestors.join(' > ')}`);
	if (e.text) lines.push(`Element text: "${e.text}"`);
	if (c.bodyClasses) lines.push(`Body classes: ${c.bodyClasses}`);
	if (e.html) lines.push(`HTML:\n${full ? e.html : e.html.slice(0, 400)}`);
	if (c.thread?.length) {
		lines.push('Conversation (latest reply is the answer to your question):');
		for (const m of c.thread) lines.push(`  ${m.from === 'claude' ? 'Claude' : 'Reviewer'}: ${m.text}`);
	}
	if (c.screenshot) lines.push(`Screenshot (pin marks the spot): ${c.screenshot}`);
	if (c.resolution) lines.push(`Resolution note: ${c.resolution}`);
	return lines.join('\n');
}

function setStatus(status) {
	const id = positional[0];
	if (!id) throw new Error(`Usage: ${command} <id>${status === 'in_progress' ? '' : ' --note "..."'}`);
	const patch = { status };
	if (typeof flags.note === 'string') patch.resolution = flags.note;
	const c = store.update(id, patch);
	console.log(`#${c.number} (${c.id}) → ${c.status}`);
}

try {
	switch (command) {
		case 'sites': {
			const sites = store.sites();
			if (!sites.length) console.log('No comments yet.');
			for (const s of sites) console.log(`${s.site}: ${s.open} open, ${s.in_progress} in progress, ${s.needs_info} needs info, ${s.resolved} resolved`);
			break;
		}
		case 'list': {
			const site = flags.site || detectSite();
			if (!site) {
				console.log('Could not match the current directory to a site. Pass --site <host>. Known sites:');
				for (const s of store.sites()) console.log(`  ${s.site}: ${s.open} open`);
				break;
			}
			// In-progress comments are included so ones left behind by an interrupted session get picked up again.
			const status = flags.status || 'open,in_progress';
			const comments = store.list({ site, status });
			console.log(`# ${site}: ${comments.length} ${status} comment(s)\n`);
			console.log(comments.map((c) => format(c)).join('\n\n'));
			break;
		}
		case 'show': {
			const c = store.get(positional[0]);
			if (!c) throw new Error(`No comment with id ${positional[0]}`);
			console.log(format(c, { full: true }));
			break;
		}
		case 'start':
			setStatus('in_progress');
			break;
		case 'resolve':
			setStatus('resolved');
			break;
		case 'needs-info':
			setStatus('needs_info');
			break;
		case 'reopen':
			setStatus('open');
			break;
		default:
			console.log('Commands: sites | list [--site host] [--status s] | show <id> | start <id> | resolve <id> --note "" | needs-info <id> --note "" | reopen <id>');
	}
} catch (err) {
	console.error(`Error: ${err.message}`);
	process.exit(1);
}
