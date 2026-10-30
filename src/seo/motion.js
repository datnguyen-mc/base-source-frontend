import { createElement, forwardRef, useState } from 'react';
import { m as baseM, motion as baseMotion } from 'framer-motion';
import { rendersServerMarkup } from '@/seo/ssr';
// `framer-motion` as the app's own code sees it (vite-plugins/seo-plugin.js points its imports
// here). framer-motion writes `initial` into the HTML, so `initial={{ opacity: 0 }}` or
// `initial="hidden"` (with whileInView / animate) is content nobody sees until the script has
// run — a blank page for Postman, a crawler, a slow phone. Here every motion element rendered on
// the server, or hydrated from it, starts at its final state (`initial={false}`): the HTML shows
// the content. One mounted later — client-side navigation — keeps its `initial` and animates.
export * from 'framer-motion';

const visibleFirst = (Component) => {
  const VisibleFirst = forwardRef(function VisibleFirst(props, ref) {
    // Decided when the element mounts: framer-motion reads `initial` only then.
    const [serverMarkup] = useState(rendersServerMarkup);
    return createElement(Component, serverMarkup ? { ...props, initial: false, ref } : { ...props, ref });
  });
  VisibleFirst.displayName = `VisibleFirst(${Component?.displayName || Component?.name || 'motion'})`;
  return VisibleFirst;
};

// motion.div, motion.span… (one wrapper per tag, kept), motion.create(Component), motion(Component).
const visibleFactory = (factory) => {
  const tags = new Map();
  return new Proxy(factory, {
    get(target, key) {
      const value = target[key];
      if (key === 'create') return (...args) => visibleFirst(value(...args));
      if (typeof key !== 'string' || !value) return value;
      if (!tags.has(key)) tags.set(key, visibleFirst(value));
      return tags.get(key);
    },
    apply: (target, self, args) => visibleFirst(Reflect.apply(target, self, args)),
  });
};

export const motion = visibleFactory(baseMotion);
export const m = visibleFactory(baseM);
