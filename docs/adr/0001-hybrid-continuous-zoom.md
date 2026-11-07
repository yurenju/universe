# Hybrid continuous zoom across separate per-level scenes

The experience spans ~10⁹ m to ~10²⁷ m. A single true-continuous scene would fight floating-point precision across 18+ orders of magnitude and force one rendering approach on every scale; fully separate levels with cut transitions lose the sense of continuous scale, which is the whole point. We chose a hybrid: each Scale Level is its own scene tuned independently, and adjacent levels cross-fade at their boundaries so the previous level shrinks into a point inside the next, making zoom feel continuous.

## Considered Options

- **Single continuous scene (log camera + floating origin)**: most faithful, but highest precision/complexity risk and hardest to make each scale look like its reference photos.
- **Discrete levels with transitions**: simplest, but breaks the "powers of ten" feeling.
