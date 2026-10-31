export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}
