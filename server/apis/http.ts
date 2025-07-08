import compression from "compression";
import cookieParser from "cookie-parser";
import nocache from "nocache";
import express from "express";
import { getMainProps } from "server/main_props";

import { prompt_llm } from '../llm';
import '../proxy';

import { queryAnalyzer } from '../proxy';
import { generateSuggestionPrompt } from '../prompt_generator';
import { ConfigManager } from '../config_manager';

const queryLogger = queryAnalyzer.logger;
let configManager: ConfigManager | null = null;

// socket.io context can be used to push messages from api routes
export function setup_routes(app: any, io: any) {
    app.use(express.json());
    app.use(cookieParser());
    app.use(nocache());
    app.use(compression());

    // Initialize ConfigManager
    const initConfigManager = async () => {
        if (!configManager) {
            configManager = new ConfigManager('dbpill.sqlite.db');
            await configManager.initialize();
        }
        return configManager;
    };

    app.get("/api/props", async (req, res) => {
        const top_level_state = await getMainProps(req);
        res.json(top_level_state);
    });

    app.get('/api/config', async (req, res) => {
        try {
            const cm = await initConfigManager();
            const config = await cm.getConfig();
            const apiKeys = await cm.getApiKeys();
            res.json({ ...config, apiKeys });
        } catch (error) {
            console.error('Error getting config:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/config', async (req, res) => {
        try {
            const cm = await initConfigManager();
            const { llm_endpoint, llm_model, llm_api_key, apiKeys } = req.body;
            
            await cm.updateConfig({
                llm_endpoint,
                llm_model,
                llm_api_key: llm_api_key || null
            });
            
            if (apiKeys) {
                await cm.updateApiKeys(apiKeys);
            }
            
            const updatedConfig = await cm.getConfig();
            const updatedApiKeys = await cm.getApiKeys();
            res.json({ ...updatedConfig, apiKeys: updatedApiKeys });
        } catch (error) {
            console.error('Error updating config:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/all_queries', async (req, res) => {
        const orderBy = req.query.orderBy as string || 'query_id';
        const orderDirection = req.query.direction as string || 'desc';
        const stats = await queryLogger.getQueryGroups({
            orderBy,
            orderDirection,
            host: queryAnalyzer.host,
            database: queryAnalyzer.database,
            port: queryAnalyzer.port,
        });
        res.json({ stats, orderBy, orderDirection: orderDirection.toLowerCase() });
    });

    app.get('/api/query/:query_id', async (req, res) => {
        const queryId = req.params.query_id as string;
        const instanceType = req.query.instance_type as string | undefined;
        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));

        if (!queryData) {
            res.status(404).json({ error: 'query not found' });
            return;
        }

        // Generate prompt preview so that the frontend can show it without the user having to rerun the suggestion flow.
        // This works regardless of whether there's already an LLM response.
        try {
            // Get the appropriate instance based on the instance_type parameter
            let selectedInstance: any = null;
            if (instanceType === 'slowest') {
                selectedInstance = await queryLogger.getSlowestQueryInstance(parseInt(queryId));
            } else if (instanceType === 'fastest') {
                selectedInstance = await queryLogger.getFastestQueryInstance(parseInt(queryId));
            } else {
                // Default to latest for backwards compatibility
                selectedInstance = await queryLogger.getLatestQueryInstance(parseInt(queryId));
            }
            
            if (selectedInstance) {
                let planJson: any = null;
                try {
                    planJson = JSON.parse(selectedInstance.query_plan);
                } catch (_) {
                    planJson = null;
                }

                if (planJson) {
                    // Helper to extract relation names from a JSON plan
                    function extractRelationNames(plan: any): string[] {
                        const relationNames: string[] = [];
                        function traverse(obj: any) {
                            if (obj && typeof obj === 'object') {
                                if ('Relation Name' in obj) {
                                    // @ts-ignore – dynamic key access
                                    relationNames.push(obj['Relation Name']);
                                }
                                for (const key in obj) {
                                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

                    const tables = extractRelationNames(planJson);
                    const table_defs = await Promise.all(tables.map(table => queryAnalyzer.getTableStructure(table)));

                    // Get suggestion history for this query to include in prompt
                    const suggestionHistory = await queryLogger.getSuggestionsForQuery(parseInt(queryId));

                    const prompt = generateSuggestionPrompt({
                        queryText: queryData.query,
                        queryPlanJson: planJson,
                        tableDefinitions: table_defs,
                        appliedIndexes: queryData.applied_indexes,
                        suggestionHistory: suggestionHistory,
                    });

                    // Attach but do not persist – this is only for UI convenience
                    // @ts-ignore
                    queryData.prompt_preview = prompt;
                }
            }
            // Attach the selected instance for UI convenience
            // @ts-ignore
            queryData.selected_instance = selectedInstance;
        } catch (err) {
            console.error('Error generating prompt preview:', err);
        }

        res.json(queryData);
    });

    app.get('/api/analyze_query', async (req, res) => {
        const queryId = req.query.query_id as string;
        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));
        const slowest_instance = await queryLogger.getSlowestQueryInstance(parseInt(queryId));

        if (!slowest_instance) {
            res.status(404).json({ error: 'No query instances found' });
            return;
        }

        const params = JSON.parse(slowest_instance.params);
        const analysis = await queryAnalyzer.analyze({query: queryData.query, params});
        await queryAnalyzer.saveAnalysis(analysis);

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);

    });

    app.get('/api/analyze_query_with_params', async (req, res) => {
        const queryId = req.query.query_id as string;
        const paramsStr = req.query.params as string;
        
        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));
        
        if (!queryData) {
            res.status(404).json({ error: 'Query not found' });
            return;
        }

        let params;
        try {
            params = JSON.parse(paramsStr);
        } catch (error) {
            res.status(400).json({ error: 'Invalid params format' });
            return;
        }

        const analysis = await queryAnalyzer.analyze({query: queryData.query, params});
        await queryAnalyzer.saveAnalysis(analysis);

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/apply_suggestions', async (req, res) => {
        const queryId = req.query.query_id as string;
        const suggestionId = req.query.suggestion_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));

        // If suggestion_id is provided, use that specific suggestion
        // Otherwise, fall back to the latest unapplied suggestion for backward compatibility
        let targetSuggestion;
        if (suggestionId) {
            targetSuggestion = await queryLogger.get(
                'SELECT * FROM index_suggestions WHERE suggestion_id = ?',
                [parseInt(suggestionId)]
            );
        } else {
            // Get the latest (unapplied) suggestion for this query.  We assume the
            // user wants to apply the most recent suggestion generated by the AI
            // that hasn't already been applied.
            targetSuggestion = await queryLogger.getLatestUnappliedSuggestion(parseInt(queryId));
        }

        if (!targetSuggestion || !targetSuggestion.suggested_indexes) {
            res.json(stats);
            return;
        }

        const suggested_indexes = targetSuggestion.suggested_indexes;

        const slowest_instance = await queryLogger.getSlowestQueryInstance(parseInt(queryId));
        if(!slowest_instance) {
            res.json(stats);
            return;
        }
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
            res.status(500).json({ error: error.message });
            return;
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

        // Update suggestion history table as well.
        try {
            await queryLogger.markSuggestionApplied(targetSuggestion.suggestion_id, {
                prev_exec_time,
                new_exec_time: execTime
            });
        } catch (err) {
            console.error('Failed to mark suggestion as applied', err);
        }

        const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
        res.json(newQueryData);
    });

    app.get('/api/revert_suggestions', async (req, res) => {
        const queryId = req.query.query_id as string;
        const suggestionId = req.query.suggestion_id as string;
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));

        // If suggestion_id is provided, use that specific suggestion
        // Otherwise, fall back to the latest applied suggestion for backward compatibility
        let targetSuggestion;
        if (suggestionId) {
            targetSuggestion = await queryLogger.get(
                'SELECT * FROM index_suggestions WHERE suggestion_id = ?',
                [parseInt(suggestionId)]
            );
        } else {
            // Latest applied suggestion row so we can mark it as reverted later.
            targetSuggestion = await queryLogger.getLatestAppliedSuggestion(parseInt(queryId));
        }

        const applied_indexes = targetSuggestion?.suggested_indexes || stats.applied_indexes;

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

        if (targetSuggestion) {
            try {
                await queryLogger.markSuggestionReverted(targetSuggestion.suggestion_id);
            } catch (err) {
                console.error('Failed to mark suggestion as reverted', err);
            }
        }
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
            UPDATE queries SET applied_indexes = null, prev_exec_time = null, new_exec_time = null;
        `);
        res.json(newIndexes);
    });

    app.post('/api/reset_query_logs', async (req, res) => {
        try {
            await queryLogger.resetQueryData();
            res.json({ success: true, message: 'Query logs cleared successfully' });
        } catch (error) {
            console.error('Error resetting query logs:', error);
            res.status(500).json({ error: error.message });
        }
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

    app.get('/api/relevant_tables', async (req, res) => {
        const queryId = req.query.query_id as string;
        if (!queryId) {
            res.status(400).json({ error: 'query_id is required' });
            return;
        }

        const queryData = await queryLogger.getQueryGroup(parseInt(queryId));
        if (!queryData) {
            res.status(404).json({ error: 'query not found' });
            return;
        }

        // Get latest instance to extract plan
        const latestInstance = await queryLogger.getLatestQueryInstance(parseInt(queryId));
        if (!latestInstance) {
            res.json({});
            return;
        }
        let planJson: any = null;
        try {
            planJson = JSON.parse(latestInstance.query_plan);
        } catch (_) {
            planJson = null;
        }

        if (!planJson) {
            res.json({});
            return;
        }

        // Helper to extract relation names
        function extractRelationNames(plan: any): string[] {
            const relationNames: string[] = [];
            function traverse(obj: any) {
                if (obj && typeof obj === 'object') {
                    if ('Relation Name' in obj) {
                        relationNames.push(obj['Relation Name']);
                    }
                    for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

        const tables = extractRelationNames(planJson);
        const infoPromises = tables.map(async (t) => {
            const stats = await queryAnalyzer.getTableSize(t);
            const table_definition = await queryAnalyzer.getTableStructure(t);
            return [t, { ...stats, table_definition }] as const;
        });
        const pairs = await Promise.all(infoPromises);
        const result: Record<string, { table_size_bytes: number; estimated_rows: number; table_definition: string }> = {};
        pairs.forEach(([name, info]) => {
            result[name] = info;
        });

        res.json(result);
    });

    // Suggest indexes – optionally accept a custom prompt from the client
    // If the client provides a prompt (req.body.prompt), we use that directly.
    // Otherwise, we generate the prompt server-side as before. Switch to POST so
    // the potentially large prompt can be sent in the request body.
    app.post('/api/suggest', async (req, res) => {
        // For backward compatibility, we still honour the query string, but the
        // recommended way is to send JSON { query_id, prompt } in the request body.
        const queryId = (req.body.query_id as string) || (req.query.query_id as string);
        const customPrompt = (req.body.prompt as string) || (req.query.prompt as string);
        const stats = await queryLogger.getQueryGroup(parseInt(queryId));
        const slowestInstance = await queryLogger.getSlowestQueryInstance(parseInt(queryId));

        if(!slowestInstance) {
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

        const queryPlan = JSON.parse(slowestInstance.query_plan);
        const tables = extractRelationNames(queryPlan);

        const table_defs = await Promise.all(tables.map(table => queryAnalyzer.getTableStructure(table)));

        const applied_indexes = stats.applied_indexes;

        // Get suggestion history for this query to include in prompt
        const suggestionHistory = await queryLogger.getSuggestionsForQuery(parseInt(queryId));

        // Determine which prompt to send to the LLM.
        const prompt = customPrompt && customPrompt.trim().length > 0 ? customPrompt : generateSuggestionPrompt({
            queryText: stats.query,
            queryPlanJson: queryPlan,
            tableDefinitions: table_defs,
            appliedIndexes: applied_indexes,
            suggestionHistory: suggestionHistory,
        });

        try {
            const response = await prompt_llm({ prompt, temperature: 0 });

            // the last ```sql block in the LLM response is treated as the suggested indexes
            function extractLastCodeBlock(text: string) {
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
                prompt,
                llm_response: response.text,
                suggested_indexes,
            });

            const newQueryData = await queryLogger.getQueryGroup(parseInt(queryId));
            // Attach prompt preview so the client can display it (not stored in DB, only sent back now)
            // @ts-ignore – dynamic property for client convenience
            newQueryData.prompt_preview = prompt;

            res.json(newQueryData);
        } catch (error) {
            console.error('Error getting LLM suggestions:', error);
            const message = (error as any)?.message || 'Failed to retrieve suggestions from LLM';
            res.status(500).json({ error: message });
        }
    });

    // Save edited indexes (manual editing functionality)
    app.post('/api/save_edited_indexes', async (req, res) => {
        try {
            const { query_id, suggested_indexes, suggestion_id } = req.body;
            
            if (!query_id) {
                res.status(400).json({ error: 'query_id is required' });
                return;
            }

            if (suggestion_id) {
                // Update existing suggestion
                await queryLogger.run(
                    'UPDATE index_suggestions SET suggested_indexes = ? WHERE suggestion_id = ?',
                    [suggested_indexes, suggestion_id]
                );
            } else {
                // Create new suggestion (legacy support)
                await queryLogger.addSuggestion({
                    query_id: parseInt(query_id),
                    prompt: null,
                    llm_response: 'Manual suggestion',
                    suggested_indexes,
                });
            }

            // Return the updated query data
            const newQueryData = await queryLogger.getQueryGroup(parseInt(query_id));
            res.json(newQueryData);
        } catch (error) {
            console.error('Error saving edited indexes:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Create manual suggestion with placeholder index
    app.post('/api/create_manual_suggestion', async (req, res) => {
        try {
            const { query_id } = req.body;
            
            if (!query_id) {
                res.status(400).json({ error: 'query_id is required' });
                return;
            }

            const queryData = await queryLogger.getQueryGroup(parseInt(query_id));
            if (!queryData) {
                res.status(404).json({ error: 'query not found' });
                return;
            }

            // Get latest instance to extract tables
            const latestInstance = await queryLogger.getLatestQueryInstance(parseInt(query_id));
            let placeholderIndex = 'CREATE INDEX dbpill_unnamed_index ON table_name (column1, column2);';
            
            if (latestInstance) {
                try {
                    const planJson = JSON.parse(latestInstance.query_plan);
                    
                    // Helper to extract relation names
                    function extractRelationNames(plan: any): string[] {
                        const relationNames: string[] = [];
                        function traverse(obj: any) {
                            if (obj && typeof obj === 'object') {
                                if ('Relation Name' in obj) {
                                    relationNames.push(obj['Relation Name']);
                                }
                                for (const key in obj) {
                                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

                    const tables = extractRelationNames(planJson);
                    if (tables.length > 0) {
                        // Use the first table found in the query plan
                        const tableName = tables[0];
                        placeholderIndex = `CREATE INDEX dbpill_unnamed_index ON ${tableName} (column1, column2);`;
                    }
                } catch (e) {
                    console.error('Error parsing query plan for placeholder:', e);
                }
            }

            // Create the suggestion in the database
            await queryLogger.addSuggestion({
                query_id: parseInt(query_id),
                prompt: null,
                llm_response: 'Manual suggestion',
                suggested_indexes: placeholderIndex,
            });

            // Return the updated query data
            const newQueryData = await queryLogger.getQueryGroup(parseInt(query_id));
            res.json(newQueryData);
        } catch (error) {
            console.error('Error creating manual suggestion:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Delete suggestion
    app.delete('/api/suggestion/:suggestion_id', async (req, res) => {
        try {
            const suggestionId = parseInt(req.params.suggestion_id);
            
            if (!suggestionId) {
                res.status(400).json({ error: 'suggestion_id is required' });
                return;
            }

            // Get the suggestion to find the query_id for response
            const suggestion = await queryLogger.get(
                'SELECT query_id FROM index_suggestions WHERE suggestion_id = ?',
                [suggestionId]
            );

            if (!suggestion) {
                res.status(404).json({ error: 'suggestion not found' });
                return;
            }

            // Delete the suggestion
            await queryLogger.run(
                'DELETE FROM index_suggestions WHERE suggestion_id = ?',
                [suggestionId]
            );

            // Return the updated query data
            const newQueryData = await queryLogger.getQueryGroup(suggestion.query_id);
            res.json(newQueryData);
        } catch (error) {
            console.error('Error deleting suggestion:', error);
            res.status(500).json({ error: error.message });
        }
    });
}