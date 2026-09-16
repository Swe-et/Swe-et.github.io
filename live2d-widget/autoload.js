// live2d_path 参数建议使用绝对路径
//const live2d_path = "https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/";
const live2d_path = "/live2d-widget/";

const waifuVersion = "20260916-1";
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
			} else if (type === "js") {
				tag = document.createElement("script");
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

async function loadWaifu(attempt = 1) {
	if (screen.width < 768 || waifuLoading || document.getElementById("waifu-toggle")) return;
	waifuLoading = true;
	try {
		await loadExternalResource(live2d_path + `waifu.css?v=${waifuVersion}`, "css");
		await loadExternalResource(live2d_path + `live2d.min.js?v=${waifuVersion}`, "js");
		await loadExternalResource(live2d_path + `waifu-tips.js?v=${waifuVersion}`, "js");
		if (typeof window.loadlive2d !== "function" || typeof window.initWidget !== "function") {
			throw new Error("Live2D 组件初始化方法不可用");
		}
		window.initWidget({
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

// DOM 可用后尽快开始；仍让首屏内容优先，但最长只延后 400ms。
function scheduleWaifuLoad() {
	if ("requestIdleCallback" in window) requestIdleCallback(() => loadWaifu(), { timeout: 400 });
	else setTimeout(() => loadWaifu(), 100);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", scheduleWaifuLoad, { once: true });
} else {
	scheduleWaifuLoad();
}

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
