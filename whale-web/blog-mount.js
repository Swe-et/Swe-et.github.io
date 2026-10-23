/*
 * 博客看板娘接入层：用「DeepSeek 大肥鱼」替换原来的 Live2D 人物。
 *
 * 原来的 live2d-widget（waifu-tips.js）负责提示气泡、工具栏、看板娘开关和 AI 聊天，
 * 只有画人物这一步调用全局函数 loadlive2d('live2d', 模型地址)。
 * 这里提供同名的 window.loadlive2d，把 <canvas id="live2d"> 换成鲸鱼娘的舞台，其余功能原样保留。
 *
 * - 第一次调用：创建鲸鱼娘；
 * - 再次调用（工具栏「换衣服」按钮）：在女仆装、冬装、店员装之间切换，并记住选择；
 * - 提示气泡出字时，她会跟着动嘴。
 *
 * 形象与引擎来自 Coopanion（https://github.com/Pal-AI-Lab/Coopanion），引擎代码为 AGPL-3.0-or-later，
 * 见同目录 LICENSE / COOPANION-LICENSE；贴图不在 AGPL 范围内，见 THIRD_PARTY_NOTICES.txt。
 * 角色原设：上善无形（溟月）；DeepSeek 女仆二创：ZipZipPipe；实现：Pal-AI-Lab。
 */
import { createPet } from './kit/body.js';
import { createWhaleFigure } from './whale/figure.js';

const BASE = new URL('./whale/', import.meta.url);
const LOOKS = [
	{ id: 'deepseek-maid', say: '换回女仆装啦，今天也请多指教～' },
	{ id: 'deepseek-cape', say: '冬装！鲸鱼兜帽还会喷水哦。' },
	{ id: 'deepseek-crew', say: '店员装上班中，要来点什么吗？' },
];
const LOOK_KEY = 'whale-look';
const STAGE_W = 300;
const STAGE_H = 320;
const SCALE = 1.05; // 人物大小

let ctl = null;
let figure = null;
let stage = null;
let mounting = null;
let lookIndex = readLook();

function readLook() {
	try {
		const i = LOOKS.findIndex(l => l.id === localStorage.getItem(LOOK_KEY));
		return i >= 0 ? i : 0;
	} catch (e) {
		return 0;
	}
}

function saveLook(i) {
	try { localStorage.setItem(LOOK_KEY, LOOKS[i].id); } catch (e) { /* 隐私模式等情况下忽略 */ }
}

function say(text, ms = 4000) {
	const tips = document.getElementById('waifu-tips');
	if (!tips) return;
	tips.innerHTML = text;
	tips.classList.add('waifu-tips-active');
	clearTimeout(say.timer);
	say.timer = setTimeout(() => tips.classList.remove('waifu-tips-active'), ms);
}

function buildStage(canvas) {
	const el = document.createElement('div');
	el.id = 'whale-stage';
	el.className = 'whale-stage';
	el.innerHTML =
		'<svg class="whale-svg" aria-hidden="true">' +
		'<ellipse class="shadow" cx="0" cy="0" rx="0" ry="0"></ellipse>' +
		'<g class="whale-pet"></g><g class="whale-fx"></g></svg>';
	canvas.replaceWith(el);
	return el;
}

/** 提示气泡出字时让她动嘴：文字越长，说得越久。 */
function syncTalkWithTips() {
	const tips = document.getElementById('waifu-tips');
	if (!tips) return;
	let until = 0;
	let timer = null;
	const start = () => {
		if (!ctl || !tips.classList.contains('waifu-tips-active')) return;
		const len = (tips.textContent || '').trim().length;
		until = performance.now() + Math.min(6000, 300 + len * 90);
		if (timer) return;
		timer = setInterval(() => {
			if (!ctl || performance.now() > until || !tips.classList.contains('waifu-tips-active')) {
				clearInterval(timer);
				timer = null;
				return;
			}
			ctl.talk();
		}, 80);
	};
	new MutationObserver(start).observe(tips, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
}

function wireStage(el) {
	const point = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
	el.addEventListener('pointerdown', e => { if (ctl && ctl.pointerDown(point(e))) el.setPointerCapture(e.pointerId); });
	el.addEventListener('pointermove', e => { if (ctl) el.style.cursor = ctl.pointerMove(point(e)) || ''; });
	el.addEventListener('pointerup', () => ctl && ctl.pointerUp());
	el.addEventListener('pointerleave', () => ctl && ctl.pointerLeave());
}

function startLoop() {
	let last = performance.now();
	const frame = now => {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		// 页面在后台、或看板娘被关掉时不渲染，省电
		if (ctl && !document.hidden && stage && stage.offsetParent !== null) {
			ctl.step(dt);
			ctl.render();
		}
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}

async function mount(canvas) {
	const waifu = document.getElementById('waifu');
	if (waifu) waifu.classList.add('whale-waifu');
	stage = buildStage(canvas);
	const svg = stage.querySelector('svg');
	try {
		figure = await createWhaleFigure(BASE, { scheme: LOOKS[lookIndex].id });
		ctl = createPet(
			{ petG: svg.querySelector('.whale-pet'), shadowEl: svg.querySelector('.shadow'), fxG: svg.querySelector('.whale-fx') },
			{
				figure,
				sfx: { play() {} }, // 博客里保持安静，不播放音效
				roam: 'calm',
				enter: 'drop',
				startX: STAGE_W * 0.5,
				bounds: () => ({ W: STAGE_W, H: STAGE_H, floorY: STAGE_H - 14, S: SCALE }),
			},
		);
		wireStage(stage);
		syncTalkWithTips();
		startLoop();
		window.whaleWaifu = { ctl, figure }; // 方便在控制台调试
	} catch (error) {
		// 浏览器不支持 WebGL 等情况：退回一张静态立绘，提示气泡和 AI 聊天照常可用
		console.warn('鲸鱼娘加载失败，改用静态图', error);
		stage.innerHTML = `<img class="whale-fallback" src="${new URL('thumbs/deepseek.png', BASE)}" alt="DeepSeek 大肥鱼">`;
	}
}

async function nextLook() {
	if (!figure || !ctl) return;
	lookIndex = (lookIndex + 1) % LOOKS.length;
	saveLook(lookIndex);
	await figure.setScheme(LOOKS[lookIndex].id, { fade: 0.45 });
	ctl.pet.sqv += 1.4;
	ctl.setExpr('happy', 1.2);
	setTimeout(() => say(LOOKS[lookIndex].say), 300);
}

// waifu-tips.js 会调用 loadlive2d('live2d', url)：第一次是加载人物，之后是「换衣服」
window.loadlive2d = function (id) {
	if (mounting) {
		mounting.then(nextLook);
		return mounting;
	}
	const canvas = document.getElementById(id);
	if (!canvas) return Promise.resolve();
	mounting = mount(canvas);
	return mounting;
};

// 「拍照」工具原本调用 Live2D 的截图接口；这里给一个空实现，避免报错
window.Live2D = window.Live2D || { captureName: '', captureFrame: false };
