export class HumanizerError extends Error {
  code: string;
  details?: string;

  constructor(message: string, code: string, details?: string) {
    super(message);
    this.name = "HumanizerError";
    this.code = code;
    this.details = details;
  }
}
