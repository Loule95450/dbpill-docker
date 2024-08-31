

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
        console.log("AAA", queryData);
        res.json(queryData);
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
        const slowest_instance = instances[0];
        const params = JSON.parse(slowest_instance.params);

        try {
            await queryAnalyzer.applyIndexes(suggested_indexes);
        } catch (error) {
            console.error('Error applying indexes:', error);
        }
        // run analyze again to get the new execution time
        const { execTime } = await queryAnalyzer.analyze({ 
            query: stats.query, 
            params 
        });
        console.log('execTime', execTime);

        await queryLogger.updateQueryStats(parseInt(queryId), {
            applied_indexes: suggested_indexes,
            prev_exec_time: stats.exec_time,
            new_exec_time: execTime
        });

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/revert_suggestions', async (req, res) => {
        const queryId = req.query.query_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));
        const applied_indexes = stats.applied_indexes;

        const index_names = applied_indexes.match(/CREATE INDEX.*?\n/g)?.map(index => index.split(' ')[2]) ?? [];

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

    app.get('/view_suggestion', async (req, res) => {
        const queryId = req.query.query_id as string;
        const query_info = await queryLogger.getQueryStats(parseInt(queryId));
        // res.render('view_suggestion', { query_info });
        res.json({ query_info });
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

        const queryPlan = JSON.parse(instances[0].query_plan);
        const tables = extractRelationNames(queryPlan);

        const table_defs = await Promise.all(tables.map(table => queryAnalyzer.getTableStructure(table)));

        const prompt = `Given the following PostgreSQL query, query plan & table definitions, suggest index improvements that would result in significantly faster query execution. List out your proposed improvements and explain the reasoning. After the list, pick only the improvements that would lead to drastic change (you can ignore minor improvements). Then, provide a single code block with all the index proposals together at the end. i.e.:
\`\`\`sql
CREATE INDEX dbpill_index_name ON table_name (column_name);
CREATE INDEX dbpill_index_name_upper ON table_name (UPPER(column_name));
\`\`\`

Always prefix the index name with dbpill_ to avoid conflicts with existing indexes.

** Query details **

${stats.query}

** Query Plan **

${queryPlan}

** Table Definitions **

${table_defs.join('\n\n')}
`;

        res.header('Content-Type', 'text/plain');
        const response = await prompt_claude({ prompt, temperature: 0 });

        // the last ```sql block in the response is the suggested indexes
        const suggested_indexes = response.text.match(/```sql\n(.*?)```/s)?.[1] ?? '';

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