import { ValidationError } from '../utils/errors.js';

/**
 * Express middleware to validate request structures against Zod schemas.
 * Re-binds validated and parsed data onto req.body/req.query/req.params.
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 */
export function validate(schema) {
  return (req, res, next) => {
    const dataToValidate = {
      body: req.body,
      query: req.query,
      params: req.params
    };

    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => {
        // Construct clean path without 'body.', 'query.', or 'params.' prefix
        const cleanPath = err.path
          .slice(1)
          .join('.');
        
        return {
          field: cleanPath || err.path[0],
          message: err.message
        };
      });

      return next(new ValidationError('Request validation failed.', formattedErrors));
    }

    // Set normalized and validated properties back onto request
    req.body = result.data.body || req.body;
    req.query = result.data.query || req.query;
    req.params = result.data.params || req.params;

    return next();
  };
}

export default validate;
