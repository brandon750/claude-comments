// Maps .test sites to project folders on disk, using Herd/Valet's links and parked paths.
const fs = require('fs');
const os = require('os');
const path = require('path');

const VALET_DIRS = [
	path.join(os.homedir(), 'Library/Application Support/Herd/config/valet'),
	path.join(os.homedir(), '.config/valet'),
];

const nameOf = (site) => site.replace(/\.test(:\d+)?$/, '');

// Herd/Valet linked sites: { name: realpath } e.g. { cbh: '/Users/me/Developer/cottesloebeachhotel' }
function linkedSites() {
	const links = {};
	for (const dir of VALET_DIRS) {
		try {
			for (const name of fs.readdirSync(path.join(dir, 'Sites'))) links[name] = fs.realpathSync(path.join(dir, 'Sites', name));
		} catch {}
	}
	return links;
}

// Folders whose subfolders are served as <folder>.test, e.g. ~/Developer.
function parkedPaths() {
	const paths = [];
	for (const dir of VALET_DIRS) {
		try {
			paths.push(...JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).paths);
		} catch {}
	}
	return paths;
}

// The project folder for a site, or null if it can't be found.
function projectDir(site) {
	const name = nameOf(site);
	const linked = linkedSites()[name];
	if (linked) return linked;
	for (const parked of parkedPaths()) {
		const dir = path.join(parked, name);
		try {
			if (fs.statSync(dir).isDirectory()) return fs.realpathSync(dir);
		} catch {}
	}
	return null;
}

// Match a directory to one of the known sites: a link pointing at (a parent of) it,
// otherwise a parked folder name, e.g. ~/Developer/foo/... → foo.test
function siteForDir(dir, known) {
	const cwd = fs.realpathSync(dir);
	const links = linkedSites();
	const linked = known
		.filter((site) => links[nameOf(site)] && (cwd + '/').startsWith(links[nameOf(site)] + '/'))
		.sort((a, b) => links[nameOf(b)].length - links[nameOf(a)].length);
	if (linked.length) return linked[0];

	const segments = cwd.split('/');
	return known.find((site) => segments.includes(nameOf(site))) || null;
}

module.exports = { projectDir, siteForDir };
