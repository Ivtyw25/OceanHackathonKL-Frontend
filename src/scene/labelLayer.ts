import { createRef } from 'react';

/**
 * A fixed DOM container for drei <Html> labels. Without it, <Html> re-attaches its labels
 * once R3F connects its events, unmounting their React roots mid-render; a label can be lost.
 */
export const labelLayer = createRef<HTMLDivElement>();
