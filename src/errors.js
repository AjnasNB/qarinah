export class QarinahError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "QarinahError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new QarinahError(code, message, details);
}
