import { createAdvancedProxy, IAdvancedProxySession } from 'pg-server';
import { Socket } from 'net';

enum CommandType {
  Startup = 0,
  Query = 81,
  Parse = 80,
  Bind = 66,
  Describe = 68,
  Execute = 69,
  Sync = 83,
  Terminate = 88,
}

interface BaseCommand {
  type: CommandType;
}

interface StartupCommand extends BaseCommand {
  type: CommandType.Startup;
  version: { major: number; minor: number };
  options: { [key: string]: string };
}

interface QueryCommand extends BaseCommand {
  type: CommandType.Query;
  query: string;
}

interface ParseCommand extends BaseCommand {
  type: CommandType.Parse;
  query: string;
  queryName: string;
}

interface BindCommand extends BaseCommand {
  type: CommandType.Bind;
  portal: string;
  statement: string;
  parameters: any[];
}

interface DescribeCommand extends BaseCommand {
  type: CommandType.Describe;
  portalType: string;
  name?: string;
}

interface ExecuteCommand extends BaseCommand {
  type: CommandType.Execute;
  portal: string;
  rows: number;
}

interface SyncCommand extends BaseCommand {
  type: CommandType.Sync;
}

interface TerminateCommand extends BaseCommand {
  type: CommandType.Terminate;
}

type Command = StartupCommand | QueryCommand | ParseCommand | BindCommand | 
                DescribeCommand | ExecuteCommand | SyncCommand | TerminateCommand;

interface ParseBindPair {
  parse: ParseCommand;
  bind: BindCommand | null;
}

class PostgresProxySession implements IAdvancedProxySession {
  private state: 'idle' | 'expecting_bind' = 'idle';
  private currentParseBind: ParseBindPair | null = null;
  private namedStatements: Map<string, string> = new Map();

  onConnect(socket: Socket) {
    console.log('👤 Client connected, IP: ', socket.remoteAddress);
  }

  async onCommand({ command, getRawData }: { command: any; getRawData: () => Buffer }, { client, db }: any) {
    const typedCommand = this.parseCommand(command);
    this.processCommand(typedCommand);
    db.sendRaw(getRawData());
  }

  onQuery(query: string) {
    console.log('Intercepted Query (Fallback):', query);
    return query;
  }

  private formatCommand(command: Command): string {
    switch (command.type) {
      case CommandType.Startup:
        return `Startup: version ${command.version.major}.${command.version.minor}, options: ${JSON.stringify(command.options)}`;
      case CommandType.Query:
        return `Query: ${command.query}`;
      case CommandType.Parse:
        return `Parse: ${command.query} (name: "${command.queryName}")`;
      case CommandType.Bind:
        return `Bind: portal "${command.portal}", statement "${command.statement}", ${command.parameters.length} parameters`;
      case CommandType.Describe:
        return `Describe: ${command.portalType}${command.name ? ` "${command.name}"` : ''}`;
      case CommandType.Execute:
        return `Execute: portal "${command.portal}", ${command.rows} rows`;
      case CommandType.Sync:
        return 'Sync';
      case CommandType.Terminate:
        return 'Terminate';
    }
  }

  private parseCommand(command: any): Command {
    switch (command.type) {
      case CommandType.Startup:
      case CommandType.Query:
      case CommandType.Describe:
      case CommandType.Execute:
        return command as StartupCommand | QueryCommand | DescribeCommand | ExecuteCommand;
      case CommandType.Parse:
        return {
          type: CommandType.Parse,
          query: command.query,
          queryName: command.queryName
        };
      case CommandType.Bind:
        return {
          type: CommandType.Bind,
          portal: command.portal,
          statement: command.statement,
          parameters: command.values
        };
      case CommandType.Sync:
        return { type: CommandType.Sync };
      case CommandType.Terminate:
        return { type: CommandType.Terminate };
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  private processCommand(command: Command) {
    switch (this.state) {
      case 'idle':
        if (command.type === CommandType.Parse) {
          this.state = 'expecting_bind';
          this.currentParseBind = { parse: command, bind: null };
          if (command.queryName) {
            this.namedStatements.set(command.queryName, command.query);
          }
        } else if (command.type === CommandType.Bind) {
          console.log('Bind (reusing prepared statement):', this.formatBind(command));
        } else {
          console.log('Intercepted Command:', this.formatCommand(command));
        }
        break;
      case 'expecting_bind':
        if (command.type === CommandType.Bind) {
          if (this.currentParseBind) {
            this.currentParseBind.bind = command;
            console.log('Completed Parse + Bind:', this.formatParseBind(this.currentParseBind));
            this.currentParseBind = null;
          }
          this.state = 'idle';
        } else {
          console.log('Unexpected command while expecting Bind:', this.formatCommand(command));
          this.state = 'idle';
        }
        break;
    }
  }

  private formatBind(bind: BindCommand): string {
    const preparedQuery = this.namedStatements.get(bind.statement) || 'Unknown query';
    return `Bind: portal "${bind.portal}", statement "${bind.statement}" (${preparedQuery}), ${bind.parameters.length} parameters`;
  }

  private formatParseBind(parseBind: ParseBindPair): string {
    const queryName = parseBind.parse.queryName ? ` (name: "${parseBind.parse.queryName}")` : '';
    return `Parse: ${parseBind.parse.query}${queryName} + ` +
           `Bind: ${parseBind.bind ? `${parseBind.bind.parameters.length} parameters` : 'No parameters'}`;
  }

  private processQuery(query: string, params?: any[]) {
    console.log('Query:', query);
    if (params) {
      console.log('Parameters:', params);
    }
  }
}

const server = createAdvancedProxy(
  { port: 5432, host: 'localhost' },
  PostgresProxySession
);

server.listen(5433, 'localhost');
console.log('Advanced proxy listening on port 5433');