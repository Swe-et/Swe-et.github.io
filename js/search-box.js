// 博客站内搜索（2026-10-23 修复版）
// 修复内容：
// 1. 空输入框获得焦点时不再弹出空白结果框；
// 2. 高亮长度按实际匹配到的文字计算（之前 C++ 等含特殊字符的关键词会多标几个字）；
// 3. 用浏览器解析 HTML 取纯文本，不再用正则删标签（之前正文里出现 "<" 会吞掉后面的文字）；
// 4. 搜索结果中的标题、正文先转义再插入，避免文章里的尖括号破坏结果框；
// 5. 点击搜索栏外部或按 Esc 关闭结果，按 Enter 打开第一条结果；
// 6. 索引加载失败时给出提示，而不是没有任何反应。
(function () {
    var searchBox = document.querySelector('.search');
    var searchBtn = document.querySelector('.search-start');
    var searchClear = document.querySelector('.search-clear');
    var searchInput = document.querySelector('.search-input');
    var searchResults = document.querySelector('.search-results');
    if (!searchBox || !searchBtn || !searchClear || !searchInput || !searchResults) return;

    var posts = []; // { title, url, text }
    var indexState = 'idle'; // idle | loading | ready | error
    var indexCallbacks = [];
    var firstResultHref = '';
    var SNIPPET_STEP = 18;
    var MAX_RESULTS = 20;

    function htmlToText(html) {
        var doc = new DOMParser().parseFromString(html || '', 'text/html');
        return (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function nodeText(entry, tag) {
        var node = entry.getElementsByTagName(tag)[0];
        return node ? node.textContent : '';
    }

    // 仅在用户开始使用搜索时加载索引，避免拖慢每个页面的首次打开。
    function loadSearchIndex(callback) {
        if (indexState === 'ready') { callback(); return; }
        indexCallbacks.push(callback);
        if (indexState === 'loading') return;
        indexState = 'loading';

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            var callbacks = indexCallbacks.splice(0);
            if (xhr.status === 200 && xhr.responseXML) {
                var entries = xhr.responseXML.getElementsByTagName('entry');
                posts = [];
                for (var i = 0; i < entries.length; i++) {
                    posts.push({
                        title: htmlToText(nodeText(entries[i], 'title')),
                        url: nodeText(entries[i], 'url').trim(),
                        text: htmlToText(nodeText(entries[i], 'content'))
                    });
                }
                indexState = 'ready';
            } else {
                indexState = 'error';
            }
            callbacks.forEach(function (fn) { fn(); });
        };
        xhr.open('get', '/search.xml', true);
        xhr.send();
    }

    function openResults() { searchResults.style.display = 'block'; }
    function closeResults() { searchResults.style.display = 'none'; }

    function addItem(html, extraClass, href) {
        var item = document.createElement('div');
        item.className = 'result-item' + (extraClass ? ' ' + extraClass : '');
        item.innerHTML = html;
        if (href) {
            item.dataset.href = href;
            item.addEventListener('click', function () { location.href = href; });
        }
        searchResults.appendChild(item);
    }

    function makeSnippet(text, start, length) {
        var from = Math.max(0, start - SNIPPET_STEP);
        var to = Math.min(text.length, start + length + SNIPPET_STEP);
        return (from > 0 ? '…' : '') +
            escapeHtml(text.slice(from, start)) +
            '<mark>' + escapeHtml(text.slice(start, start + length)) + '</mark>' +
            escapeHtml(text.slice(start + length, to)) +
            (to < text.length ? '…' : '');
    }

    function render() {
        var value = searchInput.value;
        searchResults.innerHTML = '';
        firstResultHref = '';

        if (value === '') {
            closeResults();
            searchClear.style.display = 'none';
            return;
        }
        searchClear.style.display = 'block';
        openResults();

        if (!value.trim()) {
            addItem('请输入有效内容…', 'result-empty');
            return;
        }
        if (indexState === 'error') {
            addItem('搜索索引加载失败，请刷新页面后再试…', 'result-empty');
            return;
        }

        var keyword = value.trim();
        var pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        var matches = [];

        posts.forEach(function (post) {
            var titleMatch = pattern.exec(post.title);
            var textMatch = pattern.exec(post.text);
            if (!titleMatch && !textMatch) return;
            // 标题命中时优先展示正文中的命中位置；正文没有命中再展示标题
            var source = textMatch ? post.text : post.title;
            var match = textMatch || titleMatch;
            matches.push({
                post: post,
                titleHit: !!titleMatch,
                snippet: makeSnippet(source, match.index, match[0].length)
            });
        });

        // 标题命中的排在前面
        matches.sort(function (a, b) { return (b.titleHit ? 1 : 0) - (a.titleHit ? 1 : 0); });

        addItem('找到 <b>' + matches.length + '</b> 篇相关文章', 'result-summary');
        if (!matches.length) {
            addItem('暂时没有找到相关文章…', 'result-empty');
            return;
        }

        matches.slice(0, MAX_RESULTS).forEach(function (m) {
            addItem('<b>《' + escapeHtml(m.post.title) + '》</b><hr />' + m.snippet, '', m.post.url);
        });
        firstResultHref = matches[0].post.url;
    }

    function search() {
        if (searchInput.value === '') { render(); return; }
        loadSearchIndex(render);
    }

    // input 事件可以正确处理中文输入法的拼写过程
    searchInput.addEventListener('input', search);

    searchInput.addEventListener('focus', function () {
        loadSearchIndex(function () {}); // 预加载索引
        if (searchInput.value !== '') search(); // 只有已有关键词时才重新展开结果
    });

    searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && firstResultHref) {
            event.preventDefault();
            location.href = firstResultHref;
        } else if (event.key === 'Escape') {
            closeResults();
            searchInput.blur();
        }
    });

    searchBtn.addEventListener('click', function () {
        if (searchInput.value === '') { searchInput.focus(); return; }
        search();
    });

    searchClear.addEventListener('click', function () {
        searchInput.value = '';
        render();
        searchInput.focus();
    });

    // 点击搜索栏以外的地方时收起结果
    document.addEventListener('click', function (event) {
        if (!searchBox.contains(event.target)) closeResults();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeResults();
    });
})();
