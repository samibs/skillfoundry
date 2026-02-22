# TDD Enforcement Protocol v1.0.0

> Shared module for Test-Driven Development cycle enforcement.
> Referenced by: `/coder`, `/tester`, `/go`

---

## Purpose

Enforce strict RED-GREEN-REFACTOR cycle. No implementation code is written before a failing test exists.

---

## The TDD Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     TDD ENFORCEMENT CYCLE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    ┌─────────┐      ┌─────────┐      ┌──────────┐              │
│    │   RED   │ ───► │  GREEN  │ ───► │ REFACTOR │ ───┐        │
│    └─────────┘      └─────────┘      └──────────┘    │        │
│         ▲                                             │        │
│         └─────────────────────────────────────────────┘        │
│                                                                 │
│    RED:      Write failing test FIRST                          │
│    GREEN:    Write MINIMAL code to pass                        │
│    REFACTOR: Improve code, tests still pass                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: RED (Write Failing Test)

### Requirements

1. **Test MUST fail initially**
   - If test passes immediately, you're not doing TDD
   - The failure proves the test is actually testing something

2. **Test MUST be specific**
   - One behavior per test
   - Clear assertion of expected outcome
   - Descriptive test name: `should_[action]_when_[condition]`

3. **Test MUST be runnable**
   - No compile errors (except missing implementation)
   - Proper test structure for framework

### RED Phase Checklist

```markdown
- [ ] Test file created/updated
- [ ] Test describes ONE specific behavior
- [ ] Test has clear arrange/act/assert structure
- [ ] Test runs and FAILS with expected error
- [ ] Failure message indicates missing implementation (not broken test)
```

### RED Phase Output

```json
{
  "phase": "RED",
  "test_file": "path/to/test.spec.ts",
  "test_name": "should_calculate_total_when_items_added",
  "failure_type": "assertion|reference|type",
  "failure_message": "Expected calculateTotal to be defined",
  "ready_for_green": true
}
```

---

## Phase 2: GREEN (Minimal Implementation)

### Requirements

1. **Write ONLY enough code to pass**
   - No future-proofing
   - No "while I'm here" additions
   - Hardcode if that passes the test

2. **Keep it simple**
   - First working solution, not best solution
   - Refactoring comes later
   - Ugly code is fine temporarily

3. **Run test immediately**
   - Don't write more code than needed
   - Stop as soon as test passes

### GREEN Phase Checklist

```markdown
- [ ] Implementation file created/updated
- [ ] Code is MINIMAL to pass test
- [ ] No extra features added
- [ ] Test now PASSES
- [ ] No other tests broken
```

### GREEN Phase Output

```json
{
  "phase": "GREEN",
  "implementation_file": "path/to/implementation.ts",
  "lines_added": 12,
  "test_status": "PASS",
  "all_tests_pass": true,
  "ready_for_refactor": true
}
```

---

## Phase 3: REFACTOR (Improve Code)

### Requirements

1. **Tests MUST stay green**
   - Run tests after every change
   - If tests fail, revert immediately

2. **Improve code quality**
   - Remove duplication
   - Improve naming
   - Extract methods/functions
   - Simplify logic

3. **Improve test quality**
   - Better assertions
   - Clearer test names
   - Remove test duplication

### REFACTOR Phase Checklist

```markdown
- [ ] Code duplication removed
- [ ] Names are clear and descriptive
- [ ] Functions are small and focused
- [ ] Tests still PASS after each change
- [ ] Test code also refactored if needed
```

### REFACTOR Phase Output

```json
{
  "phase": "REFACTOR",
  "changes": [
    "Extracted calculateSubtotal method",
    "Renamed 'x' to 'itemPrice'",
    "Removed duplicate validation"
  ],
  "tests_still_pass": true,
  "cycle_complete": true
}
```

---

## TDD State Tracking

### State File Location

```
.claude/tdd-state.json
```

### State Schema

```json
{
  "current_cycle": {
    "story_id": "STORY-001",
    "feature": "Shopping cart total calculation",
    "phase": "RED|GREEN|REFACTOR",
    "started_at": "2026-01-20T10:00:00Z",
    "test_file": "src/cart/__tests__/cart.spec.ts",
    "implementation_file": "src/cart/cart.service.ts"
  },
  "completed_cycles": [
    {
      "test_name": "should_add_item_to_cart",
      "red_duration_ms": 45000,
      "green_duration_ms": 120000,
      "refactor_duration_ms": 60000,
      "total_duration_ms": 225000
    }
  ],
  "metrics": {
    "total_cycles": 15,
    "avg_cycle_duration_ms": 180000,
    "tests_written_first": 15,
    "tests_written_after": 0
  }
}
```

---

## TDD Anti-Patterns (BLOCKED)

### Test-After Development

```
VIOLATION: Writing implementation before test
DETECTION: Implementation file modified before test file
ACTION: BLOCK and require test first
```

### Too Much Green

```
VIOLATION: Writing more code than needed to pass
DETECTION: Code added that isn't exercised by current test
ACTION: WARN and flag for review
```

### Skipping Refactor

```
VIOLATION: Moving to next RED without refactoring
DETECTION: GREEN → RED transition without REFACTOR
ACTION: WARN (refactor is optional but recommended)
```

### Testing Implementation Details

```
VIOLATION: Testing private methods or internal state
DETECTION: Test references private/internal members
ACTION: WARN and suggest testing public interface
```

---

## Integration with /coder

### Before Implementation

```markdown
## TDD ENFORCEMENT ACTIVE

Before writing ANY implementation code:
1. Identify the behavior to implement
2. Write a failing test for that behavior
3. Run the test - confirm it FAILS
4. Only then proceed to implementation

Current phase: [RED|GREEN|REFACTOR]
```

### /coder TDD Mode Activation

When `/coder` receives a task:

1. **Check TDD state** - Is there an incomplete cycle?
2. **Parse requirement** - What behavior needs implementing?
3. **Enter RED phase** - Write test first
4. **Confirm failure** - Run test, verify failure
5. **Enter GREEN phase** - Write minimal implementation
6. **Confirm pass** - Run test, verify pass
7. **Enter REFACTOR phase** - Improve code quality
8. **Cycle complete** - Move to next behavior

---

## TDD Commands

```
/tdd status          Show current TDD cycle state
/tdd start           Begin new TDD cycle
/tdd red             Enter/confirm RED phase
/tdd green           Enter/confirm GREEN phase
/tdd refactor        Enter/confirm REFACTOR phase
/tdd skip-refactor   Skip refactor (with warning)
/tdd metrics         Show TDD metrics
/tdd enforce [on|off] Toggle strict enforcement
```

---

## Framework-Specific Patterns

### Jest/Vitest (TypeScript)

```typescript
// RED: Write this first
describe('CartService', () => {
  it('should calculate total with tax', () => {
    const cart = new CartService();
    cart.addItem({ price: 100, quantity: 2 });

    expect(cart.calculateTotal(0.1)).toBe(220); // 200 + 10% tax
  });
});

// GREEN: Then implement minimally
class CartService {
  private items: Item[] = [];

  addItem(item: Item) {
    this.items.push(item);
  }

  calculateTotal(taxRate: number): number {
    const subtotal = this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return subtotal * (1 + taxRate);
  }
}
```

### pytest (Python)

```python
# RED: Write this first
def test_cart_calculates_total_with_tax():
    cart = CartService()
    cart.add_item(price=100, quantity=2)

    assert cart.calculate_total(tax_rate=0.1) == 220

# GREEN: Then implement minimally
class CartService:
    def __init__(self):
        self.items = []

    def add_item(self, price: float, quantity: int):
        self.items.append({"price": price, "quantity": quantity})

    def calculate_total(self, tax_rate: float) -> float:
        subtotal = sum(i["price"] * i["quantity"] for i in self.items)
        return subtotal * (1 + tax_rate)
```

### xUnit (.NET)

```csharp
// RED: Write this first
[Fact]
public void Should_Calculate_Total_With_Tax()
{
    var cart = new CartService();
    cart.AddItem(new Item { Price = 100, Quantity = 2 });

    Assert.Equal(220m, cart.CalculateTotal(0.1m));
}

// GREEN: Then implement minimally
public class CartService
{
    private readonly List<Item> _items = new();

    public void AddItem(Item item) => _items.Add(item);

    public decimal CalculateTotal(decimal taxRate)
    {
        var subtotal = _items.Sum(i => i.Price * i.Quantity);
        return subtotal * (1 + taxRate);
    }
}
```

---

## Enforcement Levels

| Level | Behavior |
|-------|----------|
| **STRICT** | Block implementation without failing test |
| **WARN** | Allow but log violation |
| **OFF** | TDD tracking only, no enforcement |

### Configuration

```json
// .claude/config.json
{
  "tdd": {
    "enforcement": "STRICT",
    "require_refactor": false,
    "min_test_coverage": 80,
    "track_metrics": true
  }
}
```

---

## Metrics Collection

TDD metrics feed into the main metrics system:

```json
{
  "tdd_metrics": {
    "cycles_completed": 45,
    "avg_red_duration_ms": 60000,
    "avg_green_duration_ms": 180000,
    "avg_refactor_duration_ms": 90000,
    "violations": {
      "test_after": 2,
      "too_much_green": 5,
      "skipped_refactor": 8
    },
    "test_first_rate": 0.96
  }
}
```

---

*TDD Protocol v1.0.0 - SkillFoundry Framework*
