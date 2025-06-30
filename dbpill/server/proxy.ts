import { IAdvancedProxySession, bindSocket, DbRawCommand, ResponseCode } from 'pg-server';
import { DbResponseParser } from 'pg-server/protocol/response-parser';
import { CommandWriter } from 'pg-server/protocol/command-writer';

import fs from 'fs';
import path from 'path';
import * as net from 'net';
import * as tls from 'tls';

import { QueryAnalyzer } from './query_analyzer';

import argv from './args';

// Import SEA helpers lazily to avoid pulling them in when not bundled.
import { isSea, getAsset } from 'node:sea';

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
        // The raw bytes have already been sent to the client upstream. We only care about
        // inspecting the response metadata here.

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
            if (analysis) {
                queryAnalyzer.saveAnalysis(analysis);
            }
        } catch (error) {
            console.error('Error analyzing query:', error);
        }
    }
}

// === TLS MITM settings ===
const diskKeyPath = path.resolve(__dirname, '../credentials/proxy.key');
const diskCertPath = path.resolve(__dirname, '../credentials/proxy.crt');

function loadCredential(filePath: string, assetKey: string): Buffer | null {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
    }
    if (isSea()) {
        try {
            const data = getAsset(assetKey);
            return Buffer.from(data);
        } catch {}
    }
    return null;
}

const keyBuf = loadCredential(diskKeyPath, 'credentials/proxy.key');
const certBuf = loadCredential(diskCertPath, 'credentials/proxy.crt');

if (!keyBuf || !certBuf) {
    console.error('[proxy] TLS key or certificate not found on disk or in SEA assets.');
    console.error('Expected either:');
    console.error(`  Disk key : ${diskKeyPath}`);
    console.error(`  Disk cert: ${diskCertPath}`);
    console.error('Or corresponding entries in sea-config.json under "credentials/".');
    process.exit(1);
}

const TLS_SERVER_OPTS: tls.TlsOptions = {
    key: keyBuf,
    cert: certBuf,
    requestCert: false,
    rejectUnauthorized: false,
    secureProtocol: 'TLS_method', // Support all TLS versions
    honorCipherOrder: true,
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
};

// Log certificate info
console.log('[proxy] Certificate loaded successfully');
console.log('[proxy] Key bytes:', keyBuf.length, 'cert bytes:', certBuf.length);

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
        // First, forward the raw bytes unmodified so the client receives exactly what the DB sent.
        clientSock.write(buf as Uint8Array);

        // Then, in the background, parse the buffer so our session can still react to
        // ReadyForQuery / Error responses, etc. Any parsing bug will no longer corrupt the
        // stream because the client has already received the pristine data.
        if (session.onResult) {
            try {
                parser.parse(buf, (res) => session.onResult!(res, parties));
            } catch (err) {
                // Parsing errors should never impact the proxy data-flow.
                console.error('[proxy] Error while parsing DB response:', err);
            }
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

            // Add comprehensive TLS event logging
            tlsClient.on('keylog', (line) => {
                console.log('[proxy] TLS keylog:', line.toString());
            });
            
            tlsClient.on('session', (session) => {
                console.log('[proxy] TLS session established, length:', session.length);
            });
            
            tlsClient.on('secureConnect', () => {
                console.log('[proxy] secureConnect fired!');
                console.log('[proxy] TLS version:', tlsClient.getProtocol());
                console.log('[proxy] TLS cipher:', tlsClient.getCipher());
                console.log('[proxy] TLS authorized:', tlsClient.authorized);
                console.log('[proxy] TLS server name:', (tlsClient as any).servername || 'none');
            });
            
            tlsClient.on('OCSPResponse', (response) => {
                console.log('[proxy] OCSP response received');
            });

            tlsClient.on('error', (err) => {
                console.error('[proxy] tlsClient error during/after handshake:', err);
                console.error('[proxy] Error code:', err.code);
                console.error('[proxy] Error errno:', (err as any).errno);
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

            // Once we receive the first decrypted Postgres packet, start full proxying
            tlsClient.once('data', (firstPg) => {
                console.log('[proxy] Received first Postgres bytes after TLS handshake:', firstPg.slice(0, 32).toString('hex'));
                startPgProxy(tlsClient, firstPg);
            });

            // Safety timeout – if we never get Postgres data, terminate
            const tlsTimeout = setTimeout(() => {
                console.warn('[proxy] TLS handshake appeared to stall (no Postgres data within 10s)');
                tlsClient.destroy();
            }, 10000);

            tlsClient.on('data', () => clearTimeout(tlsTimeout));
            tlsClient.on('close', () => clearTimeout(tlsTimeout));
        } else {
            console.log('[proxy] No SSLRequest detected, proceeding with plain text');
            // No TLS – proceed as plain text (pass along the bytes we already read)
            startPgProxy(rawClient, first8);
        }
    };
    
    // Use both 'data' and 'readable' events to catch data
    const chunk = rawClient.read(0);  // just triggers the 'readable', no drain
    
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
