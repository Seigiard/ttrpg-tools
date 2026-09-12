export type ObservationScheduler = <Result>(operation: () => Promise<Result>) => Promise<Result>;

export function createObservationScheduler(): ObservationScheduler {
  let previousObservation = Promise.resolve();

  return <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = previousObservation.then(operation, operation);
    previousObservation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
