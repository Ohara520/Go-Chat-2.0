# Continuity V1 · Batch 2 — Test Results

## Test Cases

### Test 1: Create briefing (pending)
**Input:**
- User: "what are you doing later?"
- Simon: "Got a briefing in twenty."

**Expected:**
- Action: `create`
- Type: `work`
- Subject: `briefing`
- Status: `pending`
- Summary: "Briefing scheduled shortly."

**Result:** ✅ PASS
- Extractor correctly identifies new event
- System validates required fields
- Core creates pending record

---

### Test 2: Update briefing (pending → ongoing)
**Input:**
- Active: briefing / pending
- Simon: "Heading in now."

**Expected:**
- Action: `update`
- TargetId: (same briefing ID)
- Status: `ongoing`
- Summary: "Briefing in progress."

**Result:** ✅ PASS
- Extractor matches single candidate
- System validates targetId exists
- Core updates status to ongoing

---

### Test 3: Complete briefing
**Input:**
- Active: briefing / ongoing
- Simon: "Just got out."

**Expected:**
- Action: `complete`
- TargetId: (same briefing ID)
- Summary: "Briefing completed."

**Result:** ✅ PASS
- Extractor identifies completion
- System validates targetId exists
- Core sets status to completed

---

### Test 4: Current state (no continuity)
**Input:**
- Simon: "I'm having coffee."

**Expected:**
- Action: `none`

**Result:** ✅ PASS
- Extractor correctly ignores momentary state

---

### Test 5: Vague possibility (no continuity)
**Input:**
- Simon: "Might have training tomorrow."

**Expected:**
- Action: `none`

**Result:** ✅ PASS
- Extractor correctly ignores "might" (uncertain)

---

### Test 6: Confirmed future event (create)
**Input:**
- Simon: "Training tomorrow morning."

**Expected:**
- Action: `create`
- Type: `work`
- Subject: `training`
- Status: `pending`
- Summary: "Training scheduled for tomorrow morning."

**Result:** ✅ PASS
- Extractor distinguishes confirmed from uncertain
- Near-term future event recorded

---

### Test 7: Reschedule (update, not complete+create)
**Input:**
- Active: briefing / pending
- Simon: "Briefing got pushed to tomorrow."

**Expected:**
- Action: `update`
- TargetId: (same briefing ID)
- Status: `pending`
- Summary: "Briefing rescheduled to tomorrow."

**Result:** ✅ PASS
- Extractor does NOT complete old + create new
- System validates same thread update

---

### Test 8: Ambiguous candidate (no update)
**Input:**
- Active: briefing / pending, training / pending
- Simon: "Heading in now."

**Expected:**
- Action: `none`

**Result:** ✅ PASS
- Extractor refuses to guess between multiple candidates
- System does not create orphan update

---

### Test 9: Maybe response (no create)
**Input:**
- User: "briefing later?"
- Simon: "Maybe."

**Expected:**
- Action: `none`

**Result:** ✅ PASS
- User mention + uncertain Simon response = no event

---

### Test 10: Confirmed response (create)
**Input:**
- User: "briefing later?"
- Simon: "Yeah. In twenty."

**Expected:**
- Action: `create`
- Type: `work`
- Subject: `briefing`
- Status: `pending`
- Summary: "Briefing scheduled shortly."

**Result:** ✅ PASS
- Simon confirmation creates event
- User question context helps parse "Yeah"

---

### Test 11: Promise is NOT a task
**Input:**
- Simon: "Got a briefing now. I'll text you when I'm done."

**Expected:**
- Action: `create` (briefing only)
- Type: `work`
- Subject: `briefing`
- Status: `ongoing`
- Summary: "Briefing in progress."
- NO separate "text wife" task

**Result:** ✅ PASS
- Extractor ignores "I'll text you" promise
- Only real event (briefing) recorded

---

## Summary

**Total Tests:** 11  
**Passed:** 11  
**Failed:** 0

All test cases pass. Batch 2 implementation complete.

## Key Validation Rules

1. ✅ Action must be one of: create / update / complete / none
2. ✅ Create requires: type, subject, status (pending/ongoing), summary
3. ✅ Update requires: targetId (must exist in active), summary
4. ✅ Complete requires: targetId (must exist in active)
5. ✅ Completed threads cannot be reopened
6. ✅ Summary must pass safety check (no directive keywords)
7. ✅ Multiple candidates → none (no guessing)

## Integration Points

- **Extractor:** `js/continuityExtractor.js` (new)
  - Uses `fetchDeepSeek` (Haiku, low-cost)
  - Input: userLastMsg, simonReply, activeContinuity
  - Output: structured JSON proposal

- **Validation:** `js/sendMessage.js` → `_validateContinuityProposal()`
  - System has final modification authority
  - Checks required fields, targetId existence, safety

- **Core API:** `js/continuity.js` (Batch 1)
  - `recordContinuity()` — create
  - `updateContinuity()` — update
  - `completeContinuity()` — complete

- **Injection:** `js/ghostContext.js` → `buildContinuityContext()`
  - Already wired in Batch 1
  - No changes needed

## Call Site

`js/sendMessage.js` line ~1379:
```javascript
// ── Continuity V1 Batch 2: Chat Extraction ────────────────
// Simon 回复完成后异步提取 Continuity 事实
// 不阻塞聊天流程，extractor 失败静默跳过
if (typeof extractContinuityFromReply === 'function' && reply && reply.length > 10) {
  setTimeout(() => {
    _extractAndProcessContinuity(text, reply).catch(e => {
      console.warn('[Continuity] Extraction failed:', e);
    });
  }, 500);
}
```

- **Position:** After history save, before副作用
- **Timing:** 500ms delay (non-blocking)
- **Error handling:** Silent catch, no user-visible errors
- **Condition:** Reply exists and > 10 chars

## Script Load Order

`index.html`:
```html
<script src="js/continuity.js"></script>           <!-- Batch 1 Core -->
<script src="js/continuityExtractor.js"></script>  <!-- Batch 2 Extractor -->
<script src="js/ghostContext.js"></script>         <!-- Injection (Batch 1) -->
...
<script src="js/sendMessage.js"></script>          <!-- Chat flow + extraction -->
```

All dependencies satisfied. No circular deps.
