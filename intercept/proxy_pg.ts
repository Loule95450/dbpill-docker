import { createAdvancedProxy, IAdvancedProxySession } from 'pg-server';
import { Socket } from 'net';
import { DbRawCommand } from 'pg-server';
import { CommandCode, ResponseCode } from 'pg-server';

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

interface ParseBindExecute {
  parse: ParseCommand;
  bind: BindCommand;
  execute: ExecuteCommand;
}

class AdvancedPostgresProxySession implements IAdvancedProxySession {
  private state: 'idle' | 'expecting_bind' | 'expecting_execute' | 'executing' = 'idle';
  private currentParseBind: ParseBindExecute | null = null;
  private namedStatements: Map<string, string> = new Map();
  private explainState: 'idle' | 'executing_original' | 'executing_explain' = 'idle';
  private queryQueue: { query: string, params?: any[] }[] = [];
  private currentQuery: { query: string, params?: any[] } | null = null;
  private explainResults: Map<string, string> = new Map();

  onConnect(socket: Socket) {
    console.log('👤 Client connected, IP: ', socket.remoteAddress);
  }

  async onCommand({ command, getRawData }: DbRawCommand, { client, db }: any) {
    const typedCommand = this.parseCommand(command);
    await this.processCommand(typedCommand, client, db, getRawData);
  }

  async onResult(result: any, { client, db }: any) {
    switch (this.explainState) {
      case 'executing_original':
        client.command(result.response);

        if (result.response.type === ResponseCode.ReadyForQuery) {
          this.explainState = 'executing_explain';
          await this.executeExplainAnalyze(db);
        }
        break;

      case 'executing_explain':
        if (result.response.type === ResponseCode.DataRow) {
          this.captureExplainResult(result.response.fields);
        } else if (result.response.type === ResponseCode.ReadyForQuery) {
          this.explainState = 'idle';
          this.state = 'idle';
          await this.processNextQuery(db);
        }
        break;

      default:
        client.command(result.response);
    }
  }

  private async processCommand(command: Command, client: any, db: any, getRawData: () => Buffer) {
    switch (this.state) {
      case 'idle':
        if (command.type === CommandType.Parse) {
          this.state = 'expecting_bind';
          this.currentParseBind = { parse: command, bind: null!, execute: null! };
          if (command.queryName) {
            this.namedStatements.set(command.queryName, command.query);
          }
          db.sendRaw(getRawData());
        } else if (command.type === CommandType.Query) {
          await this.handleQuery(command.query, undefined, db);
        } else {
          db.sendRaw(getRawData());
        }
        break;

      case 'expecting_bind':
        if (command.type === CommandType.Bind) {
          if (this.currentParseBind) {
            this.currentParseBind.bind = command;
            this.state = 'expecting_execute';
          }
          db.sendRaw(getRawData());
        } else {
          console.log('Unexpected command while expecting Bind:', this.formatCommand(command));
          this.state = 'idle';
          db.sendRaw(getRawData());
        }
        break;

      case 'expecting_execute':
        if (command.type === CommandType.Execute) {
          if (this.currentParseBind) {
            this.currentParseBind.execute = command;
            await this.handleQuery(this.currentParseBind.parse.query, this.currentParseBind.bind.parameters, db);
            this.state = 'executing';
          }
        } else {
          console.log('Unexpected command while expecting Execute:', this.formatCommand(command));
          this.state = 'idle';
        }
        db.sendRaw(getRawData());
        break;

      case 'executing':
        if (command.type === CommandType.Sync) {
          this.state = 'idle';
        }
        db.sendRaw(getRawData());
        break;
    }
  }

  private async handleQuery(query: string, params: any[] | undefined, db: any) {
    this.queryQueue.push({ query, params });

    console.log('Intercepted Query:', query, params);

    if (this.explainState === 'idle') {
      await this.processNextQuery(db);
    }
  }

  private async processNextQuery(db: any) {
    if (this.queryQueue.length > 0) {
      this.currentQuery = this.queryQueue.shift()!;
      this.explainState = 'executing_original';
      if (this.currentQuery.params) {
        await db.send({ type: CommandCode.query, query: this.currentQuery.query, values: this.currentQuery.params });
      } else {
        await db.send({ type: CommandCode.query, query: this.currentQuery.query });
      }
    }
  }

  private async executeExplainAnalyze(db: any) {
    if (this.currentQuery) {
      const explainQuery = `EXPLAIN ANALYZE ${this.currentQuery.query}`;
      if (this.currentQuery.params) {
        await db.send({ type: CommandCode.query, query: explainQuery, values: this.currentQuery.params });
      } else {
        await db.send({ type: CommandCode.query, query: explainQuery });
      }
    }
  }

  private captureExplainResult(fields: (string | null)[]) {
    if (this.currentQuery) {
      const explainOutput = fields.map(field => field ?? '').join('\n');
      this.explainResults.set(this.currentQuery.query, explainOutput);
      console.log(`EXPLAIN ANALYZE for query "${this.currentQuery.query}":`);
      console.log(explainOutput);
    }
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

}

const server = createAdvancedProxy(
  { port: 5432, host: 'localhost' },
  AdvancedPostgresProxySession
);

server.listen(5433, 'localhost');
console.log('Advanced proxy listening on port 5433');