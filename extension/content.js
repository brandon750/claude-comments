(() => {
	if (window.__claudeComments) return;
	window.__claudeComments = true;

	// Run in the top frame, or inside the responsive viewer's iframe — not in random embeds.
	const inViewer =
		window !== window.top && Array.from(location.ancestorOrigins || []).some((o) => o.startsWith('chrome-extension://'));
	if (window !== window.top && !inViewer) return;

	const SITE = location.host;
	const state = {
		mode: false,
		comments: [],
		showResolved: false,
		draft: null,
		pins: [],
		path: location.pathname,
		serverDown: false,
		running: false,
	};

	// Brand: gunmetal + liquid chrome, hot pink for your actions, bright green for Claude/done.
	// Neon fills always carry dark text so labels stay readable.
	const STYLES = `
		:host { all: initial;
			--pink: #ff66b8; --pink-hi: #ff8ac9; --green: #2bff88; --blue: #3ab4ff; --amber: #ffc21a; --red: #ff3b5c;
			--ink: #120a10; --metal: #0d0e12; --metal-2: #1c1e25; --pearl: #f3f4f7; --line: #dfe2e8; --muted: #636774;
			--chrome: linear-gradient(180deg, #fff 0%, #d4d9e1 30%, #7c8491 49%, #f2f4f7 53%, #aab1bc 80%, #eef1f4 100%); }
		* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
		[hidden] { display: none !important; }
		code { font: 11px/1.3 ui-monospace, Menlo, monospace; }
		.bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 2px; align-items: center; padding: 4px 4px 4px 8px;
			color: #fff; border: 1.5px solid transparent; border-radius: 999px; font-size: 12px;
			background: linear-gradient(180deg, var(--metal-2), var(--metal)) padding-box, var(--chrome) border-box;
			box-shadow: 0 8px 28px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.4); }
		.mark { display: block; width: 18px; height: 18px; margin-right: 4px; flex: none; }
		.btn { appearance: none; border: 0; background: transparent; color: inherit; font-family: inherit; font-size: 12px;
			font-weight: 600; line-height: 1; padding: 8px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
		.btn:hover { background: rgba(255,255,255,.14); }
		.btn:focus-visible { outline: 2px solid var(--green); outline-offset: 1px; }
		.btn.primary { background: var(--pink); color: var(--ink); }
		.btn.primary:hover { background: var(--pink-hi); }
		.btn.on { background: var(--green); color: var(--ink); }
		.btn.on:hover { background: #6effad; }
		.btn:disabled { opacity: .5; cursor: default; }
		.count { padding: 0 8px; color: #c5c9d2; white-space: nowrap; }
		.hover { position: fixed; pointer-events: none; outline: 2px solid var(--pink); background: rgba(255,102,184,.08); }
		.hover span { position: absolute; top: -22px; left: -2px; background: var(--pink); color: var(--ink); font: 600 11px/1 ui-monospace, Menlo, monospace;
			padding: 5px 6px; border-radius: 3px; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
		.pins { position: absolute; top: 0; left: 0; }
		.pin { --fill: var(--pink); position: absolute; width: 28px; height: 28px; margin: 0; padding: 0; transform: translate(-3px, -25px);
			border-radius: 14px 14px 14px 3px; color: var(--ink); border: 2px solid transparent; font-size: 12px;
			background: linear-gradient(var(--fill), var(--fill)) padding-box, var(--chrome) border-box;
			font-weight: 700; line-height: 24px; text-align: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4), 0 0 0 1px rgba(0,0,0,.35); }
		.pin:hover { z-index: 1; filter: brightness(1.1); }
		.pin.needs_info { --fill: var(--amber); }
		.pin.in_progress { --fill: var(--blue); }
		.pin.resolved { --fill: var(--green); }
		.pin.draft { --fill: var(--metal); color: #fff; }
		.pin.dim { opacity: .45; }
		.pin.lost { border: 2px dashed #fff; background: var(--fill); }
		.pop { position: fixed; width: min(300px, calc(100vw - 16px)); color: var(--ink); border: 1.5px solid transparent; border-radius: 12px;
			background: linear-gradient(#fff, #fff) padding-box, var(--chrome) border-box;
			box-shadow: 0 12px 40px rgba(0,0,0,.3), 0 0 0 1px rgba(0,0,0,.12); padding: 12px; font-size: 13px; line-height: 1.45; }
		.pop .btn { background: var(--pearl); color: var(--ink); padding: 7px 10px; box-shadow: inset 0 0 0 1px var(--line); }
		.pop .btn:hover { background: #e6e8ee; }
		.pop .btn:focus-visible { outline-color: var(--pink); }
		.pop .btn.primary { background: var(--pink); box-shadow: none; }
		.pop .btn.primary:hover { background: var(--pink-hi); }
		.pop textarea { display: block; width: 100%; min-height: 84px; resize: vertical; border: 1px solid var(--line); border-radius: 8px;
			padding: 8px; font-size: 13px; line-height: 1.4; color: var(--ink); background: #fff; }
		.pop textarea:focus { outline: 2px solid var(--pink); border-color: transparent; }
		.head { display: flex; gap: 6px; align-items: center; font-weight: 700; margin-bottom: 4px; }
		.head::before { content: "✦"; color: var(--pink); font-size: 12px; }
		.chip { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 2px 6px; border-radius: 4px;
			background: var(--pink); color: var(--ink); }
		.chip.resolved { background: var(--green); }
		.chip.needs_info { background: var(--amber); }
		.chip.in_progress { background: var(--blue); }
		.msg { margin-top: 8px; padding: 8px; background: var(--pearl); border-radius: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
		.msg.user { margin-left: 20px; background: #fff; border: 1px solid var(--line); }
		.pop .reply { margin-top: 8px; min-height: 60px; }
		.meta { color: var(--muted); font-size: 11px; margin-bottom: 8px; }
		.meta.working { margin: 8px 0 0; color: #0b6fb8; font-weight: 600; }
		.text { white-space: pre-wrap; word-break: break-word; }
		.note { margin-top: 8px; padding: 8px; background: var(--pearl); border-radius: 8px; font-size: 12px; white-space: pre-wrap; }
		.warn { margin-top: 8px; font-size: 11px; color: #c4005f; }
		.row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; margin-top: 10px; }
		.row .hint { margin-right: auto; color: var(--muted); font-size: 11px; }
		.toast { position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%); color: #fff; border: 1.5px solid transparent;
			background: linear-gradient(var(--metal), var(--metal)) padding-box, var(--chrome) border-box;
			padding: 9px 14px; border-radius: 10px; font-size: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.35); max-width: calc(100vw - 32px); }
		.toast.error { background: linear-gradient(#c4002f, #c4002f) padding-box, var(--chrome) border-box; }
		:host(.capturing) .bar, :host(.capturing) .pop, :host(.capturing) .toast, :host(.capturing) .hover { display: none !important; }
	`;

	const MARK = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
		<defs><linearGradient id="cc-chrome" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d4d9e1"/><stop offset=".49" stop-color="#7c8491"/>
			<stop offset=".53" stop-color="#f2f4f7"/><stop offset=".8" stop-color="#aab1bc"/><stop offset="1" stop-color="#eef1f4"/>
		</linearGradient></defs>
		<path d="M50 4 C53 40 60 47 96 50 C60 53 53 60 50 96 C47 60 40 53 4 50 C40 47 47 40 50 4Z" fill="url(#cc-chrome)"/>
	</svg>`;

	const host = document.createElement('claude-comments');
	host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
	const root = host.attachShadow({ mode: 'open' });
	root.innerHTML = `
		<style>${STYLES}</style>
		<div class="pins"></div>
		<div class="hover" hidden><span></span></div>
		<div class="bar">
			${MARK}
			<button class="btn primary" data-act="mode" title="Toggle comment mode (⌥C)">Comment</button>
			<span class="count"></span>
			<button class="btn" data-act="run" title="Have Claude Code action the open comments for this site">Action</button>
			<button class="btn" data-act="resolved" title="Show resolved comments">Resolved</button>
			${inViewer ? '' : '<button class="btn" data-act="viewer" title="Open in the responsive viewer">Responsive</button>'}
			<button class="btn" data-act="dashboard" title="Open the comments dashboard">All</button>
		</div>
		<div class="pop" hidden></div>
		<div class="toast" hidden></div>`;
	document.documentElement.appendChild(host);

	const $ = (sel) => root.querySelector(sel);
	const pinsEl = $('.pins');
	const hoverEl = $('.hover');
	const popEl = $('.pop');
	const toastEl = $('.toast');

	// Keep keystrokes typed into our UI away from the site's own key handlers.
	for (const type of ['keydown', 'keyup', 'keypress', 'input']) {
		root.addEventListener(type, (e) => e.stopPropagation());
	}

	const cursorStyle = document.createElement('style');
	cursorStyle.textContent = 'html.claude-comments-mode, html.claude-comments-mode * { cursor: crosshair !important; }';
	document.documentElement.appendChild(cursorStyle);

	// ---------- helpers ----------

	function send(msg) {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(msg, (res) => {
				if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
				if (res && res.error) return reject(new Error(res.error));
				resolve(res);
			});
		});
	}

	const esc = (s) =>
		String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

	const breakpoint = (w) => (w >= 1536 ? '2xl' : w >= 1280 ? 'xl' : w >= 1024 ? 'lg' : w >= 768 ? 'md' : w >= 640 ? 'sm' : 'base');
	const device = (w) => (w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');

	function viewport() {
		const w = window.innerWidth;
		return {
			width: w,
			height: window.innerHeight,
			dpr: window.devicePixelRatio,
			breakpoint: breakpoint(w),
			device: device(w),
			scrollY: Math.round(window.scrollY),
			responsiveViewer: inViewer,
		};
	}

	function ago(iso) {
		const s = (Date.now() - new Date(iso)) / 1000;
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		return `${Math.floor(s / 86400)}d ago`;
	}

	function label(el) {
		let out = el.localName;
		if (el.id) out += `#${el.id}`;
		const classes = Array.from(el.classList).slice(0, 6);
		if (classes.length) out += `.${classes.join('.')}`;
		return out;
	}

	function selectorFor(el) {
		const parts = [];
		while (el && el.nodeType === 1 && el !== document.documentElement) {
			if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
				parts.unshift(`#${CSS.escape(el.id)}`);
				break;
			}
			let part = el.localName;
			const parent = el.parentElement;
			if (parent) {
				const same = Array.from(parent.children).filter((c) => c.localName === el.localName);
				if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`;
			}
			parts.unshift(part);
			el = parent;
		}
		return parts.join(' > ');
	}

	function describeElement(el) {
		const ancestors = [];
		for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) ancestors.unshift(label(a));
		const html = el.outerHTML;
		return {
			selector: selectorFor(el),
			tag: el.localName,
			id: el.id || null,
			classes: Array.from(el.classList),
			text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200),
			html: html.length > 1500 ? `${html.slice(0, 1500)}…` : html,
			ancestors: ancestors.slice(-10),
		};
	}

	function anchor(c) {
		let el = null;
		try {
			el = document.querySelector(c.element.selector);
		} catch {}
		if (el) {
			const r = el.getBoundingClientRect();
			if (r.width || r.height) {
				return { x: r.left + window.scrollX + r.width * c.pin.xPct, y: r.top + window.scrollY + r.height * c.pin.yPct };
			}
		}
		return { x: c.pin.pageX, y: c.pin.pageY, lost: true };
	}

	let toastTimer;
	function toast(message, error = false) {
		toastEl.textContent = message;
		toastEl.classList.toggle('error', error);
		toastEl.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastEl.hidden = true), error ? 6000 : 2500);
	}

	const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

	function placePop(x, y) {
		popEl.hidden = false;
		const w = popEl.offsetWidth;
		const h = popEl.offsetHeight;
		const left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8));
		const top = y + 14 + h > window.innerHeight - 8 ? Math.max(8, y - h - 14) : y + 14;
		popEl.style.left = `${left}px`;
		popEl.style.top = `${top}px`;
	}

	function closePop() {
		popEl.hidden = true;
		popEl.innerHTML = '';
	}

	// ---------- data ----------

	async function load() {
		try {
			state.comments = await send({ type: 'list', site: SITE });
			state.serverDown = false;
		} catch (err) {
			state.serverDown = true;
			if (state.mode) toast(err.message, true);
		}
		renderPins();
	}

	async function updateComment(id, patch) {
		try {
			const updated = await send({ type: 'update', id, patch });
			state.comments = state.comments.map((c) => (c.id === id ? updated : c));
			closePop();
			renderPins();
		} catch (err) {
			toast(err.message, true);
		}
	}

	async function deleteComment(id) {
		if (!confirm('Delete this comment?')) return;
		try {
			await send({ type: 'delete', id });
			state.comments = state.comments.filter((c) => c.id !== id);
			closePop();
			renderPins();
		} catch (err) {
			toast(err.message, true);
		}
	}

	// ---------- pins ----------

	function visibleComments() {
		return state.comments.filter(
			(c) => c.path === location.pathname && (c.status !== 'resolved' || state.showResolved)
		);
	}

	function renderPins() {
		pinsEl.innerHTML = '';
		state.pins = [];
		const here = device(window.innerWidth);

		for (const c of visibleComments()) {
			const pin = document.createElement('button');
			pin.className = `pin ${c.status}`;
			pin.textContent = c.number;
			pin.title = `#${c.number} · ${c.viewport?.width}px — ${c.text}`;
			if (c.viewport?.device !== here) pin.classList.add('dim');
			pin.addEventListener('click', (e) => {
				e.stopPropagation();
				showDetail(c, pin);
			});
			pinsEl.appendChild(pin);
			state.pins.push({ pin, comment: c });
		}

		if (state.draft) {
			const pin = document.createElement('div');
			pin.className = 'pin draft';
			pin.textContent = '+';
			pinsEl.appendChild(pin);
			state.pins.push({ pin, draft: state.draft });
		}

		positionPins();
		renderCount();
	}

	function positionPins() {
		for (const p of state.pins) {
			const pos = p.draft ? { x: p.draft.pageX, y: p.draft.pageY } : anchor(p.comment);
			p.pin.style.left = `${pos.x}px`;
			p.pin.style.top = `${pos.y}px`;
			p.pin.classList.toggle('lost', !!pos.lost);
		}
	}

	function renderCount() {
		const open = state.comments.filter((c) => c.status !== 'resolved');
		const onPage = open.filter((c) => c.path === location.pathname).length;
		$('.count').textContent = state.serverDown
			? 'server offline'
			: state.running
				? 'Claude is working…'
				: `${onPage} here · ${open.length} on site`;
		const runBtn = $('[data-act=run]');
		runBtn.disabled = state.running;
	}

	// ---------- composer + detail ----------

	function startDraft(e) {
		const el = e.target;
		if (!el || el.nodeType !== 1) return;
		const r = el.getBoundingClientRect();
		state.draft = {
			el,
			x: e.clientX,
			y: e.clientY,
			pageX: e.clientX + window.scrollX,
			pageY: e.clientY + window.scrollY,
			xPct: r.width ? (e.clientX - r.left) / r.width : 0,
			yPct: r.height ? (e.clientY - r.top) / r.height : 0,
		};
		hoverEl.hidden = true;
		renderPins();
		showComposer();
	}

	function showComposer(text = '') {
		const v = viewport();
		popEl.innerHTML = `
			<div class="head">New comment</div>
			<div class="meta">${v.width}×${v.height} · ${v.breakpoint} · <code>${esc(label(state.draft.el))}</code></div>
			<textarea placeholder="What should Claude change?"></textarea>
			<div class="row">
				<span class="hint">⌘↵ save · esc cancel</span>
				<button class="btn" data-act="cancel">Cancel</button>
				<button class="btn primary" data-act="save">Save</button>
			</div>`;
		const ta = popEl.querySelector('textarea');
		ta.value = text;
		ta.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') cancelDraft();
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveDraft();
		});
		popEl.querySelector('[data-act=cancel]').addEventListener('click', cancelDraft);
		popEl.querySelector('[data-act=save]').addEventListener('click', saveDraft);
		placePop(state.draft.x, state.draft.y);
		ta.focus();
	}

	function cancelDraft() {
		state.draft = null;
		closePop();
		renderPins();
	}

	async function saveDraft() {
		const ta = popEl.querySelector('textarea');
		const text = ta.value.trim();
		if (!text) return ta.focus();

		const d = state.draft;
		const payload = {
			site: SITE,
			url: location.href,
			path: location.pathname,
			title: document.title,
			text,
			viewport: viewport(),
			element: describeElement(d.el),
			bodyClasses: document.body?.className || '',
			pin: { xPct: d.xPct, yPct: d.yPct, pageX: d.pageX, pageY: d.pageY },
		};

		// Hide our chrome so the screenshot shows the page plus the pin.
		popEl.hidden = true;
		host.classList.add('capturing');
		await nextFrame();
		try {
			const comment = await send({ type: 'create', comment: payload });
			state.comments.push(comment);
			state.serverDown = false;
			state.draft = null;
			host.classList.remove('capturing');
			closePop();
			toast(`Comment #${comment.number} saved. Run /action-comments in Claude Code to action it.`);
		} catch (err) {
			host.classList.remove('capturing');
			showComposer(text);
			toast(err.message, true);
		}
		renderPins();
	}

	function showDetail(c, pin) {
		const here = window.innerWidth;
		const v = c.viewport || {};
		const thread = c.thread || [];
		// Older needs-info comments only have the question in `resolution`.
		const messages =
			c.resolution && !thread.some((m) => m.text === c.resolution) ? [...thread, { from: 'claude', text: c.resolution }] : thread;
		popEl.innerHTML = `
			<div class="head">#${c.number} <span class="chip ${c.status}">${c.status.replace('_', ' ')}</span></div>
			<div class="meta">${v.width}×${v.height} · ${v.breakpoint} · ${ago(c.createdAt)}</div>
			<div class="text">${esc(c.text)}</div>
			${messages.map((m) => `<div class="msg ${m.from}"><strong>${m.from === 'claude' ? 'Claude' : 'You'}:</strong> ${esc(m.text)}</div>`).join('')}
			${c.status === 'open' ? '<div class="meta" style="margin:8px 0 0">Waiting for Claude. Run <code>/action-comments</code> in Claude Code.</div>' : ''}
			${c.status === 'in_progress' ? '<div class="meta working">Claude is working on this now.</div>' : ''}
			${c.status === 'needs_info' ? `<textarea class="reply" placeholder="Answer Claude's question…"></textarea>` : ''}
			${v.device !== device(here) ? `<div class="warn">Left at ${v.width}px; you're viewing at ${here}px.</div>` : ''}
			<div class="row">
				<button class="btn" data-act="delete">Delete</button>
				${
					c.status === 'resolved'
						? '<button class="btn" data-act="reopen">Reopen</button>'
						: '<button class="btn" data-act="resolve" title="Close this comment without Claude actioning it">Close comment</button>'
				}
				${
					c.status === 'needs_info'
						? '<button class="btn primary" data-act="reply" title="⌘↵">Send</button>'
						: '<button class="btn primary" data-act="close">Close</button>'
				}
			</div>`;
		const reply = popEl.querySelector('.reply');
		const sendReply = () => {
			const text = reply.value.trim();
			if (text) updateComment(c.id, { reply: text });
			else reply.focus();
		};
		reply?.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') closePop();
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply();
		});
		popEl.querySelector('[data-act=reply]')?.addEventListener('click', sendReply);
		popEl.querySelector('[data-act=close]')?.addEventListener('click', closePop);
		popEl.querySelector('[data-act=delete]').addEventListener('click', () => deleteComment(c.id));
		popEl.querySelector('[data-act=resolve]')?.addEventListener('click', () => updateComment(c.id, { status: 'resolved' }));
		popEl.querySelector('[data-act=reopen]')?.addEventListener('click', () => updateComment(c.id, { status: 'open' }));
		const r = pin.getBoundingClientRect();
		placePop(r.right - 14, r.bottom - 14);
	}

	// ---------- running Claude ----------

	// While Claude is running, refresh pins so they turn blue then green as it works through them.
	let watchTimer;
	async function watchRun() {
		clearTimeout(watchTimer);
		try {
			state.running = (await send({ type: 'runStatus', site: SITE })).running;
		} catch {
			state.running = false;
		}
		await load();
		if (state.running) watchTimer = setTimeout(watchRun, 4000);
	}

	async function startRun() {
		const pending = state.comments.filter((c) => c.status === 'open' || c.status === 'in_progress').length;
		if (!pending) return toast('No open comments to action.');
		try {
			await send({ type: 'run', site: SITE });
			toast(`Claude is actioning ${pending} comment${pending === 1 ? '' : 's'}. Follow along in the dashboard (All).`);
			watchRun();
		} catch (err) {
			toast(err.message, true);
		}
	}

	// ---------- comment mode ----------

	function setMode(on) {
		state.mode = on;
		document.documentElement.classList.toggle('claude-comments-mode', on);
		const btn = $('[data-act=mode]');
		btn.textContent = on ? 'Done (esc)' : 'Comment';
		btn.classList.toggle('on', on);
		if (!on) {
			hoverEl.hidden = true;
			if (state.draft) cancelDraft();
		} else if (state.serverDown) {
			load();
		}
	}

	const isOurs = (e) => e.composedPath().includes(host);

	window.addEventListener(
		'mousemove',
		(e) => {
			if (!state.mode || state.draft) return;
			const el = e.target;
			if (isOurs(e) || !el || el.nodeType !== 1) return (hoverEl.hidden = true);
			const r = el.getBoundingClientRect();
			Object.assign(hoverEl.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
			hoverEl.firstElementChild.textContent = label(el);
			hoverEl.hidden = false;
		},
		true
	);

	for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart']) {
		window.addEventListener(
			type,
			(e) => {
				if (!state.mode || isOurs(e)) return;
				e.preventDefault();
				e.stopImmediatePropagation();
				if (type === 'click' && !state.draft) startDraft(e);
			},
			{ capture: true, passive: false }
		);
	}

	window.addEventListener(
		'keydown',
		(e) => {
			if (e.altKey && e.code === 'KeyC') {
				e.preventDefault();
				setMode(!state.mode);
			} else if (e.key === 'Escape' && state.mode && !state.draft) {
				setMode(false);
			}
		},
		true
	);

	// Close the detail popover when clicking elsewhere (outside comment mode).
	window.addEventListener('click', (e) => {
		if (!state.mode && !state.draft && !popEl.hidden && !isOurs(e)) closePop();
	});

	root.addEventListener('click', (e) => {
		const act = e.target.closest?.('.bar [data-act]')?.dataset.act;
		if (act === 'mode') setMode(!state.mode);
		if (act === 'run') startRun();
		if (act === 'resolved') {
			state.showResolved = !state.showResolved;
			e.target.classList.toggle('on', state.showResolved);
			renderPins();
		}
		if (act === 'viewer') send({ type: 'openViewer', url: location.href }).catch((err) => toast(err.message, true));
		if (act === 'dashboard') send({ type: 'openDashboard', site: SITE }).catch((err) => toast(err.message, true));
	});

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg.type === 'toggle') setMode(!state.mode);
	});

	// ---------- keep in sync ----------

	function notifyViewer() {
		if (inViewer) window.parent.postMessage({ source: 'claude-comments', url: location.href, title: document.title }, '*');
	}

	// Handles page-transition libraries that swap content without a full reload.
	setInterval(() => {
		if (location.pathname !== state.path) {
			state.path = location.pathname;
			closePop();
			state.draft = null;
			renderPins();
			notifyViewer();
		} else {
			positionPins();
		}
	}, 500);

	window.addEventListener('resize', renderPins);
	window.addEventListener('focus', watchRun);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && watchRun());

	notifyViewer();
	watchRun();
})();
