# Comet Returns come from a table, not from one set of Kepler elements

A Periodic Comet's period drifts from orbit to orbit (outgassing and planetary perturbations move Halley between ~74 and ~79 years), so a single set of osculating elements propagated with Kepler's equation puts the comet in the wrong place a few orbits away. Halley at 1910 or 1066 would miss its real perihelion by months to years. We draw each comet's orbit shape from one set of elements, but take its Return dates from a table of observed and published perihelion passages (a few past, one or two future), and place the comet by mean anomaly interpolated between the two Returns that bracket Sim Time. That way "next Return" on the Body Card, the "jump to Return" buttons, and the comet's position on screen always agree, including at historical Returns.

## Considered Options

- **One set of elements, limited Sim Time range** (e.g. 1900–2100 with a "position approximate" warning): simpler, but it loses the historical Returns that make comets worth showing, and the Body Card date would disagree with the drawn position.

## Consequences

- Outside the first and last tabulated Return, positions fall back to plain Kepler propagation and should be flagged as approximate.
- Adding a comet means supplying its Return table, not just its elements.
