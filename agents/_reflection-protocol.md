# Agent Reflection Protocol

**Version**: 1.0  
**Status**: ACTIVE  
**Applies To**: All Agents

---

## Purpose

This protocol ensures all agents engage in self-critique and continuous improvement through structured reflection before, during, and after actions.

---

## Reflection Protocol (All Agents)

### Pre-Action Reflection

**BEFORE executing any major action**, ask yourself:

1. **Risk Assessment**
   - What are the risks of this approach?
   - What could go wrong?
   - What are the failure modes?

2. **Assumption Check**
   - What assumptions am I making?
   - Are these assumptions valid?
   - What if my assumptions are wrong?

3. **Pattern Recognition**
   - Have I seen similar patterns fail before?
   - What lessons learned apply here?
   - Are there known anti-patterns to avoid?

4. **Simplicity Check**
   - Is there a simpler solution I'm overlooking?
   - Am I over-engineering this?
   - Can I achieve the goal with less complexity?

5. **Context Validation**
   - Do I have all the information I need?
   - Am I missing critical context?
   - Should I request more information before proceeding?

---

### Post-Action Reflection

**AFTER executing any major action**, assess:

1. **Goal Achievement**
   - Did the output match the intent?
   - Did I achieve the stated goal?
   - What gaps exist between intent and result?

2. **Edge Case Analysis**
   - What edge cases did I miss?
   - What boundary conditions weren't considered?
   - What error scenarios weren't handled?

3. **Quality Assessment**
   - Is this production-ready?
   - What technical debt did I introduce?
   - What would I refactor if I had more time?

4. **Learning & Improvement**
   - What would I do differently next time?
   - What worked well that I should remember?
   - Should I update the knowledge base with this experience?

5. **Contradiction Detection**
   - Does my output contradict previous decisions?
   - Does it conflict with another agent's work?
   - Does it deviate from known patterns without justification?

---

### Contradiction Detection Protocol

**When detecting contradictions**:

1. **Identify Contradiction Type**
   - Architecture contradiction (different architectural decisions)
   - Implementation contradiction (different implementation patterns)
   - Testing contradiction (different test approaches)
   - Security contradiction (different security assumptions)

2. **Escalate Appropriately**
   - Architecture conflicts → Escalate to Architect agent or User
   - Implementation conflicts → Escalate to Architect for review
   - Testing conflicts → Escalate to Tester agent
   - Security conflicts → Escalate to Security Scanner agent

3. **Document Decision**
   - Record the contradiction
   - Document the resolution
   - Update knowledge base to prevent recurrence

4. **Justify Deviation**
   - If intentionally deviating from patterns, explain why
   - Document the rationale
   - Ensure deviation is justified, not accidental

---

### Self-Score (0-10)

**After each major output**, self-assess on four dimensions:

#### Scoring Criteria

1. **Completeness (0-10)**
   - 10: All requirements addressed, all edge cases handled
   - 7: Most requirements addressed, some edge cases missing
   - 5: Core requirements addressed, many gaps
   - 3: Partial implementation, significant gaps
   - 0: Incomplete or missing critical components

2. **Quality (0-10)**
   - 10: Production-ready, follows best practices, well-structured
   - 7: Good quality, minor improvements needed
   - 5: Functional but needs refactoring
   - 3: Works but poor quality, technical debt
   - 0: Not production-ready, significant issues

3. **Security (0-10)**
   - 10: All security checks passed, follows BPSBS, no vulnerabilities
   - 7: Most security checks passed, minor concerns
   - 5: Basic security in place, some gaps
   - 3: Security concerns present
   - 0: Security vulnerabilities detected

4. **Confidence (0-10)**
   - 10: Highly confident, well-tested, proven approach
   - 7: Confident, tested, minor uncertainties
   - 5: Moderate confidence, some testing, some uncertainty
   - 3: Low confidence, untested, significant uncertainty
   - 0: Very uncertain, untested, unproven approach

#### Self-Score Threshold

**If overall self-score < 7.0**:
- Request peer review before proceeding
- Identify specific areas needing improvement
- Document concerns and uncertainties
- Consider alternative approaches

**If any dimension < 5.0**:
- BLOCK further progress until addressed
- Escalate to appropriate specialist agent
- Request user input if needed

---

### Reflection Output Format

**When reflecting, use this structured format**:

```markdown
## Reflection: [Action Name]

### Pre-Action Reflection
- **Risks**: [List identified risks]
- **Assumptions**: [List assumptions made]
- **Patterns**: [Relevant patterns or anti-patterns]
- **Simplicity**: [Simpler alternatives considered]

### Post-Action Reflection
- **Goal Achievement**: [Did I achieve the goal?]
- **Edge Cases**: [Edge cases identified/missed]
- **Quality**: [Quality assessment]
- **Learning**: [Key learnings]
- **Contradictions**: [Any contradictions detected]

### Self-Score
- **Completeness**: X/10
- **Quality**: X/10
- **Security**: X/10
- **Confidence**: X/10
- **Overall**: X/10

### Action Items
- [ ] [If score < 7, list improvement actions]
- [ ] [If contradictions, list resolution steps]
```

---

## Integration with Agents

### When to Reflect

**Reflect BEFORE**:
- Starting a new story or feature
- Making architectural decisions
- Implementing security-sensitive code
- Performing complex refactoring
- Writing critical business logic

**Reflect AFTER**:
- Completing a story or feature
- Making significant code changes
- Completing a test suite
- Finishing a code review
- Resolving a bug or issue

**Reflect DURING**:
- When encountering unexpected complexity
- When assumptions prove incorrect
- When contradictions are detected
- When quality concerns arise

---

## Examples

### Example 1: Pre-Action Reflection (Coder Agent)

```markdown
## Reflection: Implementing JWT Refresh Token Rotation

### Pre-Action Reflection
- **Risks**: 
  - Token reuse detection could have race conditions
  - Concurrent refresh requests might cause issues
  - Token family tracking adds complexity
- **Assumptions**: 
  - Database supports transactions (PostgreSQL)
  - Refresh tokens stored server-side
  - Token family size is manageable
- **Patterns**: 
  - Following OAuth 2.0 refresh token best practices
  - Avoiding token replay attacks (seen in past projects)
- **Simplicity**: 
  - Considered simpler approach (no rotation) but less secure
  - Current approach balances security and complexity

### Decision: Proceed with implementation, add transaction handling for race conditions
```

### Example 2: Post-Action Reflection (Tester Agent)

```markdown
## Reflection: Test Suite for Payment Processing

### Post-Action Reflection
- **Goal Achievement**: ✅ All payment flows tested
- **Edge Cases**: 
  - ✅ Tested: Network failures, timeout scenarios
  - ⚠️ Missing: Concurrent payment attempts
- **Quality**: 
  - Good test coverage (85%)
  - Tests are maintainable
  - Some flaky tests need fixing
- **Learning**: 
  - Payment testing requires careful mock setup
  - Edge cases are critical for financial code
- **Contradictions**: None detected

### Self-Score
- **Completeness**: 8/10 (missing concurrent tests)
- **Quality**: 7/10 (some flaky tests)
- **Security**: 9/10 (security tests comprehensive)
- **Confidence**: 8/10 (well-tested, minor gaps)
- **Overall**: 8.0/10

### Action Items
- [ ] Add concurrent payment attempt tests
- [ ] Fix flaky tests (investigate timing issues)
```

---

## Benefits

1. **Improved Quality**: Reflection catches issues early
2. **Reduced Errors**: Pre-action reflection prevents mistakes
3. **Continuous Learning**: Post-action reflection captures lessons
4. **Better Decisions**: Structured thinking improves outcomes
5. **Self-Awareness**: Self-scoring identifies improvement areas

---

## Enforcement

- **Mandatory**: All agents MUST reflect before/after major actions
- **Documented**: Reflections MUST be documented in agent output
- **Threshold**: Self-score < 7 triggers peer review requirement
- **Blocking**: Self-score < 5 blocks further progress

---

**Last Updated**: January 25, 2026  
**Version**: 1.0
