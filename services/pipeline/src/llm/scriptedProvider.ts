import { LlmError, type CompletionRequest, type LlmErrorKind, type LlmProvider } from './types';

type Step = string | { error: LlmErrorKind } | ((request: CompletionRequest) => string);

/** Test double: replays a script of replies or errors, and records every request. */
export class ScriptedProvider implements LlmProvider {
  readonly requests: CompletionRequest[] = [];

  constructor(
    readonly name: string,
    private readonly steps: Step[],
    readonly minIntervalMs = 0,
  ) {}

  complete(request: CompletionRequest): Promise<string> {
    this.requests.push(request);
    const step = this.steps.length > 1 ? this.steps.shift() : this.steps[0];
    if (step === undefined) return Promise.reject(new Error(`${this.name}: script exhausted`));
    if (typeof step === 'function') return Promise.resolve(step(request));
    if (typeof step === 'object')
      return Promise.reject(new LlmError(`scripted ${step.error}`, step.error, this.name));
    return Promise.resolve(step);
  }
}
