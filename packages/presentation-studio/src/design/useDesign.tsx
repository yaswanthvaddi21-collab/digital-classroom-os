import { useToast } from '@dcos/ui';
import { useCallback, useState, type ReactNode } from 'react';
import type { SlideCommands } from '../editor/SlidesPanel';
import type { EditorModel } from '../editor/useEditorModel';
import type { PresentationImageHost } from '../hosts';
import { effectiveBackground } from '../render/SlideView';
import type { Background } from '../types';
import type { RibbonTab } from '../ui/Ribbon';
import { BackgroundDialog } from './BackgroundDialog';
import { DesignTab, LayoutDialog } from './DesignTab';
import { MasterView } from './MasterView';
import {
  applyBackgroundToAll,
  applyTheme,
  applyThemeColors,
  applyThemeFonts,
  changeLayout,
  resetSlides,
  setSlideSize,
  setSlidesBackground,
  setTargetBackground,
  targetOf,
  type MasterTarget,
} from './model';

type BackgroundTarget = { kind: 'slides' } | MasterTarget;

export interface UseDesignOptions {
  model: EditorModel;
  imageHost?: PresentationImageHost;
  wide: boolean;
  /** Ends text editing before a change that moves or replaces objects (a layout, the slide size, master view). */
  beforeChange: () => void;
  undo: () => void;
  redo: () => void;
}

/**
 * Everything DESIGN adds to the editor (Phase 7 Round 2b): the Design tab, the slide menu's Layout…, Format
 * background… and Reset slide, the background and layout dialogs, and master view, which replaces the ribbon and the
 * slides while it is open. Every change goes through the editor's model: one undo step each, saved through onChange.
 */
export function useDesign({ model, imageHost, wide, beforeChange, undo, redo }: UseDesignOptions): {
  tab: RibbonTab;
  slideCommands: Pick<SlideCommands, 'changeLayout' | 'formatBackground' | 'resetSlides'>;
  overlay: ReactNode;
  masterView: ReactNode | null;
} {
  const toast = useToast();
  const content = model.state.content;
  const slideIds = model.state.selection.slideIds;
  const [background, setBackground] = useState<BackgroundTarget | null>(null);
  const [layoutDialog, setLayoutDialog] = useState(false);
  const [master, setMaster] = useState<MasterTarget | null>(null);

  const selectedIds = () => model.latest().selection.slideIds;
  const openMaster = () => {
    beforeChange();
    const s = model.latest();
    const slide = s.content.slides.find((x) => x.id === s.selection.slideId);
    const layout = slide && s.content.layouts.find((l) => l.id === slide.layoutId);
    // Opens on the layout of the current slide, as PowerPoint does.
    setMaster(layout ? { kind: 'layout', id: layout.id } : { kind: 'master', id: s.content.masters[0]?.id ?? '' });
  };
  const onTarget = useCallback((t: MasterTarget) => setMaster(t), []);
  const doResetSlides = () => {
    beforeChange();
    model.apply((c) => resetSlides(c, selectedIds()));
  };
  const doChangeLayout = (layoutId: string) => {
    beforeChange();
    model.apply((c) => changeLayout(c, selectedIds(), layoutId));
  };

  const tab: RibbonTab = {
    id: 'design',
    label: 'Design',
    content: (
      <DesignTab
        content={content}
        slideIds={slideIds}
        applyTheme={(t) => model.apply((c) => applyTheme(c, t))}
        applyColors={(colors) => model.apply((c) => applyThemeColors(c, colors))}
        applyFonts={(fonts) => model.apply((c) => applyThemeFonts(c, fonts))}
        setSize={(size) => {
          beforeChange();
          model.apply((c) => setSlideSize(c, size));
        }}
        openBackground={() => setBackground({ kind: 'slides' })}
        changeLayout={doChangeLayout}
        resetSlides={doResetSlides}
        openMaster={openMaster}
      />
    ),
  };

  // ── The background dialog, for the selected slides or for the master or a layout ─────────────────

  let dialog: ReactNode = null;
  if (background) {
    const close = () => {
      model.endGroup();
      setBackground(null);
    };
    const onError = (message: string) => toast(message, 'error');
    // A change while a colour is dragged in the system picker joins the previous one (one undo step).
    const group = (continuous?: boolean) => (continuous ? { group: `background:${background.kind}` } : {});
    if (background.kind === 'slides') {
      const slides = content.slides.filter((s) => slideIds.includes(s.id));
      const first = slides[0];
      if (first) {
        const numbers = slides.map((s) => content.slides.indexOf(s) + 1);
        dialog = (
          <BackgroundDialog
            open
            onClose={close}
            description={numbers.length === 1 ? `Slide ${numbers[0]}` : `${numbers.length} slides (${numbers.join(', ')})`}
            theme={content.theme}
            value={effectiveBackground(content, first)}
            onChange={(bg: Background, continuous) => model.apply((c) => setSlidesBackground(c, selectedIds(), bg), group(continuous))}
            onReset={slides.some((s) => s.background) ? () => model.apply((c) => setSlidesBackground(c, selectedIds(), undefined)) : undefined}
            resetLabel="Reset to the layout’s background"
            onApplyAll={() => model.apply((c) => applyBackgroundToAll(c, effectiveBackground(c, c.slides.find((s) => s.id === first.id) ?? first)))}
            imageHost={imageHost}
            onError={onError}
          />
        );
      }
    } else {
      const t = targetOf(content, background);
      if (t) {
        const masterOfT = background.kind === 'layout' ? content.masters.find((m) => m.id === (t as { masterId: string }).masterId) : t;
        const value: Background = t.background ?? masterOfT?.background ?? { type: 'solid', color: { theme: 'light1' } };
        dialog = (
          <BackgroundDialog
            open
            onClose={close}
            description={background.kind === 'master' ? 'Slide master (every layout without a background of its own)' : `“${t.name}” layout`}
            theme={content.theme}
            value={value}
            onChange={(bg, continuous) => model.apply((c) => setTargetBackground(c, background, bg), group(continuous))}
            onReset={background.kind === 'layout' && t.background ? () => model.apply((c) => setTargetBackground(c, background, undefined)) : undefined}
            resetLabel="Use the master’s background"
            imageHost={imageHost}
            onError={onError}
          />
        );
      }
    }
  }

  const overlay = (
    <>
      {dialog}
      {layoutDialog && (
        <LayoutDialog
          open
          onClose={() => setLayoutDialog(false)}
          content={content}
          slideIds={slideIds}
          onPick={(id) => {
            doChangeLayout(id);
            setLayoutDialog(false);
          }}
        />
      )}
    </>
  );

  return {
    tab,
    slideCommands: {
      changeLayout: () => setLayoutDialog(true),
      formatBackground: () => setBackground({ kind: 'slides' }),
      resetSlides: doResetSlides,
    },
    overlay,
    masterView: master ? (
      <MasterView
        model={model}
        imageHost={imageHost}
        wide={wide}
        target={master}
        onTarget={onTarget}
        onClose={() => setMaster(null)}
        undo={undo}
        redo={redo}
        openBackground={(t) => setBackground(t)}
      />
    ) : null,
  };
}
