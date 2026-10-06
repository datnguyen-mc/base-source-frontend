// The admin console is never indexed.
export default [
  { path: '/admin', noindex: true },
  { path: '/admin/*', noindex: true },
];
