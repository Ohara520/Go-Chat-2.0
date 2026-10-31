# 英文单词粘连问题 — 临时诊断已部署

## 给用户的说明

### 问题现象
- **主聊天**和 **INNER THOUGHTS** 中偶尔出现英文单词粘在一起，缺少空格
- 例如：`showme` 应该是 `show me`，`goodnight` 应该是 `good night`
- 不是每次都发生，是偶发的

### 排查结果
已完成全链路审计：
- ✅ 前端代码（sendMessage.js, ui.js）没有删除空格的操作
- ✅ 主模型始终是 Claude Sonnet 5，没有换模型
- ⚠️ 2026-10-28 中转站接口从 Anthropic 协议改成 OpenAI 兼容协议
- ⚠️ 可能的问题点：`api/chat.js` 的响应解析

### 已部署的诊断
在 `api/chat.js` 中加入了临时诊断日志，会记录：
- 上游响应的格式（string 还是 array）
- 转换前后的空格数量
- 最长单词长度（用于检测粘连）

**不会记录**：
- 用户聊天内容
- 系统提示词
- API Key

### 如何使用

#### 1. 部署到 Vercel
```bash
git add .
git commit -m "Add spacing diagnostic logging"
git push
```

Vercel 会自动部署。

#### 2. 复现并记录
正常使用 Go Chat，当遇到粘字时：
- 记下时间（精确到分钟）
- 记下哪条消息粘字了（主聊天 or INNER THOUGHTS）

#### 3. 查看诊断日志
进入 Vercel 项目：
1. 打开 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择 Go Chat 2.0 项目
3. 点击 **Logs**
4. 搜索 `[SPACING_DIAG]`
5. 找到对应时间的日志

#### 4. 分析日志
正常情况：
```
[SPACING_DIAG] model=claude-sonnet-5 type=string len=234 spaces_in=45 spaces_out=45 diff=0 longest=12
```

异常情况（会标记 ⚠️）：
```
[SPACING_DIAG] ⚠️ model=claude-haiku-5-5 type=array parts=3 len=156 spaces_in=32 spaces_out=28 diff=4 longest=28
```

⚠️ 标记触发条件：
- `type` 不是 `string`（说明中转站返回了意外格式）
- `diff` 不是 `0`（说明转换过程中丢失了空格）
- `longest` 超过 `20`（说明有异常长的"单词"，可能是粘连）

### 观察期
建议观察 **7天**，收集足够的样本后分析规律：
- 粘字是否只出现在某个模型（Haiku vs Sonnet）？
- 是否与 `type=array` 相关？
- 是否有时间规律（高峰期/低谷期）？

### 下一步修复方向

#### 如果 `type=array`
说明中转站返回了分段的 content（不符合 OpenAI API 标准），需要修改 `api/chat.js:130`：
```javascript
// 修复前
.join('')  // 直接拼接，没有空格

// 修复后
.join(' ')  // 用空格连接各段
```

#### 如果 `diff>0` 但 `type=string`
说明中转站返回的字符串本身就缺空格，问题在上游，需要：
- 联系中转站站长反馈bug
- 或切换到其他节点

#### 如果都正常
说明问题不在响应解析，需要：
- 检查前端文本清理逻辑
- 检查是否有其他模块（innerThought.js, triggers.js）在处理文本

---

## 开发者笔记

### 已修改的文件
- `api/chat.js`：116-146 行，加入诊断日志

### 诊断日志格式
```
[SPACING_DIAG]{flag} model={model} type={type} parts={parts} len={len} spaces_in={in} spaces_out={out} diff={diff} longest={longest}
```

字段说明：
- `flag`：异常时显示 ` ⚠️`，正常时为空
- `model`：请求的模型名（claude-sonnet-5 or claude-haiku-5-5）
- `type`：rawContent 的类型（string/array/null/other）
- `parts`：如果是 array，元素数量
- `len`：转换后文本长度
- `spaces_in`：原始响应的空格数
- `spaces_out`：转换后的空格数
- `diff`：丢失的空格数（`spaces_in - spaces_out`）
- `longest`：最长单词的字符数

### 安全检查清单
- [x] 不记录用户聊天内容
- [x] 不记录系统提示词
- [x] 不记录 API Key
- [x] 只记录统计数字和类型
- [x] 日志只在后端，不传给前端
- [x] 不写数据库、不写文件
- [x] 可随时删除，无副作用

### 移除诊断代码
观察期结束后，删除 `api/chat.js:118-146` 行即可。

---

最后更新：2026-10-31
