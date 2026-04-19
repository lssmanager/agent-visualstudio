export interface CommandSpec {
  id: string;
  name: string;
  description: string;
  steps: string[];
  tags?: string[];
}
