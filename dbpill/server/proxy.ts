import { createAdvancedProxy, IAdvancedProxySession } from 'pg-server';
import { Socket } from 'net';
import { DbRawCommand } from 'pg-server';
import { CommandCode, ResponseCode } from 'pg-server';

import { QueryAnalyzer } from './query_analyzer';

import argv from './args';

export const queryAnalyzer = new QueryAnalyzer(argv.db);

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


class AdvancedPostgresProxySession implements IAdvancedProxySession {
    private queryStack: Array<{ query: string, params: any[] }> = [];
    private sessionId: string;

    constructor() {
        this.sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    onConnect(socket: Socket) {
        // console.log('👤 Client connected, IP: ', socket.remoteAddress);
    }

    async initSecondaryDbConnection() {
    }

    async onCommand({ command, getRawData }: DbRawCommand, { client, db }: any) {
        const typedCommand = ((command: any): any => {

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
                    // console.log(`Unknown command type: ${command.type} ${CommandType[command.type]}`);
            }
        })(command);

        await this.processCommand(typedCommand, client, db, getRawData);
    }

    async onResult(result: any, { client, db }: any) {
        client.socket.write(result.getRawData());

        if (result.response.type === ResponseCode.ReadyForQuery) {
            if (this.queryStack.length > 0) {
                const query = this.queryStack.pop();
                if (query) {
                    this.logQuery(query);
                }
            }
        }
    }

    private async processCommand(command: Command, client: any, db: any, getRawData: () => Buffer) {
        // console.log('Processing command:', JSON.stringify(command, null, 2));

        await db.sendRaw(getRawData());

        if (!command) {
            return;
        }

        switch (command.type) {
            case CommandType.Query:
                this.queryStack.push({ query: command.query, params: [] });
                break;
            case CommandType.Parse:
                this.queryStack.push({ query: command.query, params: [] });
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
    }

    private async logQuery(query: { query: string, params: any[] }) {
        if(query.query.trim() == 'BEGIN' || query.query.trim() == 'COMMIT' || query.query.trim() == 'ROLLBACK') {
            return;
        }
        try {
            const analysis = await queryAnalyzer.analyze({query: query.query, params: query.params});
            queryAnalyzer.saveAnalysis(analysis);
        } catch (error) {
            console.error('Error analyzing query:', error);
        }
    }
}

const server = createAdvancedProxy(
    { port: 5432, host: 'localhost' },
    AdvancedPostgresProxySession
);

server.listen(5433, 'localhost');
console.log('PostgreSQL proxy listening on port 5433');
