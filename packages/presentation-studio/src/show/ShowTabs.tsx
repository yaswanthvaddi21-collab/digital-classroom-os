import { Input, Select } from '@dcos/ui';
import { ArrowDown, ArrowUp, EyeOff, MonitorPlay, Play, Presentation, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AnimationEffect, AnimationTrigger, Direction, PresentationContent, Slide, SlideElement, TransitionType } from '../types';
import { Group, ToolButton } from '../ui/parts';
import { ANIMATION_DELAY_RANGE, ANIMATION_DURATION_RANGE, animationPlace, applyTransitionToAll, moveAnimation, setAnimationEffect, setTransitions, TRANSITION_SPEEDS, transitionOfType, updateAnimations, type AnimationPatch } from './animationModel';
import { ANIMATION_NAMES, animationHasDirection, hasDirection, TRANSITION_NAMES, TRANSITION_TYPES } from './effects';
import { buildSteps, visibleSlides } from './sequence';

/** What the Transitions and Animations tabs work on, and how they change it (one undo step per change). */
export interface ShowTabContext {
  content: PresentationContent;
  slide: Slide | null;
  /** The slides selected in the slides panel (transitions apply to all of them). */
  slideIds: string[];
  /** The selected objects on the current slide (animations apply to all of them). */
  selected: SlideElement[];
  /** Changes the content; changes with the same group, one after another, are one undo step. */
  apply: (change: (c: PresentationContent) => PresentationContent, group?: string) => void;
  preview: (what: 'transition' | 'animations') => void;
  /** Transitions and animations play as cuts (the system asks for reduced motion). */
  reduced: boolean;
}

const ReducedNote = ({ what }: { what: string }) => <span className="shrink-0 px-1 text-xs text-muted">Reduced motion is on: {what} play as cuts.</span>;

/** "From right" etc.: a transition's direction is the way the new slide moves (types.ts). */
const TRANSITION_DIRECTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'left', label: 'From right' },
  { value: 'right', label: 'From left' },
  { value: 'up', label: 'From bottom' },
  { value: 'down', label: 'From top' },
];

/** An animation's direction is where the object comes from (types.ts). */
const ANIMATION_DIRECTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'left', label: 'From left' },
  { value: 'right', label: 'From right' },
  { value: 'up', label: 'From top' },
  { value: 'down', label: 'From bottom' },
];

const TRIGGERS: ReadonlyArray<{ value: AnimationTrigger; label: string }> = [
  { value: 'on-click', label: 'On click' },
  { value: 'with-previous', label: 'With previous' },
  { value: 'after-previous', label: 'After previous' },
];

const EFFECTS: AnimationEffect[] = ['appear', 'fade', 'fly-in', 'zoom', 'wipe'];

/** The one value every item shares, or undefined when they differ (or there are none). */
function common<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  const first = JSON.stringify(items[0]);
  return items.every((x) => JSON.stringify(x) === first) ? items[0] : undefined;
}

const seconds = (ms: number | undefined) => (ms === undefined ? '' : String(Math.round(ms) / 1000));

/** A number of seconds, typed freely; every valid number typed is applied at once. */
function SecondsField({ label, ms, disabled, range, onCommit }: { label: string; ms: number | undefined; disabled: boolean; range: { min: number; max: number }; onCommit: (ms: number) => void }) {
  const [text, setText] = useState(seconds(ms));
  useEffect(() => setText(seconds(ms)), [ms]);
  return (
    <label className="flex shrink-0 items-center gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={`${label} (seconds)`}
        min={range.min / 1000}
        max={range.max / 1000}
        step={0.1}
        value={text}
        placeholder={disabled ? '' : 'Mixed'}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n * 1000);
        }}
        onBlur={() => setText(seconds(ms))}
        className="h-8 w-[4.5rem] py-0 text-xs"
      />
      <span className="text-muted">s</span>
    </label>
  );
}

/**
 * The Transitions tab: how the selected slides come in during the slide show (the effect, its direction or orientation
 * and its speed), a preview on the canvas, and "Apply to all".
 */
export function TransitionsTab({ content, slide, slideIds, apply, preview, reduced }: ShowTabContext) {
  const targets = slideIds.length ? slideIds : slide ? [slide.id] : [];
  const slides = content.slides.filter((s) => targets.includes(s.id));
  const types = slides.map((s) => s.transition?.type ?? 'none');
  const type = common(types);
  const current = slide?.transition;
  const none = !slide;
  const set = (change: Parameters<typeof setTransitions>[2]) => apply((c) => setTransitions(c, targets, change));
  const speed = current?.duration;
  const speeds = speed !== undefined && !TRANSITION_SPEEDS.some((s) => s.ms === speed) ? [...TRANSITION_SPEEDS, { ms: speed, label: `${speed / 1000} s` }] : TRANSITION_SPEEDS;
  return (
    <>
      <Group label="Transition to this slide">
        {TRANSITION_TYPES.map((t: TransitionType) => (
          <ToolButton key={t} label={TRANSITION_NAMES[t]} text={TRANSITION_NAMES[t]} pressed={type === t} disabled={none} onClick={() => set((cur) => transitionOfType(t, cur))} />
        ))}
      </Group>
      {current && hasDirection(current.type) && (
        <Group label="Effect options">
          <Select aria-label="Direction" value={current.direction ?? 'left'} onChange={(e) => set((cur) => (cur && hasDirection(cur.type) ? { ...cur, direction: e.target.value as Direction } : (cur ?? null)))} className="h-8 w-32 py-0 text-xs">
            {TRANSITION_DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Group>
      )}
      {current?.type === 'split' && (
        <Group label="Effect options">
          <Select aria-label="Orientation" value={current.orientation ?? 'horizontal'} onChange={(e) => set((cur) => (cur?.type === 'split' ? { ...cur, orientation: e.target.value as 'horizontal' | 'vertical' } : (cur ?? null)))} className="h-8 w-32 py-0 text-xs">
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </Select>
        </Group>
      )}
      <Group label="Timing">
        <Select aria-label="Speed" value={speed === undefined ? '' : String(speed)} disabled={!current} onChange={(e) => set((cur) => (cur ? { ...cur, duration: Number(e.target.value) } : null))} className="h-8 w-36 py-0 text-xs">
          {speed === undefined && <option value="">Speed</option>}
          {speeds.map((s) => (
            <option key={s.ms} value={s.ms}>
              {s.label}
            </option>
          ))}
        </Select>
        <ToolButton label="Apply to all slides" text="Apply to all" disabled={none} onClick={() => apply((c) => applyTransitionToAll(c, current ?? null))}>
          <Sparkles size={16} />
        </ToolButton>
      </Group>
      <Group label="Preview">
        <ToolButton label="Preview the transition" text="Preview" disabled={!current} onClick={() => preview('transition')}>
          <Play size={16} />
        </ToolButton>
        {reduced && <ReducedNote what="transitions" />}
      </Group>
    </>
  );
}

/**
 * The Animations tab: the entrance effect of the selected objects, its direction, when it starts (on click, with or
 * after the previous one), its duration and delay, its place in the slide's sequence, and a preview on the canvas.
 */
export function AnimationsTab({ content, slide, selected, apply, preview, reduced }: ShowTabContext) {
  void content;
  const ids = selected.map((e) => e.id);
  const animated = selected.filter((e) => e.animation);
  const anims = animated.map((e) => e.animation!);
  const effect = selected.length && animated.length === selected.length ? common(anims.map((a) => a.effect)) : selected.length && !animated.length ? null : undefined;
  const nothing = !slide || !selected.length;
  const noAnimation = !slide || !animated.length;
  const sid = slide?.id ?? '';
  const update = (patch: AnimationPatch, group?: string) => apply((c) => updateAnimations(c, sid, animated.map((e) => e.id), patch), group);
  const withDirection = animated.length > 0 && anims.every((a) => animationHasDirection(a.effect));
  const direction = common(anims.map((a) => a.direction ?? 'down'));
  const trigger = common(anims.map((a) => a.trigger));
  const duration = common(anims.map((a) => a.duration));
  const delay = common(anims.map((a) => a.delay ?? 0));
  const allAppear = animated.length > 0 && anims.every((a) => a.effect === 'appear');
  const place = slide && animated.length === 1 && selected.length === 1 ? animationPlace(slide, animated[0].id) : null;
  const hasAny = !!slide && buildSteps(slide).length > 0;
  const groupKey = ids.join(',');

  return (
    <>
      <Group label="Animation">
        <ToolButton label="No animation" text="None" pressed={effect === null} disabled={nothing} onClick={() => apply((c) => setAnimationEffect(c, sid, ids, null))} />
        {EFFECTS.map((fx) => (
          <ToolButton key={fx} label={ANIMATION_NAMES[fx]} text={ANIMATION_NAMES[fx]} pressed={effect === fx} disabled={nothing} onClick={() => apply((c) => setAnimationEffect(c, sid, ids, fx))} />
        ))}
        {nothing && <span className="shrink-0 px-1 text-xs text-muted">Select an object on the slide to animate it.</span>}
      </Group>
      {withDirection && (
        <Group label="Effect options">
          <Select aria-label="Comes in" value={direction ?? ''} onChange={(e) => update({ direction: e.target.value as Direction })} className="h-8 w-32 py-0 text-xs">
            {direction === undefined && <option value="">Mixed</option>}
            {ANIMATION_DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Group>
      )}
      <Group label="Timing">
        <Select aria-label="Start" value={trigger ?? ''} disabled={noAnimation} onChange={(e) => update({ trigger: e.target.value as AnimationTrigger })} className="h-8 w-32 py-0 text-xs">
          {trigger === undefined && <option value="">{noAnimation ? 'Start' : 'Mixed'}</option>}
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <SecondsField label="Duration" ms={noAnimation ? undefined : duration} disabled={noAnimation || allAppear} range={ANIMATION_DURATION_RANGE} onCommit={(ms) => update({ duration: ms }, `anim-duration:${groupKey}`)} />
        <SecondsField label="Delay" ms={noAnimation ? undefined : delay} disabled={noAnimation} range={ANIMATION_DELAY_RANGE} onCommit={(ms) => update({ delay: ms }, `anim-delay:${groupKey}`)} />
      </Group>
      <Group label="Order">
        {place && <span className="shrink-0 px-1 text-xs tabular-nums text-muted">{`Animation ${place.index} of ${place.count}`}</span>}
        <ToolButton label="Move earlier" text="Earlier" disabled={!place || place.index === 1} onClick={() => place && apply((c) => moveAnimation(c, sid, animated[0].id, -1))}>
          <ArrowUp size={16} />
        </ToolButton>
        <ToolButton label="Move later" text="Later" disabled={!place || place.index === place.count} onClick={() => place && apply((c) => moveAnimation(c, sid, animated[0].id, 1))}>
          <ArrowDown size={16} />
        </ToolButton>
      </Group>
      <Group label="Preview">
        <ToolButton label="Preview the slide's animations" text="Preview" disabled={!hasAny} onClick={() => preview('animations')}>
          <Play size={16} />
        </ToolButton>
        {reduced && <ReducedNote what="animations" />}
      </Group>
    </>
  );
}

export interface SlideShowTabProps {
  content: PresentationContent;
  slide: Slide | null;
  slideIds: string[];
  start: (from: 'beginning' | 'current', presenter?: boolean) => void;
  /** Whether the presenter view opens in a second window (else it is shown on this screen). */
  presenterWindow: boolean;
  setHidden: (hidden: boolean) => void;
  reduced: boolean;
}

/** The Slide Show tab: start from the beginning or the current slide, the presenter view, and hiding slides. */
export function SlideShowTab({ content, slide, slideIds, start, presenterWindow, setHidden, reduced }: SlideShowTabProps) {
  const visible = visibleSlides(content).length > 0;
  const allHiddenTitle = 'Every slide is hidden. Show a slide first.';
  const selected = content.slides.filter((s) => slideIds.includes(s.id));
  const hidden = selected.length > 0 && selected.every((s) => s.hidden);
  return (
    <>
      <Group label="Start slide show">
        <ToolButton label="From beginning" shortcut="F5" text="From beginning" disabled={!visible} title={visible ? undefined : allHiddenTitle} onClick={() => start('beginning')}>
          <Play size={16} />
        </ToolButton>
        <ToolButton label="From current slide" shortcut="Shift+F5" text="From current slide" disabled={!visible || !slide} title={visible ? undefined : allHiddenTitle} onClick={() => start('current')}>
          <MonitorPlay size={16} />
        </ToolButton>
        <ToolButton
          label="Presenter view"
          shortcut="Alt+F5"
          text="Presenter view"
          disabled={!visible || !slide}
          title={!visible ? allHiddenTitle : presenterWindow ? 'Presenter view (Alt+F5): notes, timer and the next slide in a second window' : 'Presenter view (Alt+F5): notes, timer and the next slide on this screen'}
          onClick={() => start('current', true)}
        >
          <Presentation size={16} />
        </ToolButton>
      </Group>
      <Group label="Set up">
        <ToolButton label="Hide slide" text="Hide slide" pressed={hidden} disabled={!selected.length} onClick={() => setHidden(!hidden)}>
          <EyeOff size={16} />
        </ToolButton>
        {reduced && <ReducedNote what="transitions and animations" />}
      </Group>
    </>
  );
}
