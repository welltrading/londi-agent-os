# E3-T03 Recommendation Engine

The adapter package now ranks approved adapters against pipeline/task requirements.

## Inputs

`recommendAdapters()` accepts:

- capability registry from E3-T02
- requirements list
- `allowQualityOverride`
- result limit

Requirements include:

- `kind`: `capability`, `constraint`, `access`, or `adapter`
- `category`: `safety`, `technical`, or `quality`
- `required`: defaults to true
- optional `weight`

## Filtering rules

- Unavailable adapters are blocked and not normally recommended.
- Safety failures always block.
- Technical failures always block.
- Quality failures block unless `allowQualityOverride` is true.
- Quality override produces a warning and `overrideUsed: true`.

## Ranking and explanation

Eligible adapters are ranked by:

1. registry priority
2. availability
3. matched requirement weights
4. deterministic adapter id tie-breaker

Each recommendation includes the top three reasons, mixing blockers/warnings/strengths as relevant. `explainAdapterRecommendation()` returns those same top three factors.

## Boundary

The recommendation engine only selects among `claude-code` and `codex`. It does not execute adapter processes and does not introduce Agent Zero/Hermes support.
