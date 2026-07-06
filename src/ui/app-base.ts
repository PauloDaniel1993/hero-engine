/**
 * Minimal ApplicationV2 wrapper: string-rendered content with a bind step.
 * Classes are created lazily so `foundry` globals exist at definition time.
 */

export interface HeAppSpec {
  id: string;
  title: string;
  width?: number;
  render(): string;
  bind(root: HTMLElement, app: any): void;
}

export function createApp(spec: HeAppSpec): any {
  const Base = foundry.applications.api.ApplicationV2;
  class HeApp extends Base {
    static DEFAULT_OPTIONS = {
      id: spec.id,
      window: { title: spec.title, resizable: true },
      position: { width: spec.width ?? 560, height: "auto" },
    };
    protected async _renderHTML(): Promise<string> {
      return spec.render();
    }
    protected _replaceHTML(result: string, content: HTMLElement): void {
      content.innerHTML = result;
      spec.bind(content, this);
    }
  }
  return new HeApp();
}
