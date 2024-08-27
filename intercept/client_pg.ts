
import { Client } from 'pg';

async function executeQuery(client: Client, query: string, parameters?: any[]) {
    try {
        const result = await client.query(query, parameters);
        return result.rows;
    } catch (err) {
        console.error('Error executing query:', err.stack);
        throw err; // Re-throw the error if you want the calling function to handle it
    }
}


const client = new Client({
    host: 'localhost',
    port: 5433,
    user: 'recess3d',
    password: 'temp',
    database: 'recess3d'
});

await client.connect();
console.log('Connected to the proxy');

const nowResult = await executeQuery(client, 'SELECT NOW()');
console.log('Query result:', nowResult);

const usersResult = await executeQuery(client, 'SELECT * FROM players WHERE player_id > $1', [1]);
console.log('Query result:', usersResult);

const tablesResult = await executeQuery(
    client,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log('Tables:', tablesResult);

await client.end();
