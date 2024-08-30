import express from 'express';
import path from 'path';
import { QueryAnalyzer } from './query_analyzer';
import { prompt_claude } from './llm';

export function runServer(queryAnalyzer: QueryAnalyzer) {
    const queryLogger = queryAnalyzer.logger;
    const app = express();
    const port = 3000;

    const dbPath = path.join(__dirname, 'stats.db');

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    app.get('/', async (req, res) => {
        const orderBy = req.query.orderBy as string || 'timestamp';
        const orderDirection = req.query.direction as string || 'desc';
        const stats = await queryLogger.getQueryStatsOrderBy(orderBy, orderDirection);
        res.render('index', { stats, orderBy, orderDirection: orderDirection.toLowerCase() });
    });

    app.get('/slow_queries', async (req, res) => {
        // const slow_queries = await queryLogger.getSlowQueries();
        // res.render('slow_queries', { slow_queries });
    });


    app.get('/suggest', async (req, res) => {
        const queryId = req.query.query_id as string;
        const stats = await queryLogger.getQueryStats(parseInt(queryId));
        function extractRelationNames(plan) {
            let relationNames = [];
          
            function traverse(obj) {
              if (obj && typeof obj === 'object') {
                if ('Relation Name' in obj) {
                    //@ts-ignore
                  relationNames.push(obj['Relation Name']);
                }
                
                for (let key in obj) {
                  if (obj.hasOwnProperty(key)) {
                    traverse(obj[key]);
                  }
                }
              } else if (Array.isArray(obj)) {
                obj.forEach(traverse);
              }
            }
          
            traverse(plan);
            return [...new Set(relationNames)];
          }

        const queryPlan = JSON.parse(stats.query_plan);
        const tables = extractRelationNames(queryPlan);

        const table_defs = await Promise.all(tables.map(table => queryAnalyzer.getTableStructure(table)));

        const prompt = `Given the following query, query plan & table definitions, suggest index improvements that would result in significantly faster query execution. After explanation, provide the index creation SQL statements in a code block for sql, i.e.
\`\`\`sql
CREATE INDEX index_name ON table_name (column_name);
\`\`\`

${stats.query}\n\n${stats.query_plan}\n\n${table_defs.join('\n\n')}`;

        res.header('Content-Type', 'text/plain');
        const response = await prompt_claude({ prompt, temperature: 0.5 });
        res.send(response.text);
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}