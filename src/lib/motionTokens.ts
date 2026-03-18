import type { Transition, Variants } from 'framer-motion'

export const LAYOUT_SPRING: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 0.8,
}

export const CARD_LAYOUT_SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.62,
}

export const CARD_HOVER_SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 28,
  mass: 0.55,
}

export const CARD_FLIP_SPRING: Transition = {
  type: 'spring',
  stiffness: 185,
  damping: 22,
  mass: 0.85,
}

export const SURFACE_ENTRY_SPRING: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 24,
  mass: 0.7,
}

export const BUTTON_TAP = { scale: 0.98, y: 0 }
export const BUTTON_HOVER = { scale: 1.015, y: -1 }

export const fadeUp = (distance = 10): Variants => ({
  hidden: { opacity: 0, y: distance, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SURFACE_ENTRY_SPRING,
  },
})

export const staggeredChildren = (stagger = 0.04, delayChildren = 0): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
})
