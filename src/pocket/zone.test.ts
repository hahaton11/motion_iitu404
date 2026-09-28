import { describe, expect, it } from 'vitest'
import { fanHit, fanLayout, fanRegionTop, pocketTopPx } from './fan'
import {
  CLOSE_GRACE_MS,
  HINT_COOLDOWN_MS,
  HOVER_MIN_MS,
  NEAR_MS,
  OPEN_DWELL_MS,
  STUCK_MS,
  hintAllowed,
  inPocket,
  initialZone,
  nearPocket,
  pickCard,
  stepZone,
  type HandZone,
  type ZoneEvent,
  type ZoneInput,
} from './zone'

const ctx = { fanTop: 0.55 }
const vp = { w: 1280, h: 800 }

interface CursorOpts {
  readonly closure?: number
  readonly carrying?: boolean
  readonly fist?: boolean
}

const cur = (x: number, y: number, t: number, o: CursorOpts = {}): ZoneInput => ({
  type: 'cursor',
  x,
  y,
  t,
  closure: o.closure ?? 0,
  carrying: o.carrying ?? false,
  fist: o.fist ?? false,
})

/** Прогоняет входы и собирает все события. */
function run(inputs: readonly ZoneInput[], start: HandZone = initialZone()) {
  return inputs.reduce<{ zone: HandZone; events: ZoneEvent[] }>(
    (acc, input) => {
      const r = stepZone(acc.zone, input, ctx)
      return { zone: r.zone, events: [...acc.events, ...r.events] }
    },
    { zone: start, events: [] },
  )
}

const types = (events: readonly ZoneEvent[]) => events.map((e) => (e.type === 'hint' ? `hint:${e.key}` : e.type))

describe('zone hit tests', () => {
  it('pocket is the bottom strip, near band is right above it', () => {
    expect(inPocket(0.95)).toBe(true)
    expect(inPocket(0.8)).toBe(false)
    expect(nearPocket(0.83)).toBe(true)
    expect(nearPocket(0.95)).toBe(false)
    expect(nearPocket(0.5)).toBe(false)
  })
})

describe('open timer', () => {
  it('opens after the empty hand dwells over the pocket', () => {
    const r = run([cur(0.5, 0.95, 0), { type: 'tick', t: OPEN_DWELL_MS - 1 }, { type: 'tick', t: OPEN_DWELL_MS }])
    expect(types(r.events)).toEqual(['open'])
    expect(r.zone.phase).toBe('open')
  })

  it('does not open for a fist or a carrying hand', () => {
    expect(run([cur(0.5, 0.95, 0, { fist: true }), { type: 'tick', t: 1000 }]).zone.phase).toBe('idle')
    expect(run([cur(0.5, 0.95, 0, { carrying: true }), { type: 'tick', t: 1000 }]).zone.phase).toBe('idle')
  })

  it('hints when the hand leaves too early, but not for a quick pass', () => {
    const early = run([cur(0.5, 0.95, 0), cur(0.5, 0.6, HOVER_MIN_MS + 50)])
    expect(types(early.events)).toEqual(['hint:HOVER_SHORT'])
    const pass = run([cur(0.5, 0.95, 0), cur(0.5, 0.6, HOVER_MIN_MS - 50)])
    expect(pass.events).toEqual([])
  })

  it('stays open inside the fan region and closes after leaving it', () => {
    const open = run([cur(0.5, 0.95, 0), { type: 'tick', t: OPEN_DWELL_MS }]).zone
    expect(run([cur(0.5, 0.7, 500), { type: 'tick', t: 2000 }], open).zone.phase).toBe('open')
    const left = run([cur(0.5, 0.3, 500), { type: 'tick', t: 500 + CLOSE_GRACE_MS }], open)
    expect(types(left.events)).toEqual(['close'])
  })

  it('coming back before the grace keeps the fan open', () => {
    const open = run([cur(0.5, 0.95, 0), { type: 'tick', t: OPEN_DWELL_MS }]).zone
    const r = run([cur(0.5, 0.3, 500), cur(0.5, 0.8, 600), { type: 'tick', t: 2000 }], open)
    expect(r.zone.phase).toBe('open')
  })

  it('closes when the hand starts carrying or is lost', () => {
    const open = run([cur(0.5, 0.95, 0), { type: 'tick', t: OPEN_DWELL_MS }]).zone
    expect(types(run([cur(0.5, 0.8, 500, { carrying: true })], open).events)).toEqual(['close'])
    expect(types(run([{ type: 'lost' }], open).events)).toEqual(['close'])
  })
})

describe('swipe', () => {
  const open = () => run([cur(0.5, 0.95, 0), { type: 'tick', t: OPEN_DWELL_MS }]).zone

  it('fast leftward move scrolls forward, rightward scrolls back', () => {
    const left = run([cur(0.6, 0.8, 1000), cur(0.52, 0.8, 1080), cur(0.44, 0.8, 1160)], open())
    expect(left.events).toEqual([{ type: 'scroll', delta: 3 }])
    const right = run([cur(0.4, 0.8, 1000), cur(0.56, 0.8, 1150)], open())
    expect(right.events).toEqual([{ type: 'scroll', delta: -3 }])
  })

  it('slow movement and a closed hand do not scroll', () => {
    expect(run([cur(0.6, 0.8, 1000), cur(0.44, 0.8, 2000)], open()).events).toEqual([])
    expect(run([cur(0.6, 0.8, 1000, { closure: 0.8 }), cur(0.4, 0.8, 1100, { closure: 0.8 })], open()).events).toEqual([])
  })
})

describe('carry hints', () => {
  it('hints to move lower after holding in the near band', () => {
    const r = run([cur(0.5, 0.83, 0, { carrying: true }), { type: 'tick', t: NEAR_MS }, { type: 'tick', t: NEAR_MS * 3 }])
    expect(types(r.events)).toEqual(['hint:NEAR'])
  })

  it('entering the pocket cancels the near hint', () => {
    const r = run([cur(0.5, 0.83, 0, { carrying: true }), cur(0.5, 0.95, 100, { carrying: true }), { type: 'tick', t: 5000 }])
    expect(r.events).toEqual([])
  })

  it('hints to open fingers when closure is stuck in the middle over the pocket', () => {
    const stuck = { carrying: true, closure: 0.6 }
    const r = run([cur(0.5, 0.95, 0, stuck), cur(0.5, 0.95, STUCK_MS, stuck)])
    expect(types(r.events)).toEqual(['hint:STUCK'])
  })

  it('full fist over the pocket is not stuck', () => {
    const r = run([cur(0.5, 0.95, 0, { carrying: true, closure: 1 }), { type: 'tick', t: 5000 }])
    expect(r.events).toEqual([])
  })
})

describe('hint cooldown', () => {
  it('allows the first hint and throttles repeats', () => {
    expect(hintAllowed({}, 'A', 0)).toBe(true)
    expect(hintAllowed({ A: 0 }, 'A', HINT_COOLDOWN_MS - 1)).toBe(false)
    expect(hintAllowed({ A: 0 }, 'A', HINT_COOLDOWN_MS)).toBe(true)
  })
})

describe('fan layout', () => {
  it('lays cards above the pocket with the middle one highest', () => {
    const slots = fanLayout(7, vp)
    expect(slots).toHaveLength(7)
    slots.forEach((s) => expect(s.cy + s.size / 2).toBeLessThanOrEqual(pocketTopPx(vp) + s.size))
    const mid = slots[3]
    const edge = slots[0]
    expect(mid && edge && mid.cy < edge.cy).toBe(true)
    expect(mid?.rotation).toBe(0)
    expect(edge && edge.rotation < 0).toBe(true)
  })

  it('fits a narrow screen', () => {
    const narrow = { w: 480, h: 800 }
    const slots = fanLayout(7, narrow)
    const first = slots[0]
    const last = slots[6]
    expect(first && first.cx - first.size / 2).toBeGreaterThan(-first!.size / 2)
    expect(last && last.cx).toBeLessThan(narrow.w)
  })

  it('empty fan has no slots and region top at the pocket', () => {
    expect(fanLayout(0, vp)).toEqual([])
    expect(fanRegionTop([], vp)).toBeCloseTo(0.88)
  })

  it('region top is above the highest card', () => {
    const slots = fanLayout(5, vp)
    const top = Math.min(...slots.map((s) => s.cy - s.size / 2)) / vp.h
    expect(fanRegionTop(slots, vp)).toBeLessThan(top)
  })

  it('hits the card under the point and nothing in empty space', () => {
    const slots = fanLayout(3, vp)
    const s1 = slots[1]!
    expect(fanHit(slots, s1.cx + 5, s1.cy - 5)).toBe(1)
    expect(fanHit(slots, 10, 10)).toBeUndefined()
    expect(pickCard(slots, s1.cx / vp.w, s1.cy / vp.h, vp)).toBe(1)
  })
})
