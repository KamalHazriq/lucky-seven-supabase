import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface KingLockOverlayProps {
  locked: boolean
  size?: 'sm' | 'md' | 'lg'
  animateOnEnter?: boolean
  motionEnabled?: boolean
}

const LOCK_CARD_LAYOUT = {
  sm: {
    width: '80%',
    height: '76%',
    top: '-2%',
    left: '16%',
    rotate: -6,
    enterX: -4,
    enterY: -14,
    exitX: 4,
    exitY: -18,
    radius: '0.65rem',
    cornerRank: '0.56rem',
    cornerSuit: '0.38rem',
    center: '1rem',
    subtitle: '0.30rem',
  },
  md: {
    width: '80%',
    height: '76%',
    top: '-2%',
    left: '15%',
    rotate: -6.5,
    enterX: -5,
    enterY: -18,
    exitX: 5,
    exitY: -22,
    radius: '0.8rem',
    cornerRank: '0.66rem',
    cornerSuit: '0.42rem',
    center: '1.22rem',
    subtitle: '0.34rem',
  },
  lg: {
    width: '79%',
    height: '75%',
    top: '-2%',
    left: '14%',
    rotate: -7,
    enterX: -6,
    enterY: -22,
    exitX: 6,
    exitY: -26,
    radius: '0.9rem',
    cornerRank: '0.74rem',
    cornerSuit: '0.48rem',
    center: '1.4rem',
    subtitle: '0.38rem',
  },
} as const

function KingLockOverlay({
  locked,
  size = 'md',
  animateOnEnter = false,
  motionEnabled = true,
}: KingLockOverlayProps) {
  const layout = LOCK_CARD_LAYOUT[size]
  const baseShadow = '0 18px 34px var(--king-lock-shadow), 0 6px 16px color-mix(in srgb, var(--king-lock-shadow) 70%, transparent)'

  return (
    <AnimatePresence>
      {locked ? [
          <motion.div
            key="king-lock-trail"
            initial={animateOnEnter && motionEnabled
              ? { opacity: 0, x: layout.enterX * 0.45, y: layout.enterY * 0.45, rotate: layout.rotate - 4, scale: 0.9 }
              : false}
            animate={{
              opacity: 0.22,
              x: 0,
              y: 0,
              rotate: layout.rotate,
              scale: 1,
            }}
            exit={motionEnabled
              ? {
                  opacity: 0,
                  x: layout.exitX * 0.45,
                  y: 8,
                  rotate: layout.rotate - 2,
                  scale: 1.08,
                  transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
                }
              : { opacity: 0 }}
            className="pointer-events-none absolute z-[11]"
            style={{
              width: layout.width,
              height: layout.height,
              top: layout.top,
              left: layout.left,
              transformOrigin: '24% 84%',
            }}
            aria-hidden="true"
          >
            <div
              className="h-full w-full"
              style={{
                borderRadius: layout.radius,
                background: 'linear-gradient(160deg, var(--king-lock-trail) 0%, color-mix(in srgb, var(--king-lock-trail) 74%, transparent) 100%)',
                filter: 'blur(12px)',
              }}
            />
          </motion.div>,

          <motion.div
            key="king-lock"
            initial={animateOnEnter && motionEnabled
              ? { opacity: 0, x: layout.enterX, y: layout.enterY, rotate: layout.rotate - 5, scale: 0.9 }
              : false}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              rotate: layout.rotate,
              scale: 1,
            }}
            exit={motionEnabled
              ? {
                  opacity: 0,
                  x: layout.exitX,
                  y: layout.exitY,
                  rotate: layout.rotate - 4,
                  scale: 0.94,
                  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                }
              : { opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 360,
              damping: 26,
              mass: 0.72,
            }}
            className="pointer-events-none absolute z-[12]"
            style={{
              width: layout.width,
              height: layout.height,
              top: layout.top,
              left: layout.left,
              transformOrigin: '24% 84%',
            }}
            aria-hidden="true"
          >
            <div
              className="relative h-full w-full overflow-hidden bg-white"
              style={{
                borderRadius: layout.radius,
                border: '1px solid var(--king-lock-border)',
                boxShadow: baseShadow,
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(160deg, var(--king-lock-paper-start) 0%, var(--king-lock-paper-mid) 54%, var(--king-lock-paper-end) 100%)',
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(circle at 50% 34%, var(--king-lock-glow), transparent 68%)',
                }}
              />
              <div
                className="absolute inset-[3%] border"
                style={{
                  borderRadius: `calc(${layout.radius} - 1px)`,
                  borderColor: 'color-mix(in srgb, var(--king-lock-border) 35%, white)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              />
              <div
                className="absolute inset-x-[12%] top-[9%] h-px"
                style={{ background: 'linear-gradient(90deg, transparent, var(--king-lock-rule), transparent)' }}
              />
              <div
                className="absolute inset-x-[10%] bottom-[10%] h-px"
                style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--king-lock-rule) 75%, transparent), transparent)' }}
              />

              <div
                className="absolute left-[8%] top-[8%] flex flex-col items-center leading-none"
                style={{ color: 'var(--king-lock-ink)' }}
              >
                <span className="font-black italic" style={{ fontSize: layout.cornerRank }}>
                  K
                </span>
                <span style={{ fontSize: layout.cornerSuit, marginTop: '-1px' }}>♠</span>
              </div>

              <div
                className="absolute right-[8%] bottom-[8%] flex rotate-180 flex-col items-center leading-none"
                style={{ color: 'var(--king-lock-ink)' }}
              >
                <span className="font-black italic" style={{ fontSize: layout.cornerRank }}>
                  K
                </span>
                <span style={{ fontSize: layout.cornerSuit, marginTop: '-1px' }}>♠</span>
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="flex h-[40%] w-[42%] items-center justify-center rounded-[38%] border"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--king-lock-crown) 24%, transparent)',
                    background: 'radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--king-lock-crown) 22%, white) 0%, color-mix(in srgb, var(--king-lock-glow) 85%, transparent) 38%, rgba(255,255,255,0) 72%)',
                  }}
                >
                  <span
                    className="leading-none"
                    style={{
                      color: 'var(--king-lock-crown)',
                      fontSize: layout.center,
                      textShadow: '0 1px 0 rgba(255,255,255,0.7)',
                    }}
                  >
                    ♚
                  </span>
                </div>
                <span
                  className="mt-1 font-semibold uppercase"
                  style={{
                    color: 'color-mix(in srgb, var(--king-lock-ink) 60%, transparent)',
                    fontSize: layout.subtitle,
                    letterSpacing: '0.24em',
                  }}
                >
                  King
                </span>
              </div>
            </div>
          </motion.div>
        ] : null}
    </AnimatePresence>
  )
}

export default memo(KingLockOverlay)
