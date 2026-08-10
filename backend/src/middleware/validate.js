// Wraps a Zod schema into Express middleware. Usage:
//   router.post('/login', validate(loginSchema), asyncHandler(...))
// On success, req.body is REPLACED with the parsed/coerced result — so
// downstream handlers get back exactly the typed, defaulted shape the
// schema describes, not the raw untrusted body. On failure, responds 400
// with a flat list of field-level messages instead of the whole (verbose,
// implementation-detail-leaking) Zod error object.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  };
}
