import { crayonArt, type CSSVars } from '../lib/crayonArt'

type Doodle = {
  art: string
  x: number
  y: number
  w: number
  r?: number
}

// Positions are in reference-sheet units: a 175 wide margin on a 971 tall page.
const LEFT: Doodle[] = [
  { art: 'tape-blue-plaid', x: -8, y: -14, w: 118, r: 4 },
  { art: 'sparkle-blue', x: 126, y: 74, w: 30 },
  { art: 'paw', x: 26, y: 112, w: 124 },
  { art: 'heart-pink', x: 20, y: 268, w: 68 },
  { art: 'dot-purple', x: 128, y: 300, w: 9 },
  { art: 'sparkle-yellow', x: 120, y: 344, w: 30 },
  { art: 'dot-yellow', x: 92, y: 372, w: 8 },
  { art: 'star-outline', x: 24, y: 388, w: 64 },
  { art: 'dot-pink', x: 128, y: 432, w: 8 },
  { art: 'cloud-blue', x: 22, y: 466, w: 124 },
  { art: 'squiggle-pink', x: 22, y: 574, w: 26 },
  { art: 'sparkle-green', x: 126, y: 596, w: 32 },
  { art: 'bunny', x: 14, y: 626, w: 138 },
  { art: 'note-lilac', x: 32, y: 812, w: 44 },
  { art: 'tulip', x: 100, y: 812, w: 60 },
  { art: 'tape-pink-dots', x: 0, y: 880, w: 124, r: -6 },
]

const RIGHT: Doodle[] = [
  { art: 'tick-pink', x: 40, y: 38, w: 16, r: 10 },
  { art: 'sparkle-pink', x: 102, y: 44, w: 36 },
  { art: 'heart-red', x: 54, y: 102, w: 84 },
  { art: 'sparkle-gold', x: 116, y: 180, w: 36 },
  { art: 'squiggle-blue', x: 22, y: 212, w: 62 },
  { art: 'cloud-smile', x: 58, y: 280, w: 108 },
  { art: 'cherries', x: 34, y: 374, w: 72 },
  { art: 'dot-pink', x: 140, y: 404, w: 7 },
  { art: 'star-orange', x: 108, y: 454, w: 44 },
  { art: 'curl-blue', x: 28, y: 484, w: 46 },
  { art: 'sparkle-lilac', x: 134, y: 538, w: 26 },
  { art: 'lollipop', x: 22, y: 560, w: 138 },
  { art: 'sparkle-sky', x: 26, y: 700, w: 34 },
  { art: 'sparkle-lemon', x: 124, y: 724, w: 36 },
  { art: 'bear', x: 14, y: 774, w: 122 },
  { art: 'star-gold', x: 10, y: 878, w: 40 },
  { art: 'tape-purple-dots', x: 88, y: 866, w: 96, r: -4 },
]

function Margin({ side, doodles }: { side: 'left' | 'right'; doodles: Doodle[] }) {
  return (
    <div className={`crayon-margin crayon-margin-${side}`} aria-hidden="true">
      {doodles.map((doodle) => {
        const style: CSSVars = { '--x': doodle.x, '--y': doodle.y, '--w': doodle.w, '--r': `${doodle.r ?? 0}deg` }
        return <img key={`${doodle.art}-${doodle.y}`} src={crayonArt(doodle.art)} alt="" className="crayon-doodle" style={style} />
      })}
    </div>
  )
}

export function CrayonMargins() {
  return (
    <>
      <Margin side="left" doodles={LEFT} />
      <Margin side="right" doodles={RIGHT} />
    </>
  )
}
