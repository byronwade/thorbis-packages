import { Command } from 'commander';

type CommandOptions = {
  name: string;
  description: string;
  handler: () => void;
};

export class CLI {
  private program: Command;
  private commands: Map<string, CommandOptions>;

  constructor(options: { name: string; version: string }) {
    this.program = new Command();
    this.program.name(options.name).version(options.version);
    this.commands = new Map();
  }

  command(name: string, description: string, handler: () => void) {
    this.commands.set(name, { name, description, handler });
    this.program.command(name).description(description).action(handler);
    return this;
  }

  start() {
    this.program.parse(process.argv);
  }

  private showHelp() {
    this.program.help();
  }
}
