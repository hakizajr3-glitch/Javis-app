export type ActionId = string;

export interface DesktopAction {
  id: ActionId;
  type: 'mouse_click' | 'mouse_move' | 'mouse_drag' | 'keyboard_type' | 'keyboard_press' | 'window_focus' | 'window_resize' | 'window_move' | 'window_close';
  parameters: Record<string, any>;
  timestamp: Date;
  executed: boolean;
  result?: any;
  error?: Error;
  approved: boolean;
  approvedBy?: string;
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface WindowInfo {
  id: string;
  title: string;
  processName: string;
  bounds: { x: number; y: number; width: number; height: number };
  focused: boolean;
}

export interface BrowserAction {
  id: ActionId;
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'select' | 'submit' | 'extract' | 'screenshot';
  url?: string;
  selector?: string;
  parameters: Record<string, any>;
  timestamp: Date;
  executed: boolean;
  result?: any;
  error?: Error;
  approved: boolean;
  approvedBy?: string;
}

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  actions: (DesktopAction | BrowserAction)[];
  createdAt: Date;
  createdBy: string;
  tags: string[];
}
