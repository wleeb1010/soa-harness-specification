# tasks_fingerprint Test Vector (SV-GOOD-07)

Reference `/tasks/` tree + expected `tasks_fingerprint` for the novelty-quota rule in Core §23.

Two tasks are included, picked to exercise both the present-entrypoint and absent-entrypoint branches of the fingerprint algorithm:

| Directory | `entrypoint.sh` |
|---|---|
| `tasks/alpha-adder/` | present |
| `tasks/beta-regex/` | absent (sentinel "absent") |

## Expected Output

Running `node compute.mjs` from this directory MUST produce the following fingerprint:

```
sha256:8315851bf50e45dd0e3a0ec328264ae41e1acf714ccc70f5a8c3b73dd2212237
```

Per-task rows (also verifiable):

```
alpha-adder:
  task_json_sha256:  5ccf36295e0b9a35f75c4fc66402f107aafce349fd492301bee442316e981f6d
  dockerfile_sha256: 4595c4ac2e960e0da3bfecced1fe725eacbf007fe0ce1c3dd7caa50fa54ff8ae
  entrypoint_sha256: e912f7f9932f2b312ceb23ab5a635445bb52aaab7095f45ba81ab0f546df0956

beta-regex:
  task_json_sha256:  1e242158fe0b4368b28372d919d464650be8c975af9035e4d3a0806f77cb04da
  dockerfile_sha256: 12e1e32bf71fccc28c0125c168cd7d80569688d6e1169469188bf3462f82dbcc
  entrypoint_sha256: absent
```

Canonical outer array (514 bytes, JCS-sorted):

```
[{"dockerfile_sha256":"4595c4ac2e960e0da3bfecced1fe725eacbf007fe0ce1c3dd7caa50fa54ff8ae","entrypoint_sha256":"e912f7f9932f2b312ceb23ab5a635445bb52aaab7095f45ba81ab0f546df0956","task_id":"alpha-adder","task_json_sha256":"5ccf36295e0b9a35f75c4fc66402f107aafce349fd492301bee442316e981f6d"},{"dockerfile_sha256":"12e1e32bf71fccc28c0125c168cd7d80569688d6e1169469188bf3462f82dbcc","entrypoint_sha256":"absent","task_id":"beta-regex","task_json_sha256":"1e242158fe0b4368b28372d919d464650be8c975af9035e4d3a0806f77cb04da"}]
```

## How the Test Passes

`soa-validate`, when run with `--profile core+si` against a Runner that has mounted this tree as its `/tasks/` directory, MUST invoke the Runner's fingerprint computation and receive the exact string above. Mismatch fails `SV-GOOD-07`.

## Algorithm (Core §23)

1. Enumerate child directories of `/tasks/` that contain `task.json`.
2. For each, compute `{ task_id, task_json_sha256 (JCS), dockerfile_sha256 (raw bytes), entrypoint_sha256 (raw bytes or literal "absent") }`.
3. Sort the array by `task_id` in code-unit lexicographic order.
4. `tasks_fingerprint = "sha256:" + hex(SHA-256(JCS-RFC-8785(sorted_array)))`.

`inputs/` and `expected/` directories are intentionally excluded — expected outputs may legitimately change without changing task novelty.

## Regenerating

If the fixture ever changes (e.g., real base-image digests replace the placeholders), re-run `node compute.mjs` and update the fingerprint string above.
