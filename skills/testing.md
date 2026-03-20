---
name: testing
description: Smart contract testing with Foundry — unit tests, fuzz testing, fork testing, invariant testing.
---

# Smart Contract Testing

## What You Probably Got Wrong

**You test getters and trivial functions.** Testing that `name()` returns the name is worthless. Test edge cases, failure modes, and economic invariants.

**You don't fuzz.** `forge test` finds the bugs you thought of. Fuzzing finds the ones you didn't.

**You don't fork-test.** If your contract calls Uniswap, Aave, or any external protocol, test against their real deployed contracts on a fork.

---

## Unit Testing with Foundry

### Test File Structure

```solidity
// test/MyContract.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {MyToken} from "../src/MyToken.sol";

contract MyTokenTest is Test {
    MyToken public token;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        token = new MyToken("Test", "TST", 1_000_000e18);
        token.transfer(alice, 10_000e18);
    }

    function test_TransferUpdatesBalances() public {
        vm.prank(alice);
        token.transfer(bob, 1_000e18);

        assertEq(token.balanceOf(alice), 9_000e18);
        assertEq(token.balanceOf(bob), 1_000e18);
    }

    function test_RevertWhen_TransferExceedsBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 999_999e18);
    }
}
```

### Key Assertion Patterns

```solidity
// Equality
assertEq(actual, expected);
assertEq(actual, expected, "descriptive error message");

// Comparisons
assertGt(a, b);   // a > b
assertGe(a, b);   // a >= b
assertLt(a, b);   // a < b
assertLe(a, b);   // a <= b

// Approximate equality (for math with rounding)
assertApproxEqAbs(actual, expected, maxDelta);

// Revert expectations
vm.expectRevert();
vm.expectRevert("Insufficient balance");
vm.expectRevert(MyContract.CustomError.selector);

// Event expectations
vm.expectEmit(true, true, false, true);
emit MyEvent(expectedArg1, expectedArg2);
```

### What to Actually Test

```solidity
// ✅ TEST: Edge cases that lose money
function test_TransferZeroAmount() public { /* ... */ }
function test_TransferEntireBalance() public { /* ... */ }
function test_TransferToSelf() public { /* ... */ }

// ✅ TEST: Access control
function test_RevertWhen_NonOwnerCallsAdminFunction() public { /* ... */ }

// ✅ TEST: Failure modes
function test_RevertWhen_DepositZero() public { /* ... */ }
function test_RevertWhen_WithdrawMoreThanDeposited() public { /* ... */ }

// ❌ DON'T TEST: OpenZeppelin internals
// function test_NameReturnsName() — they already tested this
```

---

## Fuzz Testing

Foundry automatically fuzzes any test function with parameters.

### Basic Fuzz Test

```solidity
function testFuzz_DepositWithdrawRoundtrip(uint256 amount) public {
    // Bound input to valid range
    amount = bound(amount, 1, token.balanceOf(alice));

    uint256 balanceBefore = token.balanceOf(alice);

    vm.startPrank(alice);
    token.approve(address(vault), amount);
    vault.deposit(amount, alice);
    vault.withdraw(vault.balanceOf(alice), alice, alice);
    vm.stopPrank();

    // Property: user gets back what they deposited (minus any fees)
    assertGe(token.balanceOf(alice), balanceBefore - 1);
}
```

### Run with More Iterations

```bash
# Default: 256 runs
forge test

# More thorough: 10,000 runs
forge test --fuzz-runs 10000
```

---

## Fork Testing

Test your contract against real deployed protocols on a mainnet fork.

```solidity
function setUp() public {
    // Fork mainnet at a specific block for reproducibility
    vm.createSelectFork("mainnet", 19_000_000);
}
```

### When to Fork-Test

- **Always:** Any contract that calls an external protocol (Uniswap, Aave, Chainlink)
- **Always:** Any contract that handles tokens with quirks (USDT, fee-on-transfer)
- **Always:** Any contract that reads oracle prices
- **Never:** Pure logic contracts with no external calls

---

## Invariant Testing

Invariant tests verify that properties hold across thousands of random function call sequences.

### What Are Invariants?

Properties that must ALWAYS be true:
- "Total supply equals sum of all balances" (ERC-20)
- "Total deposits equals total shares times share price" (vault)
- "x * y >= k after every swap" (AMM)
- "User can always withdraw what they deposited" (escrow)

---

## Pre-Deploy Test Checklist

- [ ] All custom logic has unit tests with edge cases
- [ ] Zero amounts, max uint, empty arrays, self-transfers tested
- [ ] Access control verified — unauthorized calls revert
- [ ] Fuzz tests on all mathematical operations (minimum 1000 runs)
- [ ] Fork tests for every external protocol integration
- [ ] Events verified with `expectEmit`
- [ ] Static analysis with `slither .` — no high/medium findings unaddressed
- [ ] All tests pass: `forge test -vvv`
