export interface SuggestionPromptParams {
  queryText: string;
  queryPlanJson: any;
  tableDefinitions: string[];
  appliedIndexes?: string | null;
  suggestionHistory?: any[];
}

/**
 * Generate the full prompt sent to the LLM for index suggestions based on
 * the query, its plan and table metadata.
 */
export function generateSuggestionPrompt({
  queryText,
  queryPlanJson,
  tableDefinitions,
  appliedIndexes,
  suggestionHistory = [],
}: SuggestionPromptParams): string {
  // Generate suggestion history section
  let historySection = '';
  if (suggestionHistory && suggestionHistory.length > 0) {
    historySection = `\n<previous_suggestions>\n`;
    historySection += `<description>The following index suggestions have been tried previously for this query. Please learn from these attempts and suggest something different that might work better:</description>\n\n`;
    
    // Reverse the array to show chronological order (oldest first)
    const chronologicalHistory = [...suggestionHistory].reverse();
    
    chronologicalHistory.forEach((suggestion, index) => {
      const suggestionNum = index + 1; // Start from 1 for oldest attempt
      historySection += `<attempt number="${suggestionNum}">\n`;
      historySection += `<status>${suggestion.reverted ? 'Applied and then REVERTED (did not help)' : suggestion.applied ? 'Currently APPLIED' : 'Suggested but not applied'}</status>\n`;
      historySection += `<suggested_indexes>\n\`\`\`sql\n${suggestion.suggested_indexes || 'None'}\n\`\`\`\n</suggested_indexes>\n`;
      
      if (suggestion.prev_exec_time && suggestion.new_exec_time) {
        const improvement = suggestion.prev_exec_time / suggestion.new_exec_time;
        historySection += `<performance_impact>${suggestion.prev_exec_time.toFixed(2)}ms → ${suggestion.new_exec_time.toFixed(2)}ms (${improvement.toFixed(2)}x ${improvement > 1 ? 'improvement' : 'degradation'})</performance_impact>\n`;
        
        if (suggestion.reverted) {
          historySection += `<revert_reason>This suggestion was reverted because it ${improvement < 1 ? 'made the query slower' : 'did not provide sufficient improvement'}</revert_reason>\n`;
        }
      } else {
        historySection += `<performance_impact>Not measured</performance_impact>\n`;
      }
      
      if (suggestion.llm_response && suggestion.llm_response !== 'Manual suggestion') {
        // Extract reasoning from LLM response if available
        const reasoning = suggestion.llm_response.split('```')[0].trim();
        if (reasoning.length > 50) {
          historySection += `<ai_reasoning>${reasoning.substring(0, 300)}${reasoning.length > 300 ? '...' : ''}</ai_reasoning>\n`;
        }
      }
      
      historySection += `</attempt>\n\n`;
    });
    
    historySection += `<important_note>Based on this history, please suggest a completely different approach. If previous attempts focused on certain columns or index types, try a different strategy.</important_note>\n</previous_suggestions>\n\n`;
  }

  return `<index_suggestion_task>
<instructions>
Given the following PostgreSQL query, query plan & table definitions, suggest only one index improvement that would result in significantly faster query execution. Generally avoid partial indexes unless you're *certain* it will lead to orders-of-magnitude improvements. Think through the query, the query plan, the indexes the plan used, the indexes already present on the tables, and come up with a plan. Then, provide a single code block with all the index proposals together at the end. i.e.:
\u0060\u0060\u0060sql
CREATE INDEX dbpill_index_name_upper ON table_name (column_name1, some_function(column_name2));
\u0060\u0060\u0060

Make sure the suggested index is to improve the provided query specifically, not other hypothetical queries. Pay close attention to the query, and make sure any data transformation in the where clause is also applied to the index declaration.

Always prefix the index name with dbpill_ to avoid conflicts with existing indexes.
</instructions>

<postgresql_index_tuning_heuristics>
<title>PostgreSQL Index-Tuning Heuristics</title>
<subtitle>(Optimized for automated review of EXPLAIN (ANALYZE, BUFFERS) plans, table DDL and statistics)</subtitle>

<section name="scan_patterns">
<title>1 / Scan Patterns</title>
<pattern>
<symptom>Seq Scan touching ≫ 5–10 % of a large relation</symptom>
<guideline>Likely missing index on filter predicates</guideline>
<remedy>Create (partial) index on columns in WHERE clause</remedy>
</pattern>
<pattern>
<symptom>Index Scan with many "Rows Removed by Filter"</symptom>
<guideline>Index is not covering or not selective</guideline>
<remedy>Add INCLUDE columns or switch to composite/partial index</remedy>
</pattern>
<pattern>
<symptom>Index Scan reading ≫ 10 % of pages</symptom>
<guideline>Low selectivity—index may be useless</guideline>
<remedy>Consider dropping or replacing with composite/partial index</remedy>
</pattern>
<pattern>
<symptom>Index Only Scan not chosen (shows Heap Fetches)</symptom>
<guideline>Key columns are in index but query still hits heap</guideline>
<remedy>Add remaining output columns with INCLUDE, or VACUUM so visibility map is up-to-date</remedy>
</pattern>
<pattern>
<symptom>Bitmap Index Scan → Bitmap Heap Scan</symptom>
<guideline>Acceptable for medium result sets; if repeated or expensive, consider better index</guideline>
<remedy>Create composite index that matches all bitmap conditions or make index more selective</remedy>
</pattern>
<pattern>
<symptom>Multiple Index Scans on the same table under one node</symptom>
<guideline>Optimiser intersecting results instead of single probe</guideline>
<remedy>Build composite index with columns ordered by equality → range → sort columns</remedy>
</pattern>
</section>

<section name="filter_predicate_clues">
<title>2 / Filter & Predicate Clues</title>
<clue>Filter executed after scan (Filter: line) ⇒ predicate not in index; evaluate partial/composite index.</clue>
<clue>Expression filters (WHERE lower(col) = …, JSONB operators, date trunc, etc.) ⇒ consider expression or functional index.</clue>
<clue>High-cardinality boolean or enum used in filter ⇒ partial index … WHERE flag = 'Y'.</clue>
</section>

<section name="join_indicators">
<title>3 / Join Indicators</title>
<join_pattern>
<join_node>Hash Join building large hash on a big table</join_node>
<gap>No usable B-tree on join key</gap>
</join_pattern>
<join_pattern>
<join_node>Merge Join performing explicit sort on input</join_node>
<gap>Add index that matches join key and order</gap>
</join_pattern>
<join_pattern>
<join_node>Nested Loop with high actual rows on inner side</join_node>
<gap>Inner table needs index on join key to avoid repeated scans</gap>
</join_pattern>
</section>

<section name="sort_aggregate">
<title>4 / Sort & Aggregate</title>
<pattern>Sort node with external or disk method ⇒ add index that matches ORDER BY keys (or keys + filter for partial sort).</pattern>
<pattern>GroupAggregate doing explicit sort ⇒ same as above or consider index-only aggregate (ordered DISTINCT).</pattern>
<pattern>Aggregate scanning full table for COUNT/ SUM with selective filter ⇒ index on filtered column(s) may be faster.</pattern>
</section>

<section name="parallelism_hints">
<title>5 / Parallelism Hints</title>
<hint>Parallel Seq Scan on a small (< 1 GB) table usually means no selective index exists; add one.</hint>
<hint>Parallel Index Scan rarely appears; if Postgres parallelises a query but falls back to serial index probes, check whether composite/covering index could avoid that.</hint>
</section>

<section name="index_design_checks">
<title>6 / Index Design Checks</title>
<check number="1">Match access pattern. Equality columns first, then range, then ordering/grouping columns.</check>
<check number="2">Cover what you return. Use INCLUDE for non-filter, non-order columns to promote index-only scan.</check>
<check number="3">Use the right type.
• Pattern search with %suffix ⇒ B-tree not useful; use pg_trgm GIN.
• Full-text ⇒ GIN/GiST on to_tsvector.
• @>/JSONB containment ⇒ GIN.
• Large monotonically increasing key ⇒ consider BRIN.</check>
<check number="4">Partial indexes: Perfect when predicate value appears in ≪ 20 % of rows.</check>
<check number="5">Do not over-index. Each added index costs space & write-amplification; prefer composite or partial over many singles.</check>
<check number="6">Eliminate duplicates. Drop overlapping or unused indexes (check pg_stat_user_indexes.idx_scan = 0).</check>
</section>

<section name="health_maintenance">
<title>7 / Health & Maintenance Signals</title>
<signal>High avg_leaf_density or idx_scan ≪ idx_tup_fetch ⇒ index bloat; consider REINDEX or pg_repack.</signal>
<signal>Stale n_dead_tup or many Heap Fetches on supposed index-only path ⇒ run VACUUM (ANALYZE) more often.</signal>
<signal>random_page_cost vs. seq_page_cost: if custom settings are skewing plans, validate them.</signal>
</section>

<section name="creation_checklist">
<title>8 / Rule-of-Thumb Creation Checklist (for suggestion engines)</title>
<rule>
IF column appears in (JOIN OR WHERE OR ORDER BY OR GROUP BY)
  AND table.rows > 10 000
  AND condition is selective (estimated_rows < 5 % of reltuples)
THEN propose index on those columns
</rule>
<augmentation>
<item>Prefer composite over separate indexes when query touches ≥ 2 columns together.</item>
<item>For ad-hoc predicates that hit small slice of large table, suggest partial index.</item>
<item>When multiple plans share identical expensive node, recommend clustering or covering index to serve all.</item>
</augmentation>
</section>

<final_instruction>
Use the above cues to generate candidate CREATE INDEX statements, explain why they help (selectivity, covering, ordering) and estimate improvement based on plan cost and actual time/rows metrics.
</final_instruction>
</postgresql_index_tuning_heuristics>

${historySection}
<query_details>
${queryText}
</query_details>

<query_plan>
${JSON.stringify(queryPlanJson, null, 2)}
</query_plan>

<table_definitions>
${tableDefinitions.join('\n\n')}
</table_definitions>

${appliedIndexes ? `<currently_applied_indexes>\n<description>The following indexes are currently applied to the database:</description>\n${appliedIndexes}\n</currently_applied_indexes>` : ``}
</index_suggestion_task>`;
} 