declare module "json-logic-js" {
  export function apply(logic: unknown, data?: unknown): unknown;
  export function add_operation(name: string, fn: (...args: unknown[]) => unknown): void;
}
