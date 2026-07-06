/**
 * Minimal ambient declarations for the Foundry VTT globals this module touches.
 * Deliberately loose (`any`): the engine keeps its own contract strictly typed
 * and treats the Foundry surface as a boundary, version-guarded in src/compat/.
 */

interface HooksLike {
  on(hook: string, fn: (...args: any[]) => unknown): number;
  once(hook: string, fn: (...args: any[]) => unknown): number;
  off(hook: string, id: number): void;
  callAll(hook: string, ...args: any[]): boolean;
  call(hook: string, ...args: any[]): boolean;
}

declare const Hooks: HooksLike;
declare const game: any;
declare const ui: any;
declare const canvas: any;
declare const CONFIG: any;
declare const foundry: any;
declare const Roll: any;
declare const ChatMessage: any;
declare const Actor: any;
declare const Item: any;
declare const ActiveEffect: any;
declare const Dialog: any;
