// Evita que o Node encerre por rejeição não tratada antes de alguém fazer await
export function inBackground(promise) {
  promise.catch(() => {});
  return promise;
}
