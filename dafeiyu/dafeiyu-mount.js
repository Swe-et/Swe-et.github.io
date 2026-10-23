/*
 * 博客看板娘接入层：Live2D（Cubism 4）版「大肥鱼」。
 * 模型：大肥鱼（公开免费皮套），制作人：狐宫静。运行库见 runtime/，说明见 README.txt。
 *
 * 原来的 live2d-widget（waifu-tips.js）负责提示气泡、工具栏、看板娘开关和 AI 聊天，
 * 画人物时调用全局函数 loadlive2d('live2d', 模型地址)。autoload.js 里的分发函数
 * 遇到大肥鱼时调用这里的 window.dafeiyuWaifu，其余模型（多萝艾尔）交给原来的 live2d.min.js。
 *
 * 大肥鱼画在自己的 <canvas id="dafeiyu-live2d"> 上，原来的 <canvas id="live2d"> 留给多萝艾尔，
 * 两个渲染器互不干扰；#waifu 上的 dafeiyu-waifu 类决定显示哪一个。
 *
 * - activate()：第一次加载运行库和模型，之后只是切回来显示；
 * - nextLook()（工具栏「换衣服」按钮）：轮换星星眼、爱心眼、token 等表情；
 * - 提示气泡出字时张嘴，点她会换表情或吃东西，一分钟没动静会睡着；
 *   不跟随鼠标转头（FOLLOW_MOUSE 改成 true 可以打开）。
 */
(function () {
	'use strict';

	var ROOT = '/dafeiyu/';
	var BASE = ROOT + 'model/';
	var MODEL_URL = BASE + 'dafeiyu.model3.json';
	var RUNTIME = ['live2dcubismcore.min.js', 'pixi.min.js', 'cubism4.min.js'];
	var CANVAS_ID = 'dafeiyu-live2d';
	var CANVAS_W = 300;
	var CANVAS_H = 360;
	var FOLLOW_MOUSE = false; // true：眼睛和头跟着鼠标转

	var LOOKS = [
		{ exp: 'starry', say: '星星眼！今天也有好东西要看吗？' },
		{ exp: 'heart', say: '爱心眼～被你发现啦。' },
		{ exp: 'token', say: 'token！要省着点用哦。' },
		{ exp: 'basin', say: '钢盆准备好了，开饭！' },
		{ exp: 'default', say: '恢复原样啦。' },
	];
	var TAPS = [
		{ motion: 'Eat', say: '吃饭中，勿扰……' },
		{ motion: 'EatToken', say: '嗷呜，吃掉一个 token。' },
		{ exp: 'heart', say: '摸摸头就会开心哦～' },
		{ exp: 'starry', say: '诶？叫我吗！' },
		{ exp: 'angry', say: '再戳就要生气了！' },
	];

	var app = null;
	var model = null;
	var canvas = null;
	var mounting = null;
	var active = false;
	var lookIndex = -1;
	var talkUntil = 0;
	var lastActive = performance.now();
	var sleeping = false;

	function say(text, ms) {
		var tips = document.getElementById('waifu-tips');
		if (!tips) return;
		tips.innerHTML = text;
		tips.classList.add('waifu-tips-active');
		clearTimeout(say.timer);
		say.timer = setTimeout(function () { tips.classList.remove('waifu-tips-active'); }, ms || 4000);
	}

	/** 按顺序加载 Cubism 4 运行库（只在第一次切到大肥鱼时下载）。 */
	function loadScript(src) {
		return new Promise(function (resolve, reject) {
			var key = src.split('?')[0];
			var old = document.querySelector('script[data-waifu-resource="' + key + '"]');
			if (old && old.dataset.loaded === 'true') { resolve(); return; }
			var tag = old || document.createElement('script');
			tag.addEventListener('load', function () { tag.dataset.loaded = 'true'; resolve(); }, { once: true });
			tag.addEventListener('error', function () { tag.remove(); reject(new Error('资源加载失败：' + src)); }, { once: true });
			if (!old) {
				tag.src = src;
				tag.async = false;
				tag.dataset.waifuResource = key;
				document.head.appendChild(tag);
			}
		});
	}

	async function loadRuntime() {
		if (window.PIXI && window.PIXI.live2d) return;
		for (var i = 0; i < RUNTIME.length; i++) await loadScript(ROOT + 'runtime/' + RUNTIME[i]);
	}

	/** 提示气泡出字时让她张嘴：文字越长，说得越久。 */
	function syncTalkWithTips() {
		var tips = document.getElementById('waifu-tips');
		if (!tips) return;
		new MutationObserver(function () {
			if (!tips.classList.contains('waifu-tips-active')) { talkUntil = 0; return; }
			var len = (tips.textContent || '').trim().length;
			talkUntil = performance.now() + Math.min(6000, 300 + len * 90);
		}).observe(tips, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
	}

	function setExpression(name) {
		if (!model) return;
		// 先恢复默认，避免几个表情叠在一起
		model.expression('default');
		if (name !== 'default') setTimeout(function () { model && model.expression(name); }, 60);
	}

	function wake() {
		lastActive = performance.now();
		if (sleeping && model) {
			sleeping = false;
			model.motion('Idle', 0, 3); // 3 = 强制播放，打断睡觉动作
		}
	}

	function onTap() {
		if (!model) return;
		wake();
		var t = TAPS[Math.floor(Math.random() * TAPS.length)];
		if (t.motion) model.motion(t.motion, 0, 3);
		if (t.exp) {
			setExpression(t.exp);
			setTimeout(function () { setExpression('default'); }, 4000);
		}
		say(t.say, 3500);
	}

	function layout() {
		// 按高度放下整个模型，水平居中，脚底贴近画布底部
		var w = model.internalModel.originalWidth;
		var h = model.internalModel.originalHeight;
		var scale = Math.min(CANVAS_W / w, CANVAS_H / h);
		model.scale.set(scale);
		model.x = (CANVAS_W - w * scale) / 2;
		model.y = CANVAS_H - h * scale;
	}

	/** 只有大肥鱼正在显示、页面在前台时才渲染，省电。 */
	function syncTicker() {
		if (!app) return;
		if (active && !document.hidden) app.ticker.start(); else app.ticker.stop();
	}

	function ensureCanvas() {
		if (canvas && canvas.isConnected) return canvas;
		canvas = document.getElementById(CANVAS_ID);
		if (canvas) return canvas;
		canvas = document.createElement('canvas');
		canvas.id = CANVAS_ID;
		canvas.width = CANVAS_W;
		canvas.height = CANVAS_H;
		var old = document.getElementById('live2d');
		if (old) old.insertAdjacentElement('afterend', canvas);
		else (document.getElementById('waifu') || document.body).appendChild(canvas);
		return canvas;
	}

	async function mount() {
		await loadRuntime();
		var view = ensureCanvas();
		app = new PIXI.Application({
			view: view,
			width: CANVAS_W,
			height: CANVAS_H,
			backgroundAlpha: 0,
			antialias: true,
			autoDensity: true,
			resolution: Math.min(window.devicePixelRatio || 1, 2),
		});

		model = await PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: FOLLOW_MOUSE });
		app.stage.addChild(model);
		layout();

		// 每帧：说话时张嘴；一分钟没动静就睡觉
		model.internalModel.on('beforeModelUpdate', function () {
			var now = performance.now();
			if (now < talkUntil && !sleeping) {
				var open = 0.35 + 0.45 * Math.abs(Math.sin(now / 95));
				model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', open);
			}
			if (!sleeping && now - lastActive > 60000) {
				sleeping = true;
				model.motion('Sleep', 0, 3);
			}
		});

		['pointermove', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
			window.addEventListener(ev, wake, { passive: true });
		});
		view.addEventListener('pointerdown', onTap);
		document.addEventListener('visibilitychange', syncTicker);

		syncTalkWithTips();
		syncTicker();
	}

	function showFallback() {
		var view = ensureCanvas();
		var img = document.createElement('img');
		img.id = CANVAS_ID;
		img.className = 'dafeiyu-fallback';
		img.alt = '大肥鱼';
		img.src = ROOT + 'preview.webp';
		view.replaceWith(img);
		canvas = img;
	}

	function setVisible(on) {
		active = on;
		var waifu = document.getElementById('waifu');
		if (waifu) waifu.classList.toggle('dafeiyu-waifu', on);
		syncTicker();
	}

	/** 切到大肥鱼：第一次加载模型，之后直接显示。 */
	function activate() {
		ensureCanvas();
		setVisible(true);
		wake();
		if (!mounting) {
			mounting = mount().catch(function (error) {
				console.warn('大肥鱼 Live2D 加载失败', error);
				showFallback();
			});
		}
		return mounting;
	}

	/** 切到别的看板娘：隐藏并暂停渲染（模型留在内存里，切回来不用重新下载）。 */
	function deactivate() {
		setVisible(false);
	}

	function nextLook() {
		if (!model) return;
		wake();
		lookIndex = (lookIndex + 1) % LOOKS.length;
		setExpression(LOOKS[lookIndex].exp);
		setTimeout(function () { say(LOOKS[lookIndex].say); }, 300);
	}

	window.dafeiyuWaifu = {
		activate: activate,
		deactivate: deactivate,
		nextLook: nextLook,
		isActive: function () { return active; },
		get app() { return app; },     // 方便在控制台调试
		get model() { return model; },
	};
})();
