import { AppError } from '../../utils/errors.js';

export class CSVParseError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'CSV Parse Error', details);
  }
}

export class ImportError extends AppError {
  constructor(message, statusCode = 400, title = 'Import Error', details = null) {
    super(message, statusCode, title, details);
  }
}
