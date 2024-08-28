import { createAdvancedProxy, IAdvancedProxySession } from 'pg-server';
import { Socket } from 'net';
import { DbRawCommand, DbRawResponse } from 'pg-server';
import { CommandCode } from 'pg-server';

class QueryInterceptProxy implements IAdvancedProxySession {
  onConnect(socket: Socket) {
    console.log(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);
  }

  onCommand(command: DbRawCommand, parties: { client: any; db: any }) {
    if (command.command.type === CommandCode.query || command.command.type === CommandCode.parse) {
      const query = command.command.query;
      console.log(`Intercepted query: ${query}`);
    }
    // Forward the command to the database
    parties.db.sendRaw(command.getRawData());
  }

  onResult(result: DbRawResponse, parties: { client: any; db: any }) {
    // Forward the result to the client
    parties.client.socket.write(result.getRawData());
  }
}

const proxyServer = createAdvancedProxy(
  { host: 'localhost', port: 5432 }, // Replace with your actual database connection details
  QueryInterceptProxy
);

const proxyPort = 5433; // The port on which the proxy will listen
proxyServer.listen(proxyPort, () => {
  console.log(`Proxy server listening on port ${proxyPort}`);
});