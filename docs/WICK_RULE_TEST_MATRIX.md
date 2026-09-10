# Three-Candle Wick Rule Test Matrix

The matrix is symmetric: every case runs once for LONG and once for SHORT. Tick size is `0.25`. No trading rules were changed to make these tests pass.

Production rule under test:

- LONG checks the wick against the final next level above the played level.
- SHORT checks the wick against the final next level below the played level.
- A wick touch rejects unless Candle 3 closes strictly beyond that next level.
- Candle 3 equality is not beyond the level and therefore does not override a wick violation.
- Levels already legitimately broken by Candle 3 are not the final next level.

All cases below: **PASS**. Actual outcomes are the returned evaluator result/reason.

| CASE | CANDLES | LEVELS | EXPECTED | ACTUAL | PASS/FAIL | REASON |
|---|---|---|---|---|---|---|
| LONG-1 / SHORT-1 | Valid three-candle pattern; final wick one tick before forbidden next level | Symmetric active levels; next level at 5030 LONG / 4970 SHORT; wick at 5029.75 / 4970.25 | ACCEPTED | ACCEPTED | PASS | No forbidden next-level touch |
| LONG-2 / SHORT-2 | Valid pattern; final wick exactly at forbidden next level | Next level at 5030 LONG / 4970 SHORT | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | A wick touched a forbidden next level |
| LONG-3 / SHORT-3 | Valid pattern; final wick one tick beyond forbidden next level | Next level at 5030 LONG / 4970 SHORT; wick at 5030.25 / 4969.75 | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | A wick touched a forbidden next level |
| LONG-4 / SHORT-4 | Valid pattern with Candle 1 wick violation | Candle 1 touches final next level | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Any candle wick touching the final next level invalidates the setup |
| LONG-5 / SHORT-5 | Valid pattern with Candle 2 wick violation | Candle 2 touches final next level | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Any candle wick touching the final next level invalidates the setup |
| LONG-6 / SHORT-6 | Valid pattern with Candle 3 wick violation | Candle 3 touches final next level without closing beyond it | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | A wick touched a forbidden next level |
| LONG-7 / SHORT-7 | Candle 1, Candle 2, and Candle 3 all touch the final next level | Final next level touched by multiple candles | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Multiple touches remain a rejection |
| LONG-8 / SHORT-8 | Candle 3 wick touches and Candle 3 closes exactly at the level | Final next level equality; close is not strictly beyond | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Equality does not satisfy closes-beyond override |
| LONG-9 / SHORT-9 | Candle 3 wick touches and Candle 3 closes one tick beyond | Final next level; close at level plus one tick in trade direction | ACCEPTED | ACCEPTED | PASS | Candle 3 closed strictly beyond the touched level |
| LONG-10 / SHORT-10 | Candle 3 closes beyond exactly one supplied level | One played level plus an untouched next level | ACCEPTED | ACCEPTED | PASS | Valid one-level break with untouched next level |
| LONG-11 / SHORT-11 | Candle 3 closes beyond exactly two supplied levels | Two crossed levels plus an untouched next level | ACCEPTED | ACCEPTED | PASS | Valid two-level break with final next level untouched |
| LONG-12 / SHORT-12 | Candle 3 closes beyond exactly three supplied levels | Three crossed levels plus an untouched next level | ACCEPTED | ACCEPTED | PASS | Valid three-level break with final next level untouched |
| LONG-13 / SHORT-13 | Wick crosses multiple levels but Candle 3 close does not reach final next level | Intermediate levels crossed by wick; final next level remains unclosed | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Wick rule uses the final next level, not only the close |
| LONG-14 / SHORT-14 | Wick touches a level already legitimately broken by Candle 3 | Previously crossed level is not the final next level | ACCEPTED | ACCEPTED | PASS | Only the final next level is forbidden |
| LONG-15 / SHORT-15 | Valid pattern; final next level remains untouched | Normal symmetric level spacing | ACCEPTED | ACCEPTED | PASS | No forbidden next-level touch |
| LONG-16 / SHORT-16 | Valid pattern with no level beyond the played level | Contextual levels end at the played level | ACCEPTED | ACCEPTED | PASS | No next level means no wick rejection |
| LONG-17 / SHORT-17 | Valid pattern with adjacent levels exactly one tick apart | Final next level is one tick from played level | REJECTED | REJECTED: INSUFFICIENT_BREATHING_ROOM | PASS | One-tick spacing is below the minimum breathing-room threshold |
| LONG-18 / SHORT-18 | Boundary equality: wick and Candle 3 close exactly at final next level | Final next-level equality | REJECTED | REJECTED: WICK_TOUCHED_FORBIDDEN_NEXT_LEVEL | PASS | Boundary equality is not strictly beyond |

## Test Coverage

- Test file: `backend/tests/integration/wick-rule-matrix.test.ts`
- LONG cases: 18 passed
- SHORT cases: 18 passed
- Total: 36 passed
- Strategy implementation changed for this matrix: no
