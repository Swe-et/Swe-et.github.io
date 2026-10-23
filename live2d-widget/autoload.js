// live2d_path 参数建议使用绝对路径
//const live2d_path = "https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/";
const live2d_path = "/live2d-widget/";

const waifuVersion = "20261024-7";

// 看板娘形象开关，四选一，改完重新 hexo generate 即可切换，不需要恢复任何文件：
//   "mix"     大肥鱼 + 多萝艾尔一起，工具栏「换人物」按钮来回切换（默认）
//   "dafeiyu" 只用 Live2D 大肥鱼（/dafeiyu/，Cubism 4，制作人：狐宫静）
//   "whale"   PNG 分件版鲸鱼娘（/whale-web/，Coopanion）
//   "live2d"  只用原来的 Live2D 多萝艾尔（/live2d_api/）
// 人物列表在 source/dafeiyu/waifu-api/model_list.json，第一个是默认人物。
// 注意：组件用 force-cache 读这个列表，改了列表要连目录名一起换（例如 waifu-api2），
// 并同步改下面的 waifu_api，否则老访客的浏览器一直用旧列表。
const WAIFU_MODEL = "mix";
const whale_path = "/whale-web/";
const dafeiyu_path = "/dafeiyu/";
const waifu_api = dafeiyu_path + "waifu-api/";
let waifuLoading = false;

// 动态脚本必须严格按顺序执行：运行库 -> 组件逻辑。
function loadExternalResource(url, type) {
	return new Promise((resolve, reject) => {
		const resourceKey = url.split("?")[0];
		const existing = document.querySelector(`[data-waifu-resource="${resourceKey}"]`);
		if (existing && existing.dataset.loaded === "true") {
			resolve(url);
			return;
		}

		let tag = existing;
		let shouldAppend = false;
		if (!tag) {
			if (type === "css") {
				tag = document.createElement("link");
				tag.rel = "stylesheet";
				tag.href = url;
			} else if (type === "js" || type === "module") {
				tag = document.createElement("script");
				if (type === "module") tag.type = "module";
				tag.src = url;
				tag.async = false;
			}
			if (!tag) {
				reject(new Error(`未知资源类型：${type}`));
				return;
			}
			tag.dataset.waifuResource = resourceKey;
			shouldAppend = true;
		}

		const onLoad = () => {
			tag.dataset.loaded = "true";
			resolve(url);
		};
		const onError = () => {
			tag.remove();
			reject(new Error(`资源加载失败：${url}`));
		};
		tag.addEventListener("load", onLoad, { once: true });
		tag.addEventListener("error", onError, { once: true });
		if (shouldAppend) document.head.appendChild(tag);
	});
}

// mix 模式：waifu-tips.js 调用 loadlive2d(id, 模型地址) 时，按地址分给两个渲染器。
// 大肥鱼（Cubism 4）画在自己的画布上；多萝艾尔用原来的 live2d.min.js 画在 #live2d 上。
// 两套运行库都是第一次用到时才下载。
let live2dV2 = null;
async function ensureLive2dV2() {
	if (live2dV2) return live2dV2;
	const dispatcher = window.loadlive2d;
	await loadExternalResource(live2d_path + `live2d.min.js?v=${waifuVersion}`, "js");
	live2dV2 = window.loadlive2d; // live2d.min.js 会覆盖全局 loadlive2d，取出来后放回分发函数
	window.loadlive2d = dispatcher;
	return live2dV2;
}

function installMixLoader() {
	window.loadlive2d = async (id, url) => {
		const path = new URL(url, location.href).pathname;
		const fish = window.dafeiyuWaifu;
		try {
			if (fish && path.startsWith(waifu_api + "model/dafeiyu/")) {
				// 已经是大肥鱼时（「换衣服」按钮）换表情，否则切过来
				if (fish.isActive()) fish.nextLook();
				else await fish.activate();
			} else {
				if (fish) fish.deactivate();
				(await ensureLive2dV2())(id, path);
			}
		} catch (error) {
			console.warn("看板娘切换失败", error);
		}
	};
}

async function loadWaifu(attempt = 1) {
	if (screen.width < 768 || waifuLoading || document.getElementById("waifu-toggle")) return;
	waifuLoading = true;
	try {
		await loadExternalResource(live2d_path + `waifu.css?v=${waifuVersion}`, "css");
		if (WAIFU_MODEL === "mix") {
			// 两个人物一起：先装分发函数，运行库等真正切到对应人物时再下载
			await loadExternalResource(dafeiyu_path + `dafeiyu.css?v=${waifuVersion}`, "css");
			await loadExternalResource(dafeiyu_path + `dafeiyu-mount.js?v=${waifuVersion}`, "js");
			installMixLoader();
		} else if (WAIFU_MODEL === "dafeiyu") {
			// 只用大肥鱼：所有 loadlive2d 调用都交给 dafeiyu-mount.js（第一次加载，之后换表情）
			await loadExternalResource(dafeiyu_path + `dafeiyu.css?v=${waifuVersion}`, "css");
			await loadExternalResource(dafeiyu_path + `dafeiyu-mount.js?v=${waifuVersion}`, "js");
			window.loadlive2d = () => {
				const fish = window.dafeiyuWaifu;
				return fish.isActive() ? fish.nextLook() : fish.activate();
			};
		} else if (WAIFU_MODEL === "whale") {
			// 鲸鱼娘：用 blog-mount.js 提供的 loadlive2d 代替 Live2D 运行库
			await loadExternalResource(whale_path + `blog-whale.css?v=${waifuVersion}`, "css");
			await loadExternalResource(whale_path + `blog-mount.js?v=${waifuVersion}`, "module");
		} else {
			await loadExternalResource(live2d_path + `live2d.min.js?v=${waifuVersion}`, "js");
		}
		await loadExternalResource(live2d_path + `waifu-tips.js?v=${waifuVersion}`, "js");
		if (typeof window.loadlive2d !== "function" || typeof window.initWidget !== "function") {
			throw new Error("Live2D 组件初始化方法不可用");
		}
		// 混合模式列表中 1 为多萝艾尔；首次访问默认她，之后保留访客的选择。
		if (WAIFU_MODEL === "mix") {
			try {
				if (localStorage.getItem("modelId") === null) {
					localStorage.setItem("modelId", "1");
					localStorage.setItem("modelTexturesId", "0");
				}
			} catch (error) { console.warn("看板娘默认选择无法保存", error); }
		}
		window.initWidget(WAIFU_MODEL === "mix" || WAIFU_MODEL === "dafeiyu" ? {
			waifuPath: live2d_path + `waifu-tips.json?v=${waifuVersion}`,
			cdnPath: waifu_api,
			// 「换人物」在大肥鱼和多萝艾尔之间切换（只有一个人物时去掉）；
			// 「换衣服」对大肥鱼是轮换表情。拍照、关于是老版 Live2D 专用的，去掉
			tools: WAIFU_MODEL === "mix"
				? ["hitokoto", "asteroids", "switch-model", "switch-texture", "quit"]
				: ["hitokoto", "asteroids", "switch-texture", "quit"]
		} : WAIFU_MODEL === "whale" ? {
			waifuPath: live2d_path + `waifu-tips.json?v=${waifuVersion}`,
			cdnPath: whale_path + "api/",
			// 「换衣服」切换女仆装 / 冬装 / 店员装；拍照、换模型、关于是 Live2D 专用的，去掉
			tools: ["hitokoto", "asteroids", "switch-texture", "quit"]
		} : {
			waifuPath: live2d_path + `waifu-tips.json?v=${waifuVersion}`,
			cdnPath: "/live2d_api/",
			tools: ["hitokoto", "asteroids", "switch-model", "switch-texture", "photo", "info", "quit"]
		});
	} catch (error) {
		console.warn(`Live2D 第 ${attempt} 次加载失败`, error);
		waifuLoading = false;
		if (attempt < 3) setTimeout(() => loadWaifu(attempt + 1), 800 * attempt);
		return;
	}
	waifuLoading = false;
}

// 看板娘模型和贴图约 3MB。等页面其余资源加载完、浏览器空闲时再开始，
// 避免和正文、封面抢带宽，拖慢第一次打开。最长在 load 后 2 秒内开始。
function scheduleWaifuLoad() {
	const start = () => {
		if ("requestIdleCallback" in window) requestIdleCallback(() => loadWaifu(), { timeout: 2000 });
		else setTimeout(() => loadWaifu(), 600);
	};
	if (document.readyState === "complete") start();
	else window.addEventListener("load", start, { once: true });
}

scheduleWaifuLoad();

console.log(`
  く__,.ヘヽ.        /  ,ー､ 〉
           ＼ ', !-─‐-i  /  /´
           ／｀ｰ'       L/／｀ヽ､
         /   ／,   /|   ,   ,       ',
       ｲ   / /-‐/  ｉ  L_ ﾊ ヽ!   i
        ﾚ ﾍ 7ｲ｀ﾄ   ﾚ'ｧ-ﾄ､!ハ|   |
          !,/7 '0'     ´0iソ|    |
          |.从"    _     ,,,, / |./    |
          ﾚ'| i＞.､,,__  _,.イ /   .i   |
            ﾚ'| | / k_７_/ﾚ'ヽ,  ﾊ.  |
              | |/i 〈|/   i  ,.ﾍ |  i  |
             .|/ /  ｉ：    ﾍ!    ＼  |
              kヽ>､ﾊ    _,.ﾍ､    /､!
              !'〈//｀Ｔ´', ＼ ｀'7'ｰr'
              ﾚ'ヽL__|___i,___,ンﾚ|ノ
                  ﾄ-,/  |___./
                  'ｰ'    !_,.:
`);
