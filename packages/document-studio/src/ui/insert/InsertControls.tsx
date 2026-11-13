import { Button, IconButton, Menu } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { ArrowRight, ChevronDown, Circle, MessageSquare, Minus, RectangleHorizontal, Shapes, Sigma, Square, SquareDashed } from 'lucide-react';
import type { ReactNode } from 'react';
import { requestObjectEdit } from '../../extensions/objectRequests';
import { SHAPE_KINDS, SHAPE_LABELS, type ShapeKind } from '../../extensions/shapeModel';

export const SHAPE_ICONS: Record<ShapeKind, ReactNode> = {
  rect: <RectangleHorizontal size={14} />,
  roundRect: <Square size={14} />,
  ellipse: <Circle size={14} />,
  line: <Minus size={14} />,
  arrow: <ArrowRight size={14} />,
  callout: <MessageSquare size={14} />,
};

/** Insert tab: equations (inline or display), shapes and text boxes. */
export function InsertObjectControls({ editor }: { editor: Editor }) {
  return (
    <>
      <Menu
        trigger={(p) => (
          <Button size="sm" variant="ghost" icon={<Sigma size={15} />} aria-label="Insert equation" {...p}>
            Equation <ChevronDown size={13} />
          </Button>
        )}
        items={[
          { label: 'Inline equation', hint: '$$…$$', icon: <Sigma size={14} />, onSelect: () => requestObjectEdit(editor, { kind: 'new-equation', display: false }) },
          { label: 'Display equation', icon: <Sigma size={14} />, onSelect: () => requestObjectEdit(editor, { kind: 'new-equation', display: true }) },
        ]}
      />
      <Menu
        trigger={(p) => (
          <Button size="sm" variant="ghost" icon={<Shapes size={15} />} aria-label="Insert shape" {...p}>
            Shape <ChevronDown size={13} />
          </Button>
        )}
        items={SHAPE_KINDS.map((kind) => ({ label: SHAPE_LABELS[kind], icon: SHAPE_ICONS[kind], onSelect: () => editor.chain().focus().insertShape(kind).run() }))}
      />
      <IconButton label="Insert text box" onClick={() => editor.chain().focus().insertTextBox().run()}>
        <SquareDashed size={16} />
      </IconButton>
    </>
  );
}
