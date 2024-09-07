

import compression from "compression";
import cookieParser from "cookie-parser";
import cors from 'cors';
import nocache from "nocache";
import express from "express";
import { getMainProps } from "server/main_props";

import { QueryAnalyzer } from '../query_analyzer';
import { prompt_claude } from '../llm';
import '../proxy';

import { queryAnalyzer } from '../proxy';

const queryLogger = queryAnalyzer.logger;

// socket.io context can be used to push messages from api routes
export function setup_routes(app: any, io: any) {
    app.use(cors());
    app.use(express.json());
    app.use(cookieParser());
    app.use(nocache());
    app.use(compression());

    app.get("/api/props", async (req, res) => {
        const top_level_state = await getMainProps(req);
        res.json(top_level_state);
    });



    app.get('/api/all_queries', async (req, res) => {
        const orderBy = req.query.orderBy as string || 'query_id';
        const orderDirection = req.query.direction as string || 'desc';
        const stats = await queryLogger.getQueryGroups({orderBy, orderDirection});
        res.json({ stats, orderBy, orderDirection: orderDirection.toLowerCase() });
    });

    app.get('/api/query/:query_id', async (req, res) => {
        const queryId = req.params.query_id as string;
        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(queryData);
    });

    app.get('/api/analyze_query', async (req, res) => {
        const queryId = req.query.query_id as string;
        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));
        const instances = await queryLogger.getQueryInstances(parseInt(queryId));

        const slowest_instance = instances.reduce((prev, current) => (prev.exec_time > current.exec_time) ? prev : current);

        const params = JSON.parse(slowest_instance.params);
        const analysis = await queryAnalyzer.analyze({query: queryData.query, params});
        await queryAnalyzer.saveAnalysis(analysis);

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);

    });

    app.get('/api/apply_suggestions', async (req, res) => {
        const queryId = req.query.query_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));
        const suggested_indexes = stats.suggested_indexes;

        const instances = await queryLogger.getQueryInstances(parseInt(queryId));
        if(instances.length ==0) {
            res.json(stats);
            return;
        }
        const slowest_instance = instances.sort((a, b) => b.exec_time - a.exec_time)[0];
        const params = JSON.parse(slowest_instance.params);


        // first, run query twice and save average as prev_exec_time
        let prev_exec_time = 0;
        let avg_count = 10;
        for(let i = 0; i < avg_count; i++) {
            const analyzed = await queryAnalyzer.analyze({ query: stats.query, params });
            prev_exec_time += analyzed.execTime;
        }
        prev_exec_time /= avg_count;

        await queryLogger.run(`
            UPDATE queries SET prev_exec_time = ? WHERE query_id = ?;
        `, [prev_exec_time, parseInt(queryId)]);

        try {
            await queryAnalyzer.applyIndexes(suggested_indexes);
        } catch (error) {
            console.error('Error applying indexes:', error);
            res.json({ error: error.message });
        }
        // run analyze again to get the new execution time
        const { execTime } = await queryAnalyzer.analyze({ 
            query: stats.query, 
            params 
        });

        await queryLogger.updateQueryStats(parseInt(queryId), {
            applied_indexes: suggested_indexes,
            prev_exec_time: prev_exec_time,
            new_exec_time: execTime
        });

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/revert_suggestions', async (req, res) => {
        const queryId = req.query.query_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));
        const applied_indexes = stats.applied_indexes;

        function extractIndexNames(sqlText) {
            const regex = /CREATE\s+INDEX\s+(\w+)/gi;
            const indexNames = [];
            let match;

            // Split the input text into individual statements
            const statements = sqlText.split('\n').filter(stmt => stmt.trim() !== '');

            statements.forEach(statement => {
                while ((match = regex.exec(statement)) !== null) {
                    indexNames.push(match[1]);
                }
            });

            return indexNames;
        }

        const index_names = extractIndexNames(applied_indexes);

        const drop_statement = index_names.map(index => `DROP INDEX IF EXISTS ${index};`).join('\n');
        await queryAnalyzer.applyIndexes(drop_statement);

        await queryLogger.updateQueryStats(parseInt(queryId), {
            applied_indexes: null,
            prev_exec_time: null,
            new_exec_time: null
        });
        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/ignore_query', async (req, res) => {
        const queryId = req.query.query_id as string;
        await queryLogger.updateQueryStats(parseInt(queryId), {
            hidden: true
        });
        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/revert_all_suggestions', async (req, res) => {
        const indexes = await queryAnalyzer.getAllAppliedIndexes();
        const drop_statement = indexes.map(index => `DROP INDEX IF EXISTS ${index.index_name};`).join('\n');
        await queryAnalyzer.applyIndexes(drop_statement);
        const newIndexes = await queryAnalyzer.getAllAppliedIndexes();

        await queryLogger.exec(`
            UPDATE queries SET applied_indexes = null, prev_exec_time = null, new_exec_time = null, suggested_indexes = null, llm_response = null;
        `);
        res.json(newIndexes);
    });

    app.get('/view_suggestion', async (req, res) => {
        const queryId = req.query.query_id as string;
        const query_info = await queryLogger.getQueryStats(parseInt(queryId));
        // res.render('view_suggestion', { query_info });
        res.json({ query_info });
    });

    app.get('/api/get_all_applied_indexes', async (req, res) => {
        const indexes = await queryAnalyzer.getAllAppliedIndexes();
        res.json(indexes);
    });

    app.get('/api/suggest', async (req, res) => {
        const queryId = req.query.query_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));
        const instances = await queryLogger.getQueryInstances(parseInt(queryId));

        if(instances.length == 0) {
            res.json(stats);
            return;
        }

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

        const queryPlan = JSON.parse(instances[instances.length - 1].query_plan);
        const tables = extractRelationNames(queryPlan);

        const table_defs = await Promise.all(tables.map(table => queryAnalyzer.getTableStructure(table)));

        const applied_indexes = stats.applied_indexes;

        const prompt = `Given the following PostgreSQL query, query plan & table definitions, suggest only one index improvement that would result in significantly faster query execution. Generally avoid partial indexes unless you're *certain* it will lead to orders-of-magnitude improvements. Think through the query, the query plan, the indexes the plan used, the indexes already present on the tables, and come up with a plan. Then, provide a single code block with all the index proposals together at the end. i.e.:
\`\`\`sql
CREATE INDEX dbpill_index_name_upper ON table_name (column_name1, some_function(column_name2));
\`\`\`

Make sure the suggested index is to improve the provided query specifically, not other hypothetical queries. Pay close attention to the query, and make sure any data transformation in the where clause is also applied to the index declaration.

Always prefix the index name with dbpill_ to avoid conflicts with existing indexes.

** Query details **

${stats.query}

** Query Plan **

${JSON.stringify(queryPlan, null, 2)}

** Table Definitions **

${table_defs.join('\n\n')}

${applied_indexes ? `
** Notes **

On a previous attempt, the following indexes were suggested adn applied, however it did not work very well:
${applied_indexes}
` : ``}
`;

        // console.log(prompt);

        res.header('Content-Type', 'text/plain');
        const response = await prompt_claude({ prompt, temperature: 0 });

        // the last ```sql block in the response is the suggested indexes
        function extractLastCodeBlock(text) {
            const codeBlockRegex = /```sql[\s\S]*?```/g;
            const matches = text.match(codeBlockRegex);
            
            if (matches && matches.length > 0) {
                const lastBlock = matches[matches.length - 1];
                return lastBlock.slice("```sql".length, -("```".length)).trim();
            }
            
            return null;
        }

        const suggested_indexes = extractLastCodeBlock(response.text) ?? '';

        // save the response to the database
        await queryAnalyzer.logger.addSuggestion({
            query_id: parseInt(queryId),
            llm_response: response.text,
            suggested_indexes,
        });
        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });
}