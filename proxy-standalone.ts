#!/usr/bin/env tsx

import { createAdvancedProxy, IAdvancedProxySession, bindSocket, DbRawCommand, ResponseCode } from 'pg-server';
import { DbResponseParser } from 'pg-server/protocol/response-parser';
import { CommandWriter } from 'pg-server/protocol/command-writer';
import fs from 'fs';
import path from 'path';
import * as net from 'net';
import * as tls from 'tls';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database URL and proxy port from command line
const dbUrl = process.argv[2] || 'postgresql://cashorbit@localhost:5432/cashorbit';
const proxyPort = parseInt(process.argv[3]) || 5433;

console.log('PostgreSQL TLS Proxy (Node.js)');
console.log('Database:', dbUrl);
console.log('Proxy port:', proxyPort);

// === TLS MITM settings ===
const keyPath = path.resolve(__dirname, 'credentials/proxy.key');
const certPath = path.resolve(__dirname, 'credentials/proxy.crt');

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
    requestCert: false,
    rejectUnauthorized: false,
    secureProtocol: 'TLS_method', // Support all TLS versions
    honorCipherOrder: true,
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
};

console.log('[proxy] Certificate loaded successfully');
console.log('[proxy] Key file size:', fs.statSync(keyPath).size, 'bytes');
console.log('[proxy] Cert file size:', fs.statSync(certPath).size, 'bytes');

// Parse backend details
const parsedUrl = new URL(dbUrl);
const backendHost = parsedUrl.hostname || 'localhost';
const backendPort = Number(parsedUrl.port) || 5432;

// Helper to create backend socket (plain TCP)
function createBackendSocket(): net.Socket {
    return net.connect({ host: backendHost, port: backendPort });
}

// Very simple passthrough proxy for now
function startPgProxy(clientSock: net.Socket, pending?: Buffer) {
    console.log('[proxy] Initialising pg-server bindSocket layer');

    const dbSock = createBackendSocket();

    let parties: { client: any; db: CommandWriter };

    const { writer } = bindSocket(clientSock, (cmd, _wrt) => {
        dbSock.write(cmd.getRawData() as Uint8Array);
    });

    const parser = new DbResponseParser();
    dbSock.on('data', (buf) => {
        parser.parse(buf, (res) => {
            writer.socket.write(res.getRawData() as Uint8Array);
        });
    });

    parties = { client: writer, db: new CommandWriter(dbSock) };

    dbSock.on('error', (e) => console.error('[proxy] Backend DB error:', e));
    dbSock.on('close', () => clientSock.destroy());

    // feed any pending bytes
    if (pending && pending.length) {
        clientSock.emit('data', pending);
    }
}

// Simple proxy session that just passes through commands
class SimpleProxySession implements IAdvancedProxySession {
    onConnect(socket: net.Socket) {
        console.log('[proxy] Client connected via pg-server');
    }
}

// === Listener that understands PostgreSQL SSLRequest handshake ===
const listener = net.createServer((rawClient) => {
    console.log('[proxy] TCP connection accepted from', rawClient.remoteAddress, 'port', rawClient.remotePort);
    
    rawClient.on('error', (err) => {
        console.error('[proxy] rawClient error (pre-TLS):', err);
    });
    
    let hasReceivedData = false;
    
    const handleFirstData = (first8: Buffer) => {
        if (hasReceivedData) return;
        hasReceivedData = true;
        
        console.log('[proxy] Received first data chunk:', first8.slice(0, Math.min(first8.length, 8)).toString('hex'));
        
        const isSSLRequest = first8.length >= 8 && first8.readUInt32BE(4) === 0x04d2162f;

        if (isSSLRequest) {
            console.log('[proxy] Detected SSLRequest, upgrading to TLS');
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
            startPgProxy(rawClient, first8);
        }
    };
    
    rawClient.on('data', handleFirstData);
    rawClient.on('readable', () => {
        if (hasReceivedData) return;
        const chunk = rawClient.read();
        if (chunk) {
            console.log('[proxy] Got data via readable event');
            handleFirstData(chunk);
        }
    });
    
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

listener.listen(proxyPort, () => {
    console.log(`PostgreSQL proxy listening on port ${proxyPort} (TLS MITM ready with Node.js)`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[proxy] Shutting down...');
    listener.close(() => {
        process.exit(0);
    });
}); 