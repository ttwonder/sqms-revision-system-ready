function isTransientFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|network|timeout|timed out|connection|\b50[234]\b/i.test(message)
}

export async function executeIdempotentCommand<T>(
  command: (operationId: string) => Promise<T>,
  createOperationId: () => string = () => crypto.randomUUID(),
): Promise<T> {
  const operationId = createOperationId()
  try {
    return await command(operationId)
  } catch (error) {
    if (!isTransientFailure(error)) throw error
    return command(operationId)
  }
}
