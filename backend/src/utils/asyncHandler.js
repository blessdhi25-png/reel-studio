// Express 4 does not automatically catch a rejected promise thrown inside an
// `async (req, res) => {...}` route handler — that only happens in Express 5.
// On Express 4, an unhandled rejection in a route just hangs the connection
// forever: no response is ever sent, and the client-side fetch never
// resolves or rejects. This is what was producing the profile page's
// "infinite skeleton" state — any Prisma error inside GET /users/:id (a bad
// id format, a transient DB hiccup, anything) silently killed the request
// with no way for the frontend to recover, no matter how good its own
// loading/error handling was.
//
// Wrapping a route handler in asyncHandler(...) guarantees any thrown error
// or rejected promise is passed to next(err), so the global error-handling
// middleware in server.js actually runs and sends a real response.
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
