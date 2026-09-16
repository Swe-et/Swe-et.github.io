import Model from "./model.js";
import showMessage from "./message.js";
import randomSelection from "./utils.js";
import tools from "./tools.js";

async function loadWidget(config) {
    const model = new Model(config);
    localStorage.removeItem("waifu-display");
    sessionStorage.removeItem("waifu-text");
    document.body.insertAdjacentHTML("beforeend", `<div id="waifu" class="waifu-loading" aria-busy="true">
            <div id="waifu-tips"></div>
            <canvas id="live2d" width="800" height="800"></canvas>
            <div id="waifu-tool"></div>
        </div>`);
    (function registerTools() {
        tools["switch-model"].callback = () => model.loadOtherModel();
        tools["switch-texture"].callback = () => model.loadRandModel();
        if (!Array.isArray(config.tools)) {
            config.tools = Object.keys(tools);
        }
        for (let tool of config.tools) {
            if (tools[tool]) {
                const { icon, callback } = tools[tool];
                document.getElementById("waifu-tool").insertAdjacentHTML("beforeend", `<span id="waifu-tool-${tool}">${icon}</span>`);
                document.getElementById(`waifu-tool-${tool}`).addEventListener("click", callback);
            }
        }
    })();

    function welcomeMessage(time) {
        if (location.pathname === "/") { // 如果是主页
            for (let { hour, text } of time) {
                const now = new Date(),
                    after = hour.split("-")[0],
                    before = hour.split("-")[1] || after;
                if (after <= now.getHours() && now.getHours() <= before) {
                    return text;
                }
            }
        }
        const text = `欢迎阅读<span>「${document.title.split(" - ")[0]}」</span>`;
        let from;
        if (document.referrer !== "") {
            const referrer = new URL(document.referrer),
                domain = referrer.hostname.split(".")[1];
            const domains = {
                "baidu": "百度",
                "so": "360搜索",
                "google": "谷歌搜索"
            };
            if (location.hostname === referrer.hostname) return text;

            if (domain in domains) from = domains[domain];
            else from = referrer.hostname;
            return `Hello！来自 <span>${from}</span> 的朋友<br>${text}`;
        }
        return text;
    }

    function registerEventListener(result) {
        // 检测用户活动状态，并在空闲时显示消息
        let userAction = false,
            userActionTimer,
            messageArray = Array.isArray(result.message.default) ? result.message.default.slice() : [],
            lastHoverElement;
        if (messageArray.length) {
            window.addEventListener("mousemove", () => userAction = true);
            window.addEventListener("keydown", () => userAction = true);
            setInterval(() => {
                if (userAction) {
                    userAction = false;
                    clearInterval(userActionTimer);
                    userActionTimer = null;
                } else if (!userActionTimer) {
                    userActionTimer = setInterval(() => {
                        showMessage(messageArray, 6000, 9);
                    }, 20000);
                }
            }, 1000);
        }
        showMessage(welcomeMessage(result.time), 7000, 11);
        window.addEventListener("mouseover", event => {
            for (let { selector, text } of result.mouseover) {
                if (!event.target.closest(selector)) continue;
                if (lastHoverElement === selector) return;
                lastHoverElement = selector;
                text = randomSelection(text);
                text = text.replace("{text}", event.target.innerText);
                showMessage(text, 4000, 8);
                return;
            }
        });
        window.addEventListener("click", event => {
            for (let { selector, text } of result.click) {
                if (!event.target.closest(selector)) continue;
                text = randomSelection(text);
                text = text.replace("{text}", event.target.innerText);
                showMessage(text, 4000, 8);
                return;
            }
        });
        result.seasons.forEach(({ date, text }) => {
            const now = new Date(),
                after = date.split("-")[0],
                before = date.split("-")[1] || after;
            if ((after.split("/")[0] <= now.getMonth() + 1 && now.getMonth() + 1 <= before.split("/")[0]) && (after.split("/")[1] <= now.getDate() && now.getDate() <= before.split("/")[1])) {
                text = randomSelection(text);
                text = text.replace("{year}", now.getFullYear());
                messageArray.push(text);
            }
        });

        const devtools = () => { };
        console.log("%c", devtools);
        devtools.toString = () => {
            showMessage(result.message.console, 6000, 9);
        };
        window.addEventListener("copy", () => {
            showMessage(result.message.copy, 6000, 9);
        });
        window.addEventListener("visibilitychange", () => {
            if (!document.hidden) showMessage(result.message.visibilitychange, 6000, 9);
        });
    }

    async function initModel() {
        let modelId = localStorage.getItem("modelId"),
            modelTexturesId = localStorage.getItem("modelTexturesId");
        if (modelId === null) {
            // 首次访问加载 指定模型 的 指定材质
            modelId = 0; // 当前模型列表只有编号 0
            modelTexturesId = 0;
        }
        const tipsRequest = fetch(config.waifuPath, { cache: "force-cache" }).then(response => {
            if (!response.ok) throw new Error(`看板娘提示配置加载失败：${response.status}`);
            return response.json();
        });
        const results = await Promise.all([model.loadModel(modelId, modelTexturesId), tipsRequest]);
        const waifu = document.getElementById("waifu");
        if (!waifu) return;
        waifu.classList.remove("waifu-loading");
        waifu.removeAttribute("aria-busy");
        waifu.style.bottom = 0;
        registerEventListener(results[1]);
    }

    try {
        await initModel();
    } catch (error) {
        const waifu = document.getElementById("waifu");
        if (waifu) waifu.remove();
        throw error;
    }
}

function initWidget(config, apiPath) {
    if (typeof config === "string") {
        config = {
            waifuPath: config,
            apiPath
        };
    }
    document.body.insertAdjacentHTML("beforeend", `<div id="waifu-toggle">
            <span>看板娘</span>
        </div>`);
    const toggle = document.getElementById("waifu-toggle");
    let widgetLoading = false;
    const ensureWidget = async () => {
        if (widgetLoading || document.getElementById("waifu")) return;
        widgetLoading = true;
        toggle.classList.remove("waifu-toggle-active");
        toggle.title = "看板娘加载中";
        try {
            await loadWidget(config);
            toggle.removeAttribute("first-time");
            toggle.title = "";
        } catch (error) {
            console.warn("Live2D 加载失败", error);
            toggle.setAttribute("first-time", true);
            toggle.title = "加载失败，点击重试";
            toggle.classList.add("waifu-toggle-active");
        } finally {
            widgetLoading = false;
        }
    };
    toggle.addEventListener("click", () => {
        toggle.classList.remove("waifu-toggle-active");
        const waifu = document.getElementById("waifu");
        if (toggle.getAttribute("first-time") || !waifu) {
            ensureWidget();
        } else {
            localStorage.removeItem("waifu-display");
            waifu.style.display = "";
            setTimeout(() => {
                waifu.style.bottom = 0;
            }, 0);
        }
    });
    if (localStorage.getItem("waifu-display") && Date.now() - localStorage.getItem("waifu-display") <= 86400000) {
        toggle.setAttribute("first-time", true);
        setTimeout(() => {
            toggle.classList.add("waifu-toggle-active");
        }, 0);
    } else {
        ensureWidget();
    }
}

export default initWidget;
