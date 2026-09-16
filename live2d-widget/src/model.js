import showMessage from "./message.js";
import randomSelection from "./utils.js";

class Model {
    constructor(config) {
        let { apiPath, cdnPath } = config;
        let useCDN = false;
        if (typeof cdnPath === "string") {
            useCDN = true;
            if (!cdnPath.endsWith("/")) cdnPath += "/";
        } else if (typeof apiPath === "string") {
            if (!apiPath.endsWith("/")) apiPath += "/";
        } else {
            throw "Invalid initWidget argument!";
        }
        this.useCDN = useCDN;
        this.apiPath = apiPath;
        this.cdnPath = cdnPath;
    }

    async loadModelList() {
        const response = await this.fetchWithRetry(`${this.cdnPath}model_list.json`, "json");
        if (!response || !Array.isArray(response.models) || !response.models.length) {
            throw new Error("Live2D 模型列表为空");
        }
        this.modelList = response;
    }

    async fetchWithRetry(url, type = "buffer") {
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch(url, {
                    cache: "force-cache",
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return type === "json" ? await response.json() : await response.arrayBuffer();
            } catch (error) {
                lastError = error;
                if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            } finally {
                clearTimeout(timer);
            }
        }
        throw new Error(`Live2D 资源加载失败：${url}（${lastError && lastError.message ? lastError.message : "网络异常"}）`);
    }

    async preloadModel(modelPath) {
        const modelUrl = new URL(modelPath, location.href);
        const setting = await this.fetchWithRetry(modelUrl.href, "json");
        const resources = [setting.model].concat(setting.textures || []).filter(Boolean);
        await Promise.all(resources.map(resource => {
            return this.fetchWithRetry(new URL(resource, modelUrl).href);
        }));
    }

    async loadModel(modelId, modelTexturesId, message) {
        localStorage.setItem("modelId", modelId);
        localStorage.setItem("modelTexturesId", modelTexturesId);
        showMessage(message, 4000, 10);
        if (this.useCDN) {
            if (!this.modelList) await this.loadModelList();
            const parsedModelId = Number.parseInt(modelId, 10);
            const safeModelId = Number.isInteger(parsedModelId) && this.modelList.models[parsedModelId] ? parsedModelId : 0;
            const target = randomSelection(this.modelList.models[safeModelId]);
            if (typeof target !== "string" || !target) throw new Error("Live2D 模型编号无效");
            const modelPath = `${this.cdnPath}model/${target}/index.json`;
            localStorage.setItem("modelId", safeModelId);
            localStorage.setItem("modelTexturesId", modelTexturesId || 0);
            await this.preloadModel(modelPath);
            loadlive2d("live2d", modelPath);
            await new Promise(resolve => setTimeout(resolve, 250));
        } else {
            loadlive2d("live2d", `${this.apiPath}get/?id=${modelId}-${modelTexturesId}`);
            console.log(`Live2D 模型 ${modelId}-${modelTexturesId} 加载完成`);
        }
    }

    async loadRandModel() {
        const modelId = localStorage.getItem("modelId"),
            modelTexturesId = localStorage.getItem("modelTexturesId");
        if (this.useCDN) {
            if (!this.modelList) await this.loadModelList();
            await this.loadModel(modelId, modelTexturesId);
            showMessage("我的新衣服好看嘛？", 4000, 10);
        } else {
            // 可选 "rand"(随机), "switch"(顺序)
            fetch(`${this.apiPath}rand_textures/?id=${modelId}-${modelTexturesId}`)
                .then(response => response.json())
                .then(result => {
                    if (result.textures.id === 1 && (modelTexturesId === 1 || modelTexturesId === 0)) showMessage("我还没有其他衣服呢！", 4000, 10);
                    else this.loadModel(modelId, result.textures.id, "我的新衣服好看嘛？");
                });
        }
    }

    async loadOtherModel() {
        let modelId = localStorage.getItem("modelId");
        if (this.useCDN) {
            if (!this.modelList) await this.loadModelList();
            const currentModelId = Number.parseInt(modelId, 10);
            const index = (!Number.isInteger(currentModelId) || currentModelId + 1 >= this.modelList.models.length) ? 0 : currentModelId + 1;
            await this.loadModel(index, 0, this.modelList.messages[index]);
        } else {
            fetch(`${this.apiPath}switch/?id=${modelId}`)
                .then(response => response.json())
                .then(result => {
                    this.loadModel(result.model.id, 0, result.model.message);
                });
        }
    }
}

export default Model;
