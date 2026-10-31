# 英文单词粘连问题 — 临时诊断部署说明

## 📋 已部署的修正版诊断

### 核心能力
✅ **记录响应结构和字符类别分布**（彻底脱敏）
- `type`：rawContent 类型（string/array/null/other）
- `sample`：前30字符的字符类别（L=字母 D=数字 P=其他，空格保留）
- `longest`：最长单词长度（>20 标记为疑似粘连）
- `array edges`：数组各段的边界空格情况

✅ **完全脱敏**
- 示例：`"show me，世界！"` → `sample="LLLL LLPLLLLP"`
- 字母、数字、中文、标点全部替换，只保留空白位置

✅ **只标记疑似，不判断根因**
- `⚠️SUSPECT`：标记需要人工分析的情况
- 不自动修改代码逻辑
- 不直接判断"这是粘字"

### 日志示例

#### 正常情况
```
[SPACING_DIAG] model=claude-sonnet-5 type=string sample="LLLL LL LLLLLLLLLLP LLL LLL" len=234 spaces=45 longest=12
```

#### 疑似异常（上游已粘字）
```
[SPACING_DIAG] ⚠️SUSPECT model=claude-haiku-5-5 type=string sample="LLLLLLLLLLLLLLLLLLLLLLLLLLP" len=156 spaces=28 longest=28
```
- `sample` 连续28个L无空格 → 疑似粘连
- `longest=28` → 需人工确认是否真是粘字（也可能是长单词/URL）

#### 疑似异常（array 边界无空格）
```
[SPACING_DIAG] ⚠️SUSPECT model=claude-sonnet-5 type=array parts=3 sample="LLLL|LL|LLLLLLL" len=145 spaces=22 longest=24
[SPACING_DIAG] array edges: [{"i":0,"start":"N","end":"N","len":42},{"i":1,"start":"N","end":"N","len":38}]
```
- `type=array` → 非 OpenAI 标准
- `edges` 全是 `"end":"N"` → 各段结尾无空格，`.join('')` **疑似**会导致粘连
- 需人工结合用户反馈判断

---

## 🚀 部署步骤

### 1. 提交代码
```bash
git add api/chat.js SPACING_ISSUE_DIAGNOSTIC.md SPACING_DIAG_FINAL.md
git commit -m "Add spacing diagnostic V2 (fully anonymized)

修正点：
1. 彻底脱敏：L/D/P 字符类别，不泄露中文/标点
2. 只标记疑似，不判断根因，不自动修改逻辑
3. 保持原有 .join('') 逻辑不变

日志格式：
[SPACING_DIAG]{⚠️SUSPECT} model type sample len spaces longest
array 时额外记录 edges 边界空格分析"
```

### 2. 推送部署
```bash
git push
```

Vercel 会自动部署（~2分钟）。

### 3. 验证部署
1. 进入 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择 Go Chat 2.0 项目
3. 确认最新部署状态为 **Ready**
4. 点击 **View Deployment** → **Functions** → 点击 `/api/chat`
5. 滚动到 Logs 区域

### 4. 触发诊断日志
正常使用聊天，发送任意消息，然后：
1. 回到 Vercel Functions → `/api/chat` → Logs
2. 刷新日志页面
3. 应该看到：
```
[SPACING_DIAG] model=claude-sonnet-5 type=string sample="..." ...
```

✅ 如果看到上述日志 → 诊断成功部署  
❌ 如果没有日志 → 检查构建日志是否有语法错误

---

## 📊 如何使用诊断日志

### 场景1：用户报告粘字
用户说"刚才那条消息英文粘在一起了"

**步骤**：
1. 记下时间（精确到分钟）
2. 进入 Vercel → Functions → `/api/chat` → Logs
3. 搜索时间范围内的 `[SPACING_DIAG]`
4. 查看是否有 `⚠️SUSPECT` 标记

**分析**：
- 如果有 `⚠️SUSPECT` + `sample` 连续L → 上游已粘字，问题在中转站
- 如果有 `⚠️SUSPECT` + `type=array` + edges 全无空格 → 可能是 `.join('')` 导致
- 如果没有 `⚠️SUSPECT` 但用户仍粘字 → 问题在前端，需加前端诊断

### 场景2：定期检查
每周检查一次 Vercel 日志，统计：
- `⚠️SUSPECT` 出现频率
- `type=array` 出现频率（理论上应该是0）
- `longest>20` 出现频率

如果 `type=array` 频繁出现 → 中转站兼容层有问题，联系站长

---

## ⚠️ 明确的局限性

### 诊断方案只能做到

✅ **检测后端响应阶段的异常**
- 中转站返回格式（string/array）
- 响应文本的字符类别分布
- 疑似粘连标记（longest>20）

❌ **做不到的事**

1. **不能100%确认"这是粘字"**
   - `longest=28` 可能是：粘字 / 长单词 / URL
   - 需要人工结合用户反馈判断

2. **不能检测前端处理问题**
   - 如果后端日志正常，但用户看到粘字
   - 说明问题在 `sendMessage.js` 或 `ui.js`
   - 需要加前端诊断（暂未实施）

3. **采样只看前30字符**
   - 如果粘字出现在第31字符之后，`sample` 看不到
   - 但 `longest` 仍能检测到

---

## 🔧 潜在修复方案（待确认）

**根据诊断结果，可能的修复方向**：

| 日志特征 | 可能原因 | 建议修复 |
|---------|---------|---------|
| `type=string longest>25 sample` 连续L | 中转站返回时已粘字 | 联系中转站站长反馈bug |
| `type=array edges` 全无空格 | `.join('')` 导致粘连 | 考虑改为 `.join(' ')` 或智能判断 |
| `type=array edges` 有空格 | 中转站非标准响应，但不影响空格 | 向站长反馈格式问题（可容忍）|
| 后端正常，用户仍粘字 | 前端某处理误删空格 | 加前端诊断日志 |

**关键**：不要立即修改代码，先观察诊断日志确认根因。

---

## 📅 观察计划

### 短期（1-3天）
- 验证诊断日志正常工作
- 收集 5-10 条 `⚠️SUSPECT` 样本
- 确认 `type=array` 是否真的出现

### 中期（7-14天）
- 统计异常模式分布
- 结合用户反馈确认根因
- 决定修复方案

### 不需要
- ❌ 连续观察7天才能下结论
- ❌ 今晚就解决粘字问题
- ❌ 人工监控每条日志

---

## 安全检查

✅ **彻底脱敏**
- L/D/P 字符类别，不泄露任何原始内容
- 中文、标点、emoji 全部替换成 P
- 只保留空白位置

✅ **不记录敏感信息**
- 不记录用户聊天内容
- 不记录系统提示词
- 不记录 API Key

✅ **最小影响**
- 日志只在后端（Vercel Functions）
- 不写数据库、不写文件
- 不修改原有回复逻辑
- 可随时删除诊断代码

---

最后更新：2026-10-31  
版本：V2（完全脱敏 + 只标记疑似）
