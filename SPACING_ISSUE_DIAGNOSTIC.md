# 英文单词偶发粘连问题诊断报告

## 已完成的链路审计

### 1. 确认的技术变化
- **2026-10-28**：中转站从 Anthropic 协议切换到 OpenAI Chat Completions 兼容协议
- 主模型始终是 Claude Sonnet 5，无模型更换
- `api/chat.js` 负责 OpenAI → Anthropic 格式转换

### 2. 回复链路全景

```
用户输入 → sendMessage.js (_processMergedMessageWithContent)
  ↓
  构建 system + messages → fetchSonnetWithCache
  ↓
  /api/chat POST { model, system, messages, max_tokens }
  ↓
  api/chat.js (OpenAI 节点轮询)
    - 将 Anthropic messages 转换为 OpenAI Chat 格式
    - system → {role:'system', content}
    - messages → {role, content}（含图片块转换）
    - 调用 client.chat.completions.create()
    - 解析响应：choices[0].message.content
    - 转回 Anthropic 格式：{content:[{type:'text', text}]}
  ↓
  前端接收 data.content[0].text
  ↓
  破防检测 + 文本清理（parseAssistantTags, cleanBotText）
  ↓
  appendMessage → cleanBotText → 渲染到 DOM
```

### 3. 静态代码审计结果

#### ✅ 未发现明确的删除空格操作
- `sendMessage.js`：只删控制标签、换行，无整句去空格
- `ui.js cleanBotText`：只删系统tag、旁白、HTML标签，无空格操作
- `api/chat.js`：纯协议转换，不处理文本内容

#### ⚠️ 潜在风险点

**风险点1：OpenAI 响应解析**  
`api/chat.js:116-125`：
```javascript
const rawContent = parsedResponse.choices?.[0]?.message?.content;
let text = '';
if (typeof rawContent === 'string') {
  text = rawContent.trim();
} else if (Array.isArray(rawContent)) {
  text = rawContent
    .map((p) => (p && typeof p.text === 'string') ? p.text : '')
    .join('')  // ⚠️ 直接 join('') 拼接，数组项之间无空格
    .trim();
}
```

**如果中转站返回的 content 是数组**（`[{text:"hello"}, {text:"world"}]`），join('') 会变成 "helloworld"。

但理论上 OpenAI Chat API 的 content 应该是字符串，不是数组。需要验证中转站实际返回的格式。

**风险点2：中转站兼容层可能的bug**  
OpenAI Chat API 标准返回：
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "hello world"  // 应该是完整字符串
    }
  }]
}
```

如果中转站的 OpenAI 兼容层有bug，可能返回：
- 分段的 content（流式响应未合并？）
- 字符编码问题导致空格丢失
- 协议转换时的空格清洗过度

**风险点3：前端文本清理**  
`sendMessage.js:1420` 的正则替换可能误伤：
```javascript
reply = reply.replace(/\s*—\s*/g, '\n').trim();
```
这条把 ` — ` 替换成 `\n`，但 `—` 前后的空格被删掉。如果模型输出 `word — word`，会变成 `word\nword`，显示时可能看起来连在一起。

### 4. 未确定的关键问题

1. **中转站实际返回格式**：content 到底是 string 还是 array？
2. **空格丢失的触发条件**：为什么是"偶发"而不是"每次都发生"？
3. **INNER THOUGHTS 也粘字**：说明问题不在主聊天清理，而在更上游（API响应本身）

---

## 诊断方案

### 目标
在不记录用户正文、系统提示词、API Key的前提下，记录：
- 上游响应的结构类型（string/array）
- 片段数量（如果是array）
- 转换前后的空格统计
- 响应长度、模型名、时间戳

### 实施方案：临时诊断日志

在 `api/chat.js` 中，响应转换前后加临时日志：

1. **记录上游响应结构**（不记录内容）：
   - rawContent 类型（string/array/other）
   - 如果是 array，记录 length 和每个元素的 type
   - 转换后 text 的长度、空格数量、连续字母块统计

2. **记录转换统计**：
   - 输入：rawContent 总字符数、空格数
   - 输出：text 总字符数、空格数
   - 差异：`空格丢失数 = 输入空格数 - 输出空格数`

3. **记录到 Vercel 日志**（不写文件、不入库）：
   - 每次转换打一条诊断日志
   - 格式：`[SPACING_DIAG] model={model} type={type} len={len} spaces={spaces} ...`

### 日志示例（无敏感信息）
```
[SPACING_DIAG] model=claude-sonnet-5 type=string len=234 spaces_in=45 spaces_out=45 diff=0 longest_word=12
[SPACING_DIAG] model=claude-haiku-5-5 type=array parts=3 len=156 spaces_in=32 spaces_out=28 diff=4 longest_word=28 ⚠️
```

第二条标记 `⚠️` 因为：
- type=array（不符合预期）
- diff=4（丢了4个空格）
- longest_word=28（异常长的"单词"，可能是粘连）

---

## 下一步

1. **部署临时诊断**：修改 `api/chat.js`，加入上述日志
2. **观察7天**：收集真实流量的诊断日志
3. **分析模式**：
   - 粘字是否只出现在 type=array 时？
   - 是否与某个节点相关？
   - Haiku vs Sonnet 分布差异？

4. **根据结果修复**：
   - 如果是 array join 问题 → 改 `.join(' ')`
   - 如果是中转站bug → 联系站长或换节点
   - 如果是前端清理误伤 → 优化正则

---

## 保护措施

✅ 不记录用户聊天正文  
✅ 不记录系统提示词  
✅ 不记录 API Key  
✅ 只记录统计数字和结构类型  
✅ 日志只在 Vercel Functions 后台，不暴露给前端  
✅ 不写数据库、不写文件，部署后随时可删  

---

## 如何验证

用户在主聊天或 INNER THOUGHTS 中看到英文粘字后：
1. 进入 Vercel 项目 → Logs
2. 搜索 `[SPACING_DIAG]`
3. 查看最近的诊断日志
4. 对照时间戳找到对应的那条请求
5. 检查 `type`、`diff`、`longest_word` 是否异常

预期：
- 正常情况：type=string, diff=0, longest_word<15
- 粘字出现时：type=array 或 diff>0 或 longest_word>20

