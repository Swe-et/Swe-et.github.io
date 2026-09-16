(function () {
  'use strict';

  var config = window.WAIFU_AI_CONFIG || {};
  var historyKey = 'waifu-ai-history-v1';
  var messages = [];
  var panel;
  var messageList;
  var form;
  var input;
  var sendButton;
  var searchIndexPromise;

  function cleanText(value) {
    var box = document.createElement('div');
    box.innerHTML = value || '';
    return (box.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function loadSearchIndex() {
    if (searchIndexPromise) return searchIndexPromise;
    searchIndexPromise = fetch('/search.xml', { cache: 'force-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('无法读取站内文章索引');
        return response.text();
      })
      .then(function (source) {
        var xml = new DOMParser().parseFromString(source, 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('文章索引格式错误');
        return Array.prototype.map.call(xml.querySelectorAll('entry'), function (entry) {
          return {
            title: cleanText((entry.querySelector('title') || {}).textContent),
            url: cleanText((entry.querySelector('url') || {}).textContent),
            content: cleanText((entry.querySelector('content') || {}).textContent)
          };
        }).filter(function (entry) { return entry.title && entry.url; });
      })
      .catch(function () { return []; });
    return searchIndexPromise;
  }

  function queryTokens(query) {
    var normalized = query.toLowerCase().replace(/[^\u3400-\u9fffa-z0-9]+/g, ' ');
    var tokens = normalized.split(/\s+/).filter(function (token) { return token.length > 1; });
    var chinese = normalized.match(/[\u3400-\u9fff]+/g) || [];
    chinese.forEach(function (word) {
      if (word.length <= 3) tokens.push(word);
      for (var i = 0; i < word.length - 1; i += 1) tokens.push(word.slice(i, i + 2));
    });
    return tokens.filter(function (token, index) { return tokens.indexOf(token) === index; });
  }

  function relevantArticles(entries, query) {
    var tokens = queryTokens(query);
    var latinTerms = (query.toLowerCase().match(/[a-z0-9][a-z0-9+.#-]*/g) || [])
      .filter(function (term) { return term.length > 1; });
    return entries.map(function (entry) {
      var title = entry.title.toLowerCase();
      var content = entry.content.toLowerCase();
      var score = tokens.reduce(function (total, token) {
        return total + (title.indexOf(token) >= 0 ? 8 : 0) + (content.indexOf(token) >= 0 ? 1 : 0);
      }, 0);
      var exactTitleMatch = latinTerms.some(function (term) { return title.indexOf(term) >= 0; });
      return { entry: entry, score: score + (exactTitleMatch ? 100 : 0), exactTitleMatch: exactTitleMatch };
    }).filter(function (item) { return item.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 5)
      .map(function (item) { return item.entry; });
  }

  function currentPageContext() {
    var article = document.querySelector('.kira-post article, .post-content, article');
    if (!article) return '';
    var headings = Array.prototype.map.call(article.querySelectorAll('h1,h2,h3'), function (heading) {
      return cleanText(heading.textContent);
    }).filter(Boolean).slice(0, 30);
    return [
      '当前页面：' + cleanText(document.title),
      '地址：' + location.pathname,
      headings.length ? '文章目录：' + headings.join(' / ') : '',
      '当前页正文摘录：' + cleanText(article.innerHTML).slice(0, 4500)
    ].filter(Boolean).join('\n');
  }

  async function buildBlogContext(query) {
    var entries = await loadSearchIndex();
    var overviewQuestion = /博客.*(有|内容|文章|写|介绍)|文章.*(列表|哪些|什么)|分类|归档/.test(query);
    var selected = overviewQuestion ? entries.slice(0, 80) : relevantArticles(entries, query);
    var parts = [currentPageContext()];
    if (overviewQuestion && entries.length) {
      parts.push('站内文章清单（共 ' + entries.length + ' 篇）：\n' + entries.map(function (entry) {
        return '- ' + entry.title + '：' + entry.url;
      }).join('\n'));
    } else if (selected.length) {
      parts.push('检索结论：已在博客中找到以下文章。回答“在哪里/有什么”时，必须给出其中的标题与地址，不可声称未找到。\n' + selected.map(function (entry) {
        return '【' + entry.title + '】\n地址：' + entry.url + '\n正文摘录：' + entry.content.slice(0, 1400);
      }).join('\n\n'));
    } else if (entries.length) {
      parts.push('站内检索未找到与本次问题明显相关的文章。博客现有 ' + entries.length + ' 篇文章。');
    }
    return parts.filter(Boolean).join('\n\n').slice(0, 12000);
  }

  function loadHistory() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(historyKey) || '[]');
      if (Array.isArray(saved)) {
        messages = saved.filter(function (message) {
          return message && (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string' && message.content.trim() && message.content !== 'undefined';
        }).slice(-12);
      }
    } catch (error) {
      messages = [];
    }
  }

  function saveHistory() {
    sessionStorage.setItem(historyKey, JSON.stringify(messages.slice(-12)));
  }

  function addBubble(role, text, extraClass) {
    var bubble = document.createElement('div');
    bubble.className = 'waifu-ai-message ' + role + (extraClass ? ' ' + extraClass : '');
    bubble.textContent = typeof text === 'string' ? text : '';
    messageList.appendChild(bubble);
    messageList.scrollTop = messageList.scrollHeight;
    return bubble;
  }

  function renderHistory() {
    messageList.innerHTML = '';
    if (!messages.length) {
      addBubble('assistant', '你好呀，我是多萝艾尔。有什么想聊的吗？');
      return;
    }
    messages.forEach(function (message) {
      addBubble(message.role, message.content);
    });
  }

  function createPanel() {
    panel = document.createElement('section');
    panel.className = 'waifu-ai-panel';
    panel.setAttribute('aria-label', config.title || 'AI 聊天');
    panel.innerHTML =
      '<header class="waifu-ai-header">' +
        '<span class="waifu-ai-title"></span>' +
        '<button class="waifu-ai-close" type="button" aria-label="关闭聊天">×</button>' +
      '</header>' +
      '<div class="waifu-ai-messages" aria-live="polite"></div>' +
      '<form class="waifu-ai-form">' +
        '<input class="waifu-ai-input" maxlength="1000" autocomplete="off" placeholder="和多萝艾尔说点什么……" />' +
        '<button class="waifu-ai-send" type="submit">发送</button>' +
      '</form>';
    document.body.appendChild(panel);

    panel.querySelector('.waifu-ai-title').textContent = config.title || 'AI 聊天';
    messageList = panel.querySelector('.waifu-ai-messages');
    form = panel.querySelector('.waifu-ai-form');
    input = panel.querySelector('.waifu-ai-input');
    sendButton = panel.querySelector('.waifu-ai-send');
    panel.querySelector('.waifu-ai-close').addEventListener('click', closePanel);
    form.addEventListener('submit', submitMessage);
    loadHistory();
    renderHistory();
  }

  function openPanel() {
    if (!panel) createPanel();
    panel.classList.add('is-open');
    input.focus();
  }

  function closePanel() {
    if (panel) panel.classList.remove('is-open');
  }

  function setBusy(busy) {
    input.disabled = busy;
    sendButton.disabled = busy;
    sendButton.textContent = busy ? '回复中…' : '发送';
  }

  function showShortReply(text) {
    var tips = document.getElementById('waifu-tips');
    if (!tips || typeof text !== 'string' || !text.trim() || text === 'undefined') return;
    var shortText = text.replace(/\s+/g, ' ').slice(0, 70);
    tips.textContent = shortText + (text.length > 70 ? '…' : '');
    tips.classList.add('waifu-tips-active');
    window.setTimeout(function () {
      tips.classList.remove('waifu-tips-active');
    }, 6000);
  }

  async function submitMessage(event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    if (!config.endpoint) {
      addBubble('assistant', 'AI 服务尚未配置。请先在 _config.kira.yml 中填写 Worker 地址。', 'error');
      return;
    }

    messages.push({ role: 'user', content: text });
    messages = messages.slice(-12);
    saveHistory();
    addBubble('user', text);
    input.value = '';
    setBusy(true);
    var replyBubble = addBubble('assistant', '');
    var fullReply = '';

    try {
      var blogContext = await buildBlogContext(text);
      var response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, blogContext: blogContext })
      });
      if (!response.ok) throw new Error('AI 服务返回 ' + response.status);

      if (!response.body) {
        var result = await response.json();
        fullReply = result.content || '暂时没有收到回复。';
        replyBubble.textContent = fullReply;
      } else {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        while (true) {
          var part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';
          lines.forEach(function (line) {
            if (line.indexOf('data: ') !== 0) return;
            var data = line.slice(6).trim();
            if (!data || data === '[DONE]') return;
            try {
              var chunk = JSON.parse(data);
              var content = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
              if (content) {
                fullReply += content;
                replyBubble.textContent = fullReply;
                messageList.scrollTop = messageList.scrollHeight;
              }
            } catch (error) {}
          });
        }
      }

      if (!fullReply) fullReply = '暂时没有收到有效回复。';
      replyBubble.textContent = fullReply;
      messages.push({ role: 'assistant', content: fullReply });
      messages = messages.slice(-12);
      saveHistory();
      showShortReply(fullReply);
    } catch (error) {
      replyBubble.classList.add('error');
      replyBubble.textContent = '连接 AI 服务失败：' + error.message;
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  // 在捕获阶段接管原“一言”按钮，避免旧回调继续请求随机句子。
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('#waifu-tool-hitokoto');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (panel && panel.classList.contains('is-open')) closePanel();
    else openPanel();
  }, true);

  var observer = new MutationObserver(function () {
    var button = document.getElementById('waifu-tool-hitokoto');
    if (!button) return;
    button.title = 'AI 聊天';
    button.setAttribute('aria-label', '打开 AI 聊天');
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
