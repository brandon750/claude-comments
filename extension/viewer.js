const PRESETS = [
	{ label: 'Mobile', w: 375, h: 812 },
	{ label: 'Mobile L', w: 430, h: 932 },
	{ label: 'Tablet', w: 768, h: 1024 },
	{ label: 'Laptop', w: 1280, h: 800 },
	{ label: 'Desktop', w: 1440, h: 900 },
	{ label: 'Wide', w: 1920, h: 1080 },
];

const $ = (id) => document.getElementById(id);
const frame = $('frame');
const wrap = $('frame-wrap');
const stage = $('stage');

const stored = (() => {
	try {
		return JSON.parse(localStorage.getItem('viewer-size')) || {};
	} catch {
		return {};
	}
})();
const size = { w: stored.w || 375, h: stored.h || 812 };
let currentUrl = new URLSearchParams(location.search).get('url') || '';

function normalise(url) {
	url = url.trim();
	return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function navigate(url) {
	currentUrl = normalise(url);
	frame.src = currentUrl;
	showUrl(currentUrl);
}

function showUrl(url) {
	$('url').value = url;
	history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
}

function layout() {
	const pad = 32;
	const scale = Math.min(1, (stage.clientWidth - pad) / size.w, (stage.clientHeight - pad) / size.h);
	Object.assign(wrap.style, {
		width: `${size.w}px`,
		height: `${size.h}px`,
		transform: `translateX(-50%) scale(${scale})`,
	});
	$('width').value = size.w;
	$('info').textContent = `${size.w} × ${size.h}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}`;
	for (const btn of $('presets').children) btn.classList.toggle('on', Number(btn.dataset.w) === size.w);
	try {
		localStorage.setItem('viewer-size', JSON.stringify(size));
	} catch {}
}

function setSize(w, h = size.h) {
	size.w = w;
	size.h = h;
	layout();
}

for (const p of PRESETS) {
	const btn = document.createElement('button');
	btn.dataset.w = p.w;
	btn.innerHTML = `${p.label}<small>${p.w}</small>`;
	btn.addEventListener('click', () => setSize(p.w, p.h));
	$('presets').appendChild(btn);
}

$('nav').addEventListener('submit', (e) => {
	e.preventDefault();
	navigate($('url').value);
});
$('url').addEventListener('keydown', (e) => e.key === 'Enter' && navigate($('url').value));
$('reload').addEventListener('click', () => navigate(currentUrl));
$('open').addEventListener('click', () => window.open(currentUrl, '_blank'));
$('width').addEventListener('change', (e) => setSize(Math.max(200, Number(e.target.value) || size.w)));
$('rotate').addEventListener('click', () => setSize(size.h, size.w));
window.addEventListener('resize', layout);

// The content script inside the frame reports navigation so the URL bar stays current.
window.addEventListener('message', (e) => {
	if (e.source !== frame.contentWindow || e.data?.source !== 'claude-comments') return;
	currentUrl = e.data.url;
	showUrl(currentUrl);
	document.title = `${size.w}px · ${e.data.title || 'Responsive Viewer'}`;
});

layout();
if (currentUrl) navigate(currentUrl);
