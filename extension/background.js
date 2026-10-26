const API = 'http://localhost:4848';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	handle(msg, sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
	return true;
});

chrome.action.onClicked.addListener((tab) => {
	chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
});

async function handle(msg, sender) {
	switch (msg.type) {
		case 'list':
			return api(`/api/comments?site=${encodeURIComponent(msg.site)}`);
		case 'create': {
			let screenshot = null;
			try {
				screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
			} catch (err) {
				console.warn('Screenshot failed', err);
			}
			return api('/api/comments', { method: 'POST', body: { ...msg.comment, screenshot } });
		}
		case 'update':
			return api(`/api/comments/${msg.id}`, { method: 'PATCH', body: msg.patch });
		case 'delete':
			return api(`/api/comments/${msg.id}`, { method: 'DELETE' });
		case 'run':
			return api('/api/run', { method: 'POST', body: { site: msg.site } });
		case 'runStatus':
			return api(`/api/run?site=${encodeURIComponent(msg.site)}`);
		case 'openViewer':
			await chrome.tabs.create({
				url: `${chrome.runtime.getURL('viewer.html')}?url=${encodeURIComponent(msg.url)}`,
				index: sender.tab.index + 1,
			});
			return { ok: true };
		case 'openDashboard':
			await chrome.tabs.create({ url: `${API}/?site=${encodeURIComponent(msg.site)}`, index: sender.tab.index + 1 });
			return { ok: true };
		default:
			throw new Error(`Unknown message ${msg.type}`);
	}
}

async function api(path, { method = 'GET', body } = {}) {
	let res;
	try {
		res = await fetch(API + path, {
			method,
			headers: body ? { 'Content-Type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined,
		});
	} catch {
		throw new Error('Comments server is not running. Start it with: node ~/Developer/claude-comments/server.js');
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
	return data;
}
