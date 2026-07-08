/**
 * Every application use-case implements this single-method contract. Keeps
 * controllers thin: they build a request, call `execute`, and unwrap the Result.
 */
export interface IUsecaseExecute<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse> | TResponse;
}
