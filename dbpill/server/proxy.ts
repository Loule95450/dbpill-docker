import { IAdvancedProxySession, bindSocket, DbRawCommand, ResponseCode } from 'pg-server';
import { DbResponseParser } from 'pg-server/protocol/response-parser';
import { CommandWriter } from 'pg-server/protocol/command-writer';

import fs from 'fs';
import path from 'path';
import * as net from 'net';
import * as tls from 'tls';

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

    onConnect(socket: net.Socket) {
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
        client.socket.write(result.getRawData() as Uint8Array);

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

// === TLS MITM settings ===
const keyPath = path.resolve(__dirname, '../credentials/proxy.key');
const certPath = path.resolve(__dirname, '../credentials/proxy.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('[proxy] TLS key or certificate not found. Expected at:');
    console.error(`  key : ${keyPath}`);
    console.error(`  cert: ${certPath}`);
    console.error('Please create or place a valid certificate pair before starting the proxy.');
    process.exit(1);
}

const TLS_SERVER_OPTS: tls.TlsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    // allow older pg clients that do not set SNI
    requestCert: false,
};

// Log certificate info
console.log('[proxy] Certificate loaded successfully');
console.log('[proxy] Key file size:', fs.statSync(keyPath).size, 'bytes');
console.log('[proxy] Cert file size:', fs.statSync(certPath).size, 'bytes');

// Parse backend details from the provided connection string
const dbUrl = new URL(argv.db as string);
const backendHost = dbUrl.hostname || 'localhost';
const backendPort = Number(dbUrl.port) || 5432;

function createBackendSocket(): net.Socket {
    // For local development we speak plain PG protocol to the real DB.
    // If you need TLS on the backend leg, swap this for tls.connect(...) again.
    return net.connect({ host: backendHost, port: backendPort });
}

// Re-implementation of pg-serverʼs createAdvancedProxy that works with an already-accepted socket.
function startPgProxy(clientSock: net.Socket, pending?: Buffer) {
    const session = new AdvancedPostgresProxySession();
    session.onConnect?.(clientSock);

    const dbSock = createBackendSocket();

    let parties: { client: any; db: CommandWriter };

    console.log(`[proxy] startPgProxy called. Pending buffer length: ${pending ? pending.length : 'undefined'}, socket is TLS: ${clientSock instanceof tls.TLSSocket}`);

    // Handle commands coming from the client
    const { writer } = bindSocket(clientSock, (cmd, wrt) => {
        console.log(`[proxy] bindSocket callback triggered for client command: ${cmd.command.type || 'Unknown'}`);
        if (session.onCommand) {
            session.onCommand(cmd, parties);
        } else {
            // passthrough
            dbSock.write(cmd.getRawData() as Uint8Array);
        }
    });

    // Handle responses coming from the database
    const parser = new DbResponseParser();
    dbSock.on('data', (buf) => {
        // console.log('[proxy] Received data from backend DB.'); // Potentially noisy
        if (session.onResult) {
            parser.parse(buf, (res) => session.onResult!(res, parties));
        } else {
            clientSock.write(buf as Uint8Array);
        }
    });

    parties = { client: writer, db: new CommandWriter(dbSock) };

    dbSock.on('error', (e) => {
        console.error('[proxy] Backend DB connection error:', e);
        writer.error((e as Error).message);
    });
    dbSock.on('close', () => {
        console.log('[proxy] Backend DB connection closed.');
        clientSock.destroy(); // Ensure client socket is also closed
    });
    dbSock.setNoDelay(true);

    clientSock.on('error', (err) => { // Added listener for client socket errors
        console.error('[proxy] Client socket error (in startPgProxy):', err);
    });
    clientSock.on('close', (hadError) => { // Added listener for client socket close
        console.log(`[proxy] Client socket closed (in startPgProxy). Had error: ${hadError}`);
        if (dbSock && !dbSock.destroyed) { // Ensure backend is also closed
             dbSock.destroy();
        }
    });

    // If we already read some bytes (e.g. plain StartupMessage) feed them into the parser.
    if (pending && pending.length) {
        console.log(`[proxy] Emitting ${pending.length} pending bytes to pg-server internal processing.`);
        clientSock.emit('data', pending);
    } else {
        console.log('[proxy] No pending bytes to emit in startPgProxy.');
    }
}

// === Listener that understands PostgreSQL SSLRequest handshake ===
const listener = net.createServer((rawClient) => {
    console.log('[proxy] TCP connection accepted from', rawClient.remoteAddress, 'port', rawClient.remotePort);
    
    rawClient.on('error', (err) => {
        console.error('[proxy] rawClient error (pre-TLS):', err);
    });
    
    // Set up data handler
    let hasReceivedData = false;
    
    const handleFirstData = (first8: Buffer) => {
        if (hasReceivedData) return;
        hasReceivedData = true;
        
        console.log('[proxy] Received first data chunk:', first8.slice(0, Math.min(first8.length, 8)).toString('hex'));
        
        const isSSLRequest = first8.length >= 8 && first8.readUInt32BE(4) === 0x04d2162f;

        if (isSSLRequest) {
            console.log('[proxy] Detected SSLRequest, upgrading to TLS');
            // Tell client we support TLS, then upgrade
            rawClient.write('S');
            console.log('[proxy] Sent S response, creating TLS socket...');
            const tlsClient = new tls.TLSSocket(rawClient, { ...TLS_SERVER_OPTS, isServer: true });
            console.log('[proxy] TLS socket created, waiting for handshake...');

            tlsClient.on('error', (err) => {
                console.error('[proxy] tlsClient error during/after handshake:', err);
            });
            tlsClient.on('close', (hadError) => {
                console.log(`[proxy] tlsClient closed during/after handshake. Had error: ${hadError}`);
            });
            tlsClient.on('connect', () => {
                console.log('[proxy] tlsClient connect event fired');
            });
            tlsClient.on('lookup', () => {
                console.log('[proxy] tlsClient lookup event fired');
            });
            tlsClient.on('ready', () => {
                console.log('[proxy] tlsClient ready event fired');
            });
            tlsClient.on('timeout', () => {
                console.log('[proxy] tlsClient timeout event fired');
            });

            tlsClient.once('secureConnect', () => {
                console.log('[proxy] TLS handshake complete (secureConnect), waiting for client application data');
                tlsClient.once('data', (firstPlain) => {
                    console.log(`[proxy] Received first ${firstPlain.length} application bytes after TLS handshake: ${firstPlain.slice(0, 32).toString('hex')}`);
                    startPgProxy(tlsClient, firstPlain);
                });
            });
            
            // Add a timeout for TLS handshake
            const tlsTimeout = setTimeout(() => {
                console.log('[proxy] TLS handshake timeout after 10 seconds');
                console.log('[proxy] TLS authorized:', tlsClient.authorized);
                console.log('[proxy] TLS pending:', tlsClient.pending);
                console.log('[proxy] TLS readyState:', tlsClient.readyState);
                tlsClient.destroy();
            }, 10000);
            
            tlsClient.on('secureConnect', () => {
                clearTimeout(tlsTimeout);
            });
            tlsClient.on('close', () => {
                clearTimeout(tlsTimeout);
            });
        } else {
            console.log('[proxy] No SSLRequest detected, proceeding with plain text');
            // No TLS – proceed as plain text (pass along the bytes we already read)
            startPgProxy(rawClient, first8);
        }
    };
    
    // Use both 'data' and 'readable' events to catch data
    rawClient.on('data', handleFirstData);
    rawClient.on('readable', () => {
        if (hasReceivedData) return;
        const chunk = rawClient.read();
        if (chunk) {
            console.log('[proxy] Got data via readable event');
            handleFirstData(chunk);
        }
    });
    
    // Add a timeout as fallback
    const timeout = setTimeout(() => {
        if (!hasReceivedData) {
            console.log('[proxy] No data received after 5 seconds, checking if readable...');
            const chunk = rawClient.read();
            if (chunk) {
                console.log('[proxy] Found buffered data on timeout');
                handleFirstData(chunk);
            } else {
                console.log('[proxy] No buffered data found, connection may be stalled');
                rawClient.destroy();
            }
        }
    }, 5000);
    
    rawClient.on('close', () => {
        clearTimeout(timeout);
        console.log('[proxy] rawClient closed');
    });
});

listener.listen(argv['proxy-port'] as number, () => {
    console.log(`PostgreSQL proxy listening on port ${argv['proxy-port']} (TLS MITM ready, IPv4/IPv6)`);
});
