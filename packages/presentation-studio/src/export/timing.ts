/**
 * Slide transitions (<p:transition>) and object animations (<p:timing>) for the PPTX. PptxGenJS writes neither, so
 * pptxPost.ts inserts them after <p:clrMapOvr>, the order ECMA-376 CT_Slide requires (cSld, clrMapOvr, transition,
 * timing, extLst). Only the base PresentationML namespace is used (no p14/mc extensions), so every reader that knows
 * PPTX transitions can read them. Pure.
 */
import { buildSteps } from '../show/sequence';
import type { Animation, Direction, Slide, Transition } from '../types';

/** OOXML has three speeds; a duration is written as the nearest one (fast 0.5 s, medium 0.75 s, slow 1 s). */
export function transitionSpeed(ms: number): 'fast' | 'med' | 'slow' {
  if (!(ms > 0) || ms <= 600) return 'fast';
  if (ms <= 875) return 'med';
  return 'slow';
}

const SIDE: Record<Direction, string> = { left: 'l', right: 'r', up: 'u', down: 'd' };

/** The <p:transition> for a slide, or '' for none. */
export function transitionXml(t: Transition | undefined): string {
  if (!t || t.type === 'none') return '';
  const dir = SIDE[t.direction ?? 'left'] ?? 'l';
  let effect: string;
  switch (t.type) {
    case 'fade':
      effect = '<p:fade/>';
      break;
    case 'push':
      effect = `<p:push dir="${dir}"/>`;
      break;
    case 'wipe':
      effect = `<p:wipe dir="${dir}"/>`;
      break;
    case 'cover':
      effect = `<p:cover dir="${dir}"/>`;
      break;
    case 'split':
      effect = `<p:split orient="${t.orientation === 'vertical' ? 'vert' : 'horz'}" dir="out"/>`;
      break;
    case 'zoom':
      effect = '<p:zoom dir="in"/>';
      break;
    default:
      return '';
  }
  return `<p:transition spd="${transitionSpeed(t.duration)}">${effect}</p:transition>`;
}

/** One effect of a build step, aimed at a shape id (p:cNvPr id). `start` is ms after the step begins. */
export interface TimedEffect {
  spid: number;
  animation: Animation;
  start: number;
  /** p:sp with text (gets a p:bldP entry); pictures and graphic frames do not. */
  textShape: boolean;
}

/** The effects one click plays, or (`auto`) that play as the slide comes in. */
export interface TimedStep {
  auto: boolean;
  effects: TimedEffect[];
}

/**
 * A slide's build steps with each effect's start time, as the app's slide show plays them (show/sequence.ts
 * buildSteps: "on click" starts a step, "with previous" starts with the animation before it, "after previous" when
 * it has finished, delays count from then). `target` gives the shape id of an element, or null to leave it out.
 */
export function timedSteps(slide: Slide, target: (elementId: string) => { spid: number; textShape: boolean } | null): TimedStep[] {
  return buildSteps(slide)
    .map((step) => ({
      auto: step.auto,
      effects: step.effects.flatMap((e) => {
        const t = target(e.elementId);
        return t ? [{ spid: t.spid, textShape: t.textShape, animation: e.animation, start: Math.max(0, Math.round(e.start)) }] : [];
      }),
    }))
    .filter((s) => s.effects.length);
}

/** PowerPoint preset ids and subtypes of the entrance effects the app offers. */
const PRESET: Record<Animation['effect'], number> = { appear: 1, 'fly-in': 2, fade: 10, wipe: 22, zoom: 53 };
/** Subtype of fly-in and wipe: where the object comes from (1 top, 2 right, 4 bottom, 8 left). */
const FROM: Record<Direction, number> = { up: 1, right: 2, down: 4, left: 8 };
/** The wipe filter for an object revealed from a side ("wipe(down)" = from the top). */
const WIPE: Record<Direction, string> = { up: 'down', right: 'left', down: 'up', left: 'right' };

const ms = (v: number | undefined) => Math.max(0, Math.round(Number.isFinite(v) ? (v as number) : 0));

/**
 * The effect's behaviours (inside its effect cTn). `next` hands out cTn ids. Every effect first makes the object
 * visible (p:set style.visibility), then animates it.
 */
function behaviours(s: TimedEffect, next: () => number): string {
  const a = s.animation;
  const dur = Math.max(1, ms(a.duration));
  const tgt = `<p:tgtEl><p:spTgt spid="${s.spid}"/></p:tgtEl>`;
  const set = `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const anim = (attr: string, from: string, to: string) =>
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${next()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const effect = (filter: string) => `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${next()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`;
  switch (a.effect) {
    case 'appear':
      return set;
    case 'fade':
      return set + effect('fade');
    case 'wipe':
      return set + effect(`wipe(${WIPE[a.direction ?? 'down'] ?? 'up'})`);
    case 'zoom':
      return set + anim('ppt_w', '0', '#ppt_w') + anim('ppt_h', '0', '#ppt_h') + effect('fade');
    case 'fly-in': {
      const from = a.direction ?? 'down';
      const x = from === 'left' ? '0-#ppt_w/2' : from === 'right' ? '1+#ppt_w/2' : '#ppt_x';
      const y = from === 'up' ? '0-#ppt_h/2' : from === 'down' ? '1+#ppt_h/2' : '#ppt_y';
      return set + anim('ppt_x', x, '#ppt_x') + anim('ppt_y', y, '#ppt_y');
    }
  }
}

const subtype = (a: Animation) => (a.effect === 'fly-in' || a.effect === 'wipe' ? FROM[a.direction ?? 'down'] ?? 4 : a.effect === 'zoom' ? 16 : 0);

/**
 * The <p:timing> for a slide's build steps, or '' for none: one click group per step (an automatic first step starts
 * with the slide), inside it one group per start time (its delay), inside that the effects. Node types follow the
 * triggers (click, with previous, after previous), as PowerPoint writes them.
 */
export function timingXml(steps: TimedStep[]): string {
  const list = steps.filter((s) => s.effects.some((e) => PRESET[e.animation.effect] !== undefined));
  if (!list.length) return '';
  let id = 2;
  const next = () => ++id;
  let groupXml = '';
  list.forEach((step, si) => {
    const gid = next();
    const effects = step.effects.filter((e) => PRESET[e.animation.effect] !== undefined);
    const starts = [...new Set(effects.map((e) => e.start))].sort((a, b) => a - b);
    let seqXml = '';
    for (const start of starts) {
      const sid = next();
      let fx = '';
      for (const e of effects.filter((x) => x.start === start)) {
        const a = e.animation;
        const first = e === effects[0];
        const nodeType = first && !(si === 0 && step.auto) ? 'clickEffect' : a.trigger === 'after-previous' ? 'afterEffect' : 'withEffect';
        const eid = next();
        fx += `<p:par><p:cTn id="${eid}" presetID="${PRESET[a.effect]}" presetClass="entr" presetSubtype="${subtype(a)}" fill="hold"${e.textShape ? ' grpId="0"' : ''} nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${behaviours(e, next)}</p:childTnLst></p:cTn></p:par>`;
      }
      seqXml += `<p:par><p:cTn id="${sid}" fill="hold"><p:stCondLst><p:cond delay="${start}"/></p:stCondLst><p:childTnLst>${fx}</p:childTnLst></p:cTn></p:par>`;
    }
    const begin = si === 0 && step.auto ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
    groupXml += `<p:par><p:cTn id="${gid}" fill="hold"><p:stCondLst>${begin}</p:stCondLst><p:childTnLst>${seqXml}</p:childTnLst></p:cTn></p:par>`;
  });
  const builds = [...new Set(list.flatMap((s) => s.effects.filter((e) => e.textShape).map((e) => e.spid)))].map((spid) => `<p:bldP spid="${spid}" grpId="0" animBg="1"/>`).join('');
  return (
    '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groupXml}</p:childTnLst></p:cTn>` +
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>' +
    `</p:childTnLst></p:cTn></p:par></p:tnLst>${builds ? `<p:bldLst>${builds}</p:bldLst>` : ''}</p:timing>`
  );
}
