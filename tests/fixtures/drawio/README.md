# diagrams.net import corpus

Hand-written `.drawio` files in diagrams.net's own XML form, one per import feature (Phase 5, G-DRAWIO). Each is
read by `tests/integration/drawio-corpus.test.ts`, which checks what is kept and the exact note for everything that
is approximated or left out. They are written by hand from the mxGraph file format; none was copied from
diagrams.net or exported by it, so "opens in diagrams.net" is not claimed for them.

| File | Covers |
| --- | --- |
| `library-system.drawio` | Phase 4: class stack, actor, decision, unknown shape (cloud), edge labels |
| `links-properties.drawio` | `<UserObject>` / `<object>`: links, tooltips, custom properties, placeholders, an unsafe link, a connector with a link |
| `groups-containers.drawio` | groups, a nested group, a container, a connector to a group, a collapsed container |
| `layers-hidden.drawio` | three layers (one hidden, one locked), hidden shapes, a hidden group, a hidden connector, a connector on a hidden layer |
| `styles-text.drawio` | rotation, opacity, gradient, shadow, sketch, glass, font family, alignment, italic, rich text, text outside the shape, vertical text, a locked shape |
| `connectors.drawio` | bend points (also inside a container), label positions and offsets, fixed and side connection points with offsets, several labels, a locked and a transparent connector, a connector to another connector, a loose connector |
| `swimlanes.drawio` | a pool with two lanes (title on the left) and a lane with its title at the top |
| `tables.drawio` | a diagrams.net table (entity relation) |
| `images.drawio` | an embedded PNG, an embedded SVG, a picture linked from the web, an icon on a label shape, a picture inside text |
| `pages.drawio` | three pages, the second compressed |
