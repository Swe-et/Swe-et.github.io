import randomSelection from "./utils.js";

let messageTimer;

function showMessage(text, timeout, priority) {
    text = randomSelection(text);
    if (typeof text !== "string" || !text.trim() || text === "undefined") return;
    if (sessionStorage.getItem("waifu-text") && Number(sessionStorage.getItem("waifu-text")) > priority) return;
    if (messageTimer) {
        clearTimeout(messageTimer);
        messageTimer = null;
    }
    const tips = document.getElementById("waifu-tips");
    if (!tips) return;
    sessionStorage.setItem("waifu-text", priority);
    tips.innerHTML = text;
    tips.classList.add("waifu-tips-active");
    messageTimer = setTimeout(() => {
        sessionStorage.removeItem("waifu-text");
        tips.classList.remove("waifu-tips-active");
    }, timeout);
}

export default showMessage;
