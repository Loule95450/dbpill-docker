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
}


class AdvancedPostgresProxySession implements IAdvancedProxySession {
    private queryStack: Array<{query: string, params: any[]}> = [];
    private isExplaining: boolean = false;
    private explainStack: Array<{query: string, params: any[]}> = [];
  
    onConnect(socket: Socket) {
      console.log('👤 Client connected, IP: ', socket.remoteAddress);
    }
  
    async onCommand({ command, getRawData }: DbRawCommand, { client, db }: any) {
      const typedCommand = this.parseCommand(command);
      await this.processCommand(typedCommand, client, db, getRawData);
    }
  
    async onResult(result: any, { client, db }: any) {
      if (this.isExplaining) {
        if (result.response.type === ResponseCode.DataRow) {
          this.captureExplainResult(result.response.fields);
        } else if (result.response.type === ResponseCode.ReadyForQuery) {
          this.isExplaining = false;
          console.log('EXPLAIN ANALYZE completed');
          if (this.explainStack.length > 0) {
            await this.executeNextExplain(db);
          }
        }
      } else {
        client.command(result.response);
  
        if (result.response.type === ResponseCode.ReadyForQuery) {
          if (this.queryStack.length > 0) {
            const query = this.queryStack.pop();
            if (query) {
              this.explainStack.push(query);
              if (!this.isExplaining) {
                await this.executeNextExplain(db);
              }
            }
          }
        }
      }
    }
  
    private async processCommand(command: Command, client: any, db: any, getRawData: () => Buffer) {
      console.log('Processing command:', JSON.stringify(command, null, 2));
  
      switch (command.type) {
        case CommandType.Query:
          this.queryStack.push({query: command.query, params: []});
          break;
        case CommandType.Parse:
          this.queryStack.push({query: command.query, params: []});
          break;
        case CommandType.Bind:
          if (this.queryStack.length > 0) {
            const lastQuery = this.queryStack[this.queryStack.length - 1];
            lastQuery.params = command.parameters;
          }
          break;
        case CommandType.Execute:
          // The query will be executed now
          break;
      }
  
      db.sendRaw(getRawData());
    }
  
    private async executeNextExplain(db: any) {
      if (this.explainStack.length === 0) return;
  
      const {query, params} = this.explainStack.pop()!;
      console.log('Executing EXPLAIN ANALYZE for query:', query);
      const explainQuery = `EXPLAIN ANALYZE ${query}`;
      
      this.isExplaining = true;
      
      if (params.length > 0) {
        await db.send({ type: CommandCode.parse, query: explainQuery });
        await db.send({ type: CommandCode.bind, values: params });
        await db.send({ type: CommandCode.execute });
        await db.send({ type: CommandCode.sync });
      } else {
        await db.send({ type: CommandCode.query, query: explainQuery });
      }
    }
  
    private captureExplainResult(fields: (string | null)[]) {
      const explainOutput = fields.map(field => field ?? '').join('\n');
    //   console.log('EXPLAIN ANALYZE result:');
      console.log(">> "+explainOutput);
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