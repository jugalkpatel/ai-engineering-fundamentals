# General Diagram Best Practices

These rules apply to almost any diagram, regardless of type.

## Layout

- **Pick a direction and stay with it.** Top-to-bottom for hierarchies and processes, left-to-right for sequences and data flows. Don't mix.
- **Group related elements visually.** Things that belong together should sit close together. Things that don't should be separated by whitespace.
- **Align elements to an invisible grid.** Boxes that should be the same size should be the same size. Boxes that share a row should share a baseline. Misaligned shapes look like noise.
- **Leave breathing room.** At least 20px of empty space between any two unrelated shapes. Crowded diagrams are hard to scan.
- **Don't cross lines if you can avoid it.** Reroute around boxes. Two crossing lines is acceptable; six crossing lines is a tangle.
- **Limit the diagram's width or height to one screen.** If a diagram doesn't fit, break it into multiple diagrams or collapse some details.

## Labels

- **Every shape gets a label.** An unlabeled box is meaningless.
- **Every connection that isn't obvious gets a label.** Arrows in a flowchart usually don't need labels (the order is the meaning); arrows in an ER diagram do (cardinality matters); arrows in a sequence diagram always do (the message is the meaning).
- **Keep labels short.** A label is a name, not a sentence. Two or three words. Put detail in a separate notes box if you need it.
- **Use the same vocabulary throughout.** Don't call something "User" in one place and "Customer" in another.

## Colors

- **Use color to encode roles, not for decoration.** All databases the same color. All external systems the same color. Same role, same color, every time.
- **Two or three colors maximum.** Past that, color stops being a signal.
- **Make sure the diagram still works in grayscale.** Many people print and many tools render to monochrome thumbnails. Don't rely on color alone to convey meaning.
- **Default to neutral fills.** Bright fills draw the eye. Reserve them for the elements you actually want to highlight.

## Element selection

- **Pick the right shape for the role.** Rectangles for components and steps. Diamonds for decisions. Ellipses for start/end. Arrows for direction. Lines for undirected connection. Don't reuse a shape for two different roles in the same diagram.
- **Don't invent new shapes.** Stick to the standard vocabulary your audience already knows. A custom hexagon means nothing without a legend, and the legend itself is friction.

## Iteration

- **Draft the structure first, polish second.** Place all the boxes and connections roughly. Then go back and align, label, and color. Polishing as you go wastes time you'll throw away when you discover the layout doesn't work.
- **One concept per diagram.** Don't try to show data flow, deployment topology, and team ownership in the same picture.
