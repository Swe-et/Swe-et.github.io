function generateTOC() {
    var toc = document.querySelector('.toc');
    var headings = document.querySelectorAll('h1, h2, h3, h4');  // 查找所有 h1, h2, h3 标签
    var tocList = document.createElement('ul');  // 创建一个列表来容纳目录

    headings.forEach(function(heading, index) {
        // 排除侧边栏中的标题
        if (heading.closest('#sidebar') || heading.closest('.kira-sidebar')) {
            return;
        }
        if (heading.closest('#kira-post') || heading.closest('.kira-post-cover')) {
            return;
        }
        var tocItem = document.createElement('li');  // 创建一个目录项
        var tocLink = document.createElement('a');  // 创建目录项链接
        tocLink.textContent = heading.textContent;  // 设置链接文本为标题的文本
        tocLink.href = '#toc' + index;  // 设置锚点链接
        tocItem.appendChild(tocLink);  // 将链接添加到目录项中

        // 为标题添加 ID，以便在目录中链接到该位置
        heading.id = 'toc' + index;

        tocList.appendChild(tocItem);  // 将目录项添加到目录列表中
    });

    toc.appendChild(tocList);  // 将目录列表添加到 .toc 中
    toc.style.display = 'block';  // 显示目录
}

// 页面加载后执行
window.onload = function() {
    generateTOC();  // 生成目录
};

