// server.js
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

// 使用 bodyParser 中间件解析 JSON 请求体
app.use(bodyParser.json());

// 代理路由
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;

        // 调用 OpenAI API
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [{"role": "user", "content": userMessage}]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer YOUR_OPENAI_API_KEY`
            }
        });

        // 将 OpenAI 的响应返回给前端
        res.json(response.data);
    } catch (error) {
        console.error('Error communicating with OpenAI:', error);
        res.status(500).send('Error communicating with OpenAI');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

